import type { Slab } from "../schema";

/**
 * Fare for a leg that has covered `amount` (km or stations, per the operator's
 * basis). Slabs must be ascending by `max`; the last one acts as the cap.
 *
 * Amount 0 returns the first slab, so entering a system always costs at least
 * its minimum fare — which is also what makes a cross-operator transfer charge
 * the second system's minimum rather than nothing.
 */
export function fareAt(slabs: Slab[], amount: number): number {
  for (const slab of slabs) {
    if (amount <= slab.max) return slab.fare;
  }
  return slabs[slabs.length - 1].fare;
}

/**
 * Fare added by travelling from `fromAmount` to `toAmount` on one leg. Slabs are
 * monotonic, so this is never negative, which is what lets the fare search use
 * plain Dijkstra over incremental cost.
 */
export function incrementalFare(slabs: Slab[], fromAmount: number, toAmount: number): number {
  return fareAt(slabs, toAmount) - fareAt(slabs, fromAmount);
}

/**
 * The last slab's `max` doubles as the cap: it means "this bound and above", so
 * the fare stops growing past it and distance can be clamped there without
 * changing the answer. The engine relies on this to collapse search states.
 */
export function capAmount(slabs: Slab[]): number {
  return slabs[slabs.length - 1].max;
}

/** Ascending `max` and non-decreasing fares — the invariants the engine assumes. */
export function slabsAreMonotonic(slabs: Slab[]): boolean {
  for (let i = 1; i < slabs.length; i++) {
    if (slabs[i].max <= slabs[i - 1].max) return false;
    if (slabs[i].fare < slabs[i - 1].fare) return false;
  }
  return true;
}
