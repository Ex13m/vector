# Аудит готовности к Google Play (production review)
**Дата:** 31 августа 2026 · **Версия:** 0.5.99 / versionCode 5
**Метод:** мульти-агентный аудит — 5 независимых аудиторов (политика и манифест, локализация, релизная гигиена, первый запуск, витрина), каждая находка затем проверялась отдельным агентом-скептиком с задачей её опровергнуть.
**Итог:** проверено 36 гипотез · подтверждено 4 · отклонено как ложные 32 · блокеров ревью нет.

---
## 1. Вердикт

**GO — отправлять можно.** Блокеров ревью нет; перед отправкой стоит потратить ~20 минут на один guard в `tilesForBox` и пять строк i18n, но ни то, ни другое submission не останавливает.

## 2. Блокеры

**Нет.** Ни одна из 36 проверенных гипотез не дала ни policy-нарушения, ни краша на свежем устройстве ревьюера. Отдельно проверено и чисто:

- `ACCESS_BACKGROUND_LOCATION` **не объявлен нигде** — ни в `android/app/src/main/AndroidManifest.xml:47-59`, ни в манифесте плагина (`node_modules/@capgo/background-geolocation/android/src/main/AndroidManifest.xml`), ни в собранном merged manifest (`android/app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml` — 0 совпадений). Работа с экраном офф идёт через foreground-сервис `foregroundServiceType="location"`, который стартует из foreground. То есть форма Sensitive permissions → *Background location* у тебя, скорее всего, **вообще не активируется** — это снимает главный исторический риск. Поправь `docs/PLAY-LISTING.md` §3: там всё ещё написано «Декларация фоновой геолокации», по факту это обычная декларация foreground-service location.
- `targetSdkVersion = 36`, `minSdkVersion = 24` (`android/variables.gradle`) — требования Play по target API выполнены.
- `versionCode 5` / `versionName "1.0.1"` (`android/app/build.gradle:18-19`) — выше живого versionCode 4, конфликта при загрузке не будет.
- Privacy Policy URL живой и файл в репозитории есть (`public/privacy.html`), Data Safety = «no data collected» согласуется с кодом (данные не уходят разработчику).

## 3. Стоит поправить

1. **`tilesForBox` строит сотни тысяч объектов, если Старт нажат с отдалённой карты** — `src/screens/CacheScreen.tsx:277-278` + `src/lib/tiles.ts:33`. На свежей установке без GPS-фикса `PickScreen.tsx:189` открывает карту на `zoom: 4`, а `getBounds()` (`PickScreen.tsx:538-544`) отдаёт этот огромный box как есть; зумы при этом считаются от хардкод-`12`. Реально: ~500 тыс. объектов, подлаг доли секунды и мусорная карточка «~497241 tiles / ~8700 MB / СЛИШКОМ БОЛЬШАЯ ОБЛАСТЬ». Тупика нет («Пропустить» работает), но если ревьюер дополнительно отзумит пальцами до zoom ≤ 2 — это уже миллионы аллокаций и реальный шанс убить WebView.
   *Фикс (1 строка):* в `tilesForBox` ранний выход по счётчику — `if (res.length > 50_000) return res;` внутри цикла по зумам. `tooBig` сработает как раньше, аллокаций не будет.
2. **Пять русских строк в английском UI на happy path.** `src/screens/CacheScreen.tsx:516` (`← PINCH расширить / сжать охват →`, видна сразу при входе на обязательный экран кэша) и `:654` (`Отмена`); `src/screens/PickScreen.tsx:1382` (`Поставьте цель и нажмите ★`), `:1462` (`+ Сохранить текущую цель`), `:1472` (`Поездок ещё нет`). Дефолтный язык — английский (`src/App.tsx:45-49`), остальной UI полностью через `t()`, так что кириллица бросается в глаза и расходится с листингом «Russian, English, German interface».
   *Фикс:* пять ключей в `src/lib/i18n.ts` (`cache.pinchHint`, `cache.cancel`, `pick.emptyTargets`, `pick.saveCurrent`, `pick.emptyTrips`) + замена литералов на `t()`. Тип `Record<UiLang,string>` заставит заполнить все три языка.

Алгоритм поездки (`rideStateMachine.ts`, `rideSession.ts`, GPS-тик, голосовые интервалы) не трогаем — проблем там не найдено.

## 4. Только руками в Console

API/скриптами это не делается, планируй время:

1. **Загрузка подписанного AAB** в Production release (Play Developer API умеет, но у тебя нет настроенного service account — быстрее руками).
2. **Sensitive permissions / App access**: обоснование foreground-location + **ссылка на видео-демо** (unlisted YouTube, 30–60 с: выбор цели → старт → показать уведомление сервиса → выключить экран → слышен голос → «Завершить» → уведомление исчезло). Видео ревьюеры действительно смотрят; без него итерация почти гарантирована.
3. **Data Safety** — форма заполняется только в Console (ответ «No» по всем типам, см. `docs/PLAY-LISTING.md` §2).
4. **Content rating** (анкета IARC) и **Target audience** — только вручную.
5. **Графика листинга**: иконка 512×512 без альфы, feature graphic 1024×500, 2-8 скриншотов телефона.
6. **Ads: No**, категория Maps & Navigation, контактные данные.
7. Продвижение сборки из Internal testing в Production (или новый release с тем же AAB).

## 5. Главный оставшийся риск

Он не тот, которого ты боялся. Поскольку `ACCESS_BACKGROUND_LOCATION` не объявлен, тяжёлая background-location декларация с её многонедельными итерациями, скорее всего, не откроется вовсе — остаётся обычная проверка foreground-service типа `location`, а она проходит на порядок легче. Что действительно может дать вопрос от ревьюера:

- **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** (`AndroidManifest.xml:58`, диалог реально показывается — `android/.../BatteryOptimizationPlugin.java:53`). Play ограничивает эту permission перечнем допустимых кейсов; навигация с активным foreground-сервисом в него укладывается, но это единственное место, где могут попросить объяснение. Держи наготове ту же формулировку, что и для сервиса: голосовое ведение при выключенном экране рвётся из-за Doze.
- **Соответствие описания поведению.** Строка листинга «Background location is used only during an active ride… a visible notification is shown» должна буквально совпадать с тем, что видно на видео. Если уведомление foreground-сервиса на демо не показано крупно — будет второй раунд.

Реалистичный срок: 1-7 дней, одна итерация вопросов вероятна, отказ — нет.

---

## Приложение: подтверждённые находки (сырые данные)

### 1. [major] Экран кэша строит ~2 млн объектов-тайлов, если Старт нажат с отдалённой карты (на первом запуске карта открывается на zoom 4) — фриз/OOM
- **Файл:** `src/screens/CacheScreen.tsx:277` · **измерение:** firstrun
- **Что видит пользователь:** Ревьюер, который (а) открыл приложение в помещении/без разрешения GPS — карта остаётся на zoom 4, либо (б) просто отзумил карту пальцами, чтобы выбрать далёкую цель, — тапает Старт и получает белый/замерший экран на несколько секунд, ANR-диалог «приложение не отвечает» или падение WebView по памяти (~150-200 МБ аллокаций). Это второй экран сценария, попасть очень легко.
- **Фикс:** Считать зумы от размера самого box, а не от хардкод-зума карты: перед tilesForBox ограничить набор — вычислить зум по ширине box (как это делает fitBounds) либо жёстко обрезать генерацию, выйдя из цикла в tilesForBox после MAX_TILES*N элементов и вернув флаг «too big». Минимально: в tilesForBox добавить ранний выход по счётчику ( `if (res.length > 50_000) return res;` ) — tooBig тогда сработает как раньше, но без миллионов аллокаций.
- **Почему находка выжила:** Механизм подтверждён, но масштаб и последствия в находке завышены — severity надо снизить с blocker до major. ЧТО ПОДТВЕРДИЛОСЬ (читал сам): - PickScreen.tsx:183-189 — на свежей установке `me` null и `getLastKnownPos()` null, значит `hasPos=false` → `zoom: 4`. Карта остаётся на 4, пока не придёт GPS-фикс (flyTo zoom 15 в map.on('load') / эффекте маркера). При отказе в разрешении или медленном фиксе в помещении зум 4 держится сколько угодно долго. - PickScreen.tsx:538-544 — `start()` отдаёт сырые видимые границы через `getBounds()`, без клампа. - App.tsx: `goCache` (стр. 153-165) и рендер `<CacheScreen box={pickBox} .../>` (стр. 278-282) — box проходит насквозь, нигде не ограничивается. - CacheScreen.tsx:60 `useState<LngLatBox>(box)`, :263 `useState<number>(12)`, :277-278 `tilesForBox(currentBox, adaptiveZooms(mapZoom))` — на ПЕРВОМ рендере (до создания карты, до всех эффектов) зумы берут…

### 2. [minor] Saved-targets sheet on PickScreen still has three hardcoded Russian strings
- **Файл:** `src/screens/PickScreen.tsx:1382` · **измерение:** i18n
- **Что видит пользователь:** A Play reviewer on an English or German device taps the ★ button on the very first screen — a fresh install means both lists are empty, so BOTH Cyrillic empty-states are the only text in the sheet, next to English tab labels "Targets · 0" / "Trips · 0". This is exactly the class of bug the field video caught and v0.5.99 fixed elsewhere; it is the most visible remaining one, on the app's first screen.
- **Фикс:** Add three keys to `src/lib/i18n.ts` (e.g. `pick.noSaved`, `pick.saveCurrent`, `pick.noTrips`) with ru/en/de values and replace the literals with `tr('…')`.
- **Почему находка выжила:** I could not refute the facts. Verified independently in C:\dev\vector\src\screens\PickScreen.tsx: line 1382 `Поставьте цель и нажмите ★`, line 1462 `+ Сохранить текущую цель`, line 1472 `Поездок ещё нет` — all three are raw JSX text nodes, while every sibling label in the same component goes through `tr()` (line 27 `import { t as tr } from '../lib/i18n'`; lines 1352-1353 `tr('pick.targets')` / `tr('pick.trips')`). Reachability is also real: line 660-668 is the ★ IconButton in the topbar of the first screen, which sets `showFavSheet` and renders `SavedSheet` (line 896-918), and C:\dev\vector\src\App.tsx:45-47 derives the default language from `navigator.language`, so an English or German reviewer genuinely gets an English UI with Cyrillic empty-states. Grep for a fallback found none — `t()` in C:\dev\vector\src\lib\i18n.ts:141 only handles missing keys, not hardcoded literals, so nothing …

### 3. [minor] CacheScreen pinch hint and Cancel button are hardcoded Russian
- **Файл:** `src/screens/CacheScreen.tsx:516` · **измерение:** i18n
- **Что видит пользователь:** CacheScreen sits on the mandatory path between picking a target and riding, so every first-run user sees the pinch hint in Cyrillic regardless of UI language. Anyone who starts a tile download then wants to abort sees a Russian `Отмена` as the only button on screen.
- **Фикс:** Add `cache.pinchHint` and `cache.cancel` to `src/lib/i18n.ts` (ru/en/de) and swap both literals for `t('…')`.
- **Почему находка выжила:** Confirmed by reading the code myself; the evidence is verbatim accurate and the path is live, but the severity is inflated. CONFIRMED: C:\dev\vector\src\screens\CacheScreen.tsx:516 is literally `← <span style={{ color: C.target }}>PINCH</span> расширить / сжать охват →` and :654 is literally `Отмена` — both raw JSX text, not routed through t(). Verified by grep: "Отмена" matches only line 654, "расширить" only line 516. I could not refute reachability. C:\dev\vector\src\App.tsx:45-48 derives the default language from navigator.language and falls back to 'en' for any non-ru/non-de device, and App.tsx:98 calls setUiLang(settings.lang) — so a Play reviewer on an English device genuinely gets an English UI everywhere else, making the two Cyrillic strings stand out. CacheScreen is on the mandatory pick→cache→ride path (App.tsx:165, :246, :276). The hint's only guard is `!hintHidden && !progre…

### 4. [minor] Русские строки в английском интерфейсе на первом же проходе: подсказка PINCH и кнопка «Отмена» на экране кэша, пустые состояния в списке сохранённого
- **Файл:** `src/screens/CacheScreen.tsx:516` · **измерение:** firstrun
- **Что видит пользователь:** Англоязычный ревьюер на втором экране сценария видит кириллицу («расширить / сжать охват», «Отмена»), и то же самое при тапе на ★ на первом экране. Читается как недоделанная локализация и расходится с описанием в листинге.
- **Фикс:** Вынести пять строк в src/lib/i18n.ts (ru/en/de) и заменить литералы на t(): 'cache.pinchHint', 'cache.cancel', 'pick.emptyTargets', 'pick.saveCurrent', 'pick.emptyTrips'. Тип Record<UiLang,string> заставит добавить все три языка.
- **Почему находка выжила:** Опровергнуть не удалось — факты подтверждены чтением кода, но severity завышена. Что подтвердил сам: - CacheScreen.tsx:516 — строка `← <span style={{ color: C.target }}>PINCH</span> расширить / сжать охват →` захардкожена. Гейт `{!hintHidden && !progress && ...}` (стр. 496) при `const [hintHidden, setHintHidden] = useState(false)` (стр. 62) означает, что подсказка видна СРАЗУ при входе на экран, до любого жеста. Это ровно то, что заявляет находка. - CacheScreen.tsx:654 — `Отмена` захардкожена. - Это единственные две сырые строки на экране: остальной UI идёт через `t()` (стр. 360, 392, 397, 591, 610, 635, 676), а голосовой онбординг на стр. 82-84 локализован корректно ru/de/en. То есть это реальный пропуск i18n-свипа, а не «экран без локализации by design». - PickScreen.tsx:1382 `Поставьте цель и нажмите ★` и :1472 `Поездок ещё нет` — это ветки `saved.length === 0` / `trips.length === 0`,…
