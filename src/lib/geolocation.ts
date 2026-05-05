import type { LatLng } from './geo';

export type Fix = LatLng & {
  accuracy: number;
  speed: number | null;
  heading: number | null;
  ts: number;
};

export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export type GeoListener = (fix: Fix) => void;
export type GeoErrListener = (err: GeoError) => void;

export function watchLocation(onFix: GeoListener, onError: GeoErrListener): () => void {
  if (!('geolocation' in navigator)) {
    onError('unsupported');
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        ts: pos.timestamp,
      }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) onError('denied');
      else if (err.code === err.POSITION_UNAVAILABLE) onError('unavailable');
      else onError('timeout');
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export async function getCurrentFix(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          ts: pos.timestamp,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10_000 },
    );
  });
}
