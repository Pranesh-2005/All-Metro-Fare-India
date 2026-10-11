import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { City } from "../lib/schema";
import { buildGraph } from "../lib/network/graph";
import { slabsAreMonotonic } from "../lib/fare/slabs";

const CITIES_DIR = join(process.cwd(), "data", "cities");

/**
 * Everything here is a thing a nightly bot could plausibly get wrong. The
 * schema catches shape; these catch meaning: a station that no longer exists,
 * a line with the wrong number of segment distances, a network split in two by
 * a bad edit, a fare table that goes down as distance goes up.
 */
function checkCity(city: City): string[] {
  const problems: string[] = [];

  const duplicate = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${city.id}: duplicate ${label} id "${id}"`);
      seen.add(id);
    }
  };
  duplicate("station", city.stations.map((s) => s.id));
  duplicate("line", city.lines.map((l) => l.id));
  duplicate("operator", city.operators.map((o) => o.id));

  const stationIds = new Set(city.stations.map((s) => s.id));
  const operatorIds = new Set(city.operators.map((o) => o.id));

  for (const [lon, lat] of city.stations.map((s) => s.coord)) {
    if (lon < 60 || lon > 100 || lat < 5 || lat > 40) {
      problems.push(
        `${city.id}: station coordinate [${lon}, ${lat}] is outside India — likely swapped lat/lon`,
      );
    }
  }

  for (const line of city.lines) {
    if (!operatorIds.has(line.operator)) {
      problems.push(`${city.id}: line "${line.id}" references unknown operator "${line.operator}"`);
    }
    for (const id of line.stations) {
      if (!stationIds.has(id)) {
        problems.push(`${city.id}: line "${line.id}" references unknown station "${id}"`);
      }
    }
    const repeated = new Set<string>();
    for (const id of line.stations) {
      if (repeated.has(id)) {
        problems.push(`${city.id}: line "${line.id}" visits station "${id}" more than once`);
      }
      repeated.add(id);
    }
    if (line.segments && line.segments.length !== line.stations.length - 1) {
      problems.push(
        `${city.id}: line "${line.id}" has ${line.segments.length} segment distances for ${line.stations.length} stations (expected ${line.stations.length - 1})`,
      );
    }
    if (line.segments?.some((km) => km <= 0)) {
      problems.push(`${city.id}: line "${line.id}" has a non-positive segment distance`);
    }
  }

  for (const operator of city.operators) {
    if (!slabsAreMonotonic(operator.fareRules.slabs)) {
      problems.push(
        `${city.id}: operator "${operator.id}" fare slabs are not ascending with non-decreasing fares`,
      );
    }
    if (operator.fareRules.slabs.at(-1)!.max === 0) {
      problems.push(`${city.id}: operator "${operator.id}" top slab is 0, so it caps at zero distance`);
    }
  }

  for (const transfer of city.transfers) {
    if (!stationIds.has(transfer.from)) {
      problems.push(`${city.id}: transfer references unknown station "${transfer.from}"`);
    }
    if (!stationIds.has(transfer.to)) {
      problems.push(`${city.id}: transfer references unknown station "${transfer.to}"`);
    }
  }

  // A city split into disconnected pieces is the classic bad generated edit:
  // an orphan line looks fine in isolation but cannot be routed to.
  const graph = buildGraph(city);
  const all = [...graph.nodes.keys()];
  if (all.length > 0) {
    const seen = new Set<string>([all[0]]);
    const queue = [all[0]];
    while (queue.length > 0) {
      const node = queue.pop()!;
      for (const edge of graph.adj.get(node) ?? []) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    if (seen.size !== all.length) {
      const orphans = all.filter((id) => !seen.has(id));
      problems.push(
        `${city.id}: network is not connected — ${orphans.length} unreachable platform(s), e.g. ${orphans.slice(0, 5).join(", ")}`,
      );
    }
  }

  return problems;
}

async function main() {
  let files: string[];
  try {
    files = (await readdir(CITIES_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(`No data directory at ${CITIES_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`No city files in ${CITIES_DIR}. Refusing to report success on empty data.`);
    process.exit(1);
  }

  const problems: string[] = [];
  let unverifiedOperators = 0;
  let stations = 0;

  for (const file of files.sort()) {
    const raw = JSON.parse(await readFile(join(CITIES_DIR, file), "utf8"));
    const parsed = City.safeParse(raw);
    if (!parsed.success) {
      const issues = z.treeifyError(parsed.error);
      problems.push(`${file}: schema invalid\n${JSON.stringify(issues, null, 2)}`);
      continue;
    }
    stations += parsed.data.stations.length;
    for (const operator of parsed.data.operators) {
      if (operator.fareRules.confidence === "unverified") unverifiedOperators += 1;
    }
    problems.push(...checkCity(parsed.data));
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ✘ ${problem}`);
    process.exit(1);
  }

  console.log(
    `✔ ${files.length} cities, ${stations} stations, ${unverifiedOperators} operator(s) marked unverified`,
  );
  if (unverifiedOperators > 0) {
    console.log("  (unverified fares are shown with a warning in the UI — fill in a source to clear them)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
