"use client";

import { useEffect, useRef } from "react";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";

export type MapPoint = {
  id: string;
  name: string;
  coord: [number, number];
  /** True where two or more lines meet, so the map can call it out. */
  interchange: boolean;
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

const INDIA_CENTER: [number, number] = [78.96, 20.59];

/**
 * MapLibre touches `window` on import, so this module is only ever reached
 * through the ssr:false wrapper in route-map.tsx.
 */
export function MapView({
  geometry,
  points,
  segments,
  fromId,
  toId,
  onPick,
}: {
  geometry: [number, number][];
  points: MapPoint[];
  segments: RouteSegment[];
  fromId: string | null;
  toId: string | null;
  onPick: (stationId: string) => void;
}) {
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || geometry.length === 0) return;
    const lons = geometry.map((point) => point[0]);
    const lats = geometry.map((point) => point[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 56, duration: 0 },
    );
  }, [geometry]);

  const endpoint = (id: string | null) => id !== null && (id === fromId || id === toId);
  const colorOf = (id: string) => (id === fromId ? "#16a34a" : id === toId ? "#dc2626" : null);
  const ringOf = (point: MapPoint) => {
    const colors = [...new Set(point.lineColors)];
    if (colors.length === 0) return "#64748b";
    if (colors.length === 1) return colors[0];
    return `conic-gradient(${colors.join(", ")})`;
  };

  return (
    <Map
      ref={mapRef}
      center={geometry[0] ?? INDIA_CENTER}
      zoom={geometry.length > 1 ? 11 : 4.4}
      className="h-full w-full"
    >
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
            <MarkerContent>
              {point.interchange && !endpoint(point.id) ? (
                <span
                  className="block rounded-full border-2 border-white shadow"
                  style={{ width: 14, height: 14, background: ringOf(point) }}
                >
                  <span className="absolute top-1/2 left-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm" />
                </span>
              ) : (
                <span
                  className="block rounded-full border-2 border-white shadow"
                  style={{
                    width: endpoint(point.id) ? 16 : 10,
                    height: endpoint(point.id) ? 16 : 10,
                    background: color ?? (point.interchange ? ringOf(point) : "#64748b"),
                  }}
                />
              )}
            </MarkerContent>
            <MarkerTooltip>
              {point.name}
              {point.interchange ? " · interchange" : ""}
            </MarkerTooltip>
          </MapMarker>
        );
      })}
      <MapControls showZoom showCompass={false} position="bottom-right" />
    </Map>
  );
}
