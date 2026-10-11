import type { City, Discount } from "./schema";

/**
 * Discounts are selected by id. They never stack: the traveller picks one fare
 * product, so a leg takes the best single discount that applies to it.
 */
export type DiscountSelection = Record<string, boolean>;

export function applyDiscount(amount: number, discount: Discount): number {
  const off = discount.kind === "percent" ? (amount * discount.value) / 100 : discount.value;
  return Math.max(0, amount - off);
}

export function discountedFare(
  amount: number,
  discounts: Discount[],
  selected: DiscountSelection,
): number {
  let best = amount;
  for (const discount of discounts) {
    if (!selected[discount.id]) continue;
    const candidate = applyDiscount(amount, discount);
    if (candidate < best) best = candidate;
  }
  return best;
}

/**
 * Selecting a discount clears the rest of its group, so DMRC's 10% smart-card
 * rate and its 20% off-peak rate — which already includes the 10% — cannot both
 * be counted.
 */
export function toggleDiscount(
  discounts: Discount[],
  selected: DiscountSelection,
  id: string,
): DiscountSelection {
  const next = { ...selected };
  const turningOn = !next[id];
  next[id] = turningOn;
  if (!turningOn) return next;

  const group = discounts.find((d) => d.id === id)?.group;
  if (group) {
    for (const other of discounts) {
      if (other.id !== id && other.group === group) next[other.id] = false;
    }
  }
  return next;
}

/** Discounts a city offers, deduplicated across operators. */
export function allDiscounts(city: City): Discount[] {
  const byId = new Map<string, Discount>();
  for (const operator of city.operators) {
    for (const discount of operator.discounts) {
      if (!byId.has(discount.id)) byId.set(discount.id, discount);
    }
  }
  return [...byId.values()];
}

/** Fare variants a city offers, e.g. DMRC's Sunday table. */
export function cityFareVariants(city: City): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const operator of city.operators) {
    for (const variant of operator.fareRules.variants) {
      if (!seen.has(variant.id)) seen.set(variant.id, variant.label);
    }
  }
  return [...seen].map(([id, label]) => ({ id, label }));
}
