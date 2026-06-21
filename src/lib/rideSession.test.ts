import { describe, it, expect } from 'vitest';
import { seedRidden } from './rideSession';
import type { TrailPoint } from './storage';

const p = (lat: number, lng: number): TrailPoint => ({ lat, lng, t: 0 });

// 0.001° latitude ≈ 111 m, so this trail is ≈ 222 m.
const trail: TrailPoint[] = [p(0, 0), p(0.001, 0), p(0.002, 0)];

describe('seedRidden', () => {
  it('continuation uses the carried total, NOT trail + carried (no doubling)', () => {
    const r = seedRidden(trail, 5000);
    expect(r.ridden).toBe(5000); // not 5000 + ~222
    expect(r.lastPoint).toEqual(trail[2]);
  });

  it('fresh resume (no carried distance) sums the trail', () => {
    const r = seedRidden(trail, 0);
    expect(r.ridden).toBeGreaterThan(200);
    expect(r.ridden).toBeLessThan(240);
    expect(r.lastPoint).toEqual(trail[2]);
  });

  it('empty trail → zero ridden, null lastPoint', () => {
    expect(seedRidden([], 0)).toEqual({ ridden: 0, lastPoint: null });
  });

  it('empty trail with carried distance keeps the carried total', () => {
    expect(seedRidden([], 1234)).toEqual({ ridden: 1234, lastPoint: null });
  });
});
