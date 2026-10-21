type Located = { stations: { coord: [number, number] }[] };

/**
 * Nearest metro network to a coordinate, for the "use my city" shortcut.
 * Generic over anything station-shaped so it can be tested without building a
 * whole city document.
 */
export function nearestCity<T extends Located>(
  cities: T[],
  latitude: number,
  longitude: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const city of cities) {
    const centre = centroid(city);
    if (!centre) continue;
    // ponytail: plain degree distance; cities are hundreds of km apart, so the
    // cosine correction would not change the winner.
    const distance = (centre[1] - latitude) ** 2 + (centre[0] - longitude) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = city;
    }
  }
  return best;
}

function centroid(city: Located): [number, number] | null {
  if (city.stations.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const station of city.stations) {
    lon += station.coord[0];
    lat += station.coord[1];
  }
  return [lon / city.stations.length, lat / city.stations.length];
}
