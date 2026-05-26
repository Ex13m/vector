import { describe, test, expect } from 'vitest';
import {
  distanceM,
  bearingTo,
  relativeToClock,
  relativeToClockHM,
  fmtDist,
  fmtSpeed,
  fmtTime,
  fmtETA,
} from './geo';

// ── Ядро концепции: «направление по часам» ───────────────────────────────────

describe('relativeToClock (1..12)', () => {
  test('0° = 12 (прямо вперёд)', () => expect(relativeToClock(0)).toBe(12));
  test('30° = 1 час', () => expect(relativeToClock(30)).toBe(1));
  test('90° = 3 часа', () => expect(relativeToClock(90)).toBe(3));
  test('180° = 6 часов', () => expect(relativeToClock(180)).toBe(6));
  test('270° = 9 часов', () => expect(relativeToClock(270)).toBe(9));
  test('360° сворачивается в 12', () => expect(relativeToClock(360)).toBe(12));
  test('отрицательный угол нормализуется (-30° → 11)', () => expect(relativeToClock(-30)).toBe(11));
});

describe('relativeToClockHM (H:MM, шаг 5 мин)', () => {
  test('0° = 12:00', () => expect(relativeToClockHM(0)).toBe('12:00'));
  test('90° = 3:00', () => expect(relativeToClockHM(90)).toBe('3:00'));
  test('180° = 6:00', () => expect(relativeToClockHM(180)).toBe('6:00'));
  test('270° = 9:00', () => expect(relativeToClockHM(270)).toBe('9:00'));
  test('15° = 12:30 (полчаса циферблата)', () => expect(relativeToClockHM(15)).toBe('12:30'));
  test('5° = 12:10', () => expect(relativeToClockHM(5)).toBe('12:10'));
  test('360° = 12:00', () => expect(relativeToClockHM(360)).toBe('12:00'));
  test('отрицательный угол нормализуется (-90° → 9:00)', () => expect(relativeToClockHM(-90)).toBe('9:00'));
});

// ── Геодезия ─────────────────────────────────────────────────────────────────

describe('distanceM (haversine)', () => {
  test('та же точка = 0', () => {
    expect(distanceM({ lat: 55.75, lng: 37.61 }, { lat: 55.75, lng: 37.61 })).toBeCloseTo(0, 5);
  });
  test('1° широты ≈ 111 км', () => {
    const d = distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_100);
    expect(d).toBeLessThan(111_300);
  });
  test('симметрична (A→B == B→A)', () => {
    const a = { lat: 55.0, lng: 37.0 };
    const b = { lat: 56.0, lng: 38.0 };
    expect(distanceM(a, b)).toBeCloseTo(distanceM(b, a), 6);
  });
});

describe('bearingTo (0..360, 0 = север)', () => {
  test('на север = 0°', () => expect(bearingTo({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 3));
  test('на восток = 90°', () => expect(bearingTo({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 3));
  test('на юг = 180°', () => expect(bearingTo({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 3));
  test('на запад = 270°', () => expect(bearingTo({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })).toBeCloseTo(270, 3));
});

// ── Форматтеры ───────────────────────────────────────────────────────────────

describe('fmtDist', () => {
  test('метры < 1км', () => expect(fmtDist(500)).toEqual({ v: '500', u: 'm' }));
  test('километры >= 1км', () => expect(fmtDist(1500)).toEqual({ v: '1.50', u: 'km' }));
  test('граница 1000м → км', () => expect(fmtDist(1000)).toEqual({ v: '1.00', u: 'km' }));
  test('imperial: футы', () => expect(fmtDist(100, 'imperial')).toEqual({ v: '328', u: 'ft' }));
  test('imperial: мили', () => expect(fmtDist(1000, 'imperial')).toEqual({ v: '0.62', u: 'mi' }));
});

describe('fmtSpeed', () => {
  test('м/с → км/ч', () => expect(fmtSpeed(10)).toEqual({ v: '36', u: 'km/h' }));
  test('м/с → mph', () => expect(fmtSpeed(10, 'imperial')).toEqual({ v: '22.4', u: 'mph' }));
});

describe('fmtTime', () => {
  test('< часа = MM:SS', () => expect(fmtTime(65)).toBe('01:05'));
  test('>= часа = H:MM:SS', () => expect(fmtTime(3661)).toBe('1:01:01'));
  test('ноль', () => expect(fmtTime(0)).toBe('00:00'));
});

describe('fmtETA', () => {
  test('стоим (mps < 0.5) = —', () => expect(fmtETA(100, 0)).toBe('—'));
  test('минуты', () => expect(fmtETA(600, 5)).toBe('2'));
  test('часы+минуты', () => expect(fmtETA(36_000, 5)).toBe('2h00'));
});
