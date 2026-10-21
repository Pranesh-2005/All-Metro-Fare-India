import { describe, expect, it } from "vitest";
import { City } from "./schema";
import { journeySteps, changeStationIds } from "./journey";
import type { Hop, Route } from "./fare/engine";

/**
 * Two lines meeting at one station. Blue runs north to south, Red runs west to
 * east, so the direction labels are checkable by eye.
 */
const city = City.parse({
  id: "t",
  name: "Test",
  dataVersion: { network: "2026-01-01", fares: "2026-01-01" },
  operators: [
    {
      id: "op",
      name: "Operator",
      shortName: "OP",
      color: "#111111",
      fareRules: {
        basis: "distance_km",
        effectiveFrom: "2026-01-01",
        confidence: "verified",
        slabs: [{ max: 50, fare: 20 }],
      },
    },
  ],
  lines: [
    {
      id: "blue",
      operator: "op",
      name: "Blue Line",
      color: "#0000ff",
      stations: ["north", "junction", "south"],
    },
    {
      id: "red",
      operator: "op",
      name: "Red Line",
      color: "#ff0000",
      stations: ["west", "junction", "east"],
    },
  ],
  stations: [
    { id: "north", name: "North", coord: [77.0, 28.0] },
    { id: "junction", name: "Junction", coord: [77.0, 27.9] },
    { id: "south", name: "South", coord: [77.0, 27.8] },
    { id: "west", name: "West", coord: [76.9, 27.9] },
    { id: "east", name: "East", coord: [77.1, 27.9] },
  ],
});

function hop(fromStation: string, toStation: string, lineId: string | null): Hop {
  return { fromStation, toStation, lineId, km: 1, minutes: 2, resetsLeg: false };
}

function route(hops: Hop[]): Route {
  return {
    fromStation: hops[0].fromStation,
    toStation: hops[hops.length - 1].toStation,
    stations: [],
    hops,
    legs: [],
    km: hops.length,
    fare: 20,
    minutes: hops.length * 2,
    transfers: 0,
    confidence: "verified",
    geometry: [],
  };
}

describe("journeySteps", () => {
  it("keeps one line in one ride and names the terminal ahead", () => {
    const steps = journeySteps(
      route([hop("north", "junction", "blue"), hop("junction", "south", "blue")]),
      city,
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      kind: "ride",
      lineName: "Blue Line",
      fromStation: "north",
      toStation: "south",
      stops: 2,
      towards: "South",
    });
  });

  it("splits rides on a change hop and records where to change", () => {
    const steps = journeySteps(
      route([
        hop("north", "junction", "blue"),
        { ...hop("junction", "junction", null), km: 0 },
        hop("junction", "east", "red"),
      ]),
      city,
    );
    expect(steps.map((step) => step.kind)).toEqual(["ride", "change", "ride"]);
    expect(steps[1]).toMatchObject({
      kind: "change",
      atStation: "junction",
      toLineId: "red",
    });
    expect(steps[2]).toMatchObject({ lineName: "Red Line", towards: "East" });
    expect([...changeStationIds(steps)]).toEqual(["junction"]);
  });
});
