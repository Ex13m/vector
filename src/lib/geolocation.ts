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

/**
 * Одноразовый быстрый фикс позиции (сетевая позиция, ~мгновенно).
 * Для засева начальной позиции на RideScreen, пока фоновый плагин
 * ещё ловит первый спутниковый фикс. На web — getCurrentPosition.
 */
export function getQuickFix(): Promise<GeoPosition | null> {
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
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 8_000 },
      );
    });
  }
  return (async () => {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions({ permissions: ['location'] });
        }
      } catch { /* ignore */ }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false, // сетевая позиция — быстро, работает в помещении
        timeout: 8_000,
        maximumAge: 10_000,
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
      console.warn('[geolocation] quick fix failed:', e);
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
  // Сразу даём грубую сетевую позицию (~мгновенно, работает в помещении),
  // чтобы карта центрировалась и маркер "вы" появился без ожидания спутников.
  // Точный фикс придёт следом от основного watcher.
  void getQuickFix().then((pos) => {
    if (pos && !cleared) onSuccess(pos);
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
      const { Geolocation } = await import('@capacitor/geolocation');
      // Запросить разрешение явно (иначе watch молча не стартует).
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions({ permissions: ['location'] });
        }
      } catch { /* ignore — watch всё равно попробует */ }

      if (cleared) return;

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
      console.warn('[geolocation] native foreground watch failed:', e);
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
      console.warn('[geolocation] native start failed:', e);
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
