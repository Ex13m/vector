// Бесплатные поездки и разблокировка полной версии.
//
// Правила (зафиксированы владельцем):
//   • 5 бесплатных завершённых поездок;
//   • на попытке начать сверх лимита показывается экран покупки;
//   • кнопка «Позже» даёт +2 поездки и работает ОДИН раз за всё время —
//     иначе покупку можно откладывать бесконечно;
//   • покупка снимает лимит навсегда;
//   • функционал до покупки полный, ограничено только число поездок.
//
// Этот модуль — чистая арифметика над localStorage. Он намеренно ничего не знает
// ни про биллинг, ни про стейт-машину поездки: считает только завершённые поездки
// и отвечает на вопрос «можно ли начать следующую». Так его можно покрыть тестами
// целиком и подменить биллинг, не трогая правила.

const KEY_DONE = 'vector.quota.ridesDone';
const KEY_LATER = 'vector.quota.laterUsed';
const KEY_UNLOCKED = 'vector.quota.unlocked';

/** Сколько поездок доступно бесплатно. */
export const FREE_RIDES = 5;

/** Сколько добавляет единственное нажатие «Позже». */
export const LATER_BONUS = 2;

function readInt(key: string): number {
  try {
    const v = parseInt(localStorage.getItem(key) ?? '', 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Приватный режим или переполненное хранилище: молча продолжаем. Хуже
    // потерять счётчик, чем уронить старт поездки.
  }
}

export type QuotaState = {
  /** Полная версия куплена — лимитов нет. */
  unlocked: boolean;
  /** Сколько поездок уже завершено. */
  ridesDone: number;
  /** Текущий лимит с учётом использованного «Позже». */
  limit: number;
  /** Сколько бесплатных поездок осталось (0, если лимит исчерпан). */
  ridesLeft: number;
  /** Можно ли начать следующую поездку без покупки. */
  canRide: boolean;
  /** Доступна ли ещё кнопка «Позже». */
  laterAvailable: boolean;
};

/** Текущее состояние квоты. Дёшево, можно звать на каждый рендер. */
export function quotaState(): QuotaState {
  const unlocked = readFlag(KEY_UNLOCKED);
  const ridesDone = readInt(KEY_DONE);
  const laterUsed = readFlag(KEY_LATER);
  const limit = FREE_RIDES + (laterUsed ? LATER_BONUS : 0);
  const ridesLeft = Math.max(0, limit - ridesDone);
  return {
    unlocked,
    ridesDone,
    limit,
    ridesLeft: unlocked ? Infinity : ridesLeft,
    canRide: unlocked || ridesDone < limit,
    laterAvailable: !unlocked && !laterUsed,
  };
}

/**
 * Отметить завершённую поездку. Вызывать там же, где поездка сохраняется в
 * журнал, — то есть один раз на завершение, а не на каждый GPS-фикс.
 *
 * После покупки не считаем: счётчик замирает, чтобы при возврате покупки
 * (refund) пользователь не оказался сразу за лимитом.
 */
export function countFinishedRide(): void {
  if (readFlag(KEY_UNLOCKED)) return;
  write(KEY_DONE, String(readInt(KEY_DONE) + 1));
}

/** Нажатие «Позже»: +2 поездки, доступно один раз. Вернёт false, если уже использовано. */
export function useLater(): boolean {
  if (readFlag(KEY_UNLOCKED) || readFlag(KEY_LATER)) return false;
  write(KEY_LATER, '1');
  return true;
}

/**
 * Полная версия куплена (или восстановлена при переустановке).
 * Идемпотентно: биллинг может сообщить о владении покупкой при каждом запуске.
 */
export function setUnlocked(on: boolean): void {
  write(KEY_UNLOCKED, on ? '1' : '0');
}

/** Только для разработки и тестов: сброс счётчиков в исходное состояние. */
export function resetQuota(): void {
  write(KEY_DONE, '0');
  write(KEY_LATER, '0');
  write(KEY_UNLOCKED, '0');
}
