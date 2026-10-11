import { describe, expect, it } from "vitest";
import { parseSlabTable } from "./scrape-fares";

describe("parseSlabTable", () => {
  it("reads a clean ascending km/₹ table and caps the top band", () => {
    const html = `<table>
      <tr><td>0 - 2 km</td><td>₹10</td></tr>
      <tr><td>2 to 5 km</td><td>₹ 20</td></tr>
      <tr><td>5-12 km</td><td>₹30</td></tr>
    </table>`;
    const slabs = parseSlabTable(html);
    expect(slabs).toEqual([
      { max: 2, fare: 10 },
      { max: 5, fare: 20 },
      { max: 999, fare: 30 },
    ]);
  });

  it("rejects a non-monotonic parse rather than ship a wrong fare", () => {
    const html = `0-2 km ₹30 ... 2-5 km ₹10`;
    expect(parseSlabTable(html)).toBeNull();
  });

  it("returns null when there is no static table (the JS-calculator case)", () => {
    expect(parseSlabTable("<div>Use our fare calculator</div>")).toBeNull();
  });
});
