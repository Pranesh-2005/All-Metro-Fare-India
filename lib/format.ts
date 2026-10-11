export const rupees = (amount: number) => `₹${Math.round(amount)}`;

export const km = (amount: number) => `${amount.toFixed(1)} km`;

export function minutes(total: number): string {
  const rounded = Math.round(total);
  if (rounded < 60) return `${rounded} min`;
  return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}
