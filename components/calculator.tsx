"use client";

import { useMemo, useState } from "react";
import { FareBreakdown } from "@/components/fare-breakdown";
import { RouteMap } from "@/components/route-map";
import type { MapPoint, RouteSegment } from "@/components/map-view";
import { StationPicker } from "@/components/station-picker";
import {
  allDiscounts,
  cityFareVariants,
  discountedFare,
  type DiscountSelection,
} from "@/lib/discounts";
import { planTripForCity, type Route } from "@/lib/fare/engine";
import { minutes, rupees } from "@/lib/format";
import type { City } from "@/lib/schema";

export function Calculator({ cities }: { cities: City[] }) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>("default");
  const [selection, setSelection] = useState<DiscountSelection>({});

  const city = cities.find((c) => c.id === cityId) ?? cities[0];

  const plan = useMemo(() => {
    if (!city || !fromId || !toId || fromId === toId) return null;
    return planTripForCity(city, fromId, toId, variantId === "default" ? {} : { variant: variantId });
  }, [city, fromId, toId, variantId]);

  const variants = city ? cityFareVariants(city) : [];
  const discountOptions = city ? allDiscounts(city) : [];

  const mapPoints = useMemo<MapPoint[]>(() => {
    if (!city) return [];
    const onRoute = new Set(plan?.cheapest.stations ?? []);
    const ids = onRoute.size > 0 ? onRoute : null;
    const service = stationService(city);
    return city.stations
      .filter((station) => !ids || ids.has(station.id))
      .map((station) => ({
        id: station.id,
        name: station.name,
        coord: station.coord,
        interchange: service.interchanges.has(station.id),
        lineColors: service.colorsOf.get(station.id) ?? [],
      }));
  }, [city, plan]);

  const segments = useMemo<RouteSegment[]>(
    () => (city && plan ? segmentsOf(plan.cheapest, city) : []),
    [city, plan],
  );

  const pickStation = (stationId: string) => {
    if (!fromId || (fromId && toId)) {
      setFromId(stationId);
      setToId(null);
      return;
    }
    if (stationId === fromId) return;
    setToId(stationId);
  };

  if (!city) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">No network data yet</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Add a city file under <code>data/cities/</code> and reload. Each file is a plain JSON
          network plus its operators&rsquo; fare tables.
        </p>
      </div>
    );
  }

  const discountedTotal = plan
    ? plan.cheapest.legs.reduce((sum, leg) => {
        const operator = city.operators.find((op) => op.id === leg.operatorId);
        return sum + discountedFare(leg.fare, operator?.discounts ?? [], selection);
      }, 0)
    : 0;

  const fastestIsBetter =
    plan && !plan.sameRoute && plan.fastest.minutes < plan.cheapest.minutes - 3;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Metro fare, any Indian city</h1>
          <p className="text-muted-foreground text-sm">
            Fares are computed from each operator&rsquo;s own published slabs, so a trip that crosses
            two systems shows two fares.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {cities.length > 1 && (
            <div className="sm:col-span-2">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">City</label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={cityId}
                onChange={(event) => {
                  setCityId(event.target.value);
                  setFromId(null);
                  setToId(null);
                }}
              >
                {cities.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <StationPicker
            label="From"
            stations={city.stations}
            value={fromId}
            onChange={pickStation}
            placeholder="Origin station"
          />
          <StationPicker
            label="To"
            stations={city.stations}
            value={toId}
            onChange={(id) => id !== fromId && setToId(id)}
            placeholder="Destination station"
          />
        </div>

        {variants.length > 0 && (
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium">Fare table</label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              <option value="default">Standard</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {discountOptions.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-muted-foreground mb-1 text-xs font-medium">
              Concession (pick one per group)
            </legend>
            <div className="flex flex-wrap gap-2">
              {discountOptions.map((discount) => {
                const on = Boolean(selection[discount.id]);
                return (
                  <button
                    key={discount.id}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent"
                    }`}
                    onClick={() => setSelection((prev) => toggleIn(discountOptions, prev, discount.id))}
                  >
                    {discount.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="rounded-lg border p-4">
          {!fromId || !toId ? (
            <p className="text-muted-foreground text-sm">
              Pick an origin and a destination, or tap a station on the map.
            </p>
          ) : !plan ? (
            <p className="text-muted-foreground text-sm">
              No route found between those two stations.
            </p>
          ) : (
            <div className="space-y-4">
              <FareBreakdown city={city} route={plan.cheapest} selection={selection} />
              {fastestIsBetter && (
                <p className="text-muted-foreground border-t pt-3 text-xs">
                  A faster route exists: {minutes(plan.fastest.minutes)} instead of{" "}
                  {minutes(plan.cheapest.minutes)}, for {rupees(plan.fastest.fare)}.
                </p>
              )}
              <p className="text-muted-foreground border-t pt-3 text-xs">
                Network {city.dataVersion.network} · fares {city.dataVersion.fares}
                {discountedTotal !== plan.cheapest.fare && " · discounts applied"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="h-[420px] overflow-hidden rounded-lg border lg:sticky lg:top-8 lg:h-[calc(100vh-6rem)]">
        <RouteMap
          geometry={plan?.cheapest.geometry ?? []}
          points={mapPoints}
          segments={segments}
          fromId={fromId}
          toId={toId}
          onPick={pickStation}
        />
      </div>
    </div>
  );
}

function toggleIn(
  options: { id: string; group?: string }[],
  selected: DiscountSelection,
  id: string,
): DiscountSelection {
  const next = { ...selected };
  const turningOn = !next[id];
  next[id] = turningOn;
  const group = options.find((option) => option.id === id)?.group;
  if (turningOn && group) {
    for (const option of options) {
      if (option.id !== id && option.group === group) next[option.id] = false;
    }
  }
  return next;
}

/** Which lines serve each station — drives marker colour and the interchange ring. */
function stationService(city: City) {
  const colorsOf = new Map<string, string[]>();
  const groups = new Map<string, Set<string>>();
  for (const line of city.lines) {
    // Branch chains are named "Magenta Line (1)" / "(2)": the same real line,
    // so they must not make their shared junction look like an interchange.
    const group = line.name.replace(/ \(\d+\)$/, "");
    for (const id of line.stations) {
      colorsOf.set(id, [...(colorsOf.get(id) ?? []), line.color]);
      const served = groups.get(id) ?? new Set<string>();
      served.add(group);
      groups.set(id, served);
    }
  }
  const interchanges = new Set(
    [...groups].filter(([, served]) => served.size > 1).map(([id]) => id),
  );
  return { colorsOf, interchanges };
}

/** Split a route into runs on one line so each can be drawn in that line's colour. */
function segmentsOf(route: Route, city: City): RouteSegment[] {
  const coord = new Map(city.stations.map((s) => [s.id, s.coord]));
  const color = new Map(city.lines.map((l) => [l.id, l.color]));
  const out: RouteSegment[] = [];
  let current: RouteSegment | null = null;
  let currentKey: string | null = null;
  for (const hop of route.hops) {
    const from = coord.get(hop.fromStation);
    const to = coord.get(hop.toStation);
    if (!from || !to) continue;
    const key = hop.lineId ?? "walk";
    if (!current || currentKey !== key) {
      current = {
        id: `${key}-${out.length}`,
        color: hop.lineId ? (color.get(hop.lineId) ?? "#2563eb") : "#64748b",
        coordinates: [from],
        dashed: !hop.lineId,
      };
      currentKey = key;
      out.push(current);
    }
    current.coordinates.push(to);
  }
  return out;
}
