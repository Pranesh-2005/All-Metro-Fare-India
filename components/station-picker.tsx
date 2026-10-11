"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerStation = { id: string; name: string; aliases: string[] };

/**
 * Search box over station names and aliases. Hand-rolled because the only
 * requirement is "filter a few hundred strings and pick one" — a combobox
 * dependency would be more code than this.
 */
export function StationPicker({
  label,
  stations,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  stations: PickerStation[];
  value: string | null;
  onChange: (stationId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = stations.find((station) => station.id === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? stations.filter(
          (station) =>
            station.name.toLowerCase().includes(needle) ||
            station.aliases.some((alias) => alias.toLowerCase().includes(needle)),
        )
      : stations;
    return pool.slice(0, 60);
  }, [stations, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pick = (station: PickerStation) => {
    onChange(station.id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="text-muted-foreground mb-1 block text-xs font-medium">{label}</label>
      <input
        className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-1"
        value={open ? query : (selected?.name ?? "")}
        placeholder={placeholder ?? "Search a station"}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (event.key === "Enter") {
            const station = matches[highlight];
            if (open && station) {
              event.preventDefault();
              pick(station);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          role="listbox"
          className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-lg"
        >
          {matches.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-sm">No station matches</li>
          )}
          {matches.map((station, index) => (
            <li key={station.id} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-left text-sm ${
                  index === highlight ? "bg-accent text-accent-foreground" : ""
                }`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(station)}
              >
                {station.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
