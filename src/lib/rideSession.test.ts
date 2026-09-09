import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedRidden, saveRideSession, loadRideSession, clearRideSession, type RideSession } from './rideSession';
import type { TrailPoint, Trip } from './storage';
import type { RideMachineState } from './rideStateMachine';
import { setUiLang } from './i18n';

// archiveSession пишет в IndexedDB — в node её нет, ловим вызовы.
const { archived } = vi.hoisted(() => ({ archived: [] as Trip[] }));
vi.mock('./storage', () => ({
  saveTrip: async (trip: Trip) => {
    archived.push(trip);
  },
}));

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  archived.length = 0;
});

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

// ── Личность поездки и спасение оборванного маршрута ──────────────────────

const machine = {} as RideMachineState;

function session(over: Partial<RideSession> = {}): RideSession {
  return {
    target: { lat: 50, lng: 14 },
    targetName: 'Дом',
    reverse: false,
    trail: [
      { lat: 50.0, lng: 14.0, t: 1_000 },
      { lat: 50.001, lng: 14.0, t: 2_000 },
      { lat: 50.002, lng: 14.0, t: 3_000 },
    ],
    elapsedSec: 120,
    machineState: machine,
    ridePhase: 'RIDING',
    speedMaxMps: 8,
    startedAt: 1_000,
    savedAt: Date.now(),
    ...over,
  };
}

describe('RideSession помнит запись в журнале', () => {
  it('tripId и tripName переживают сохранение и загрузку', () => {
    saveRideSession(session({ tripId: 'trip-42', tripName: 'Поездка 07.09' }));
    const back = loadRideSession();
    expect(back?.tripId).toBe('trip-42');
    expect(back?.tripName).toBe('Поездка 07.09');
  });

  it('сессия от старой версии без этих полей всё равно читается', () => {
    const old = session();
    delete (old as Partial<RideSession>).tripId;
    saveRideSession(old);
    const back = loadRideSession();
    expect(back).not.toBeNull();
    expect(back?.tripId).toBeUndefined();
  });
});

describe('оборванная поездка не пропадает', () => {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  it('устаревшая сессия дописывается в журнал и удаляется', () => {
    saveRideSession(session({ savedAt: Date.now() - SIX_HOURS - 1000, tripId: 'trip-7' }));
    expect(loadRideSession()).toBeNull(); // резюмировать поздно
    expect(archived).toHaveLength(1); // но маршрут сохранён
    expect(archived[0].id).toBe('trip-7');
    expect(archived[0].finished).toBe(false);
    expect(archived[0].trail).toHaveLength(3);
    expect(archived[0].distM).toBeGreaterThan(200);
    expect(localStorage.getItem('vector.rideSession.v1')).toBeNull();
  });

  it('сессия без id получает id от первой точки трека', () => {
    saveRideSession(session({ savedAt: Date.now() - SIX_HOURS - 1000, startedAt: 777 }));
    loadRideSession();
    expect(archived[0].id).toBe('1000'); // trail[0].t, а не startedAt сегмента
  });

  it('время старта берётся от первой точки, а не от начала последнего сегмента', () => {
    // Продолжение: сегмент стартовал в 12:30, а выехал человек в 10:00.
    saveRideSession(session({ savedAt: Date.now() - SIX_HOURS - 1000, startedAt: 999_999 }));
    loadRideSession();
    expect(archived[0].startedAt).toBe(1_000);
  });

  it('имя спасённой поездки на языке интерфейса, а не всегда по-русски', () => {
    setUiLang('en');
    saveRideSession(session({ savedAt: Date.now() - SIX_HOURS - 1000, tripName: null }));
    loadRideSession();
    expect(archived[0].name.startsWith('Ride')).toBe(true);
    setUiLang('ru');
  });

  it('трек из одной точки показывать нечего — в журнал не пишем', () => {
    saveRideSession(
      session({ savedAt: Date.now() - SIX_HOURS - 1000, trail: [{ lat: 50, lng: 14, t: 1 }] }),
    );
    loadRideSession();
    expect(archived).toHaveLength(0);
  });

  it('свежая сессия возвращается как есть и ничего не архивирует', () => {
    saveRideSession(session({ tripId: 'trip-9' }));
    expect(loadRideSession()?.tripId).toBe('trip-9');
    expect(archived).toHaveLength(0);
  });

  it('битая сессия без цели удаляется молча', () => {
    localStorage.setItem('vector.rideSession.v1', JSON.stringify({ savedAt: Date.now() }));
    expect(loadRideSession()).toBeNull();
    expect(archived).toHaveLength(0);
  });

  it('clearRideSession стирает сессию', () => {
    saveRideSession(session());
    clearRideSession();
    expect(loadRideSession()).toBeNull();
  });
});
