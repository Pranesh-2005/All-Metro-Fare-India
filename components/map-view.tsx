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

export type MapPoint = { id: string; name: string; coord: [number, number] };

const INDIA_CENTER: [number, number] = [78.96, 20.59];

/**
 * MapLibre touches `window` on import, so this module is only ever reached
 * through the ssr:false wrapper in route-map.tsx.
 */
export function MapView({
  geometry,
  points,
  fromId,
  toId,
  onPick,
}: {
  geometry: [number, number][];
  points: MapPoint[];
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

  return (
    <Map
      ref={mapRef}
      center={geometry[0] ?? INDIA_CENTER}
      zoom={geometry.length > 1 ? 11 : 4.4}
      className="h-full w-full"
    >
      {geometry.length > 1 && (
        <MapRoute coordinates={geometry} color="#2563eb" width={5} opacity={0.9} />
      )}
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
              <span
                className="block rounded-full border-2 border-white shadow"
                style={{
                  width: endpoint(point.id) ? 16 : 10,
                  height: endpoint(point.id) ? 16 : 10,
                  background: color ?? "#64748b",
                }}
              />
            </MarkerContent>
            <MarkerTooltip>{point.name}</MarkerTooltip>
          </MapMarker>
        );
      })}
      <MapControls showZoom showCompass={false} position="bottom-right" />
    </Map>
  );
}
