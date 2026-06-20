# Vector — голосовой велонавигатор-маяк

Велонавигатор, который вместо «через 200 м направо» говорит направление **«по часам»**
(«цель на 3 часа, 8 км»). Главный сценарий: езда с **выключенным экраном**, телефон в кармане.
PWA + Android APK (Capacitor).

## Язык
**Всё общение с пользователем — на русском.** Код, коммиты, имена — на английском.

## Команды
Запускать из `C:\dev\vector` (НЕ из `.claude/worktrees/...` — иначе module-not-found).
```
npm run dev      # vite dev-сервер
npm run build    # tsc -b && vite build
npm run lint     # tsc -b --noEmit  (проверка типов)
npm test         # vitest run  (45 тестов: rideStateMachine, geo)
```
После правок всегда: `npm run lint` + `npm test`.

## Стек
- React 18 + Vite + TypeScript, MapLibre GL (карта)
- Capacitor 8 → Android APK
- `@capgo/background-geolocation` — foreground GPS-сервис (работает с выключенным экраном)
- `@capacitor-community/text-to-speech` — нативный TTS (speechSynthesis в Android WebView сломан)
- Локальный нативный плагин `BatteryOptimization` (Java) — исключение из Doze

## Архитектура
- **Стейт-машина поездки** (`lib/rideStateMachine.ts`) — чистый редьюсер, 4 фазы:
  PRE_RIDE → RIDING → SHORT_STOP → LONG_STOP. Покрыта юнит-тестами. НЕ ломать без тестов.
- **Голос** (`lib/voice.ts`) — два источника: `setInterval`-каденция (тормозится при экране-офф)
  и GPS-dup внутри GPS-колбэка (работает в фоне). Порог между фразами `MIN_GAP_MS`.
- **Keep-alive** (`lib/wakeAudio.ts`) — тихий `<audio>` держит JS-движок WebView живым в фоне.
  КРИТИЧНО: TTS забирает аудио-фокус и паузит его → возобновляем в `finally` после `speak`.
- **GPS** (`lib/geolocation.ts`) — гибрид: фон через capgo (foreground service), перед-план через
  @capacitor/geolocation. Один глобальный watcher.
- **Компас** (`lib/orientation.ts`) — deviceorientation, 1€-фильтр. Нет foreground-сервиса —
  умирает при экране-офф (в отличие от GPS).

## Главная сложность: работа с выключенным экраном
Пользователь ВСЕГДА тестирует с погашенным экраном, телефон в кармане. Поэтому:
- Нельзя полагаться на `setInterval`/`requestAnimationFrame`/компас — они тормозятся в фоне.
- GPS-колбэк из натива продолжает приходить → критичную логику дублируем там.
- Android может заморозить весь процесс (Doze) или JS (если keep-alive audio встал).
- Симптом заморозки JS: трек «дорисовывается пачкой» при включении экрана + сразу фраза.

## Диагностика (ВРЕМЕННАЯ — убрать перед релизом)
- `lib/diag.ts` — кольцевой буфер. `dlog(tag, msg)`.
- **MARK** — тап по бейджу LIVE/PAUSED пишет снимок состояния голоса (sil/int/arr/wake/sinceV…).
- Лог по каждой поездке: Saved → Поездки → ⌕ Лог (срез буфера за поездку, ключ `triplog:<id>`).
- Экспорт всего: Настройки → Диагностика.

## CI / деплой
- Push в `main` → GitHub Actions «Build APK (Capacitor)» (~4 мин), артефакт APK.
- Netlify — PWA. Сборка подписывается **debug-ключом** (release-подпись отложена).

## Google Play (верификация разработчика)
- Разработчик: **EXPROMT SERVIS s.r.o.** (подтверждён).
- Package: **`cz.konsalting.vektor`** — зарегистрирован, SHA-256 release-ключа подтверждён.
- Release keystore: `C:\Users\User\vektor-keys\vektor-release.jks`, alias `vektor` (НЕ в репо).
- Префикс портфолио: `cz.konsalting.*`.

## Конвенции
- **CHANGELOG.md** обновлять В ТОМ ЖЕ коммите, что и фича/фикс (не позже). Формат Keep a Changelog.
- Версия в `package.json` — SemVer, бампать с каждым релизом APK.
- Коммиты на английском, в конце: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Секреты (keystore, пароли) — НИКОГДА в репозиторий (`.gitignore`: `*.jks`, `*.keystore`).

## Техдолг / планы
- `RideScreen.tsx` ~2900 строк — разбить на модули + хуки (рефакторинг #1).
- Единый GPS-провайдер в App.tsx вместо отдельных watch на экранах (#8).
- Убрать временную диагностику перед релизом.
- Перед публикацией: CI release-подпись (keystore в GitHub Secrets), листинг Play, privacy policy
  (фоновая геолокация — придирчивая часть ревью Google, нужно обоснование).
