// Короткие юзер-френдли хайлайты последнего релиза для модалки «Что нового».
// Обновлять при бампе версии (заголовок версии берётся из __APP_VERSION__).
// Технический разбор — в CHANGELOG.md; здесь — простым языком, на 3 языках.

import type { UiLang } from './i18n';

export const RELEASE_NOTES: Record<UiLang, string[]> = {
  ru: [
    '⬆️ Приложение само предложит обновиться, когда в Play выйдет новая версия',
    '⚙️ В настройках видно, куплена ли полная версия — и там же можно купить',
    '💳 Экран покупки закрывается сам, как только оплата прошла',
    '🧭 «Новая цель» посреди поездки больше не просит денег — это та же поездка',
    '💾 Поездка не пропадает, если система выгрузила приложение из памяти',
    '🔋 Экран прибытия перестал без нужды писать на диск — меньше расход батареи',
  ],
  en: [
    '⬆️ The app offers to update itself when a new version lands on Play',
    '⚙️ Settings now show whether the full version is unlocked — and let you buy it',
    '💳 The purchase screen closes itself as soon as the payment goes through',
    '🧭 “New target” mid-ride no longer asks for money — it is the same ride',
    '💾 A ride is no longer lost when the system unloads the app',
    '🔋 The arrival screen stopped writing to disk for nothing — less battery drain',
  ],
  de: [
    '⬆️ Die App bietet selbst an, sich zu aktualisieren, sobald eine neue Version bei Play ist',
    '⚙️ Die Einstellungen zeigen jetzt, ob die Vollversion aktiv ist — und du kannst sie dort kaufen',
    '💳 Der Kaufbildschirm schließt sich selbst, sobald die Zahlung durch ist',
    '🧭 „Neues Ziel“ unterwegs verlangt kein Geld mehr — es ist dieselbe Fahrt',
    '💾 Eine Fahrt geht nicht mehr verloren, wenn das System die App entlädt',
    '🔋 Der Ankunftsbildschirm schreibt nicht mehr unnötig auf die Festplatte — weniger Akkuverbrauch',
  ],
};
