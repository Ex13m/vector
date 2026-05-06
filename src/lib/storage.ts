import { get, set, del, keys } from 'idb-keyval';
import type { LatLng } from './geo';

export type TrailPoint = { lat: number; lng: number; t: number };

export type Trip = {
  id: string;
  name: string;
  startedAt: number;
  finishedAt: number | null;
  distM: number;
  speedAvgMps: number;
  speedMaxMps: number;
  trail: TrailPoint[];
  reverse: boolean;
  finished: boolean;
  target: LatLng | null;
};

export type SavedTarget = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cachedTiles?: number;
  createdAt: number;
};

const TRIP_PREFIX = 'trip:';
const TARGET_PREFIX = 'target:';

export async function saveTrip(trip: Trip): Promise<void> {
  await set(TRIP_PREFIX + trip.id, trip);
}

export async function listTrips(): Promise<Trip[]> {
  const ks = (await keys()) as string[];
  const out: Trip[] = [];
  for (const k of ks) {
    if (typeof k === 'string' && k.startsWith(TRIP_PREFIX)) {
      const v = (await get(k)) as Trip | undefined;
      if (v) out.push(v);
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export async function deleteTrip(id: string) {
  await del(TRIP_PREFIX + id);
}

export async function renameTrip(id: string, name: string) {
  const t = (await get(TRIP_PREFIX + id)) as Trip | undefined;
  if (!t) return;
  t.name = name;
  await set(TRIP_PREFIX + id, t);
}

export async function saveTarget(t: SavedTarget): Promise<void> {
  await set(TARGET_PREFIX + t.id, t);
}

export async function listTargets(): Promise<SavedTarget[]> {
  const ks = (await keys()) as string[];
  const out: SavedTarget[] = [];
  for (const k of ks) {
    if (typeof k === 'string' && k.startsWith(TARGET_PREFIX)) {
      const v = (await get(k)) as SavedTarget | undefined;
      if (v) out.push(v);
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTarget(id: string) {
  await del(TARGET_PREFIX + id);
}

export function tripToGpx(trip: Trip): string {
  const pts = trip.trail
    .map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vector" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trip.name)}</name>
    <time>${new Date(trip.startedAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trip.name)}</name>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
}
