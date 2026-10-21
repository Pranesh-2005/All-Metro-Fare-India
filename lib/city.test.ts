import { describe, expect, it } from "vitest";
import { nearestCity } from "./city";

const delhi = {
  id: "delhi",
  stations: [
    { coord: [77.2, 28.6] as [number, number] },
    { coord: [77.3, 28.7] as [number, number] },
  ],
};
const pune = {
  id: "pune",
  stations: [{ coord: [73.85, 18.52] as [number, number] }],
};
const empty = { id: "empty", stations: [] };

describe("nearestCity", () => {
  it("picks the network whose stations are closest", () => {
    expect(nearestCity([pune, delhi], 28.61, 77.21)?.id).toBe("delhi");
    expect(nearestCity([pune, delhi], 18.5, 73.9)?.id).toBe("pune");
  });

  it("ignores cities with no stations and returns null when nothing is left", () => {
    expect(nearestCity([empty], 20, 78)).toBeNull();
    expect(nearestCity([empty, pune], 20, 78)?.id).toBe("pune");
  });

  it("returns null for an empty list", () => {
    expect(nearestCity([], 20, 78)).toBeNull();
  });
});
