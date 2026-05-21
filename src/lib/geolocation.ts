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
  if (isNative) {
    return watchNative(onSuccess, onError, options);
  }
  return watchWeb(onSuccess, onError, options);
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

// ── Native путь ───────────────────────────────────────────────────────
// @capgo/background-geolocation работает как ОДИН глобальный watcher на
// процесс (start/stop). У нас одновременно показывается только один экран,
// так что это OK. Перед новым start всегда делаем stop.

let _activeOwner: symbol | null = null;

function watchNative(
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
