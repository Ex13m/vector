// Реальное скачивание тайлов для оффлайна — Workbox CacheFirst подхватит каждый fetch.
// Для БОЛЬШОЙ области предупреждаем (лимит ~2000 тайлов).

import { tileUrl, type Layer } from './mapStyles';

export type LngLatBox = { west: number; south: number; east: number; north: number };

export type TilePoint = { z: number; x: number; y: number };

export const MAX_TILES = 2000;

export function lngLat2Tile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
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
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) res.push({ z, x, y });
  }
  return res;
}

export async function downloadTiles(
  layer: Layer,
  tiles: TilePoint[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  concurrency = 6,
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  const total = tiles.length;
  const queue = tiles.slice();
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const t = queue.shift()!;
      try {
        const res = await fetch(tileUrl(layer, t.z, t.x, t.y), { signal, cache: 'force-cache' });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      done++;
      onProgress(done, total);
    }
  });
  await Promise.all(workers);
  return { done, failed };
}

export function bytesEstimate(tileCount: number): number {
  return tileCount * 18 * 1024;
}

export function fmtBytes(b: number): string {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}
