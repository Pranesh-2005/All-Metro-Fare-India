"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { nearestCity } from "@/lib/city";
import type { City } from "@/lib/schema";

/**
 * City search with a locate shortcut. Twenty native options are unusable on a
 * phone once the networks start overlapping (Noida vs Delhi NCR), so the list
 * filters as you type.
 */
export function CityPicker({
  cities,
  value,
  onChange,
}: {
  cities: City[];
  value: string;
  onChange: (cityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = cities.find((city) => city.id === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cities;
    return cities.filter((city) => city.name.toLowerCase().includes(needle));
  }, [cities, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pick = (city: City) => {
    onChange(city.id);
    setQuery("");
    setOpen(false);
    setError(null);
  };

  const locate = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Location is not available here. Pick your city from the list.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const best = nearestCity(cities, position.coords.latitude, position.coords.longitude);
        if (best) pick(best);
        else setError("No metro network found near you. Pick your city from the list.");
      },
      () => {
        setLocating(false);
        setError("Could not get your location. Pick your city from the list.");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div ref={boxRef}>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-muted-foreground text-xs font-medium" htmlFor="city-search">
          City
        </label>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium disabled:opacity-50"
        >
          <LocateFixed className="size-3.5" aria-hidden="true" />
          {locating ? "Finding…" : "Use my city"}
        </button>
      </div>
      <div className="relative">
        <input
          id="city-search"
          aria-label="City"
          role="combobox"
          aria-expanded={open}
          aria-controls="city-options"
          className="border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
          value={open ? query : (selected?.name ?? "")}
          placeholder="Search your city"
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            const match = cities.find(
              (city) =>
                city.name.toLowerCase() === event.target.value.trim().toLowerCase(),
            );
            if (match) pick(match);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              pick(matches[0]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && (
          <ul
            id="city-options"
            role="listbox"
            className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-lg"
          >
            {matches.length === 0 && (
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                No city matches.
              </li>
            )}
            {matches.map((city) => (
              <li key={city.id} role="option" aria-selected={city.id === value}>
                <button
                  type="button"
                  className="hover:bg-accent hover:text-accent-foreground w-full px-3 py-2.5 text-left text-sm"
                  onClick={() => pick(city)}
                >
                  {city.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
