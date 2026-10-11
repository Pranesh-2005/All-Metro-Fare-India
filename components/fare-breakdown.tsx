"use client";

import type { Route } from "@/lib/fare/engine";
import { discountedFare, type DiscountSelection } from "@/lib/discounts";
import { km, minutes, rupees } from "@/lib/format";
import type { City } from "@/lib/schema";

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

      {route.confidence === "unverified" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Fare unverified — one of these operators&rsquo; published table has not been confirmed
          against an official source yet. Treat this number as a guide, not a quote.
        </p>
      )}
    </div>
  );
}
