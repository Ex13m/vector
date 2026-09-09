/**
 * Ride session persistence — спасает поездку от убийства вкладки ОС.
 *
 * Сохраняем в localStorage каждый GPS-тик (дёшево, ~50кб для 2000 точек).
 * При загрузке приложения — проверяем, есть ли активная сессия, и восстанавливаем.
 */

import { distanceM, type LatLng } from './geo';
import { saveTrip, type TrailPoint, type Trip } from './storage';
import type { RidePhase, RideMachineState } from './rideStateMachine';
import { t, uiLang } from './i18n';

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
  /**
   * id и имя записи в журнале. Без них восстановленная после убийства поездка
   * теряла свою личность: persistTrip чеканил ВТОРОЙ id, в журнале появлялся
   * дубль того же маршрута, а countFinishedRide списывал вторую бесплатную
   * поездку за одну физическую. Необязательные — сессии, записанные прошлой
   * версией приложения, этих полей не содержат.
   */
  tripId?: string | null;
  tripName?: string | null;
  /** Когда поездка стартовала */
  startedAt: number;
  /** Таймстамп последнего сохранения */
  savedAt: number;
};

/**
 * Стартовое значение пройденной дистанции при продолжении/восстановлении.
 * Считаем ОДИН раз: если есть перенесённый итог (contRiddenM > 0) — берём его
 * как авторитетный, иначе суммируем загруженный трек. НЕ складываем оба —
 * иначе расстояние удваивается на каждом продолжении (баг 168 км за 9 с).
 */
export function seedRidden(
  trail: TrailPoint[],
  contRiddenM: number,
): { ridden: number; lastPoint: TrailPoint | null } {
  const lastPoint = trail.length > 0 ? trail[trail.length - 1] : null;
  if (contRiddenM > 0) return { ridden: contRiddenM, lastPoint };
  let total = 0;
  for (let i = 1; i < trail.length; i++) {
    const d = distanceM(trail[i - 1], trail[i]);
    if (d > 1 && d < 300) total += d;
  }
  return { ridden: total, lastPoint };
}

/** Сохранить текущую сессию. Вызывается на каждом GPS-тике (быстро — ~1-2ms). */
export function saveRideSession(session: RideSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage full или недоступен — не критично
  }
}

/**
 * Дописать оборванную поездку в журнал.
 *
 * Сессию старше 6 часов резюмировать поздно, но раньше она просто удалялась —
 * и человек, у которого система выгрузила приложение посреди двухчасовой
 * поездки, наутро находил пустой журнал. Маршрут при этом лежал в localStorage
 * целым. Теперь сохраняем его записью с finished: false: путь на месте,
 * а предлагать продолжить такую старую поездку по-прежнему не будем.
 */
/** Формат даты в имени поездки — тот же, что у persistTrip. */
const FMT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

const dateLocale = () => (uiLang() === 'ru' ? 'ru-RU' : uiLang() === 'de' ? 'de-DE' : 'en-US');

function archiveSession(session: RideSession): void {
  const trail = Array.isArray(session.trail) ? session.trail : [];
  if (trail.length < 2) return; // одна точка — показывать нечего
  const { ridden } = seedRidden(trail, 0);
  const elapsedSec = Math.max(0, Math.round(session.elapsedSec ?? 0));
  // Время выезда — от первой точки трека, как и в persistTrip. session.startedAt
  // у продолжения хранит начало ПОСЛЕДНЕГО сегмента, и запись в журнале (id тот
  // же) получила бы время не того участка.
  const startedAt = trail[0]?.t ?? session.startedAt;
  const trip: Trip = {
    id: session.tripId ?? String(startedAt),
    name: session.tripName || `${t('trip.name')} ${new Date(startedAt).toLocaleString(dateLocale(), FMT)}`,
    startedAt,
    finishedAt: session.savedAt,
    distM: Math.round(ridden),
    elapsedSec,
    speedAvgMps: elapsedSec > 0 ? ridden / elapsedSec : 0,
    speedMaxMps: session.speedMaxMps ?? 0,
    trail,
    reverse: !!session.reverse,
    finished: false,
    target: session.target ?? null,
  };
  void saveTrip(trip);
}

/** Загрузить сохранённую сессию. null если нет или устарела (>6 часов). */
export function loadRideSession(): RideSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as RideSession;
    // Не восстанавливаем сессии старше 6 часов
    if (Date.now() - session.savedAt > 6 * 60 * 60 * 1000) {
      archiveSession(session); // резюмировать поздно, но путь не теряем
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
