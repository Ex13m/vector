import { get, set } from 'idb-keyval';
import type { LatLng } from '../lib/geo';

export type Trip = {
  id: string;
  name: string;
  startedAt: number;
  finishedAt: number | null;
  distM: number;
  durationSec: number;
  speedAvgMps: number;
  speedMaxMps: number;
  trail: Array<{ lat: number; lng: number; t: number }>;
  reverse: boolean;
  target: LatLng | null;
};

const KEY = 'trips.v1';

export async function loadTrips(): Promise<Trip[]> {
  const raw = (await get(KEY)) as Trip[] | undefined;
  return raw ?? [];
}

export async function saveTrip(trip: Trip): Promise<void> {
  const all = await loadTrips();
  await set(KEY, [trip, ...all].slice(0, 100));
}
