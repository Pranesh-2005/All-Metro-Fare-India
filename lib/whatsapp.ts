/**
 * Ticket links for operators with an official WhatsApp booking bot.
 *
 * Numbers are stored digits-only with the country code (e.g. "919650855800"),
 * which is exactly what wa.me expects. The message is prefilled, not sent: the
 * traveller still confirms it in WhatsApp.
 */
export function whatsappLink(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function ticketMessage({
  city,
  from,
  to,
  fare,
}: {
  city: string;
  from: string;
  to: string;
  fare: string;
}): string {
  return `Hi, I want to book a metro ticket in ${city} from ${from} to ${to}. Fare ${fare}.`;
}
