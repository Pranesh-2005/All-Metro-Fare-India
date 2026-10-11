import type { City, FareRules } from "../schema";
import { buildGraph, type BuildOptions, type Edge, type Graph } from "../network/graph";
import { capAmount, fareAt } from "./slabs";

/**
 * The fare leg accumulator is bucketed to 100 m. Metro slabs are whole-km bands,
 * so a shift this small only changes the answer when a leg's true distance sits
 * within 100 m of a slab boundary.
 * ponytail: 100 m buckets. If a city's computed fare ever disagrees with its
 * published table, put real per-segment km in that line's `segments` — do not
 * shrink the bucket.
 */
const LEG_QUANTUM_KM = 0.1;

/**
 * Among equal-fare routes, prefer the quicker one. Fares are whole rupees, so a
 * per-minute nudge this small (a cross-city 3000-minute path adds under 0.01)
 * can never outweigh a 1-rupee fare difference — it only breaks ties, which is
 * what stops the fare search from returning an arbitrarily long detour once a
 * leg has hit its distance cap and further edges cost nothing.
 */
const TIME_TIEBREAK = 1e-6;

export type Hop = {
  fromStation: string;
  toStation: string;
  /** null on a transfer between lines or systems. */
  lineId: string | null;
  km: number;
  minutes: number;
  resetsLeg: boolean;
};

export type Leg = {
  operatorId: string;
  operatorName: string;
  fromStation: string;
  toStation: string;
  /** km, or station count when the operator's basis is station_count. */
  amount: number;
  basis: FareRules["basis"];
  fare: number;
  confidence: FareRules["confidence"];
};

export type Route = {
  fromStation: string;
  toStation: string;
  /** Station ids in travel order, consecutive duplicates collapsed. */
  stations: string[];
  hops: Hop[];
  legs: Leg[];
  /** Sum of leg distances in km, regardless of basis. */
  km: number;
  fare: number;
  minutes: number;
  transfers: number;
  confidence: FareRules["confidence"];
  /** [lon, lat] polyline for the map. */
  geometry: [number, number][];
};

// ---------------------------------------------------------------- min-heap

type HeapItem = { key: string; cost: number; nodeId: string; legKm: number };

class MinHeap {
  private items: HeapItem[] = [];

  get size() {
    return this.items.length;
  }

  push(item: HeapItem) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): HeapItem | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || !last) return top;
    items[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < items.length && items[l].cost < items[smallest].cost) smallest = l;
      if (r < items.length && items[r].cost < items[smallest].cost) smallest = r;
      if (smallest === i) break;
      [items[smallest], items[i]] = [items[i], items[smallest]];
      i = smallest;
    }
    return top;
  }
}

// ---------------------------------------------------------------- searches

const stateKey = (node: string, legKm: number) =>
  `${node}|${Math.round(legKm / LEG_QUANTUM_KM)}`;

type CameFrom = { key: string | null; via: Edge | null; nodeId: string };

/**
 * Minimum-fare search. State is (platform node, distance already ridden on the
 * current operator leg), and an edge costs the *incremental* slab fare. Because
 * slabs are monotonic that increment is never negative, so Dijkstra is exact.
 * A `resetsLeg` edge closes the leg and opens a new one, which charges the next
 * operator its own minimum fare — that is the entire multi-operator rule.
 */
function searchByFare(graph: Graph, fromStation: string, toStation: string) {
  const dist = new Map<string, number>();
  const cameFrom = new Map<string, CameFrom>();
  const heap = new MinHeap();

  for (const platform of graph.platformsOf.get(fromStation) ?? []) {
    const operatorId = graph.nodes.get(platform)!.operatorId;
    const slabs = graph.slabsOf.get(operatorId)!;
    const key = stateKey(platform, 0);
    const cost = fareAt(slabs, 0);
    dist.set(key, cost);
    cameFrom.set(key, { key: null, via: null, nodeId: platform });
    heap.push({ key, cost, nodeId: platform, legKm: 0 });
  }

  const settled = new Set<string>();
  let best: { key: string; cost: number } | null = null;
  const destPlatforms = new Set(graph.platformsOf.get(toStation) ?? []);

  while (heap.size > 0) {
    const cur = heap.pop()!;
    if (settled.has(cur.key)) continue;
    settled.add(cur.key);

    if (destPlatforms.has(cur.nodeId)) {
      best = { key: cur.key, cost: cur.cost };
      break;
    }

    const curOperator = graph.nodes.get(cur.nodeId)!.operatorId;
    for (const edge of graph.adj.get(cur.nodeId) ?? []) {
      const nextOperator = edge.resetsLeg ? graph.nodes.get(edge.to)!.operatorId : curOperator;
      const slabs = graph.slabsOf.get(nextOperator)!;
      const cap = capAmount(slabs);
      const legKm = edge.resetsLeg
        ? Math.min(edge.km, cap)
        : Math.min(cur.legKm + edge.km, cap);

      const delta = edge.resetsLeg
        ? fareAt(slabs, legKm)
        : fareAt(slabs, legKm) - fareAt(slabs, cur.legKm);

      const cost = cur.cost + delta + edge.minutes * TIME_TIEBREAK;
      const key = stateKey(edge.to, legKm);
      const known = dist.get(key);
      if (known !== undefined && known <= cost) continue;
      dist.set(key, cost);
      cameFrom.set(key, { key: cur.key, via: edge, nodeId: edge.to });
      heap.push({ key, cost, nodeId: edge.to, legKm });
    }
  }

  if (!best) return null;
  return { cost: best.cost, path: reconstruct(cameFrom, best.key) };
}

/** Fastest-ride search: plain Dijkstra weighted by minutes. */
function searchByTime(graph: Graph, fromStation: string, toStation: string) {
  const dist = new Map<string, number>();
  const cameFrom = new Map<string, CameFrom>();
  const heap = new MinHeap();
  const settled = new Set<string>();
  const destPlatforms = new Set(graph.platformsOf.get(toStation) ?? []);

  for (const platform of graph.platformsOf.get(fromStation) ?? []) {
    dist.set(platform, 0);
    cameFrom.set(platform, { key: null, via: null, nodeId: platform });
    heap.push({ key: platform, cost: 0, nodeId: platform, legKm: 0 });
  }

  let best: { key: string; cost: number } | null = null;
  while (heap.size > 0) {
    const cur = heap.pop()!;
    if (settled.has(cur.key)) continue;
    settled.add(cur.key);
    if (destPlatforms.has(cur.nodeId)) {
      best = { key: cur.key, cost: cur.cost };
      break;
    }
    for (const edge of graph.adj.get(cur.nodeId) ?? []) {
      const cost = cur.cost + edge.minutes;
      const known = dist.get(edge.to);
      if (known !== undefined && known <= cost) continue;
      dist.set(edge.to, cost);
      cameFrom.set(edge.to, { key: cur.key, via: edge, nodeId: edge.to });
      heap.push({ key: edge.to, cost, nodeId: edge.to, legKm: 0 });
    }
  }

  if (!best) return null;
  return { cost: best.cost, path: reconstruct(cameFrom, best.key) };
}

function reconstruct(cameFrom: Map<string, CameFrom>, endKey: string): CameFrom[] {
  const out: CameFrom[] = [];
  let key: string | null = endKey;
  while (key) {
    const step: CameFrom | undefined = cameFrom.get(key);
    if (!step) break;
    out.push(step);
    key = step.key;
  }
  return out.reverse();
}

// ---------------------------------------------------------------- assembly

function hopsFromPath(graph: Graph, path: CameFrom[]): Hop[] {
  const hops: Hop[] = [];
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    const via = step.via!;
    hops.push({
      fromStation: graph.nodes.get(path[i - 1].nodeId)!.stationId,
      toStation: graph.nodes.get(step.nodeId)!.stationId,
      lineId: via.lineId,
      km: via.km,
      minutes: via.minutes,
      resetsLeg: via.resetsLeg,
    });
  }
  return hops;
}

function legsFromHops(graph: Graph, hops: Hop[]): Leg[] {
  const legs: Leg[] = [];
  let operatorId: string | null = null;
  let startStation = "";
  let km = 0;
  let stops = 0;

  const close = (endStation: string) => {
    if (!operatorId) return;
    const operator = graph.operators.get(operatorId)!;
    const amount = operator.fareRules.basis === "station_count" ? stops : km;
    legs.push({
      operatorId,
      operatorName: operator.shortName,
      fromStation: startStation,
      toStation: endStation,
      amount,
      basis: operator.fareRules.basis,
      fare: fareAt(graph.slabsOf.get(operatorId)!, amount),
      confidence: operator.fareRules.confidence,
    });
    operatorId = null;
    km = 0;
    stops = 0;
  };

  for (const hop of hops) {
    if (hop.resetsLeg) {
      close(hop.fromStation);
      continue;
    }
    if (hop.lineId === null) continue; // same-operator line change: stays one leg
    const hopOperator = graph.operatorOfLine.get(hop.lineId)!;
    if (operatorId === null) {
      operatorId = hopOperator;
      startStation = hop.fromStation;
    }
    km += hop.km;
    stops += 1;
  }
  close(hops[hops.length - 1]?.toStation ?? startStation);
  return legs;
}

function geometryFromStations(city: City, stations: string[]): [number, number][] {
  const byId = new Map(city.stations.map((s) => [s.id, s.coord]));
  const points: [number, number][] = [];
  for (const id of stations) {
    const coord = byId.get(id);
    if (coord) points.push([coord[0], coord[1]]);
  }
  return points;
}

function assemble(graph: Graph, fromStation: string, toStation: string, hops: Hop[]): Route {
  const legs = legsFromHops(graph, hops);
  const stations: string[] = [];
  const push = (id: string) => {
    if (stations[stations.length - 1] !== id) stations.push(id);
  };
  if (hops.length > 0) {
    push(hops[0].fromStation);
    for (const hop of hops) push(hop.toStation);
  } else {
    push(fromStation);
  }

  return {
    fromStation,
    toStation,
    stations,
    hops,
    legs,
    km: hops.reduce((sum, h) => (h.lineId ? sum + h.km : sum), 0),
    fare: legs.reduce((sum, leg) => sum + leg.fare, 0),
    minutes: hops.reduce((sum, h) => sum + h.minutes, 0),
    transfers: hops.filter((h) => h.lineId === null).length,
    confidence: legs.some((l) => l.confidence === "unverified") ? "unverified" : "verified",
    geometry: geometryFromStations(graph.city, stations),
  };
}

export type TripPlan = {
  cheapest: Route;
  fastest: Route;
  /** True when both searches landed on the same path. */
  sameRoute: boolean;
};

export function planTrip(graph: Graph, fromStation: string, toStation: string): TripPlan | null {
  const fareResult = searchByFare(graph, fromStation, toStation);
  const timeResult = searchByTime(graph, fromStation, toStation);
  if (!fareResult || !timeResult) return null;

  const cheapest = assemble(graph, fromStation, toStation, hopsFromPath(graph, fareResult.path));
  const fastest = assemble(graph, fromStation, toStation, hopsFromPath(graph, timeResult.path));

  const shape = (r: Route) => r.hops.map((h) => `${h.toStation}:${h.lineId ?? "x"}`).join(">");
  return { cheapest, fastest, sameRoute: shape(cheapest) === shape(fastest) };
}

export function planTripForCity(
  city: City,
  fromStation: string,
  toStation: string,
  options: BuildOptions = {},
): TripPlan | null {
  return planTrip(buildGraph(city, options), fromStation, toStation);
}

/** Convenience for tests and scripts: just the fare-optimal route. */
export function cheapestRoute(
  city: City,
  fromStation: string,
  toStation: string,
  options: BuildOptions = {},
): Route | null {
  return planTripForCity(city, fromStation, toStation, options)?.cheapest ?? null;
}
