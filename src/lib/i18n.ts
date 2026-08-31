// UI-переводы интерфейса. Голос локализован отдельно (lib/voice.ts), здесь —
// видимый текст экранов. Паттерн как у voice.ts, но по ключам.
//
// Фолбэк: нет ключа → возвращаем сам ключ (заметно в разработке, не падает).
// Тип Record<UiLang,string> заставляет tsc требовать ВСЕ три языка для каждой
// строки — пропустить перевод нельзя (ловится на компиляции).

import type { VoiceLang } from './voice';

export type UiLang = VoiceLang; // 'ru' | 'en' | 'de'

type Tr = Record<UiLang, string>;

const T: Record<string, Tr> = {
  // ── Общее ─────────────────────────────────────────────
  'common.off':   { ru: 'выкл',   en: 'off',   de: 'aus' },
  'common.min':   { ru: 'мин',    en: 'min',   de: 'Min' },

  // ── Настройки ─────────────────────────────────────────
  'settings.title':      { ru: 'Настройки',                en: 'Settings',                  de: 'Einstellungen' },
  'settings.language':   { ru: 'Язык',                     en: 'Language',                  de: 'Sprache' },
  'settings.voiceEvery': { ru: 'Озвучка каждые',           en: 'Voice every',               de: 'Ansage alle' },
  'settings.voiceTurn':  { ru: 'Голос на повороте ≥',      en: 'Voice on turn ≥',           de: 'Ansage bei Kurve ≥' },
  'settings.units':      { ru: 'Единицы',                  en: 'Units',                     de: 'Einheiten' },
  'settings.haptics':    { ru: 'Вибрация',                 en: 'Haptics',                   de: 'Vibration' },
  'settings.voice':      { ru: 'Голос',                    en: 'Voice',                     de: 'Stimme' },
  'settings.diag':       { ru: 'Диагностика (GPS / голос)', en: 'Diagnostics (GPS / voice)', de: 'Diagnose (GPS / Stimme)' },
  'settings.auto':       { ru: 'Авто',                     en: 'Auto',                      de: 'Auto' },
  'settings.exportLog':  { ru: 'Экспорт лога',             en: 'Export log',                de: 'Log exportieren' },
  'settings.clear':      { ru: 'Очистить',                 en: 'Clear',                     de: 'Löschen' },

  // ── Поездка: HUD / подсказки ──────────────────────────
  'ride.toTarget':     { ru: 'ДО ЦЕЛИ',   en: 'TO TARGET',  de: 'ZUM ZIEL' },
  'ride.atClock':      { ru: 'НА ЧАСАХ',  en: "AT O'CLOCK", de: 'UHR' },
  'ride.eta':          { ru: 'ETA',       en: 'ETA',        de: 'ETA' },
  'ride.waitGps':      { ru: '⏳ ожидание GPS',                en: '⏳ waiting for GPS',           de: '⏳ warte auf GPS' },
  'ride.stoppedMove':  { ru: '⏸ остановка · двигайтесь к цели', en: '⏸ stopped · move to target',  de: '⏸ Pause · zum Ziel fahren' },
  'ride.moveAuto':     { ru: '🧭 двигайтесь к цели · авто-старт', en: '🧭 move to target · auto-start', de: '🧭 zum Ziel · Auto-Start' },

  // ── Поездка: наведение (TargetingHud) ────────────────
  'ride.distLabel':  { ru: 'до цели',   en: 'to target',    de: 'zum Ziel' },
  'ride.aimLabel':   { ru: 'наведение', en: 'aiming',       de: 'Peilung' },
  'ride.waitGps2':   { ru: 'жду GPS…',  en: 'waiting GPS…', de: 'warte GPS…' },
  'ride.straight':   { ru: '↑ прямо!',  en: '↑ straight!',  de: '↑ geradeaus!' },
  'ride.right':      { ru: '→ вправо',  en: '→ right',      de: '→ rechts' },
  'ride.left':       { ru: '← влево',   en: '← left',       de: '← links' },

  // ── Поездка: тулбар ───────────────────────────────────
  'ride.play':  { ru: 'СТАРТ', en: 'PLAY',  de: 'START' },
  'ride.pause': { ru: 'ПАУЗА', en: 'PAUSE', de: 'PAUSE' },
  'ride.voice': { ru: 'ГОЛОС', en: 'VOICE', de: 'STIMME' },
  'ride.mute':  { ru: 'ТИХО',  en: 'MUTE',  de: 'STUMM' },
  'ride.stop':  { ru: 'СТОП',  en: 'STOP',  de: 'STOPP' },

  // ── Окно прибытия / остановки (RideModal) ─────────────
  'modal.arrived':   { ru: 'Прибыли!',           en: 'Arrived!',     de: 'Angekommen!' },
  'modal.stopped':   { ru: 'Остановка',          en: 'Stopped',      de: 'Pause' },
  'modal.time':      { ru: 'Время',              en: 'Time',         de: 'Zeit' },
  'modal.distance':  { ru: 'Дистанция',          en: 'Distance',     de: 'Distanz' },
  'modal.avg':       { ru: 'Средняя',            en: 'Avg',          de: 'Ø Tempo' },
  'modal.max':       { ru: 'Макс.',              en: 'Max',          de: 'Max.' },
  'modal.tripName':  { ru: 'Имя поездки',        en: 'Trip name',    de: 'Fahrtname' },
  'modal.finish':    { ru: 'Завершить',          en: 'Finish',       de: 'Beenden' },
  'modal.newTarget': { ru: 'Новая цель',         en: 'New target',   de: 'Neues Ziel' },
  'modal.goHome':    { ru: '↩ Вернуться к старту', en: '↩ Return to start', de: '↩ Zurück zum Start' },
  'modal.continue':  { ru: 'Продолжить поездку', en: 'Continue ride', de: 'Fahrt fortsetzen' },

  // ── Выбор цели (PickScreen) ───────────────────────────
  'pick.search':    { ru: 'Введите цель',     en: 'Enter target',  de: 'Ziel eingeben' },
  'pick.targetSet': { ru: 'Цель выбрана',     en: 'Target set',    de: 'Ziel gewählt' },
  'pick.tapMap':    { ru: 'Тапните по карте', en: 'TAP THE MAP',   de: 'Auf Karte tippen' },
  'pick.saved':     { ru: 'Сохранённое',      en: 'Saved',         de: 'Gespeichert' },
  'pick.targets':   { ru: 'Цели',             en: 'Targets',       de: 'Ziele' },
  'pick.trips':     { ru: 'Поездки',          en: 'Trips',         de: 'Fahrten' },
  'pick.continue':  { ru: 'Продолжить',       en: 'Continue',      de: 'Fortsetzen' },
  'pick.log':       { ru: 'Лог',              en: 'Log',           de: 'Log' },
  'pick.gpxTitle':  { ru: 'GPX-трек',         en: 'GPX track',     de: 'GPX-Track' },
  'pick.start':     { ru: 'Старт →',          en: 'Start →',       de: 'Start →' },
  'pick.mapPoint':  { ru: 'Точка на карте',   en: 'Map point',     de: 'Punkt auf der Karte' },

  // ── Кэш (CacheScreen) ─────────────────────────────────
  'cache.tilesCached': { ru: 'Тайлы в кэше',            en: 'Tiles cached',   de: 'Kacheln im Cache' },
  'cache.area':        { ru: 'Область кэширования',     en: 'Caching area',   de: 'Cache-Bereich' },
  'cache.tooBig':      { ru: 'Область слишком большая', en: 'Area too large', de: 'Bereich zu groß' },
  'cache.tooBigBtn':   { ru: 'Слишком большая область', en: 'Area too large', de: 'Bereich zu groß' },
  'cache.tiles':       { ru: 'тайлов',                 en: 'tiles',          de: 'Kacheln' },
  'cache.skip':        { ru: 'Пропустить',             en: 'Skip',           de: 'Überspringen' },
  'cache.save':        { ru: 'Сохранить область',      en: 'Save area',      de: 'Bereich speichern' },
  'cache.done':        { ru: '✓ Готово',               en: '✓ Done',         de: '✓ Fertig' },

  // ── Слои карты ────────────────────────────────────────
  'layer.std':  { ru: 'Карта',   en: 'Map',       de: 'Karte' },
  'layer.sat':  { ru: 'Спутник', en: 'Satellite', de: 'Satellit' },
  'layer.topo': { ru: 'Топо',    en: 'Topo',      de: 'Topo' },
  'layer.tour': { ru: 'Турист',  en: 'Touring',   de: 'Touren' },

  // ── Разное (пропуски i18n-свипа) ──────────────────────
  'trip.name':      { ru: 'Поездка от',  en: 'Ride',   de: 'Fahrt' },
  'cache.go':       { ru: 'Поехали →',   en: "Let's go →", de: "Los geht's →" },
  'pick.point':     { ru: 'Точка',       en: 'Point',  de: 'Punkt' },
  'pick.pointName': { ru: 'Название точки:', en: 'Point name:', de: 'Name des Punkts:' },
  'pick.noLog':     { ru: 'Лог для этой поездки недоступен (записана до обновления).', en: 'No log for this trip (recorded before the update).', de: 'Kein Log für diese Fahrt (vor dem Update aufgezeichnet).' },
  'target.start':   { ru: 'Старт',       en: 'Start',  de: 'Start' },
  'media.toTarget': { ru: 'к цели',      en: 'to target', de: 'zum Ziel' },
  'install.ios':    { ru: 'Поделиться → На экран Домой', en: 'Share → Add to Home Screen', de: 'Teilen → Zum Home-Bildschirm' },
  'install.open':   { ru: 'Откроется как приложение', en: 'Opens as an app', de: 'Öffnet sich als App' },
  'install.title':  { ru: 'Установить Vector', en: 'Install Vector', de: 'Vector installieren' },
  'install.btn':    { ru: 'Установить',        en: 'Install',        de: 'Installieren' },
  'install.later':  { ru: 'Позже',             en: 'Later',          de: 'Später' },

  // ── Модалка «Что нового» ──────────────────────────────
  'whatsNew.title': { ru: '✨ Что нового', en: "✨ What's new", de: '✨ Neu' },
  'whatsNew.gotIt': { ru: 'Понятно',      en: 'Got it',       de: 'Verstanden' },

  // ── Баннеры разрешений (RideScreen) ───────────────────
  'perm.compass.title': { ru: 'Разрешить компас', en: 'Enable compass', de: 'Kompass erlauben' },
  'perm.compass.body':  { ru: 'Без него «по часам» считается только при движении.', en: 'Without it, the clock bearing updates only while moving.', de: 'Ohne ihn wird die Uhr-Richtung nur in Bewegung berechnet.' },
  'perm.battery.title': { ru: '⚡ Работа в фоне', en: '⚡ Background mode', de: '⚡ Hintergrundbetrieb' },
  'perm.battery.body':  { ru: 'Чтобы голос и трек не прерывались при выключенном экране — разрешите работу без ограничений батареи.', en: 'To keep voice and tracking alive with the screen off, allow running without battery restrictions.', de: 'Damit Stimme und Track bei ausgeschaltetem Display weiterlaufen, Betrieb ohne Akku-Einschränkung erlauben.' },
  'perm.allow':         { ru: 'Разрешить', en: 'Allow', de: 'Erlauben' },
  'perm.hide':          { ru: 'скрыть',    en: 'hide',  de: 'ausblenden' },

  // ── Обновление PWA ────────────────────────────────────
  'update.available': { ru: 'Доступно обновление', en: 'Update available', de: 'Update verfügbar' },
  'update.apply':     { ru: 'ОБНОВИТЬ',            en: 'UPDATE',           de: 'AKTUALISIEREN' },

  // ── Журнал ────────────────────────────────────────────
  'pick.downloadLog': { ru: 'скачать лог поездки', en: 'download ride log', de: 'Fahrt-Log herunterladen' },
};

// Текущий язык UI. Ставится из App (setUiLang) в теле рендера — ДО рендера
// детей (App — корень), поэтому t() без параметра всегда отдаёт актуальный
// язык, и под-компоненты (re-render вместе с родителем) подхватывают смену.
let _lang: UiLang = 'ru';

/** Установить текущий язык интерфейса. Вызывать из App на каждом рендере. */
export function setUiLang(lang: UiLang): void { _lang = lang; }

/** Перевод UI-строки по ключу. Нет ключа → сам ключ (без краша). */
export function t(key: string): string {
  const e = T[key];
  if (!e) return key;
  return e[_lang];
}
