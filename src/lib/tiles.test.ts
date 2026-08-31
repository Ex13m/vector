import { describe, test, expect } from 'vitest';
import { tilesForBox } from './tiles';

// Регрессия: на первом запуске без GPS-фикса карта открывается на zoom 4, и её
// границы попадали в генератор целиком — сотни тысяч объектов за один рендер
// (при зуме ≤2 — миллионы и риск OOM в WebView). Область всё равно отвергается
// как «слишком большая», поэтому строить весь список смысла нет.
describe('tilesForBox', () => {
  const WORLD = { west: -180, east: 180, north: 85, south: -85 };

  test('маленькая область считается точно', () => {
    // Один тайл по каждой оси на зуме 10.
    const box = { west: 14.42, east: 14.43, north: 50.09, south: 50.08 };
    const tiles = tilesForBox(box, [10]);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(10);
    expect(tiles.every((t) => t.z === 10)).toBe(true);
  });

  test('весь мир на глубоком зуме не взрывает память — генерация обрывается', () => {
    const tiles = tilesForBox(WORLD, [12, 13, 14]);
    expect(tiles.length).toBeLessThanOrEqual(50_000);
  });

  test('обрыв всё ещё даёт «слишком большую область» (> MAX_TILES = 2000)', () => {
    expect(tilesForBox(WORLD, [8]).length).toBeGreaterThan(2000);
  });

  test('пустой список зумов — пустой результат', () => {
    expect(tilesForBox(WORLD, [])).toEqual([]);
  });
});
