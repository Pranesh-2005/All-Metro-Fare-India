import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { City } from "./schema";

const CITIES_DIR = join(process.cwd(), "data", "cities");

/**
 * Every city dataset on disk, parsed and validated at build time. A malformed
 * file throws rather than rendering a half-empty page, so a bad merge fails the
 * build instead of shipping quietly.
 */
export async function loadCities(): Promise<City[]> {
  "use cache"; // city JSON is static build-time data — cache so the page prerenders
  let files: string[] = [];
  try {
    files = (await readdir(CITIES_DIR)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const cities: City[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(join(CITIES_DIR, file), "utf8"));
    const parsed = City.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `  ${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("\n");
      throw new Error(`${file} is not a valid city dataset:\n${issues}`);
    }
    cities.push(parsed.data);
  }
  return cities;
}
