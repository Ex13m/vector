import { describe, test, expect, beforeEach } from 'vitest';
import {
  quotaState, countFinishedRide, useLater, setUnlocked, resetQuota,
  FREE_RIDES, LATER_BONUS,
} from './rideQuota';

// localStorage в node-окружении нет — минимальная подмена. Модуль обёрнут в
// try/catch, но тестируем именно рабочий путь, а не деградацию.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  resetQuota();
});

const ride = (n: number) => { for (let i = 0; i < n; i++) countFinishedRide(); };

describe('свежая установка', () => {
  test('пять бесплатных поездок и «Позже» доступно', () => {
    const s = quotaState();
    expect(s.canRide).toBe(true);
    expect(s.ridesLeft).toBe(FREE_RIDES);
    expect(s.laterAvailable).toBe(true);
    expect(s.unlocked).toBe(false);
  });
});

describe('расход бесплатных поездок', () => {
  test('после пятой поездки лимит исчерпан', () => {
    ride(FREE_RIDES);
    const s = quotaState();
    expect(s.ridesDone).toBe(FREE_RIDES);
    expect(s.ridesLeft).toBe(0);
    expect(s.canRide).toBe(false);
  });

  test('на четвёртой ещё можно ехать', () => {
    ride(FREE_RIDES - 1);
    expect(quotaState().canRide).toBe(true);
    expect(quotaState().ridesLeft).toBe(1);
  });
});

describe('кнопка «Позже»', () => {
  test('даёт +2 поездки и снова пускает в поездку', () => {
    ride(FREE_RIDES);
    expect(quotaState().canRide).toBe(false);
    expect(useLater()).toBe(true);
    const s = quotaState();
    expect(s.canRide).toBe(true);
    expect(s.ridesLeft).toBe(LATER_BONUS);
    expect(s.laterAvailable).toBe(false);
  });

  test('работает ровно один раз — иначе покупку можно откладывать вечно', () => {
    ride(FREE_RIDES);
    useLater();
    ride(LATER_BONUS);
    expect(quotaState().canRide).toBe(false);
    expect(useLater()).toBe(false);
    expect(quotaState().canRide).toBe(false);
  });
});

describe('покупка', () => {
  test('снимает лимит независимо от числа поездок', () => {
    ride(FREE_RIDES + LATER_BONUS + 3);
    expect(quotaState().canRide).toBe(false);
    setUnlocked(true);
    const s = quotaState();
    expect(s.unlocked).toBe(true);
    expect(s.canRide).toBe(true);
    expect(s.ridesLeft).toBe(Infinity);
  });

  test('после покупки счётчик замирает — при возврате средств не окажемся сразу за лимитом', () => {
    ride(2);
    setUnlocked(true);
    ride(10);
    expect(quotaState().ridesDone).toBe(2);
    setUnlocked(false);
    expect(quotaState().canRide).toBe(true);
  });

  test('повторное подтверждение владения ничего не ломает (биллинг сообщает при каждом запуске)', () => {
    setUnlocked(true);
    setUnlocked(true);
    expect(quotaState().unlocked).toBe(true);
    expect(quotaState().canRide).toBe(true);
  });

  test('«Позже» после покупки недоступно', () => {
    setUnlocked(true);
    expect(useLater()).toBe(false);
  });
});

describe('устойчивость к мусору в хранилище', () => {
  test('битое значение счётчика читается как ноль, а не ломает старт поездки', () => {
    localStorage.setItem('vector.quota.ridesDone', 'сломано');
    expect(quotaState().ridesDone).toBe(0);
    expect(quotaState().canRide).toBe(true);
  });

  test('отрицательное значение не даёт бесконечных поездок', () => {
    localStorage.setItem('vector.quota.ridesDone', '-100');
    expect(quotaState().ridesDone).toBe(0);
    expect(quotaState().ridesLeft).toBe(FREE_RIDES);
  });
});
