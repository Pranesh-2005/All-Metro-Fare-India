import { describe, expect, it } from "vitest";
import { City } from "../schema";
import { planTripForCity } from "./engine";
import { fareAt, incrementalFare, slabsAreMonotonic } from "./slabs";

/**
 * Synthetic network with distances fixed by `segments`, so every expectation
 * below is exact arithmetic rather than a guess about coordinates.
 *
 *   opa (DMRC-like)  a1: s1 - s2 - s3 - s4     3, 4, 5 km
 *                    a2: s4 - s5               2 km      (same operator, free change)
 *   opb (Aqua-like)  b1: s5 - s6               3 km      (own tariff)
 *   opc (Express)    c1: s7 - s8               1 km      (own tariff)
 *   opd (a third)    c2: s1 - s3               1 km      (faster, pricier)
 *   transfer         s3 -> s7, 200 m walk
 */
const fixture = City.parse({
  id: "test",
  name: "Test",
  dataVersion: { network: "2026-01-01", fares: "2026-01-01" },
  tunables: { rideSpeedKmph: 35, dwellMinutes: 0.5, transferMinutes: 4 },
  operators: [
    {
      id: "opa",
      name: "Operator A",
      shortName: "A",
      color: "#111111",
      fareRules: {
        basis: "distance_km",
        effectiveFrom: "2026-01-01",
        confidence: "verified",
        slabs: [
          { max: 2, fare: 10 },
          { max: 5, fare: 20 },
          { max: 12, fare: 30 },
          { max: 32, fare: 40 },
        ],
      },
    },
    {
      id: "opb",
      name: "Operator B",
      shortName: "B",
      color: "#222222",
      fareRules: {
        basis: "distance_km",
        effectiveFrom: "2026-01-01",
        confidence: "verified",
        slabs: [
          { max: 3, fare: 15 },
          { max: 6, fare: 25 },
          { max: 100, fare: 35 },
        ],
      },
    },
    {
      id: "opc",
      name: "Operator C",
      shortName: "C",
      color: "#333333",
      fareRules: {
        basis: "distance_km",
        effectiveFrom: "2026-01-01",
        confidence: "verified",
        slabs: [
          { max: 10, fare: 60 },
          { max: 100, fare: 100 },
        ],
      },
    },
    {
      // A separate operator on the direct s1-s3 hop, so the fast route is also a
      // different system and the inter-station transfer below is genuinely needed.
      id: "opd",
      name: "Operator D",
      shortName: "D",
      color: "#444444",
      fareRules: {
        basis: "distance_km",
        effectiveFrom: "2026-01-01",
        confidence: "verified",
        slabs: [
          { max: 10, fare: 60 },
          { max: 100, fare: 100 },
        ],
      },
    },
  ],
  lines: [
    { id: "a1", operator: "opa", name: "A1", color: "#111111", stations: ["s1", "s2", "s3", "s4"], segments: [3, 4, 5] },
    { id: "a2", operator: "opa", name: "A2", color: "#111111", stations: ["s4", "s5"], segments: [2] },
    { id: "b1", operator: "opb", name: "B1", color: "#222222", stations: ["s5", "s6"], segments: [3] },
    { id: "c1", operator: "opc", name: "C1", color: "#333333", stations: ["s7", "s8"], segments: [1] },
    { id: "c2", operator: "opd", name: "D1", color: "#444444", stations: ["s1", "s3"], segments: [1] },
  ],
  stations: [
    { id: "s1", name: "One", coord: [77.0, 28.0] },
    { id: "s2", name: "Two", coord: [77.03, 28.0] },
    { id: "s3", name: "Three", coord: [77.08, 28.0] },
    { id: "s4", name: "Four", coord: [77.11, 28.0] },
    { id: "s5", name: "Five", coord: [77.13, 28.0] },
    { id: "s6", name: "Six", coord: [77.16, 28.0] },
    { id: "s7", name: "Seven", coord: [77.09, 28.01] },
    { id: "s8", name: "Eight", coord: [77.1, 28.01] },
  ],
  transfers: [{ from: "s3", to: "s7", walkMeters: 200 }],
});

const route = (from: string, to: string) => {
  const plan = planTripForCity(fixture, from, to);
  if (!plan) throw new Error(`no route ${from} -> ${to}`);
  return plan;
};

describe("fare slabs", () => {
  it("charges the minimum fare on entry", () => {
    expect(fareAt(fixture.operators[0].fareRules.slabs, 0)).toBe(10);
  });

  it("is a monotonic step function", () => {
    expect(slabsAreMonotonic(fixture.operators[0].fareRules.slabs)).toBe(true);
    const slabs = fixture.operators[0].fareRules.slabs;
    expect(fareAt(slabs, 2)).toBe(10);
    expect(fareAt(slabs, 2.1)).toBe(20);
    expect(fareAt(slabs, 99)).toBe(40);
  });

  it("never has a negative increment, which is what makes Dijkstra valid here", () => {
    const slabs = fixture.operators[0].fareRules.slabs;
    for (let from = 0; from <= 35; from += 0.25) {
      for (let to = from; to <= 35; to += 0.25) {
        expect(incrementalFare(slabs, from, to)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("single-operator trips", () => {
  it("prices one leg by distance", () => {
    expect(route("s1", "s2").cheapest.fare).toBe(20); // 3 km
    expect(route("s1", "s3").cheapest.fare).toBe(30); // 7 km
    expect(route("s1", "s4").cheapest.fare).toBe(30); // 12 km, top of the band
    expect(route("s1", "s4").cheapest.legs).toHaveLength(1);
  });

  it("treats a same-operator line change as one leg, not two fares", () => {
    const plan = route("s1", "s5");
    expect(plan.cheapest.legs).toHaveLength(1);
    expect(plan.cheapest.km).toBeCloseTo(14, 6); // 3 + 4 + 5 + 2
    expect(plan.cheapest.fare).toBe(40); // one 14 km leg on opa
  });
});

describe("multi-operator trips", () => {
  it("stacks a second operator's fare with its own minimum on entry", () => {
    const plan = route("s1", "s6");
    expect(plan.cheapest.legs).toHaveLength(2);
    expect(plan.cheapest.legs.map((l) => l.operatorId)).toEqual(["opa", "opb"]);
    expect(plan.cheapest.legs[0].fare).toBe(40); // 14 km on opa
    expect(plan.cheapest.legs[1].fare).toBe(15); // 3 km on opb, which is its minimum
    expect(plan.cheapest.fare).toBe(55);
  });

  it("walks an inter-station transfer and charges the second system's minimum", () => {
    const plan = route("s1", "s8");
    expect(plan.cheapest.legs.map((l) => l.operatorId)).toEqual(["opa", "opc"]);
    expect(plan.cheapest.legs[1].fare).toBe(60); // 1 km on opc, floored at its minimum
    expect(plan.cheapest.fare).toBe(90);
    expect(plan.cheapest.transfers).toBe(1);
  });

  it("sums leg fares to the route total", () => {
    for (const [from, to] of [["s1", "s5"], ["s1", "s6"], ["s3", "s6"], ["s1", "s8"]]) {
      const r = route(from, to).cheapest;
      const sum = r.legs.reduce((acc, leg) => acc + leg.fare, 0);
      expect(sum).toBe(r.fare);
    }
  });
});

describe("cheapest vs fastest", () => {
  it("returns the cheaper route even when a faster one exists", () => {
    const plan = route("s1", "s3");
    expect(plan.sameRoute).toBe(false);
    // 7 km on opa = 30 beats 1 km on opc = 60
    expect(plan.cheapest.fare).toBe(30);
    expect(plan.fastest.fare).toBe(60);
    expect(plan.fastest.minutes).toBeLessThan(plan.cheapest.minutes);
  });
});

describe("confidence", () => {
  it("downgrades a route when any leg comes from an unverified table", () => {
    const unverified = City.parse({
      ...fixture,
      operators: fixture.operators.map((op) =>
        op.id === "opb"
          ? { ...op, fareRules: { ...op.fareRules, confidence: "unverified" } }
          : op,
      ),
    });
    expect(planTripForCity(fixture, "s1", "s6")!.cheapest.confidence).toBe("verified");
    expect(planTripForCity(unverified, "s1", "s6")!.cheapest.confidence).toBe("unverified");
  });
});

describe("fare variants", () => {
  const withVariant = City.parse({
    ...fixture,
    operators: fixture.operators.map((op) =>
      op.id === "opa"
        ? {
            ...op,
            fareRules: {
              ...op.fareRules,
              variants: [
                {
                  id: "sunday",
                  label: "Sundays and national holidays",
                  slabs: [
                    { max: 5, fare: 10 },
                    { max: 12, fare: 20 },
                    { max: 32, fare: 30 },
                  ],
                },
              ],
            },
          }
        : op,
    ),
  });

  it("prices with the variant table when one is selected", () => {
    expect(planTripForCity(withVariant, "s1", "s4")!.cheapest.fare).toBe(30); // default
    expect(planTripForCity(withVariant, "s1", "s4", { variant: "sunday" })!.cheapest.fare).toBe(20);
  });

  it("leaves operators without that variant on their default table", () => {
    const plan = planTripForCity(withVariant, "s1", "s6", { variant: "sunday" })!;
    expect(plan.cheapest.legs[0].fare).toBe(30); // opa, 14 km on the sunday table
    expect(plan.cheapest.legs[1].fare).toBe(15); // opb, unchanged
  });
});

describe("degenerate input", () => {
  it("returns an empty trip for same station and null for unknown stations", () => {
    expect(route("s1", "s1").cheapest.fare).toBe(0);
    expect(planTripForCity(fixture, "s1", "nope")).toBeNull();
  });
});
