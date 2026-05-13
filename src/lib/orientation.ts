// Курс устройства (heading) — из компаса (DeviceOrientationEvent).
// На iOS 13+ нужно вызывать requestPermission после явного жеста.

import { distanceM, type LatLng } from './geo';

type HeadingHandler = (heading: number) => void;

type DOEStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

export function needsIosPermission(): boolean {
  const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as DOEStatic | undefined;
  return !!DOE && typeof DOE.requestPermission === 'function';
}

export async function requestIosPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as DOEStatic;
  if (typeof DOE.requestPermission !== 'function') return true;
  try {
    const r = await DOE.requestPermission();
    return r === 'granted';
  } catch {
    return false;
  }
}

/**
 * Подписка на компас. Фильтр: handler вызывается ТОЛЬКО если
 * (а) дельта heading >= MIN_DELTA_DEG и
 * (б) с прошлого вызова прошло >= MIN_INTERVAL_MS.
 * Без фильтра событие летит на 60Hz → весь useMemo цикл re-render-ится.
 */
export function startHeading(handler: HeadingHandler): () => void {
  const MIN_DELTA_DEG = 2;
  const MIN_INTERVAL_MS = 100; // ~10 Hz
  // NaN как sentinel: Math.min(NaN, NaN) = NaN, NaN < 2 = false →
  // первое событие всегда проходит фильтр (иначе с -999 дельта уходит
  // в отрицательные числа и все события отфильтровываются навсегда).
  let lastEmitted = NaN;
  let lastEmitAt = 0;

  const onOrient = (e: DeviceOrientationEvent) => {
    const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let heading: number | null = null;
    if (typeof anyE.webkitCompassHeading === 'number') {
      // iOS Safari: компасный heading напрямую.
      heading = anyE.webkitCompassHeading;
    } else if (e.alpha !== null) {
      // Android Chrome: deviceorientationabsolute даёт absolute=true и
      // истинный северный heading; обычный deviceorientation — относительный,
      // но тоже используем как лучшее из доступного.
      heading = (360 - (e.alpha as number)) % 360;
    }
    if (heading === null || Number.isNaN(heading)) return;

    const now = Date.now();
    if (now - lastEmitAt < MIN_INTERVAL_MS) return;
    // Угловая дистанция с учётом 360→0 wrap.
    // NaN-safe: если lastEmitted = NaN, delta = NaN, NaN < 2 = false → проходит.
    const delta = Math.min(
      Math.abs(heading - lastEmitted),
      360 - Math.abs(heading - lastEmitted),
    );
    if (delta < MIN_DELTA_DEG) return;
    lastEmitted = heading;
    lastEmitAt = now;
    handler(heading);
  };
  window.addEventListener('deviceorientationabsolute' as keyof WindowEventMap, onOrient as EventListener);
  window.addEventListener('deviceorientation', onOrient as EventListener);
  return () => {
    window.removeEventListener('deviceorientationabsolute' as keyof WindowEventMap, onOrient as EventListener);
    window.removeEventListener('deviceorientation', onOrient as EventListener);
  };
}

/**
 * Сглаженный bearing: от точки ~targetDistBack метров назад по треку
 * до текущей позиции. Стабильнее чем по 2 последним точкам —
 * не дёргается на каждом GPS-фиксе.
 */
export function smoothedBearingFromTrail(
  trail: LatLng[],
  targetDistBack = 40,
): number | null {
  if (trail.length < 2) return null;
  const curr = trail[trail.length - 1];
  let cumDist = 0;
  for (let i = trail.length - 2; i >= 0; i--) {
    cumDist += distanceM(trail[i], trail[i + 1]);
    if (cumDist >= targetDistBack) {
      return bearingFromTrail(trail[i], curr);
    }
  }
  // Трек короче targetDistBack — используем первую точку
  return bearingFromTrail(trail[0], curr);
}

// Курс по последним двум GPS-точкам — это то, что нужно реально
// (DESIGN_SPEC §2: «направление по вектору движения»).
export function bearingFromTrail(prev: LatLng, curr: LatLng): number {
  const lat1 = (prev.lat * Math.PI) / 180;
  const lat2 = (curr.lat * Math.PI) / 180;
  const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
