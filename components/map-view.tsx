"use client";

import { useEffect, useMemo, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  useMap,
} from "@/components/ui/map";

export type MapPoint = {
  id: string;
  name: string;
  coord: [number, number];
  /** True where two or more lines meet, so the map can call it out. */
  interchange: boolean;
  /** True where this trip actually changes lines. */
  changeHere: boolean;
  /** One colour per line serving the station, deduped. Empty for single-line stops. */
  lineColors: string[];
};

/** One ride on one line — the map draws each in that line's own colour. */
export type RouteSegment = {
  id: string;
  color: string;
  coordinates: [number, number][];
  /** True for a walking transfer between systems: drawn dashed. */
  dashed?: boolean;
};

type Bounds = [[number, number], [number, number]];

const INDIA_CENTER: [number, number] = [78.96, 20.59];

function boundsOf(points: [number, number][]): Bounds {
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/**
 * Frames the map on the route, or on the whole city before a route exists.
 * Lives inside `<Map>` so it can wait for the map instance to exist.
 */
function FitTo({ bounds }: { bounds: Bounds | null }) {
  const { map } = useMap();
  const key = bounds ? bounds.flat().join(",") : "";

  useEffect(() => {
    if (!map || !bounds) return;
    // One frame later: the container has its final size by then, so the
    // padding is real and endpoints are not clipped at the edge.
    const frame = requestAnimationFrame(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 15 });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

/**
 * Reports the settled zoom so marker hit areas can grow as the map is zoomed
 * in. Updating on every frame would re-render every marker for nothing.
 */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const report = () => onChange(map.getZoom());
    report();
    map.on("zoomend", report);
    return () => {
      map.off("zoomend", report);
    };
  }, [map, onChange]);
  return null;
}

/**
 * Picks the station nearest a tap, not the marker element under it. A 10px dot
 * is a hard target on a phone, and in dense city centres the nearest station is
 * the right answer even when the finger lands a little off.
 */
function PickNearest({
  points,
  onPick,
}: {
  points: MapPoint[];
  onPick: (stationId: string) => void;
}) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const handler = (event: MapMouseEvent) => {
      const tap = map.project([event.lngLat.lng, event.lngLat.lat]);
      let nearest: MapPoint | null = null;
      let nearestDistance = 24;
      for (const point of points) {
        const projected = map.project(point.coord);
        const distance = Math.hypot(projected.x - tap.x, projected.y - tap.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = point;
        }
      }
      if (nearest) onPick(nearest.id);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, points, onPick]);
  return null;
}

/**
 * MapLibre touches `window` on import, so this module is only ever reached
 * through the ssr:false wrapper in route-map.tsx.
 */
export function MapView({
  geometry,
  points,
  segments,
  focusBounds,
  fromId,
  toId,
  onPick,
}: {
  geometry: [number, number][];
  points: MapPoint[];
  segments: RouteSegment[];
  /** Bounds of the whole city, so the map is useful before a route is picked. */
  focusBounds: Bounds | null;
  fromId: string | null;
  toId: string | null;
  onPick: (stationId: string) => void;
}) {
  const fitBounds = useMemo<Bounds | null>(
    () => (geometry.length > 1 ? boundsOf(geometry) : focusBounds),
    [geometry, focusBounds],
  );

  // A 10px dot is not a tap target. Padding grows with zoom, where stations are
  // far enough apart that bigger hit areas cannot steal each other's taps.
  const [zoom, setZoom] = useState(0);
  const tapPad = zoom >= 14 ? "p-3" : zoom >= 12 ? "p-2" : "p-1";

  const endpoint = (id: string | null) => id !== null && (id === fromId || id === toId);
  const colorOf = (id: string) => (id === fromId ? "#16a34a" : id === toId ? "#dc2626" : null);
  const ringOf = (point: MapPoint) => {
    const colors = [...new Set(point.lineColors)];
    if (colors.length === 0) return "#64748b";
    if (colors.length === 1) return colors[0];
    return `conic-gradient(${colors.join(", ")})`;
  };
  const hasChanges = points.some((point) => point.changeHere);

  return (
    <Map
      center={geometry[0] ?? INDIA_CENTER}
      zoom={geometry.length > 1 ? 11 : 4.4}
      className="h-full w-full"
    >
      <FitTo bounds={fitBounds} />
      <ZoomWatcher onChange={setZoom} />
      <PickNearest points={points} onPick={onPick} />
      {segments.map((segment) => (
        <MapRoute
          key={segment.id}
          id={`seg-${segment.id}`}
          coordinates={segment.coordinates}
          color={segment.color}
          width={5}
          opacity={0.9}
          dashArray={segment.dashed ? [1.5, 1.5] : undefined}
        />
      ))}
      {points.map((point) => {
        const color = colorOf(point.id);
        return (
          <MapMarker
            key={point.id}
            longitude={point.coord[0]}
            latitude={point.coord[1]}
            onClick={() => onPick(point.id)}
          >
            <MarkerContent className={tapPad}>
              {endpoint(point.id) ? (
                <span
                  className="block rounded-full border-2 border-white shadow"
                  style={{
                    width: 16,
                    height: 16,
                    background: color ?? "#64748b",
                  }}
                />
              ) : point.changeHere ? (
                <span
                  className="border-foreground bg-background block rounded-full border-[3px] shadow"
                  style={{ width: 14, height: 14 }}
                />
              ) : point.interchange ? (
                <span
                  className="block rounded-full border-2 border-white shadow"
                  style={{ width: 14, height: 14, background: ringOf(point) }}
                >
                  <span className="absolute top-1/2 left-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm" />
                </span>
              ) : (
                <span
                  className="block rounded-full border-2 border-white shadow"
                  style={{ width: 10, height: 10, background: point.lineColors[0] ?? "#64748b" }}
                />
              )}
            </MarkerContent>
            <MarkerTooltip>
              {point.name}
              {point.changeHere ? " · change here" : point.interchange ? " · interchange" : ""}
            </MarkerTooltip>
          </MapMarker>
        );
      })}
      {segments.length > 0 && (
        <div className="bg-background/95 pointer-events-none absolute top-2 left-2 z-10 space-y-1.5 rounded-md border px-2.5 py-2 text-[11px] shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#16a34a]" aria-hidden="true" />
            Start
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#dc2626]" aria-hidden="true" />
            Destination
          </div>
          {hasChanges && (
            <div className="flex items-center gap-2">
              <span className="border-foreground bg-background size-2.5 rounded-full border-2" aria-hidden="true" />
              Change here
            </div>
          )}
        </div>
      )}
      <MapControls showZoom showCompass={false} position="bottom-right" />
    </Map>
  );
}
