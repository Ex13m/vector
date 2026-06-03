// Константы, общие между App и Settings. Вынесены сюда чтобы избежать
// циклической зависимости App.tsx ↔ SettingsSheet.tsx (импорт констант из
// App при ESM-circle давал undefined → input[type=range] подбирал step=1).

export const VOICE_INTERVAL_MAX = 900; // 15 минут
export const VOICE_INTERVAL_STEP = 60; // 1 минута
export const DEFAULT_VOICE_INTERVAL = 60; // раз в минуту
