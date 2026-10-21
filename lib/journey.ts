import type { Route } from "./fare/engine";
import type { City, Line } from "./schema";

/**
 * A route told the way a passenger rides it: board here, ride this line, get
 * off there, change to that line. The fare engine works in operator legs
 * because that is what fares are charged on; people think in lines and changes,
 * and one operator leg can span several lines.
 */
export type RideStep = {
  kind: "ride";
  lineId: string;
  lineName: string;
  color: string;
  fromStation: string;
  toStation: string;
  /** Stations ridden after boarding. */
  stops: number;
  km: number;
  /** Name of the terminal the train is heading to, when the line order says so. */
  towards: string | null;
};

export type ChangeStep = {
  kind: "change";
  atStation: string;
  /** Set when the change needs a short walk to a different station. */
  walkTo?: string;
  walkKm?: number;
  /** Line boarded after the change. Null only if the route ends here. */
  toLineId: string | null;
};

export type JourneyStep = RideStep | ChangeStep;

type LineIndex = {
  city: City;
  lineById: Map<string, Line>;
  stationName: (id: string) => string;
};

function index(city: City): LineIndex {
  return {
    city,
    lineById: new Map(city.lines.map((line) => [line.id, line])),
    stationName: (id) => city.stations.find((station) => station.id === id)?.name ?? id,
  };
}

/**
 * Which end of the line the train is heading for. Line station arrays run
 * terminus to terminus, so the travel direction is the sign of the index delta.
 * Branch lines are stored as their own arrays, so a branch's end is a real
 * terminal, not the trunk's.
 */
function terminalTowards(line: Line | undefined, fromId: string, toId: string): string | null {
  if (!line) return null;
  const from = line.stations.indexOf(fromId);
  const to = line.stations.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return null;
  const terminalId =
    to > from ? line.stations[line.stations.length - 1] : line.stations[0];
  return terminalId;
}

export function journeySteps(route: Route, city: City): JourneyStep[] {
  const { lineById, stationName } = index(city);
  const steps: JourneyStep[] = [];
  let ride: RideStep | null = null;

  for (const hop of route.hops) {
    if (hop.lineId === null) {
      if (ride) {
        steps.push(ride);
        ride = null;
      }
      // A walk hop also separates rides: the next hop starts a new one.
      steps.push({
        kind: "change",
        atStation: hop.fromStation,
        ...(hop.toStation !== hop.fromStation ? { walkTo: hop.toStation } : {}),
        ...(hop.km > 0.05 ? { walkKm: hop.km } : {}),
        toLineId: null,
      });
      continue;
    }

    const line = lineById.get(hop.lineId);
    if (!ride || ride.lineId !== hop.lineId) {
      if (ride) {
        // A line change with no walk hop: still a change for the passenger.
        steps.push(ride);
        steps.push({ kind: "change", atStation: hop.fromStation, toLineId: hop.lineId });
      }
      const terminalId = terminalTowards(line, hop.fromStation, hop.toStation);
      ride = {
        kind: "ride",
        lineId: hop.lineId,
        // Branch chains are stored as "Blue Line (2)": the passenger knows it
        // as the Blue Line, and the direction already names the branch end.
        lineName: (line?.name ?? hop.lineId).replace(/ \(\d+\)$/, ""),
        color: line?.color ?? "#64748b",
        fromStation: hop.fromStation,
        toStation: hop.toStation,
        stops: 1,
        km: hop.km,
        towards: terminalId ? stationName(terminalId) : null,
      };
      continue;
    }

    ride.toStation = hop.toStation;
    ride.stops += 1;
    ride.km += hop.km;
  }

  if (ride) steps.push(ride);

  // Fill in which line each change leads to.
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.kind !== "change" || step.toLineId) continue;
    const nextRide = steps.slice(i + 1).find((entry) => entry.kind === "ride");
    step.toLineId = nextRide?.kind === "ride" ? nextRide.lineId : null;
  }

  return steps;
}

/** Station ids where the passenger has to change, for highlighting the map. */
export function changeStationIds(steps: JourneyStep[]): Set<string> {
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.kind !== "change") continue;
    ids.add(step.atStation);
    if (step.walkTo) ids.add(step.walkTo);
  }
  return ids;
}

export function changeCount(steps: JourneyStep[]): number {
  return steps.filter((step) => step.kind === "change").length;
}
