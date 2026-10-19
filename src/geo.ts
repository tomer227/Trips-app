export interface Coords {
  lat: number;
  lng: number;
}

/** One-off location lookup that never throws: resolves to null when denied, unavailable or too slow. */
export function getPosition(timeoutMs = 8000): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}
