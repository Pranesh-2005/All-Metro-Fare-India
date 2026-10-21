"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export type PickerStation = { id: string; name: string; aliases: string[] };

type PickerLine = { id: string; name: string; color: string; stations: string[] };

/**
 * Search box over station names and aliases. Hand-rolled because the only
 * requirement is "filter a few hundred strings and pick one" — a combobox
 * dependency would be more code than this.
 */
export function StationPicker({
  label,
  stations,
  lines = [],
  value,
  onChange,
  onClear,
  placeholder,
  dotColor,
}: {
  label: string;
  stations: PickerStation[];
  lines?: PickerLine[];
  value: string | null;
  onChange: (stationId: string) => void;
  onClear?: () => void;
  placeholder?: string;
  /** Endpoint colour shown beside the label, matching the map markers. */
  dotColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = stations.find((station) => station.id === value) ?? null;

  // Which lines serve each station, so two similarly named stops can be told
  // apart in the results ("IGI Airport" vs "Terminal 1-IGI Airport").
  const stationLines = useMemo(() => {
    const map = new Map<string, PickerLine[]>();
    for (const line of lines) {
      for (const stationId of line.stations) {
        const served = map.get(stationId) ?? [];
        served.push(line);
        map.set(stationId, served);
      }
    }
    return map;
  }, [lines]);

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
      <label className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
        {dotColor && (
          <span
            className="size-2 rounded-full"
            style={{ background: dotColor }}
            aria-hidden="true"
          />
        )}
        {label}
      </label>
      <input
        aria-label={label}
        className="border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 pr-9 text-sm outline-none focus-visible:ring-2"
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
      {selected && !open && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()} station`}
          className="text-muted-foreground hover:text-foreground absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md"
          onClick={() => onClear?.()}
        >
          <X className="size-4" />
        </button>
      )}
      {open && (
        <ul
          role="listbox"
          className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-lg"
        >
          {matches.length === 0 && (
            <li className="text-muted-foreground px-3 py-2.5 text-sm">
              No station matches. Check the spelling, or switch city above.
            </li>
          )}
          {matches.map((station, index) => {
            const served = stationLines.get(station.id) ?? [];
            return (
              <li key={station.id} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                    index === highlight ? "bg-accent text-accent-foreground" : ""
                  }`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(station)}
                >
                  <span className="truncate">{station.name}</span>
                  {served.length > 0 && (
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: served[0].color }}
                        aria-hidden="true"
                      />
                      <span className="max-w-28 truncate">
                        {served[0].name.replace(/ \(\d+\)$/, "")}
                      </span>
                      {served.length > 1 && ` +${served.length - 1}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
