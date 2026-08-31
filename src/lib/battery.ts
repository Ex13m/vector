// Исключение из Doze / battery optimization (только Android APK).
//
// Без этого Android агрессивно усыпляет процесс при выключенном экране и
// замораживает даже foreground GPS-сервис на 5+ минут. В диагностике это
// проявлялось как dt=316s — голос и трек полностью замирали, потом резко
// «догоняли» пачкой. Когда приложение в белом списке оптимизации батареи,
// Doze его не трогает и фоновый трекинг работает стабильно.
//
// Нативная часть: BatteryOptimizationPlugin.java (локальный Capacitor-плагин).

import { registerPlugin, Capacitor } from '@capacitor/core';

interface BatteryOptimizationPlugin {
  /** Уже ли приложение исключено из оптимизации батареи. */
  isIgnoring(): Promise<{ ignoring: boolean }>;
  /**
   * Показать системный диалог запроса исключения (no-op если уже исключено).
   * Резолвится ПОСЛЕ закрытия диалога актуальным статусом.
   */
  request(): Promise<{ ignoring: boolean }>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization');

/** True, если приложение уже исключено из оптимизации (или не-native). */
export async function isBatteryExempt(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { ignoring } = await BatteryOptimization.isIgnoring();
    return ignoring;
  } catch {
    return false;
  }
}

/**
 * Если приложение ещё не исключено — показывает системный диалог запроса и
 * резолвится ПОСЛЕ его закрытия актуальным состоянием (натив использует
 * startActivityForResult). Вызывать при старте поездки.
 */
export async function requestBatteryExempt(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { ignoring } = await BatteryOptimization.request();
    if (ignoring) return true;
    // Один «нет» сразу после закрытия диалога — ещё не отказ пользователя:
    // на части прошивок запись в белый список Doze происходит асинхронно, и
    // PowerManager в момент ActivityResult отдаёт прежнее значение. Из-за этого
    // баннер возвращался, хотя разрешение уже было выдано. Перепроверяем.
    for (const delay of [300, 700, 1500]) {
      await new Promise<void>((r) => setTimeout(r, delay));
      if (await isBatteryExempt()) return true;
    }
    return false;
  } catch {
    return false;
  }
}
