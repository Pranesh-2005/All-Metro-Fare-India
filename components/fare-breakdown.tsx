"use client";

import { useState } from "react";
import { ArrowLeftRight, ArrowRight, Check, Copy } from "lucide-react";
import type { Route } from "@/lib/fare/engine";
import { discountedFare, type DiscountSelection } from "@/lib/discounts";
import { km, minutes, rupees } from "@/lib/format";
import { changeCount, journeySteps } from "@/lib/journey";
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
  const lineById = new Map(city.lines.map((line) => [line.id, line]));
  const stationName = (id: string) => city.stations.find((s) => s.id === id)?.name ?? id;

  const steps = journeySteps(route, city);
  const changes = changeCount(steps);

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

  // Plain text a rider can paste into a chat: the trip, each ride and change,
  // and the total.
  const tripText = [
    tripFrom && tripTo ? `${tripFrom} → ${tripTo}` : city.name,
    ...steps.map((step) =>
      step.kind === "ride"
        ? `${step.lineName}${step.towards ? ` towards ${step.towards}` : ""}: ${stationName(step.fromStation)} → ${stationName(step.toStation)}`
        : `Change at ${stationName(step.atStation)}${
            step.walkTo ? ` (walk to ${stationName(step.walkTo)})` : ""
          }${
            step.toLineId
              ? ` to ${lineById.get(step.toLineId)?.name.replace(/ \(\d+\)$/, "") ?? "the next line"}`
              : ""
          }`,
    ),
    `${rupees(total)} · ${km(route.km)} · about ${minutes(route.minutes)}`,
    "metro-fare.vercel.app",
  ].join("\n");

  const [copied, setCopied] = useState(false);

  const copyTrip = async () => {
    try {
      await navigator.clipboard.writeText(tripText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: leave the button as is.
    }
  };

  return (
    <div className="space-y-5">
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
          {km(route.km)} · {route.stations.length} stations ·{" "}
          {changes === 0 ? "direct" : `${changes} change${changes === 1 ? "" : "s"}`}
          <br />
          about {minutes(route.minutes)}
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) =>
          step.kind === "ride" ? (
            <li key={index} className="flex gap-3">
              <span
                className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                style={{ background: step.color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{step.lineName}</span>
                  {step.towards && (
                    <span className="text-muted-foreground text-xs">
                      towards {step.towards}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{stationName(step.fromStation)}</span>
                  <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{stationName(step.toStation)}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {step.stops} stop{step.stops === 1 ? "" : "s"} · {km(step.km)}
                </div>
              </div>
            </li>
          ) : (
            <li
              key={index}
              className="text-muted-foreground bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2 text-xs"
            >
              <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Change at <span className="text-foreground font-medium">{stationName(step.atStation)}</span>
                {step.walkTo && (
                  <>
                    , walk {step.walkKm ? km(step.walkKm) : "a short distance"} to{" "}
                    {stationName(step.walkTo)}
                  </>
                )}
                {step.toLineId && lineById.get(step.toLineId) && (
                  <> to {lineById.get(step.toLineId)!.name.replace(/ \(\d+\)$/, "")}</>
                )}
              </span>
            </li>
          ),
        )}
      </ol>

      {legs.length > 1 && (
        <div className="border-t pt-3">
          <div className="text-muted-foreground mb-2 text-xs font-medium">Fare by operator</div>
          <ol className="space-y-2">
            {legs.map((leg, index) => (
              <li key={index} className="flex items-start gap-3">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: leg.operator?.color ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{leg.operator?.name ?? leg.operatorId}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {stationName(leg.fromStation)} → {stationName(leg.toStation)}
                    {" · "}
                    {leg.basis === "station_count"
                      ? `${Math.round(leg.amount)} stops`
                      : km(leg.amount)}
                  </div>
                </div>
                <div className="text-right text-sm font-medium tabular-nums">{rupees(leg.fare)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="space-y-1.5 border-t pt-3">
        <div className="flex flex-wrap gap-2">
            {payLinks.map((operator) => (
              <a
                key={operator.id}
                href={whatsappLink(operator.whatsapp, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-medium text-white transition hover:bg-[#1fb956]"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
                </svg>
                Pay on WhatsApp
                {payLinks.length > 1 ? ` · ${operator.shortName}` : ""}
              </a>
            ))}
            <button
              type="button"
              onClick={copyTrip}
              className="border-input hover:bg-accent focus-visible:ring-ring inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition active:scale-[0.98] focus-visible:ring-2 focus-visible:outline-none"
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              <span aria-live="polite">{copied ? "Copied" : "Copy trip"}</span>
            </button>
          </div>
          {payLinks.length > 0 && (
            <p className="text-muted-foreground text-xs">
              This site does not take payments. The button opens the operator&rsquo;s WhatsApp
              chat with your trip and fare prefilled.
            </p>
          )}
        </div>

      {route.confidence === "unverified" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Fare unverified. One of these operators has not been confirmed against an official
          source yet, so treat this number as a guide, not a quote.
        </p>
      )}
    </div>
  );
}
