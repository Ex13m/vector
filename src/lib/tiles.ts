import { get, set, del, keys } from 'idb-keyval';

export type TilePoint = { x: number; y: number; z: number };
export type LngLatBox = { west: number; south: number; east: number; north: number };

const TILE_PREFIX = 'tile:';

export function lngLat2Tile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function tilesForBox(box: LngLatBox, zooms: number[]): TilePoint[] {
  const res: TilePoint[] = [];
  for (const z of zooms) {
    const a = lngLat2Tile(box.west, box.north, z);
    const b = lngLat2Tile(box.east, box.south, z);
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) res.push({ x, y, z });
  }
  return res;
}

export function tileUrl(t: TilePoint, scheme = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'): string {
  return scheme.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
}

function keyOf(t: TilePoint): string {
  return `${TILE_PREFIX}${t.z}/${t.x}/${t.y}`;
}

export async function downloadTiles(
  tiles: TilePoint[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  concurrency = 6,
): Promise<{ done: number; failed: number; bytes: number }> {
  let done = 0;
  let failed = 0;
  let bytes = 0;
  const total = tiles.length;
  const queue = tiles.slice();
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const t = queue.shift()!;
      try {
        const exists = await get(keyOf(t));
        if (exists) {
          done++;
          onProgress(done, total);
          continue;
        }
        const res = await fetch(tileUrl(t), { signal });
        if (res.ok) {
          const blob = await res.blob();
          bytes += blob.size;
          await set(keyOf(t), blob);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      done++;
      onProgress(done, total);
    }
  });
  await Promise.all(workers);
  return { done, failed, bytes };
}

export async function clearTileCache(): Promise<void> {
  const all = await keys();
  for (const k of all) {
    if (typeof k === 'string' && k.startsWith(TILE_PREFIX)) await del(k);
  }
}

export async function tileCacheSize(): Promise<number> {
  const all = await keys();
  return all.filter((k) => typeof k === 'string' && (k as string).startsWith(TILE_PREFIX)).length;
}

export function bytesFmt(b: number): string {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}
