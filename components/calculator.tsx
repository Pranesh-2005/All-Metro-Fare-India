"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { CityPicker } from "@/components/city-picker";
import { FareBreakdown } from "@/components/fare-breakdown";
import { RouteMap } from "@/components/route-map";
import type { MapPoint, RouteSegment } from "@/components/map-view";
import { StationPicker } from "@/components/station-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  allDiscounts,
  cityFareVariants,
  discountedFare,
  type DiscountSelection,
} from "@/lib/discounts";
import { planTripForCity, type Route } from "@/lib/fare/engine";
import { minutes, rupees } from "@/lib/format";
import { changeStationIds, journeySteps } from "@/lib/journey";
import type { City } from "@/lib/schema";

export function Calculator({ cities }: { cities: City[] }) {
  // Delhi NCR is the busiest network, so it is the best first thing to show.
  const defaultCity = cities.find((c) => c.id === "delhi") ?? cities[0];
  const [cityId, setCityId] = useState(defaultCity?.id ?? "");
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>("default");
  const [selection, setSelection] = useState<DiscountSelection>({});
  const [hydrated, setHydrated] = useState(false);

  // Reopen in the city the rider used last time. Runs after mount because
  // localStorage does not exist on the server.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("metro-city");
      if (stored && cities.some((city) => city.id === stored)) setCityId(stored);
    } catch {
      // Storage blocked: the default city still works.
    }
    setHydrated(true);
  }, [cities]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("metro-city", cityId);
    } catch {
      // Storage blocked: nothing to remember.
    }
  }, [cityId, hydrated]);

  const city = cities.find((c) => c.id === cityId) ?? cities[0];

  const plan = useMemo(() => {
    if (!city || !fromId || !toId || fromId === toId) return null;
    return planTripForCity(city, fromId, toId, variantId === "default" ? {} : { variant: variantId });
  }, [city, fromId, toId, variantId]);

  const variants = city ? cityFareVariants(city) : [];
  const discountOptions = city ? allDiscounts(city) : [];

  const changeIds = useMemo(
    () => (city && plan ? changeStationIds(journeySteps(plan.cheapest, city)) : new Set<string>()),
    [city, plan],
  );

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
        changeHere: changeIds.has(station.id),
        lineColors: service.colorsOf.get(station.id) ?? [],
      }));
  }, [city, plan, changeIds]);

  const segments = useMemo<RouteSegment[]>(
    () => (city && plan ? segmentsOf(plan.cheapest, city) : []),
    [city, plan],
  );

  // Tapping the map fills the empty field first; with both filled it starts a
  // fresh trip. It never wipes a station the user already picked.
  const pickOnMap = (stationId: string) => {
    if (!fromId) {
      setFromId(stationId);
      return;
    }
    if (!toId) {
      if (stationId !== fromId) setToId(stationId);
      return;
    }
    if (stationId === fromId || stationId === toId) return;
    setFromId(stationId);
    setToId(null);
  };

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const focusBounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!city || city.stations.length === 0) return null;
    const lons = city.stations.map((station) => station.coord[0]);
    const lats = city.stations.map((station) => station.coord[1]);
    return [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
  }, [city]);

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
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Metro fare, any Indian city</h1>
            <p className="text-muted-foreground text-sm">
              Pick where you start and where you go. You&rsquo;ll see the fare, the lines to take,
              and where to change.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="space-y-3">
          {cities.length > 1 && (
            <CityPicker
              cities={cities}
              value={cityId}
              onChange={(id) => {
                setCityId(id);
                setFromId(null);
                setToId(null);
              }}
            />
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3">
            <StationPicker
              label="From"
              dotColor="#16a34a"
              stations={city.stations}
              lines={city.lines}
              value={fromId}
              onChange={setFromId}
              onClear={() => setFromId(null)}
              placeholder="Origin station"
            />
            <button
              type="button"
              onClick={swap}
              disabled={!fromId && !toId}
              aria-label="Swap origin and destination"
              title="Swap origin and destination"
              className="border-input bg-background hover:bg-accent focus-visible:ring-ring row-span-2 flex size-11 items-center justify-center self-center rounded-full border shadow-sm transition active:scale-95 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
            >
              <ArrowUpDown className="size-4" aria-hidden="true" />
            </button>
            <StationPicker
              label="To"
              dotColor="#dc2626"
              stations={city.stations}
              lines={city.lines}
              value={toId}
              onChange={setToId}
              onClear={() => setToId(null)}
              placeholder="Destination station"
            />
          </div>
        </div>

        {variants.length > 0 && (
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium">
              Ticket type
            </label>
            <select
              className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              <option value="default">Standard fare</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-xs">
              Some cities charge differently for this ticket.
            </p>
          </div>
        )}

        {plan && discountOptions.length > 0 && (
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
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
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
          {!fromId ? (
            <p className="text-muted-foreground text-sm">
              Pick where you&rsquo;re starting from, or tap a station on the map.
            </p>
          ) : !toId ? (
            <p className="text-muted-foreground text-sm">
              Now pick where you&rsquo;re going, or tap a second station on the map.
            </p>
          ) : !plan ? (
            <p className="text-muted-foreground text-sm">
              No route connects those two stations. Try another pair.
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

      <div className="space-y-2 lg:sticky lg:top-8">
        <div className="h-[420px] overflow-hidden rounded-lg border lg:h-[calc(100vh-8rem)]">
          <RouteMap
            geometry={plan?.cheapest.geometry ?? []}
            points={mapPoints}
            segments={segments}
            focusBounds={focusBounds}
            fromId={fromId}
            toId={toId}
            onPick={pickOnMap}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Tap two stations on the map, or search above.
        </p>
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
    // A same-station change has no distance to draw; it still ends the run so
    // the next line starts in its own colour.
    if (!hop.lineId && from[0] === to[0] && from[1] === to[1]) {
      current = null;
      currentKey = null;
      continue;
    }
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
