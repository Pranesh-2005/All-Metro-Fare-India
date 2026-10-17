# All-Metro-Fare-India

Fare and route for **every operational Indian metro**, in one place. Pick an
origin and destination on any of 19 networks and get the cheapest fare, the
fastest route, the line-by-line breakdown, and an interactive map — computed
from each operator's own published fare slabs, so a trip that crosses two
systems (say Delhi Metro into the Airport Express) correctly shows **two
fares**, not one.

19 cities · 843 stations · built from live open data.

## How it works

The whole design is a split between a **pure fare engine** (no city names in
code) and **versioned city data** (JSON, one file per city). Adding a line or
changing a price is a data edit, never a code change.

- **Topology** (stations, coordinates, lines, adjacency) is pulled live from
  **Wikidata** by `scripts/refresh.ts`, which reconstructs each line's station
  order, auto-detects interchanges, and keeps the largest connected component.
  (Overpass/OSM was the original plan but has been unreliable; Wikidata models
  line membership and adjacency and answers consistently.)
- **Fares** are curated in `data/cities.config.json` — each operator's distance
  or station-count slab table, with a source URL and a `verified` /
  `unverified` confidence flag. Unverified fares render with a warning in the
  UI rather than pretending to be exact.
- **Routing** is a state-expanded Dijkstra over `(platform, operator, leg
  distance)` with incremental slab cost, computing both the min-fare and
  min-time route.

## Fare confidence

Only operators that publish an official static fare table are marked
`verified` — currently **DMRC (Delhi), Hyderabad Metro, and Jaipur Metro**.
Every other operator exposes fares only through a JavaScript fare-calculator or
a station-pair matrix, so their slabs come from reliable secondary sources and
stay `unverified` (correct bands, real source link, shown with a caveat) until
an official table is found.

## Commands

```bash
npm run dev            # start the app
npm run data:refresh   # rebuild all data/cities/*.json from Wikidata (+ fares)
npm run data:refresh delhi bengaluru   # just these cities
npm run data:validate  # schema + connectivity + monotonic-slab checks
npm run test:fare      # fare engine unit tests
npm run build          # production build
```

## Keeping it current

`.github/workflows/data-refresh.yml` runs nightly: it refreshes topology from
Wikidata, re-applies curated fares, validates, runs the fare tests, and opens a
pull request **only when `data/cities/*.json` actually changed**. A new station
or line that Wikidata already knows about lands as a reviewable diff.

If the run fails at "Open a PR" with *GitHub Actions is not permitted to create
or approve pull requests*, enable it once in the repo: **Settings → Actions →
General → Workflow permissions → Allow GitHub Actions to create and approve pull
requests**. A Wikidata outage does not fail the run — that city keeps its last
committed file and the job logs a warning annotation instead.

To add a city: add one entry to `data/cities.config.json` (its Wikidata network
id + operator fare block) and run `data:refresh`. To fix a fare: edit that
operator's `fare` block.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · MapLibre GL (mapcn,
keyless CARTO tiles) · Zod · Vitest.
