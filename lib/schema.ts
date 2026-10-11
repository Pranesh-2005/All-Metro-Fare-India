import { z } from "zod";

/** [longitude, latitude] — GeoJSON order, which is also what MapLibre expects. */
export const Coord = z.tuple([z.number(), z.number()]);

export const Slab = z.object({
  /**
   * Inclusive upper bound of the band, in km or station count depending on the
   * operator's `basis`. The last slab is the cap: it catches everything above
   * the previous bound, so it never needs a real number.
   */
  max: z.number(),
  fare: z.number().nonnegative(),
});

export const FareVariant = z.object({
  id: z.string(),
  label: z.string(),
  slabs: z.array(Slab).min(1),
});

export const FareRules = z.object({
  basis: z.enum(["distance_km", "station_count"]),
  slabs: z.array(Slab).min(1),
  /**
   * Alternative tables for the same operator, e.g. DMRC's reduced Sunday and
   * national-holiday fares. `slabs` is the default; a variant replaces it whole.
   */
  variants: z.array(FareVariant).default([]),
  /** ISO date the fares took effect, as published by the operator. */
  effectiveFrom: z.string(),
  /** "unverified" renders a warning in the UI. Never guess a fare silently. */
  confidence: z.enum(["verified", "unverified"]),
  sourceUrl: z.string().optional(),
  note: z.string().optional(),
});

export const Discount = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["percent", "flat"]),
  value: z.number().nonnegative(),
  /**
   * Discounts sharing a group are mutually exclusive and render as one choice —
   * e.g. DMRC's 10% smart-card discount versus its 20% off-peak rate, which
   * already includes that 10%.
   */
  group: z.string().optional(),
});

export const Operator = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  color: z.string(),
  fareRules: FareRules,
  discounts: z.array(Discount).default([]),
});

export const Line = z.object({
  id: z.string(),
  operator: z.string(),
  name: z.string(),
  color: z.string(),
  /** Ordered station ids, terminus to terminus. */
  stations: z.array(z.string()).min(2),
  /**
   * Published per-segment distances in km, length must be stations.length - 1.
   * Omit to fall back to haversine over station coordinates, which approximates
   * track distance. Where a known trip disagrees with the published fare,
   * measure the segment instead of fudging the slab.
   */
  segments: z.array(z.number()).optional(),
  /** Real track shape for map rendering. Derived from station coords if absent. */
  geometry: z.array(Coord).optional(),
});

export const Station = z.object({
  id: z.string(),
  name: z.string(),
  coord: Coord,
  /** Alternative spellings for the search box, e.g. old names. */
  aliases: z.array(z.string()).default([]),
});

export const Transfer = z.object({
  /** Station ids. Use this when two systems meet without a shared station node. */
  from: z.string(),
  to: z.string(),
  walkMeters: z.number().nonnegative().default(0),
  /** Reserved: a paid transfer would need its own fare rule. Only free is modelled. */
  free: z.boolean().default(true),
});

export const DEFAULT_TUNABLES = {
  rideSpeedKmph: 35,
  dwellMinutes: 0.5,
  transferMinutes: 4,
};

export const Tunables = z.object({
  /** Average speed including station dwell, km/h. */
  rideSpeedKmph: z.number().positive().default(DEFAULT_TUNABLES.rideSpeedKmph),
  /** Added per intermediate station, minutes. */
  dwellMinutes: z.number().nonnegative().default(DEFAULT_TUNABLES.dwellMinutes),
  /** Same-station line change, minutes. */
  transferMinutes: z.number().nonnegative().default(DEFAULT_TUNABLES.transferMinutes),
});

export const City = z.object({
  id: z.string(),
  name: z.string(),
  /** Surfaced in the UI so stale data is visible rather than silent. */
  dataVersion: z.object({ network: z.string(), fares: z.string() }),
  tunables: Tunables.default(DEFAULT_TUNABLES),
  operators: z.array(Operator).min(1),
  lines: z.array(Line).min(1),
  stations: z.array(Station).min(2),
  transfers: z.array(Transfer).default([]),
});

export type Coord = z.infer<typeof Coord>;
export type Slab = z.infer<typeof Slab>;
export type FareRules = z.infer<typeof FareRules>;
export type Discount = z.infer<typeof Discount>;
export type Operator = z.infer<typeof Operator>;
export type Line = z.infer<typeof Line>;
export type Station = z.infer<typeof Station>;
export type Transfer = z.infer<typeof Transfer>;
export type Tunables = z.infer<typeof Tunables>;
export type City = z.infer<typeof City>;
