"use client";

import type { Route } from "@/lib/fare/engine";
import { discountedFare, type DiscountSelection } from "@/lib/discounts";
import { km, minutes, rupees } from "@/lib/format";
import type { City } from "@/lib/schema";
import { ticketMessage, whatsappLink } from "@/lib/whatsapp";

export function FareBreakdown({
  city,
  route,
  selection,
}: {
  city: City;
  route: Route;
  selection: DiscountSelection;
}) {
  const operatorById = new Map(city.operators.map((operator) => [operator.id, operator]));
  const stationName = (id: string) => city.stations.find((s) => s.id === id)?.name ?? id;

  const legs = route.legs.map((leg) => {
    const operator = operatorById.get(leg.operatorId);
    return {
      ...leg,
      operator,
      fare: discountedFare(leg.fare, operator?.discounts ?? [], selection),
    };
  });
  const total = legs.reduce((sum, leg) => sum + leg.fare, 0);
  const saved = route.fare - total;

  // One link per distinct WhatsApp number: a route can cross operators that
  // share the same bot (DMRC and the Airport Express both use DMRC's).
  const payByNumber = new Map<string, { id: string; shortName: string; whatsapp: string }>();
  for (const leg of route.legs) {
    const operator = operatorById.get(leg.operatorId);
    if (operator?.whatsapp) {
      payByNumber.set(operator.whatsapp, {
        id: operator.id,
        shortName: operator.shortName,
        whatsapp: operator.whatsapp,
      });
    }
  }
  const payLinks = [...payByNumber.values()];
  const tripFrom = city.stations.find((s) => s.id === route.stations[0])?.name;
  const tripTo = city.stations.find((s) => s.id === route.stations[route.stations.length - 1])?.name;
  const message =
    tripFrom && tripTo
      ? ticketMessage({ city: city.name, from: tripFrom, to: tripTo, fare: rupees(total) })
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold tracking-tight">{rupees(total)}</div>
          <div className="text-muted-foreground text-xs">
            {saved > 0 ? (
              <>
                <span className="line-through">{rupees(route.fare)}</span> before discounts
              </>
            ) : (
              "total fare"
            )}
          </div>
        </div>
        <div className="text-muted-foreground text-right text-xs">
          {km(route.km)} · {route.stations.length} stations · {route.transfers} interchange
          {route.transfers === 1 ? "" : "s"}
          <br />
          about {minutes(route.minutes)}
        </div>
      </div>

      <ol className="divide-border divide-y">
        {legs.map((leg, index) => (
          <li key={index} className="flex items-start gap-3 py-2.5">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ background: leg.operator?.color ?? "#64748b" }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{leg.operator?.name ?? leg.operatorId}</div>
              <div className="text-muted-foreground truncate text-xs">
                {stationName(leg.fromStation)} → {stationName(leg.toStation)}
              </div>
              <div className="text-muted-foreground text-xs">
                {leg.basis === "station_count"
                  ? `${Math.round(leg.amount)} stops`
                  : km(leg.amount)}
              </div>
            </div>
            <div className="text-right text-sm font-medium tabular-nums">{rupees(leg.fare)}</div>
          </li>
        ))}
      </ol>

      {payLinks.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            {payLinks.map((operator) => (
              <a
                key={operator.id}
                href={whatsappLink(operator.whatsapp, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white transition hover:bg-[#1fb956]"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
                </svg>
                Pay via WhatsApp
                {payLinks.length > 1 ? ` · ${operator.shortName}` : ""}
              </a>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Opens the operator&rsquo;s WhatsApp chat with this trip and fare prefilled.
          </p>
        </div>
      )}

      {route.confidence === "unverified" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Fare unverified — one of these operators&rsquo; published table has not been confirmed
          against an official source yet. Treat this number as a guide, not a quote.
        </p>
      )}
    </div>
  );
}
