"use client";

import dynamic from "next/dynamic";
import type { MapPoint, RouteSegment } from "./map-view";

/**
 * MapLibre needs a browser, so the map is loaded without SSR and only once the
 * page is interactive.
 */
const MapView = dynamic(() => import("./map-view").then((mod) => mod.MapView), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
      Loading map…
    </div>
  ),
});

export function RouteMap(props: {
  geometry: [number, number][];
  points: MapPoint[];
  segments: RouteSegment[];
  focusBounds: [[number, number], [number, number]] | null;
  fromId: string | null;
  toId: string | null;
  onPick: (stationId: string) => void;
}) {
  return <MapView {...props} />;
}
