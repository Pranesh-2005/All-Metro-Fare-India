import type { City, Operator, Slab, Station } from "../schema";
import { haversineKm, walkMetersToMinutes } from "../fare/geo";

/**
 * A platform node is one station *on one line*. A station served by three lines
 * is three nodes joined by zero-cost transfer edges, which is what makes
 * "change trains here" fall out of the graph rather than being special-cased.
 */
export type PlatformNode = {
  id: string;
  stationId: string;
  lineId: string;
  operatorId: string;
};

export type Edge = {
  to: string;
  km: number;
  minutes: number;
  /**
   * True when this edge crosses into a differently-tariffed operator. The fare
   * engine reads it as "the previous leg ends here and the next one starts at
   * zero" — the whole per-operator-leg rule lives in this one flag.
   */
  resetsLeg: boolean;
  /** null on transfer edges, which are not rides. */
  lineId: string | null;
};

export type Graph = {
  city: City;
  nodes: Map<string, PlatformNode>;
  adj: Map<string, Edge[]>;
  /** station id -> the platform node ids that serve it */
  platformsOf: Map<string, string[]>;
  operators: Map<string, Operator>;
  /** line id -> operator id */
  operatorOfLine: Map<string, string>;
  /** operator id -> the slabs in force, after applying the selected variant */
  slabsOf: Map<string, Slab[]>;
  /** Which variant was applied, if any. */
  variantId: string | null;
  tunables: City["tunables"];
};

export const nodeId = (lineId: string, stationId: string) => `${lineId}::${stationId}`;

export type BuildOptions = {
  /**
   * Fare variant to price with, by id (e.g. "sunday"). Applied per operator, so
   * an operator that publishes no such variant keeps its default table.
   */
  variant?: string;
};

export function buildGraph(city: City, options: BuildOptions = {}): Graph {
  const operators = new Map(city.operators.map((op) => [op.id, op]));
  const stations = new Map<string, Station>(city.stations.map((s) => [s.id, s]));
  const operatorOfLine = new Map(city.lines.map((l) => [l.id, l.operator]));

  const slabsOf = new Map<string, Slab[]>();
  for (const operator of city.operators) {
    const variant = options.variant
      ? operator.fareRules.variants.find((v) => v.id === options.variant)
      : undefined;
    slabsOf.set(operator.id, variant?.slabs ?? operator.fareRules.slabs);
  }

  const nodes = new Map<string, PlatformNode>();
  const adj = new Map<string, Edge[]>();
  const platformsOf = new Map<string, string[]>();

  const addEdge = (e: Edge, from: string) => {
    const list = adj.get(from);
    if (list) list.push(e);
    else adj.set(from, [e]);
  };

  const coordOf = (stationId: string): Station["coord"] => {
    const station = stations.get(stationId);
    if (!station) throw new Error(`station "${stationId}" is not defined`);
    return station.coord;
  };

  for (const line of city.lines) {
    if (!operators.has(line.operator)) {
      throw new Error(`line "${line.id}" points at unknown operator "${line.operator}"`);
    }
    line.stations.forEach((stationId, index) => {
      const id = nodeId(line.id, stationId);
      nodes.set(id, { id, stationId, lineId: line.id, operatorId: line.operator });
      const at = platformsOf.get(stationId);
      if (at) at.push(id);
      else platformsOf.set(stationId, [id]);

      if (index === 0) return;
      const prevStationId = line.stations[index - 1];
      const prevId = nodeId(line.id, prevStationId);
      const km = line.segments?.[index - 1] ?? haversineKm(coordOf(prevStationId), coordOf(stationId));
      const minutes = (km / city.tunables.rideSpeedKmph) * 60 + city.tunables.dwellMinutes;
      addEdge({ to: prevId, km, minutes, resetsLeg: false, lineId: line.id }, id);
      addEdge({ to: id, km, minutes, resetsLeg: false, lineId: line.id }, prevId);
    });
  }

  // Same-station interchange: every ordered pair of platforms at a station.
  // Free, and priced as a single leg when the operator is unchanged — so a
  // DMRC-to-DMRC line change is one fare while DMRC-to-NMRC is two.
  for (const platforms of platformsOf.values()) {
    for (const from of platforms) {
      for (const to of platforms) {
        if (from === to) continue;
        addEdge(
          {
            to,
            km: 0,
            minutes: city.tunables.transferMinutes,
            resetsLeg: nodes.get(from)!.operatorId !== nodes.get(to)!.operatorId,
            lineId: null,
          },
          from,
        );
      }
    }
  }

  // Inter-station transfers: two systems that meet without sharing a station.
  for (const transfer of city.transfers) {
    const fromPlatforms = platformsOf.get(transfer.from) ?? [];
    const toPlatforms = platformsOf.get(transfer.to) ?? [];
    const minutes = walkMetersToMinutes(transfer.walkMeters);
    for (const a of fromPlatforms) {
      for (const b of toPlatforms) {
        const resetsLeg = nodes.get(a)!.operatorId !== nodes.get(b)!.operatorId;
        addEdge({ to: b, km: 0, minutes, resetsLeg, lineId: null }, a);
        addEdge({ to: a, km: 0, minutes, resetsLeg, lineId: null }, b);
      }
    }
  }

  return {
    city,
    nodes,
    adj,
    platformsOf,
    operators,
    operatorOfLine,
    slabsOf,
    variantId: options.variant ?? null,
    tunables: city.tunables,
  };
}
