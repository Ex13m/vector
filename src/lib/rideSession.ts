/**
 * Ride session persistence — спасает поездку от убийства вкладки ОС.
 *
 * Сохраняем в localStorage каждый GPS-тик (дёшево, ~50кб для 2000 точек).
 * При загрузке приложения — проверяем, есть ли активная сессия, и восстанавливаем.
 */

import type { LatLng } from './geo';
import type { TrailPoint } from './storage';
import type { RidePhase, RideMachineState } from './rideStateMachine';

const SESSION_KEY = 'vector.rideSession.v1';

export type RideSession = {
  /** Цель поездки */
  target: LatLng;
  targetName: string | null;
  reverse: boolean;
  /** Записанный трек */
  trail: TrailPoint[];
  /** Накопленное время езды (секунды) */
  elapsedSec: number;
  /** Состояние state machine */
  machineState: RideMachineState;
  /** Фаза (дубль для быстрого чтения) */
  ridePhase: RidePhase;
  /** Макс скорость */
  speedMaxMps: number;
  /** Когда поездка стартовала */
  startedAt: number;
  /** Таймстамп последнего сохранения */
  savedAt: number;
};

/** Сохранить текущую сессию. Вызывается на каждом GPS-тике (быстро — ~1-2ms). */
export function saveRideSession(session: RideSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage full или недоступен — не критично
  }
}

/** Загрузить сохранённую сессию. null если нет или устарела (>6 часов). */
export function loadRideSession(): RideSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as RideSession;
    // Не восстанавливаем сессии старше 6 часов
    if (Date.now() - session.savedAt > 6 * 60 * 60 * 1000) {
      clearRideSession();
      return null;
    }
    // Базовая валидация
    if (!session.target || typeof session.target.lat !== 'number') {
      clearRideSession();
      return null;
    }
    return session;
  } catch {
    clearRideSession();
    return null;
  }
}

/** Удалить сессию (по прибытии / ручному завершению / новой поездке). */
export function clearRideSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
