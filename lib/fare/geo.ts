import type { Coord } from "../schema";

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

/**
 * Great-circle distance in km. This approximates track distance between two
 * stations; metro track is close to straight between adjacent stops, so the
 * error per segment is small, but it is not zero. Where an operator's published
 * station-to-station fare disagrees with a slab computed from this, put the
 * real per-segment km in the line's `segments` array instead of widening a slab.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Walking distance in metres to minutes, at a leisurely 1.3 m/s. */
export function walkMetersToMinutes(meters: number): number {
  return meters / 1.3 / 60;
}
