/**
 * DEV-only GPS simulator.
 * Patches navigator.geolocation with a fake walk (≈15 km/h).
 * Активируется только когда import.meta.env.DEV === true.
 *
 * Управление из DevBar (window.__geoMock):
 *   window.__geoMock.moveTo(lat, lng)  — телепортация
 *   window.__geoMock.setHeading(deg)   — направление движения
 *   window.__geoMock.setSpeed(mps)     — скорость м/с (0 = стоп)
 */

const TICK_MS = 1000;

export interface GeoMockHandle {
  moveTo(lat: number, lng: number): void;
  setHeading(deg: number): void;
  setSpeed(mps: number): void;
  getState(): { lat: number; lng: number; heading: number; speed: number };
}

declare global {
  interface Window {
    __geoMock?: GeoMockHandle;
  }
}

type SuccessCb = PositionCallback;
type ErrorCb = PositionErrorCallback;

let _lat = 55.7512;
let _lng = 37.6184;
let _heading = 60;   // degrees clockwise from north
let _speed = 4.2;    // m/s  ≈ 15 km/h

const _watchers = new Map<number, { success: SuccessCb; error: ErrorCb }>();
let _nextId = 1;
let _ticker: ReturnType<typeof setInterval> | null = null;

function _makePos(): GeolocationPosition {
  return {
    coords: {
      latitude: _lat,
      longitude: _lng,
      accuracy: 4,
      altitude: null,
      altitudeAccuracy: null,
      heading: _heading,
      speed: _speed,
    } as GeolocationCoordinates,
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function _tick() {
  if (_speed > 0) {
    // Лёгкий изгиб маршрута
    _heading += (Math.random() - 0.5) * 8;
    const rad = (_heading * Math.PI) / 180;
    _lat += (_speed * Math.cos(rad)) / 111_320;
    _lng += (_speed * Math.sin(rad)) / (111_320 * Math.cos((_lat * Math.PI) / 180));
  }
  const pos = _makePos();
  for (const { success } of _watchers.values()) success(pos);
}

function _ensureTicker() {
  if (_ticker !== null) return;
  _ticker = setInterval(_tick, TICK_MS);
}

function _maybeStopTicker() {
  if (_watchers.size === 0 && _ticker !== null) {
    clearInterval(_ticker);
    _ticker = null;
  }
}

const mockGeo: Geolocation = {
  watchPosition(
    success: SuccessCb,
    error?: ErrorCb | null,
    _options?: PositionOptions,
  ): number {
    const id = _nextId++;
    _watchers.set(id, { success, error: error ?? (() => {}) });
    _ensureTicker();
    // Сразу отдаём текущую позицию
    setTimeout(() => success(_makePos()), 0);
    return id;
  },

  clearWatch(id: number) {
    _watchers.delete(id);
    _maybeStopTicker();
  },

  getCurrentPosition(
    success: SuccessCb,
    _error?: ErrorCb | null,
    _options?: PositionOptions,
  ) {
    setTimeout(() => success(_makePos()), 0);
  },
};

export function installDevGPS(startLat = 55.7512, startLng = 37.6184): GeoMockHandle {
  _lat = startLat;
  _lng = startLng;

  try {
    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });
  } catch {
    // Safari иногда не даёт переопределить — игнорируем
  }

  const handle: GeoMockHandle = {
    moveTo(lat, lng) { _lat = lat; _lng = lng; },
    setHeading(deg) { _heading = deg; },
    setSpeed(mps) { _speed = mps; },
    getState: () => ({ lat: _lat, lng: _lng, heading: _heading, speed: _speed }),
  };

  window.__geoMock = handle;
  console.info('[geoMock] DEV GPS simulator active. window.__geoMock available.');
  return handle;
}
