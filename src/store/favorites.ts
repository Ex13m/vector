import { get, set } from 'idb-keyval';
import type { LatLng } from '../lib/geo';

export type Favorite = {
  id: string;
  name: string;
  point: LatLng;
  createdAt: number;
};

const KEY = 'favorites.v1';

export async function loadFavorites(): Promise<Favorite[]> {
  const raw = (await get(KEY)) as Favorite[] | undefined;
  return raw ?? [];
}

export async function saveFavorites(list: Favorite[]): Promise<void> {
  await set(KEY, list);
}

export async function addFavorite(fav: Favorite): Promise<Favorite[]> {
  const list = await loadFavorites();
  const next = [fav, ...list.filter((f) => f.id !== fav.id)].slice(0, 50);
  await saveFavorites(next);
  return next;
}

export async function removeFavorite(id: string): Promise<Favorite[]> {
  const list = await loadFavorites();
  const next = list.filter((f) => f.id !== id);
  await saveFavorites(next);
  return next;
}
