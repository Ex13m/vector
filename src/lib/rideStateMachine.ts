/**
 * Ride state machine — чистый reducer без React и side-effects.
 *
 * 4 фазы:
 *   PRE_RIDE   → стою, ещё не поехал
 *   RIDING     → еду
 *   SHORT_STOP → короткая остановка (светофор)
 *   LONG_STOP  → длинная стоянка (магазин, обед)
 */

import type { LatLng } from './geo';

// ── Types ────────────────────────────────────────────────────────────────────

export type RidePhase = 'PRE_RIDE' | 'RIDING' | 'SHORT_STOP' | 'LONG_STOP';

export type RideMachineState = {
  phase: RidePhase;
  /** Когда вошли в текущую фазу (Date.now()) */
  phaseEnteredAt: number;
  /** Точка привязки: старт для PRE_RIDE, точка остановки для LONG_STOP */
  anchorPoint: LatLng | null;
  /** Счётчик подряд быстрых GPS-фиксов (для PRE_RIDE / LONG_STOP → RIDING) */
  fastFixCount: number;
  /** Счётчик подряд фиксов средней скорости (для SHORT_STOP → RIDING) */
  resumeFixCount: number;
  /** Когда скорость впервые упала <STOP_SPEED (null = скорость нормальная) */
  slowSince: number | null;
  /** Была ли хоть одна фаза RIDING (необратимость PRE_RIDE) */
  everRode: boolean;
  /**
   * LONG_STOP вошли ВРУЧНУЮ (кнопкой PAUSE). Авто-возобновление по
   * скорости/дистанции отключено — выйти можно только кнопкой PLAY.
   * Для авто-LONG_STOP (3 мин стоянки) = false, там авто-резюм работает.
   */
  manualStop: boolean;
};

export type TransitionSignal =
  | { type: 'START_RIDING'; from: 'PRE_RIDE' | 'LONG_STOP'; manual?: boolean }
  | { type: 'RESUME_RIDING' }
  | { type: 'ENTER_SHORT_STOP' }
  | { type: 'ENTER_LONG_STOP'; manual?: boolean }
  | null;

export type GpsTick = {
  pos: LatLng;
  speedMps: number;
  timestamp: number;
  distFromAnchor: number;
};

// ── Thresholds ───────────────────────────────────────────────────────────────

/** Расстояние от якоря для старта/возобновления */
export const START_DIST_M = 50;
/** Минимальная скорость для старта (8 км/ч = 2.22 м/с) */
export const START_SPEED_MPS = 2.22;
/** Подряд быстрых фиксов для подтверждения старта */
export const START_CONSECUTIVE = 3;

/** Скорость ниже которой считается остановка */
export const STOP_SPEED_MPS = 1.0;
/** Сколько мс стоять чтобы войти в SHORT_STOP */
export const STOP_DURATION_MS = 5_000;

/** Скорость для возобновления из SHORT_STOP (5 км/ч) */
export const RESUME_SPEED_MPS = 1.4;
/** Подряд фиксов для возобновления из SHORT_STOP */
export const RESUME_CONSECUTIVE = 3;

/** Через сколько мс SHORT_STOP переходит в LONG_STOP */
export const LONG_STOP_MS = 180_000; // 3 минуты

// ── Factory ──────────────────────────────────────────────────────────────────

export function createInitialState(anchor: LatLng | null): RideMachineState {
  return {
    phase: 'PRE_RIDE',
    phaseEnteredAt: Date.now(),
    anchorPoint: anchor,
    fastFixCount: 0,
    resumeFixCount: 0,
    slowSince: null,
    everRode: false,
    manualStop: false,
  };
}

// ── Pure reducer ─────────────────────────────────────────────────────────────

export function tickMachine(
  state: RideMachineState,
  tick: GpsTick,
): { nextState: RideMachineState; signal: TransitionSignal } {
  switch (state.phase) {
    // ──────── PRE_RIDE ────────
    case 'PRE_RIDE': {
      // 50м от старта + скорость >8 км/ч + 3 подряд
      if (tick.distFromAnchor >= START_DIST_M && tick.speedMps >= START_SPEED_MPS) {
        const count = state.fastFixCount + 1;
        if (count >= START_CONSECUTIVE) {
          return {
            nextState: {
              ...state,
              phase: 'RIDING',
              phaseEnteredAt: tick.timestamp,
              fastFixCount: 0,
              slowSince: null,
              everRode: true,
            },
            signal: { type: 'START_RIDING', from: 'PRE_RIDE' },
          };
        }
        return { nextState: { ...state, fastFixCount: count }, signal: null };
      }
      // Не прошёл — сбрасываем счётчик
      return { nextState: { ...state, fastFixCount: 0 }, signal: null };
    }

    // ──────── RIDING ────────
    case 'RIDING': {
      if (tick.speedMps < STOP_SPEED_MPS) {
        const slowSince = state.slowSince ?? tick.timestamp;
        if (tick.timestamp - slowSince >= STOP_DURATION_MS) {
          return {
            nextState: {
              ...state,
              phase: 'SHORT_STOP',
              phaseEnteredAt: tick.timestamp,
              slowSince: null,
              resumeFixCount: 0,
            },
            signal: { type: 'ENTER_SHORT_STOP' },
          };
        }
        return { nextState: { ...state, slowSince }, signal: null };
      }
      // Скорость нормальная — сброс slowSince
      return { nextState: { ...state, slowSince: null }, signal: null };
    }

    // ──────── SHORT_STOP ────────
    case 'SHORT_STOP': {
      // Проверка → LONG_STOP (3 минуты)
      if (tick.timestamp - state.phaseEnteredAt >= LONG_STOP_MS) {
        return {
          nextState: {
            ...state,
            phase: 'LONG_STOP',
            phaseEnteredAt: tick.timestamp,
            anchorPoint: tick.pos, // запомнить точку для 50м порога
            fastFixCount: 0,
            manualStop: false, // авто-стоп → авто-резюм разрешён
          },
          signal: { type: 'ENTER_LONG_STOP' },
        };
      }
      // Проверка → RIDING (скорость >5 км/ч, 3 подряд)
      if (tick.speedMps >= RESUME_SPEED_MPS) {
        const count = state.resumeFixCount + 1;
        if (count >= RESUME_CONSECUTIVE) {
          return {
            nextState: {
              ...state,
              phase: 'RIDING',
              phaseEnteredAt: tick.timestamp,
              resumeFixCount: 0,
              slowSince: null,
            },
            signal: { type: 'RESUME_RIDING' },
          };
        }
        return { nextState: { ...state, resumeFixCount: count }, signal: null };
      }
      // Скорость ниже порога — сброс
      return { nextState: { ...state, resumeFixCount: 0 }, signal: null };
    }

    // ──────── LONG_STOP ────────
    case 'LONG_STOP': {
      // Возобновление по движению работает И для авто-, И для ручной паузы:
      // поехал — навигация сама включается (не застрянешь, забыв нажать Плей;
      // случайная пауза на ходу авто-снимется). Кнопка Плей — отдельный быстрый
      // путь (forceRiding). 50м + скорость + N подряд, как в PRE_RIDE.
      if (tick.distFromAnchor >= START_DIST_M && tick.speedMps >= START_SPEED_MPS) {
        const count = state.fastFixCount + 1;
        if (count >= START_CONSECUTIVE) {
          return {
            nextState: {
              ...state,
              phase: 'RIDING',
              phaseEnteredAt: tick.timestamp,
              fastFixCount: 0,
              slowSince: null,
              manualStop: false, // движение сняло паузу (в т.ч. ручную)
            },
            signal: { type: 'START_RIDING', from: 'LONG_STOP' },
          };
        }
        return { nextState: { ...state, fastFixCount: count }, signal: null };
      }
      return { nextState: { ...state, fastFixCount: 0 }, signal: null };
    }
  }
}

// ── Ручные переходы (кнопка PLAY / PAUSE) — обгон автодетекта ─────────────────
// Кнопка в UI: «не едем» (PRE_RIDE/LONG_STOP) → PLAY → forceRiding;
// «едем» (RIDING/SHORT_STOP) → PAUSE → forceLongStop.
// Автодетект в tickMachine остаётся как fallback.

/** Ручной старт/возобновление: PRE_RIDE | LONG_STOP → RIDING. */
export function forceRiding(
  state: RideMachineState,
  timestamp: number,
): { nextState: RideMachineState; signal: TransitionSignal } {
  return {
    nextState: {
      ...state,
      phase: 'RIDING',
      phaseEnteredAt: timestamp,
      fastFixCount: 0,
      resumeFixCount: 0,
      slowSince: null,
      everRode: true,
      manualStop: false, // PLAY снимает ручную паузу
    },
    // «Поехали!» + навигация. from определяет только фразу-реакцию.
    signal: { type: 'START_RIDING', from: state.phase === 'LONG_STOP' ? 'LONG_STOP' : 'PRE_RIDE', manual: true },
  };
}

/** Ручная пауза: RIDING | SHORT_STOP → LONG_STOP. */
export function forceLongStop(
  state: RideMachineState,
  pos: LatLng,
  timestamp: number,
): { nextState: RideMachineState; signal: TransitionSignal } {
  return {
    nextState: {
      ...state,
      phase: 'LONG_STOP',
      phaseEnteredAt: timestamp,
      anchorPoint: pos,
      fastFixCount: 0,
      resumeFixCount: 0,
      slowSince: null,
      manualStop: true, // держим до PLAY — авто-резюм выключен
    },
    signal: { type: 'ENTER_LONG_STOP', manual: true },
  };
}
