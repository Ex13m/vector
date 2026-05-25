// Гибридный GPS:
//
// • Web (PWA): navigator.geolocation.watchPosition.
//   Работает только пока вкладка видна, троттлится при выключенном экране.
//
// • Native (Capacitor Android): @capgo/background-geolocation.
//   Нативный плагин со встроенным foreground service. Если передан
//   backgroundMessage — работает с выключенным экраном.
//
// API совместим с навигаторовским PositionCallback, чтобы не переписывать
// существующий код в экранах.

import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export type GeoPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
};

export type GeoSuccessCb = (pos: GeoPosition) => void;
export type GeoErrorCb = (err: { code: number; message: string }) => void;

export type GeoWatchOptions = {
  enableHighAccuracy?: boolean;
  /**
   * Если задано, на native платформе плагин покажет persistent notification
   * с этим текстом и будет продолжать GPS с выключенным экраном.
   * На web игнорируется.
   */
  backgroundMessage?: string;
  backgroundTitle?: string;
  /** Минимальная дистанция между обновлениями в метрах (default 0 — все обновления). */
  distanceFilter?: number;
};

export type WatchHandle = {
  /** Прекратить отслеживание. Безопасно вызывать многократно. */
  clear: () => void;
};

// ── Единый запрос разрешений (один промис на весь процесс) ─────────────
// Предотвращает двойной диалог разрешений от getQuickFix + watcher.
let _permPromise: Promise<boolean> | null = null;

function ensureLocationPermission(): Promise<boolean> {
  if (!isNative) return Promise.resolve(true);
  if (_permPromise) return _permPromise;
  _permPromise = (async () => {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      if (perm.location === 'granted' || perm.coarseLocation === 'granted') return true;
      const result = await Geolocation.requestPermissions({ permissions: ['location'] });
      return result.location === 'granted' || result.coarseLocation === 'granted';
    } catch {
      return false;
    }
  })();
  return _permPromise;
}

/**
 * Одноразовый быстрый фикс позиции (сетевая позиция, ~мгновенно).
 * Для засева начальной позиции, пока фоновый плагин ещё ловит
 * первый спутниковый фикс. На web — getCurrentPosition.
 *
 * НЕ запрашивает разрешения — вызывать после ensureLocationPermission().
 */
function getQuickFix(): Promise<GeoPosition | null> {
  if (!isNative) {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          },
          timestamp: pos.timestamp,
        }),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
      );
    });
  }
  return (async () => {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false, // сетевая позиция — быстро, работает в помещении
        timeout: 12_000,
        // Принимаем кэш до 5 минут — важно для первого запуска, когда
        // FusedLocationProvider ещё не прогрелся, но уже имеет позицию
        // от другого приложения (карты, такси, etc.).
        maximumAge: 300_000,
      });
      return {
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
          altitude: pos.coords.altitude ?? null,
          altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
        },
        timestamp: pos.timestamp ?? Date.now(),
      };
    } catch (e) {
      console.warn('[geo] quick fix failed:', e);
      return null;
    }
  })();
}

/**
 * Подписаться на GPS. Возвращает handle с .clear().
 *
 * Используй для RideScreen с `backgroundMessage`, чтобы трек продолжался
 * с выключенным экраном. Для других экранов backgroundMessage не нужен.
 */
export function watchPosition(
  onSuccess: GeoSuccessCb,
  onError: GeoErrorCb = () => {},
  options: GeoWatchOptions = {},
): WatchHandle {
  let cleared = false;

  // ── Быстрый засев позиции (ВСЕ экраны) ──
  // 1. Сначала дожидаемся разрешения (один раз, общий промис)
  // 2. Потом getQuickFix (уже без диалога) → грубая позиция мгновенно
  // 3. Параллельно стартует точный watcher
  const t0 = Date.now();
  void ensureLocationPermission().then((granted) => {
    if (!granted || cleared) {
      console.warn(`[geo] permission ${granted ? 'OK but cleared' : 'DENIED'}`);
      return;
    }
    // Quick fix — после того как разрешение получено
    void getQuickFix().then((pos) => {
      const dt = Date.now() - t0;
      if (pos && !cleared) {
        console.log(`[geo] quickFix OK in ${dt}ms — acc=${pos.coords.accuracy.toFixed(0)}m`);
        onSuccess(pos);
      } else {
        console.warn(`[geo] quickFix ${pos ? 'cleared' : 'FAILED'} after ${dt}ms`);
      }
    });
  });

  let inner: WatchHandle;
  if (isNative) {
    // Если задан backgroundMessage — нужен фоновый трекинг (поездка):
    // @capgo/background-geolocation со своим foreground service.
    // Иначе (стартовые экраны) — foreground-watcher через @capacitor/geolocation.
    inner = options.backgroundMessage
      ? watchNativeBackground(onSuccess, onError, options)
      : watchNativeForeground(onSuccess, onError, options);
  } else {
    inner = watchWeb(onSuccess, onError, options);
  }

  return {
    clear: () => {
      cleared = true;
      inner.clear();
    },
  };
}

// ── Native foreground путь (быстрый, для PickScreen/CacheScreen) ───────
// @capacitor/geolocation использует FusedLocationProvider — отдаёт сетевую
// позицию мгновенно (как браузер), работает в помещении.
function watchNativeForeground(
  onSuccess: GeoSuccessCb,
  onError: GeoErrorCb,
  options: GeoWatchOptions,
): WatchHandle {
  let watchId: string | null = null;
  let cleared = false;

  (async () => {
    try {
      // Ждём разрешения (общий промис — без повторного диалога)
      const granted = await ensureLocationPermission();
      if (!granted || cleared) return;

      const { Geolocation } = await import('@capacitor/geolocation');
      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          timeout: 30_000,
          maximumAge: 5000,
        },
        (pos, err) => {
          if (err) {
            onError({ code: 0, message: err.message || String(err) });
            return;
          }
          if (!pos) return;
          onSuccess({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? 0,
              altitude: pos.coords.altitude ?? null,
              altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
              heading: pos.coords.heading ?? null,
              speed: pos.coords.speed ?? null,
            },
            timestamp: pos.timestamp ?? Date.now(),
          });
        },
      );
      if (cleared) {
        await Geolocation.clearWatch({ id });
      } else {
        watchId = id;
      }
    } catch (e) {
      console.warn('[geo] native foreground watch failed:', e);
      onError({ code: 0, message: String(e) });
    }
  })();

  return {
    clear: () => {
      cleared = true;
      if (watchId) {
        const id = watchId;
        watchId = null;
        void import('@capacitor/geolocation')
          .then(({ Geolocation }) => Geolocation.clearWatch({ id }))
          .catch(() => { /* ignore */ });
      }
    },
  };
}

// ── Web путь ──────────────────────────────────────────────────────────
function watchWeb(
  onSuccess: GeoSuccessCb,
  onError: GeoErrorCb,
  options: GeoWatchOptions,
): WatchHandle {
  if (!('geolocation' in navigator)) {
    return { clear: () => {} };
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onSuccess({
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
      },
      timestamp: pos.timestamp,
    }),
    (err) => onError({ code: err.code, message: err.message }),
    {
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      maximumAge: 5000,
    },
  );
  return { clear: () => navigator.geolocation.clearWatch(id) };
}

// ── Native background путь (для RideScreen — трекинг с выключенным экраном) ─
// @capgo/background-geolocation работает как ОДИН глобальный watcher на
// процесс (start/stop). У нас одновременно показывается только один экран,
// так что это OK. Перед новым start всегда делаем stop.

let _activeOwner: symbol | null = null;

function watchNativeBackground(
  onSuccess: GeoSuccessCb,
  onError: GeoErrorCb,
  options: GeoWatchOptions,
): WatchHandle {
  const myToken = Symbol('gpsWatcher');
  _activeOwner = myToken;
  let cleared = false;

  (async () => {
    try {
      const { BackgroundGeolocation } = await import('@capgo/background-geolocation');
      // На случай если предыдущий watcher не успел остановиться
      try { await BackgroundGeolocation.stop(); } catch { /* ignore */ }

      if (cleared || _activeOwner !== myToken) return;

      await BackgroundGeolocation.start(
        {
          requestPermissions: true,
          stale: false,
          distanceFilter: options.distanceFilter ?? 0,
          backgroundTitle: options.backgroundTitle,
          backgroundMessage: options.backgroundMessage,
        },
        (location, err) => {
          if (_activeOwner !== myToken) return; // мы уже не активный — игнор
          if (err) {
            onError({ code: 0, message: err.message || String(err) });
            return;
          }
          if (!location) return;
          onSuccess({
            coords: {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy ?? 0,
              altitude: location.altitude ?? null,
              altitudeAccuracy: location.altitudeAccuracy ?? null,
              heading: location.bearing ?? null,
              speed: location.speed ?? null,
            },
            timestamp: location.time ?? Date.now(),
          });
        },
      );
    } catch (e) {
      console.warn('[geo] native start failed:', e);
      onError({ code: 0, message: String(e) });
    }
  })();

  return {
    clear: () => {
      cleared = true;
      if (_activeOwner === myToken) {
        _activeOwner = null;
        void import('@capgo/background-geolocation')
          .then(({ BackgroundGeolocation }) => BackgroundGeolocation.stop())
          .catch(() => { /* ignore */ });
      }
    },
  };
}

/** True когда работаем в нативной обёртке (Android APK). */
export function isNativePlatform(): boolean {
  return isNative;
}
