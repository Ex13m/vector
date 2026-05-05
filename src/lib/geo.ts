export type LatLng = { lat: number; lng: number };

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingTo(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function relativeBearing(absolute: number, heading: number): number {
  return (((absolute - heading) % 360) + 360) % 360;
}

export function bearingToClock(rel: number): number {
  const hr = Math.round(rel / 30) % 12;
  return hr === 0 ? 12 : hr;
}

export function fmtDistance(m: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const mi = m * 0.000621371;
    if (mi >= 0.1) return `${mi.toFixed(2)} mi`;
    return `${Math.round(m * 3.28084)} ft`;
  }
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function fmtDistanceShort(m: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const mi = m * 0.000621371;
    return mi >= 0.1 ? `${mi.toFixed(1)}mi` : `${Math.round(m * 3.28084)}ft`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

export function fmtSpeed(mps: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') return `${(mps * 2.23694).toFixed(1)}`;
  return `${(mps * 3.6).toFixed(1)}`;
}

export function speedUnit(units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? 'mi/h' : 'km/h';
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtETA(distM: number, mps: number): string {
  if (!mps || mps < 0.5) return '—';
  return fmtTime(distM / mps);
}
