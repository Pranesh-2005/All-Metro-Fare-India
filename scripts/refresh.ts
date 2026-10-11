import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { City, type FareRules } from "../lib/schema";
import { haversineKm } from "../lib/fare/geo";
import { scrapeFares } from "./scrape-fares";

/**
 * Rebuilds every data/cities/*.json from live sources.
 *
 * Topology (stations, coordinates, line membership, adjacency) comes from
 * Wikidata, queried fresh per run, so a new station or line that Wikidata
 * already knows about lands here with no code change. Fares, operator identity
 * and colours are curated in data/cities.config.json, because no open dataset
 * carries a reliable fare table — fare scrapers (scrape-fares.ts) may refine a
 * curated value but are allowed to fail silently and fall back to it.
 *
 * Wikidata (not Overpass) is the topology source: Overpass was unavailable
 * across many attempts, while WDQS answers reliably and already models line
 * membership (P81) and adjacency (P197).
 */

const ROOT = process.cwd();
const WDQS = "https://query.wikidata.org/sparql";
const UA = "metro-fare/1.0 (data refresh; https://github.com/metro-fare)";
/** Two stations closer than this on different lines are treated as an interchange. */
const INTERCHANGE_METERS = 180;

type Config = {
  defaultFare: FareRules;
  cities: CityConfig[];
};

type CityConfig = {
  id: string;
  name: string;
  wikidataNetwork: string;
  dataVersion: { network: string; fares: string };
  defaultOperator: string;
  operatorMeta?: { name: string; shortName: string; color: string };
  /** Curated fare for the single auto-operator; falls back to the shared defaultFare. */
  fare?: FareRules;
  operators?: unknown[];
  lineOperators?: Record<string, string>;
  transfers?: unknown[];
};

type Row = Record<string, { value: string }>;
type Raw = { name: string; lon: number; lat: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string): Promise<Row[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${WDQS}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    });
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Wikidata ${res.status} ${res.statusText}`);
    const body = (await res.json()) as { results: { bindings: Row[] } };
    return body.results.bindings;
  }
}

const qid = (uri: string) => uri.replace(/.*\//, "");
const cleanName = (label: string) =>
  label.replace(/\s+(metro|railway)\s+station$/i, "").replace(/\s+station$/i, "").trim();

const COLOR_WORDS: Record<string, string> = {
  red: "#e2231a", blue: "#0062cc", green: "#00a650", yellow: "#f6c200",
  purple: "#6b2a86", violet: "#6b2a86", pink: "#e5338c", magenta: "#cc0099",
  orange: "#f26522", grey: "#8c8c8c", gray: "#8c8c8c", aqua: "#00b7c3",
  black: "#333333", brown: "#8b5a2b", maroon: "#800000", teal: "#008080",
};
const PALETTE = ["#0062cc", "#e2231a", "#00a650", "#f6c200", "#6b2a86", "#e5338c", "#f26522", "#00b7c3"];

function colorFor(label: string, index: number): string {
  for (const [word, hex] of Object.entries(COLOR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(label)) return hex;
  }
  return PALETTE[index % PALETTE.length];
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "line";

/**
 * Covers a line's adjacency with as few simple paths as possible: a plain line
 * yields one chain, a Y-branch yields two sharing the junction, a loop is
 * broken at one edge into a single open chain. Each chain becomes one Line, so
 * the fare engine rides it without a phantom transfer at every station.
 * ponytail: a loop drops its one closing edge, so you cannot route "the short
 * way" around a ring. Add that edge back as an explicit line only if a real
 * trip's time is wrong because of it.
 */
function chainsOfLine(edges: Set<string>): string[][] {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  for (const e of edges) {
    const [a, b] = e.split("|");
    link(a, b);
    link(b, a);
  }
  const used = new Set<string>();
  const edgeKey = (a: string, b: string) => [a, b].sort().join("|");
  const remainingDeg = (n: string) =>
    [...(adj.get(n) ?? [])].filter((m) => !used.has(edgeKey(n, m))).length;

  const chains: string[][] = [];
  while (used.size < edges.size) {
    const odd = [...adj.keys()].find((n) => remainingDeg(n) % 2 === 1 && remainingDeg(n) > 0);
    const start = odd ?? [...adj.keys()].find((n) => remainingDeg(n) > 0)!;
    const trail: string[] = [start];
    let cur = start;
    for (;;) {
      const next = [...(adj.get(cur) ?? [])].find((m) => !used.has(edgeKey(cur, m)));
      if (!next) break;
      used.add(edgeKey(cur, next));
      trail.push(next);
      cur = next;
      if (cur === start) break; // closed loop: stop before repeating the start
    }
    let run: string[] = [trail[0]];
    const seen = new Set([trail[0]]);
    for (const n of trail.slice(1)) {
      if (seen.has(n)) {
        if (run.length >= 2) chains.push(run);
        run = [n];
        seen.clear();
        seen.add(n);
      } else {
        run.push(n);
        seen.add(n);
      }
    }
    if (run.length >= 2) chains.push(run);
  }
  return chains;
}

/** Add zero-distance transfers between nearby stations on different lines that
 *  do not already share a line, so a Wikidata interchange modelled as two
 *  separate station items still connects. */
function proximityTransfers(
  stations: Map<string, Raw>,
  lineOf: Map<string, Set<string>>,
): { from: string; to: string; walkMeters: number; free: boolean }[] {
  const out: { from: string; to: string; walkMeters: number; free: boolean }[] = [];
  const ids = [...stations.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const sa = lineOf.get(a) ?? new Set(), sb = lineOf.get(b) ?? new Set();
      if ([...sa].some((l) => sb.has(l))) continue; // already share a line
      const km = haversineKm(
        [stations.get(a)!.lon, stations.get(a)!.lat],
        [stations.get(b)!.lon, stations.get(b)!.lat],
      );
      if (km * 1000 <= INTERCHANGE_METERS) {
        out.push({ from: a, to: b, walkMeters: Math.round(km * 1000), free: true });
      }
    }
  }
  return out;
}

/** Station ids in the largest connected component, where an edge is either two
 *  stations adjacent on a line chain or the two ends of a transfer. */
function largestComponent(
  lines: City["lines"],
  transfers: { from: string; to: string }[],
  allIds: string[],
): Set<string> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const line of lines) {
    for (let i = 1; i < line.stations.length; i++) link(line.stations[i - 1], line.stations[i]);
  }
  for (const t of transfers) link(t.from, t.to);

  const seen = new Set<string>();
  let best = new Set<string>();
  for (const start of allIds) {
    if (seen.has(start)) continue;
    const comp = new Set<string>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const n = queue.pop()!;
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          comp.add(m);
          queue.push(m);
        }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}

async function buildCity(cfg: CityConfig, defaultFare: FareRules) {
  const stationRows = await sparql(
    `SELECT ?s ?sLabel ?coord ?l WHERE {
       ?s wdt:P16 wd:${cfg.wikidataNetwork} ; wdt:P625 ?coord ; wdt:P81 ?l .
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     }`,
  );
  const adjacencyRows = await sparql(
    `SELECT ?s ?adj ?line WHERE {
       ?s wdt:P16 wd:${cfg.wikidataNetwork} .
       ?s p:P197 ?st . ?st ps:P197 ?adj ; pq:P81 ?line .
     }`,
  );
  const lineRows = await sparql(
    `SELECT ?l ?lLabel WHERE {
       ?s wdt:P16 wd:${cfg.wikidataNetwork} ; wdt:P81 ?l .
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     } GROUP BY ?l ?lLabel`,
  );

  const stations = new Map<string, Raw>();
  const linesOfStation = new Map<string, Set<string>>();
  for (const row of stationRows) {
    const id = qid(row.s.value);
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value);
    if (!m) continue;
    if (!stations.has(id))
      stations.set(id, { name: cleanName(row.sLabel.value), lon: +m[1], lat: +m[2] });
    (linesOfStation.get(id) ?? linesOfStation.set(id, new Set()).get(id)!).add(qid(row.l.value));
  }

  const lineLabel = new Map(lineRows.map((r) => [qid(r.l.value), r.lLabel?.value ?? "Line"]));
  const edgesByLine = new Map<string, Set<string>>();
  for (const row of adjacencyRows) {
    const a = qid(row.s.value), b = qid(row.adj.value), line = qid(row.line.value);
    if (!stations.has(a) || !stations.has(b)) continue;
    (edgesByLine.get(line) ?? edgesByLine.set(line, new Set()).get(line)!).add([a, b].sort().join("|"));
  }

  const usedSlugs = new Set<string>();
  const lines: City["lines"] = [];
  [...edgesByLine.keys()]
    .sort((a, b) => edgesByLine.get(b)!.size - edgesByLine.get(a)!.size)
    .forEach((wdLine, index) => {
      const label = lineLabel.get(wdLine) ?? "Line";
      const operator = cfg.lineOperators?.[wdLine] ?? cfg.defaultOperator;
      const color = colorFor(label, index);
      const base = slug(label);
      const chains = chainsOfLine(edgesByLine.get(wdLine)!);
      chains.forEach((chain, i) => {
        let id = chains.length > 1 ? `${base}-${i + 1}` : base;
        while (usedSlugs.has(id)) id = `${id}x`;
        usedSlugs.add(id);
        lines.push({
          id,
          operator,
          name: chains.length > 1 ? `${label} (${i + 1})` : label,
          color,
          stations: chain,
        });
      });
    });

  const onALine = new Set(lines.flatMap((l) => l.stations));
  for (const id of [...stations.keys()]) if (!onALine.has(id)) stations.delete(id);
  for (const id of [...linesOfStation.keys()]) if (!onALine.has(id)) linesOfStation.delete(id);

  const operators = cfg.operators ?? [
    {
      id: cfg.defaultOperator,
      name: cfg.operatorMeta?.name ?? cfg.name,
      shortName: cfg.operatorMeta?.shortName ?? cfg.defaultOperator.toUpperCase(),
      color: cfg.operatorMeta?.color ?? "#444444",
      fareRules: await scrapeFares(cfg.defaultOperator, cfg.fare ?? defaultFare),
      discounts: [],
    },
  ];

  const transfers = [
    ...((cfg.transfers ?? []) as { from: string; to: string; walkMeters?: number; free?: boolean }[]),
    ...proximityTransfers(stations, linesOfStation),
  ];

  // Keep only the largest connected component. Wikidata routinely carries an
  // under-construction stub that touches nothing yet; shipping it would fail
  // the connectivity check for the whole city. ponytail: drop small islands
  // rather than invent the interchange that will connect them — the next
  // refresh picks them up once Wikidata links them.
  const keep = largestComponent(lines, transfers, [...stations.keys()]);
  const keptLines = lines.filter((l) => l.stations.every((s) => keep.has(s)));
  const keptStations = [...stations.entries()].filter(([id]) => keep.has(id));
  const keptTransfers = transfers.filter((t) => keep.has(t.from) && keep.has(t.to));

  const city = {
    id: cfg.id,
    name: cfg.name,
    dataVersion: cfg.dataVersion,
    operators,
    lines: keptLines,
    stations: keptStations.map(([id, s]) => ({
      id, name: s.name, coord: [s.lon, s.lat] as [number, number], aliases: [],
    })),
    transfers: keptTransfers,
  };

  const parsed = City.safeParse(city);
  if (!parsed.success) {
    throw new Error(`${cfg.id}: not schema-valid\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  const out = join(ROOT, "data", "cities", `${cfg.id}.json`);
  await mkdir(join(ROOT, "data", "cities"), { recursive: true });
  await writeFile(out, JSON.stringify(parsed.data, null, 2) + "\n");
  return { stations: city.stations.length, lines: city.lines.length, transfers: city.transfers.length };
}

async function main() {
  const only = process.argv.slice(2); // optional: refresh just these city ids
  const config: Config = JSON.parse(
    await readFile(join(ROOT, "data", "cities.config.json"), "utf8"),
  );
  const cities = only.length ? config.cities.filter((c) => only.includes(c.id)) : config.cities;
  if (cities.length === 0) {
    console.error(only.length ? `No matching city ids: ${only.join(", ")}` : "No cities configured");
    process.exit(1);
  }

  let ok = 0;
  for (const cfg of cities) {
    try {
      const r = await buildCity(cfg, config.defaultFare);
      console.log(`✔ ${cfg.id.padEnd(14)} ${r.stations} stations, ${r.lines} line chains, ${r.transfers} transfers`);
      ok += 1;
    } catch (error) {
      console.error(`✘ ${cfg.id}: ${(error as Error).message.split("\n")[0]}`);
    }
    await sleep(400); // be polite to WDQS between cities
  }
  console.log(`\n${ok}/${cities.length} cities built. Next: npm run data:validate`);
  if (ok < cities.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
