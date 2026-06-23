// Короткие юзер-френдли хайлайты последнего релиза для модалки «Что нового».
// Обновлять при бампе версии (заголовок версии берётся из __APP_VERSION__).
// Технический разбор — в CHANGELOG.md; здесь — простым языком, на 3 языках.

import type { UiLang } from './i18n';

export const RELEASE_NOTES: Record<UiLang, string[]> = {
  ru: [
    '🌍 Интерфейс теперь на выбранном языке (RU/EN/DE)',
    '📣 Голос-подсказка при прибытии к цели',
    '🗺️ Карта больше не сбивается случайным кручением',
    '🔋 Надёжнее запрос GPS на первом запуске',
  ],
  en: [
    '🌍 Interface now in your selected language (RU/EN/DE)',
    '📣 Spoken hint when you arrive',
    '🗺️ Map no longer twists by accident',
    '🔋 More reliable GPS permission at startup',
  ],
  de: [
    '🌍 Oberfläche jetzt in deiner Sprache (RU/EN/DE)',
    '📣 Sprachhinweis bei Ankunft',
    '🗺️ Karte verdreht sich nicht mehr versehentlich',
    '🔋 Zuverlässigere GPS-Abfrage beim Start',
  ],
};
