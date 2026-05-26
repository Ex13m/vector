// Геодезия + ядро концепции «направление по часам».

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export type LatLng = { lat: number; lng: number };

// ── Shared last-known GPS position.
// Пишется из GPS-callback любого экрана, читается синхронно при создании
// карты PickScreen — карта стартует УЖЕ центрированной, без flyTo-анимации.
// Персистится в localStorage чтобы не терять между перезапусками.
const _POS_KEY = 'vector.lastPos';
let _lastKnownPos: LatLng | null = (() => {
  try {
    const raw = localStorage.getItem(_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') return p as LatLng;
  } catch { /* ignore */ }
  return null;
})();
export function setLastKnownPos(pos: LatLng) {
  _lastKnownPos = pos;
  try { localStorage.setItem(_POS_KEY, JSON.stringify({ lat: pos.lat, lng: pos.lng })); } catch { /* ignore */ }
}
export function getLastKnownPos(): LatLng | null { return _lastKnownPos; }

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingTo(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 1..12 (12 = прямо вперёд по курсу)
export function relativeToClock(rel: number): number {
  const norm = ((rel % 360) + 360) % 360;
  const hr = Math.round(norm / 30) % 12;
  return hr === 0 ? 12 : hr;
}

// Формат «H:MM» — шаг 5 минут циферблата (2.5° на шаг, 144 сектора).
// 12:00 = прямо по курсу. Дальше 12:05, 12:10, … 11:55.
export function relativeToClockHM(rel: number): string {
  const norm = ((rel % 360) + 360) % 360;
  // bearing × 2 = clock-minutes, округляем к ближайшим 5
  const totalMin = (Math.round(norm / 2.5) * 5) % 720;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h === 0 ? 12 : h}:${String(m).padStart(2, '0')}`;
}

export function fmtDist(m: number, units: 'metric' | 'imperial' = 'metric') {
  if (units === 'imperial') {
    const ft = m * 3.28084;
    if (ft < 1000) return { v: Math.round(ft).toString(), u: 'ft' };
    return { v: (ft / 5280).toFixed(2), u: 'mi' };
  }
  if (m < 1000) return { v: Math.round(m).toString(), u: 'm' };
  return { v: (m / 1000).toFixed(2), u: 'km' };
}

export function fmtSpeed(mps: number, units: 'metric' | 'imperial' = 'metric') {
  if (units === 'imperial') return { v: (mps * 2.23694).toFixed(1), u: 'mph' };
  return { v: (mps * 3.6).toFixed(0), u: 'km/h' };
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
  const min = distM / mps / 60;
  if (min < 60) return `${Math.max(1, Math.round(min))}`;
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
}
