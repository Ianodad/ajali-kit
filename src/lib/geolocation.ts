// Wraps navigator.geolocation so capture of the scene location never blocks
// the flow (SPEC F2 edge state: "Location denied: field shows ... No
// blocking."). Resolves null instead of throwing for every failure case:
// denied permission, timeout, or no geolocation support at all.

export interface GeoResult {
  lat: number;
  lng: number;
  accuracyM?: number;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 60_000,
};

export function getCurrentPosition(options: PositionOptions = DEFAULT_OPTIONS): Promise<GeoResult | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
      },
      () => resolve(null),
      options,
    );
  });
}
