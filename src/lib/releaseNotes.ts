// Короткие юзер-френдли хайлайты последнего релиза для модалки «Что нового».
// Обновлять при бампе версии (заголовок версии берётся из __APP_VERSION__).
// Технический разбор — в CHANGELOG.md; здесь — простым языком, на 3 языках.

import type { UiLang } from './i18n';

export const RELEASE_NOTES: Record<UiLang, string[]> = {
  ru: [
    '🔄 После обновления из Play приложение сразу свежее — лишний вопрос убран',
    '🔋 Баннер «Работа в фоне» уходит с первого подтверждения',
    '🧭 Компас больше не просит разрешение, когда и так работает',
    '🧹 Кнопка «Очистить» в диагностике действительно обнуляет счётчик',
  ],
  en: [
    '🔄 After a Play update the app is fresh right away — no extra prompt',
    '🔋 The background-mode banner leaves on the first confirmation',
    '🧭 No compass permission banner when the compass already works',
    '🧹 The Clear button in diagnostics really resets the counter',
  ],
  de: [
    '🔄 Nach einem Play-Update ist die App sofort aktuell — ohne Extra-Frage',
    '🔋 Der Hintergrund-Banner verschwindet beim ersten Bestätigen',
    '🧭 Keine Kompass-Abfrage mehr, wenn der Kompass bereits läuft',
    '🧹 „Löschen“ in der Diagnose setzt den Zähler wirklich zurück',
  ],
};
