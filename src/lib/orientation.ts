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

// Разделяемое состояние: warm-up в App.tsx будит магнитометр и оставляет
// последнее показание; RideScreen стартует с него — карта-конструктор
// получает прогретый bearing, нет скачка ориентации от 0°.
let _sharedSmoothed = NaN;

/** Последнее сглаженное значение компаса (NaN если событий ещё не было). */
export function getLastHeading(): number | null {
  return Number.isNaN(_sharedSmoothed) ? null : _sharedSmoothed;
}

// ─────────────────────────────────────────────────────────────────────────
// 1€ filter (Casiez, Roussel, Vogel — «1€ Filter», CHI 2012).
//
// Адаптивный low-pass: cutoff-частота растёт со скоростью сигнала.
//   • стоишь, целишься в цель → скорость ≈0 → низкий cutoff → дрожь убрана
//   • быстро повернул телефон    → высокая скорость → высокий cutoff → нет лага
//
// Фиксированный α (старый LPF) заставлял выбирать одно из двух — «или
// дрожит на месте, или отстаёт при повороте». 1€ снимает компромисс:
// карта стоит как влитая при прицеливании и мгновенно следует за рукой.
//
// Параметры подбираются на устройстве; разумные старты для компаса ниже.
// MIN_CUTOFF меньше → глаже в покое, но больше лаг покоя (для прицела не важен).
// BETA больше → агрессивнее открывается на вращении (меньше лаг, риск дёрготни).
const ONE_EURO_MIN_CUTOFF = 2.5; // Гц (было 1.0 — экспериментальное повышение v0.5.35)
const ONE_EURO_BETA = 0.5;
const ONE_EURO_D_CUTOFF = 1.0;   // Гц — сглаживание производной (стандарт из статьи)

/** Коэффициент экспоненциального low-pass для данной частоты и cutoff. */
function lowpassAlpha(rateHz: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  const te = 1 / rateHz;
  return 1 / (1 + tau / te);
}

/** Кратчайшая дуга a−b в диапазоне [-180, 180]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

type OneEuroState = {
  smoothed: number; // отфильтрованный угол [0, 360)
  dx: number;       // отфильтрованная угловая скорость, °/с
  rawPrev: number;  // прошлый сырой угол
  tPrev: number;    // прошлый timestamp события, мс
  init: boolean;
};

/**
 * Один шаг 1€-фильтра для кругового угла (компас).
 * Производная и сам угол считаются по кратчайшей дуге — корректно через 0°/360°.
 */
function oneEuroStep(s: OneEuroState, raw: number, tMs: number): number {
  if (!s.init) {
    // Seed от прогретого компаса (warm-up в App.tsx) — если есть.
    // Без этого первый сырой event (часто мусор при холодном магнитометре)
    // защёлкивает фильтр на кривом heading, и карта 2-3 сек смотрит не туда.
    const seed = Number.isNaN(_sharedSmoothed) ? raw : _sharedSmoothed;
    s.smoothed = seed;
    s.rawPrev = raw;
    s.tPrev = tMs;
    s.dx = 0;
    s.init = true;
    return seed;
  }
  let dt = (tMs - s.tPrev) / 1000; // c
  if (!(dt > 0) || dt > 1) dt = 1 / 60; // защита от кривых/просроченных timestamp
  const rate = 1 / dt;

  // Производная (°/с) по кратчайшей дуге, затем её low-pass с фикс. cutoff —
  // сырая производная сама зашумлена, без сглаживания cutoff дёргался бы.
  const rawDx = angleDelta(raw, s.rawPrev) * rate;
  const aD = lowpassAlpha(rate, ONE_EURO_D_CUTOFF);
  s.dx = s.dx + aD * (rawDx - s.dx);

  // Адаптивный cutoff: чем быстрее вращение — тем прозрачнее фильтр.
  const cutoff = ONE_EURO_MIN_CUTOFF + ONE_EURO_BETA * Math.abs(s.dx);
  const a = lowpassAlpha(rate, cutoff);
  s.smoothed = ((s.smoothed + a * angleDelta(raw, s.smoothed)) % 360 + 360) % 360;

  s.rawPrev = raw;
  s.tPrev = tMs;
  return s.smoothed;
}
// ─────────────────────────────────────────────────────────────────────────

/**
 * Подписка на компас. 1€-фильтр работает на ПОЛНОЙ частоте событий (~60 Hz).
 *
 * Два канала вывода:
 *  • handler    — throttle 16 Hz, для React-state (HUD, голос). Полная частота
 *                 здесь дала бы re-render-шторм RideScreen.
 *  • rawHandler — ПОЛНАЯ частота (~60 Hz), для камеры карты. Пишет в ref,
 *                 React не трогает → карта вращается плавно 60 fps без
 *                 ступенек 16 Hz и без лага (лерп не нужен).
 */
export function startHeading(handler: HeadingHandler, rawHandler?: HeadingHandler): () => void {
  const MIN_INTERVAL_MS = 60; // emit ≤16 Hz

  let lastEmitAt = 0;
  let hasAbsolute = false; // true once absolute/webkit event fires

  // Состояние 1€ — локальное на подписку. init=false: первое событие
  // защёлкивает фильтр на текущий курс (мгновенная истина без скачка от 0°).
  // Прогрев в App.tsx живёт в _sharedSmoothed отдельно — для карты-конструктора.
  const euro: OneEuroState = { smoothed: NaN, dx: 0, rawPrev: NaN, tPrev: 0, init: false };

  // Общая обработка: isAbsoluteEvent = true для deviceorientationabsolute
  // (абсолютен по определению, НЕ полагаемся на e.absolute флаг — он
  // бывает false на ряде Android-устройств/Chrome-версий).
  const process = (e: DeviceOrientationEvent, isAbsoluteEvent: boolean) => {
    const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let heading: number | null = null;

    if (typeof anyE.webkitCompassHeading === 'number') {
      // iOS Safari: истинный компасный heading (tilt-compensated самим iOS).
      heading = anyE.webkitCompassHeading;
      hasAbsolute = true;
    } else if (isAbsoluteEvent && e.alpha !== null) {
      // deviceorientationabsolute — абсолютен по имени события.
      // (360−alpha) — heading верхней грани телефона: математически точен
      // при любом наклоне вперёд/крене (проверено через матрицу поворота).
      heading = (360 - (e.alpha as number)) % 360;
      hasAbsolute = true;
    } else if (!hasAbsolute && !isAbsoluteEvent && e.alpha !== null) {
      // Fallback: обычный deviceorientation (относительный), только если
      // абсолютных событий не было. Хуже чем компас, но лучше чем ничего.
      heading = (360 - (e.alpha as number)) % 360;
    }
    if (heading === null || Number.isNaN(heading)) return;

    // 1€-фильтр на полной частоте событий.
    const t = e.timeStamp || performance.now();
    const smoothed = oneEuroStep(euro, heading, t);
    _sharedSmoothed = smoothed;

    // Полная частота → камера карты (ref, без React-рендера).
    rawHandler?.(smoothed);

    // Emit в React — time-throttle 16 Hz. Фильтр уже сделал всё сглаживание.
    const now = Date.now();
    if (now - lastEmitAt < MIN_INTERVAL_MS) return;
    lastEmitAt = now;
    handler(smoothed);
  };

  // Два раздельных обработчика: различаем тип события.
  const onAbsolute = (e: Event) => process(e as DeviceOrientationEvent, true);
  const onRelative = (e: Event) => process(e as DeviceOrientationEvent, false);

  window.addEventListener('deviceorientationabsolute', onAbsolute);
  window.addEventListener('deviceorientation', onRelative);
  return () => {
    window.removeEventListener('deviceorientationabsolute', onAbsolute);
    window.removeEventListener('deviceorientation', onRelative);
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
