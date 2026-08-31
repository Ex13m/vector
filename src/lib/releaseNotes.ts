// Короткие юзер-френдли хайлайты последнего релиза для модалки «Что нового».
// Обновлять при бампе версии (заголовок версии берётся из __APP_VERSION__).
// Технический разбор — в CHANGELOG.md; здесь — простым языком, на 3 языках.

import type { UiLang } from './i18n';

export const RELEASE_NOTES: Record<UiLang, string[]> = {
  ru: [
    '🔋 Запрос «Работа в фоне» больше не появляется повторно',
    '🧭 Баннер компаса можно закрыть и при залоченном экране',
    '🌍 Подсказки разрешений — на выбранном языке',
  ],
  en: [
    '🔋 Background-mode prompt no longer re-appears after allowing',
    '🧭 Compass banner is dismissible even with the screen locked',
    '🌍 Permission prompts now follow your language',
  ],
  de: [
    '🔋 Hintergrund-Abfrage erscheint nach Erlauben nicht erneut',
    '🧭 Kompass-Banner auch bei gesperrtem Screen schließbar',
    '🌍 Berechtigungs-Hinweise in deiner Sprache',
  ],
};
