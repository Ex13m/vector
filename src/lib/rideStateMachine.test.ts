import { describe, test, expect } from 'vitest';
import {
  createInitialState,
  tickMachine,
  forceRiding,
  forceLongStop,
  START_DIST_M,
  START_SPEED_MPS,
  START_CONSECUTIVE,
  STOP_DURATION_MS,
  type RideMachineState,
  type GpsTick,
} from './rideStateMachine';

const ORIGIN = { lat: 0, lng: 0 };

/** Хелпер: прогнать N тиков «еду быстро далеко» и вернуть финальное состояние. */
function feedRiding(state: RideMachineState, n: number, t0 = 1000): RideMachineState {
  let s = state;
  for (let i = 0; i < n; i++) {
    const tick: GpsTick = {
      pos: { lat: 1, lng: 1 },
      speedMps: START_SPEED_MPS + 1,
      timestamp: t0 + i * 1000,
      distFromAnchor: START_DIST_M + 10,
    };
    s = tickMachine(s, tick).nextState;
  }
  return s;
}

describe('начальное состояние', () => {
  test('старт в PRE_RIDE, без ручной паузы', () => {
    const s = createInitialState(ORIGIN);
    expect(s.phase).toBe('PRE_RIDE');
    expect(s.manualStop).toBe(false);
    expect(s.everRode).toBe(false);
  });
});

describe('авто-детект (tickMachine)', () => {
  test(`PRE_RIDE → RIDING после ${START_CONSECUTIVE} быстрых фиксов (50м + >8км/ч)`, () => {
    const s = feedRiding(createInitialState(ORIGIN), START_CONSECUTIVE);
    expect(s.phase).toBe('RIDING');
    expect(s.everRode).toBe(true);
  });

  test('PRE_RIDE НЕ стартует если медленно', () => {
    let s = createInitialState(ORIGIN);
    for (let i = 0; i < 5; i++) {
      s = tickMachine(s, {
        pos: { lat: 1, lng: 1 }, speedMps: 0.5, timestamp: 1000 + i * 1000, distFromAnchor: 100,
      }).nextState;
    }
    expect(s.phase).toBe('PRE_RIDE');
  });

  test('RIDING → SHORT_STOP после остановки', () => {
    let s = feedRiding(createInitialState(ORIGIN), START_CONSECUTIVE);
    expect(s.phase).toBe('RIDING');
    // первый медленный фикс — взводит slowSince
    s = tickMachine(s, { pos: ORIGIN, speedMps: 0, timestamp: 100_000, distFromAnchor: 0 }).nextState;
    // спустя STOP_DURATION_MS — переход
    const r = tickMachine(s, {
      pos: ORIGIN, speedMps: 0, timestamp: 100_000 + STOP_DURATION_MS, distFromAnchor: 0,
    });
    expect(r.nextState.phase).toBe('SHORT_STOP');
    expect(r.signal?.type).toBe('ENTER_SHORT_STOP');
  });
});

describe('ручной старт (forceRiding / кнопка PLAY)', () => {
  test('PRE_RIDE → RIDING мгновенно, сигнал START_RIDING(manual)', () => {
    const { nextState, signal } = forceRiding(createInitialState(ORIGIN), 5000);
    expect(nextState.phase).toBe('RIDING');
    expect(nextState.everRode).toBe(true);
    expect(nextState.manualStop).toBe(false);
    expect(signal).toEqual({ type: 'START_RIDING', from: 'PRE_RIDE', manual: true });
  });

  test('из LONG_STOP сигнал помечен from: LONG_STOP', () => {
    const longStop: RideMachineState = { ...createInitialState(ORIGIN), phase: 'LONG_STOP' };
    const { signal } = forceRiding(longStop, 5000);
    expect(signal).toEqual({ type: 'START_RIDING', from: 'LONG_STOP', manual: true });
  });
});

describe('ручная пауза (forceLongStop / кнопка PAUSE)', () => {
  test('RIDING → LONG_STOP, manualStop=true, якорь = текущая позиция', () => {
    const riding = forceRiding(createInitialState(ORIGIN), 0).nextState;
    const pos = { lat: 10, lng: 20 };
    const { nextState, signal } = forceLongStop(riding, pos, 5000);
    expect(nextState.phase).toBe('LONG_STOP');
    expect(nextState.manualStop).toBe(true);
    expect(nextState.anchorPoint).toEqual(pos);
    expect(signal).toEqual({ type: 'ENTER_LONG_STOP', manual: true });
  });

  // v0.5.91: по просьбе пользователя ручная пауза ТЕПЕРЬ тоже снимается
  // движением (чтобы не застрять, забыв нажать PLAY; случайная пауза на ходу
  // авто-снимется). Прежнее «держим до PLAY» (v0.5.57) намеренно снято.
  test('РУЧНАЯ пауза авто-возобновляется при движении (как и авто-пауза)', () => {
    const riding = forceRiding(createInitialState(ORIGIN), 0).nextState;
    const paused = forceLongStop(riding, ORIGIN, 5000).nextState;
    const after = feedRiding(paused, 5, 10_000);
    expect(after.phase).toBe('RIDING');
    expect(after.manualStop).toBe(false);
  });

  test('PLAY (forceRiding) снимает ручную паузу', () => {
    const paused = forceLongStop(forceRiding(createInitialState(ORIGIN), 0).nextState, ORIGIN, 5000).nextState;
    const resumed = forceRiding(paused, 9000).nextState;
    expect(resumed.phase).toBe('RIDING');
    expect(resumed.manualStop).toBe(false);
  });
});

describe('авто-LONG_STOP против ручной паузы', () => {
  test('АВТО LONG_STOP (manualStop=false) возобновляется при движении', () => {
    const autoStop: RideMachineState = {
      ...createInitialState(ORIGIN),
      phase: 'LONG_STOP',
      manualStop: false,
      everRode: true,
    };
    const after = feedRiding(autoStop, START_CONSECUTIVE);
    expect(after.phase).toBe('RIDING');
  });
});
