import type { FareRules, Slab } from "../lib/schema";

/**
 * Fare scrapers — the plan's second tier. Topology comes from Wikidata, but no
 * open dataset carries fare tables, so each operator *may* register a scraper
 * that fetches its published fare page and returns slabs. A scraper is allowed
 * to fail: on any error (site down, markup changed, nothing parsed) we keep the
 * curated fallback from cities.config.json rather than ship a wrong number.
 *
 * Reality check: most Indian metro operators publish fares only through a
 * JavaScript "fare calculator", not a static table, so there is nothing to
 * scrape without driving a headless browser station-by-station. Those stay
 * curated-and-`unverified` until a human fills in a source. The registry below
 * is the seam where a real scraper slots in — add one entry, nothing else
 * changes. A scraper that returns slabs marks the operator `verified`.
 */

export type FareScraper = () => Promise<{ slabs: Slab[]; sourceUrl: string; effectiveFrom?: string }>;

const UA = "metro-fare/1.0 (fare refresh; https://github.com/metro-fare)";

/** Fetch a page as text, with a hard timeout so a hung site can't stall a run. */
export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull "<n> km … ₹<fare>" rows out of a static fare table. Returns null when the
 * page yields nothing usable (the common case for JS-only fare pages), which
 * tells the caller to keep its curated fallback.
 */
export function parseSlabTable(html: string): Slab[] | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const rows = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*km[^₹]{0,40}₹\s*(\d+)/gi)];
  if (rows.length < 2) return null;
  const slabs: Slab[] = rows.map((m) => ({ max: Number(m[2]), fare: Number(m[3]) }));
  // Only trust a clean ascending table; anything non-monotonic means we misread it.
  for (let i = 1; i < slabs.length; i++) {
    if (slabs[i].max <= slabs[i - 1].max || slabs[i].fare < slabs[i - 1].fare) return null;
  }
  slabs[slabs.length - 1].max = 999; // top band is the cap
  return slabs;
}

/**
 * Per-operator scrapers. Empty by default: every entry here must be verified by
 * hand against the live page before being trusted, and none has been yet. To
 * add one, map the operator id to a function returning parsed slabs, e.g.:
 *
 *   dmrc: async () => {
 *     const slabs = parseSlabTable(await fetchText("https://.../fare"));
 *     if (!slabs) throw new Error("no table");
 *     return { slabs, sourceUrl: "https://.../fare" };
 *   },
 */
const SCRAPERS: Record<string, FareScraper> = {};

/**
 * Returns the operator's fare rules: scraped-and-verified when a scraper exists
 * and succeeds, otherwise the curated fallback untouched. Never throws.
 */
export async function scrapeFares(operatorId: string, fallback: FareRules): Promise<FareRules> {
  const scraper = SCRAPERS[operatorId];
  if (!scraper) return fallback;
  try {
    const { slabs, sourceUrl, effectiveFrom } = await scraper();
    return {
      ...fallback,
      slabs,
      sourceUrl,
      effectiveFrom: effectiveFrom ?? fallback.effectiveFrom,
      confidence: "verified",
    };
  } catch (error) {
    console.warn(`  (scraper for ${operatorId} failed: ${(error as Error).message} — keeping curated fare)`);
    return fallback;
  }
}
