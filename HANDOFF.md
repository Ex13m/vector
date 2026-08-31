# HANDOFF — состояние проекта Vector

**Обновлено:** 31 августа 2026 · **В репозитории:** v0.5.99 · **В Play (internal testing):** versionCode 5 / 1.0.1

Документ для переключения между машинами и сессиями: где мы находимся, что сделано, что осталось.

---

## Где мы сейчас

Приложение **загружено в Google Play, трек internal testing**, установлено на телефон владельца и проверено в поле
(включая поездку на машине, YouTube в фоне и входящие звонки — голос не прерывался).
Витрина магазина **заполнена полностью через Play Developer API** и помечена консолью как «Готово к отправке на проверку».
Публичной страницы в магазине ещё нет — она появится после Production-ревью.

**Аудит готовности пройден** (см. `docs/AUDIT-PLAY-READINESS.md`): 36 гипотез проверено, блокеров ревью нет,
вердикт **GO**. Ключевой вывод: `ACCESS_BACKGROUND_LOCATION` в манифестах отсутствует (фон работает через
foreground-сервис с `foregroundServiceType="location"`), поэтому тяжёлая декларация background location,
которой мы опасались, скорее всего вообще не потребуется.

---

## Что уже сделано

| Область | Состояние |
|---|---|
| Сборка | versionCode 5, versionName 1.0.1, подписана релизным ключом, залита в internal |
| Витрина | тексты EN + RU, иконка 512, feature graphic 1024×500, 8 скриншотов — всё через API |
| Privacy policy | https://boisterous-heliotrope-499640.netlify.app/privacy.html (живая) |
| Лендинг | тот же домен, `/landing.html` — видео-герой с музыкой и озвучкой, кнопка Sound on |
| Промо-ролик | 5 сцен Seedance + плашка, музыка lyria-2, закадр minimax; мастера 16:9, 9:16 и 4K/60 в `output/video/vector-promo/final/` |
| Промо-PDF | `output/Vector-promo.pdf` |
| Автоматизация Play | `scripts/play-publish.py` — status / listing / images / upload / promote |

---

## ОТПРАВЛЕНО НА РЕВЬЮ — 31 августа 2026

Production: **versionCode 8 / 1.0.4, status=completed** (проверено через API). Приложение в проверке Google.
Вместе с релизом ушли витрина EN+RU с промо-роликом, возрастной рейтинг, политика, заявление о рекламе
и декларация foreground-геолокации.

Что оказалось нужным сверх ожидаемого:
- **Страны/регионы** — у Production трека их не было вовсе, из-за чего кнопка отправки оставалась серой.
  Добавлено 40 стран (остальные можно дозаполнить позже, нового ревью не требуют).
- **Декларация «Разрешения на использование активных служб»** (Android 14+) — обязательна, раз объявлен
  `FOREGROUND_SERVICE_LOCATION`. Задача: **Навигация**, описание из §3 `docs/PLAY-LISTING.md`,
  видео https://www.youtube.com/watch?v=cgbiE_2xiUE
- Предупреждение «нет файла деобфускации» — безобидное, следствие выключенного R8.

Ожидание: 1–7 дней. Управляемая публикация выключена → после одобрения приложение появится в магазине
автоматически. Ссылка после публикации:
https://play.google.com/store/apps/details?id=cz.konsalting.vektor

## Что осталось до Production

1. **Формы в Console** (API их не умеет — только руками): Data Safety · Content rating (IARC) ·
   Target audience · Ads = No. Готовые ответы — в `docs/PLAY-LISTING.md` §2.
2. **App access / обоснование foreground-location** + ссылка на демо-видео (unlisted YouTube).
   Видео снято владельцем 31.08.2026. В кадре должно быть видно: выбор цели → старт → уведомление
   сервиса → экран гаснет → слышен голос → «Завершить» → уведомление исчезло.
3. **Видео в витрине** (необязательно, но поднимает конверсию): промо-ролик на YouTube → ссылка в поле «Видео».
4. **Production release**: продвинуть сборку из internal или создать новый релиз с тем же AAB. Ревью 1–7 дней.

Ссылки: [список приложений](https://play.google.com/console/u/1/developers/5618751079422654222/app-list) ·
[витрина](https://play.google.com/console/u/1/developers/5618751079422654222/app/4972740517887436346/main-store-listing) ·
[пользователи и разрешения](https://play.google.com/console/u/1/developers/5618751079422654222/users-and-permissions)

---

## Рекомендовано аудитом (не блокеры, ~20 минут)

- `src/lib/tiles.ts` — ранний выход в `tilesForBox` по счётчику: без GPS-фикса карта открывается на zoom 4,
  и экран кэша строит ~500 тыс. объектов-тайлов (подлаг + мусорная карточка; при zoom ≤2 — риск убить WebView).
- Пять оставшихся русских литералов в английском UI: `CacheScreen.tsx:516`, `:654`,
  `PickScreen.tsx:1382`, `:1462`, `:1472`.
- `docs/PLAY-LISTING.md` §3 — переименовать «декларация фоновой геолокации» в декларацию
  foreground-service location (по факту это она).

---

## v1.1 сразу после отправки MVP (решения владельца зафиксированы)

- **Paywall «полная версия»** (НЕ донат, НЕ подписка): **5 бесплатных поездок** → экран
  «Unlock full version **$4.99**» (Google Play Billing, one-time product) → «Позже» = **+2 поездки**.
  Покупка навсегда, restore при переустановке. Функционал полный с первой минуты, рекламы нет.
- **Реклама и продвижение**: FB-группы (Bikepacking, MTB Community, Electric Bike Enthusiasts, eBike Smile eMTB,
  Cycle Touring Companions + чешские), Reddit (r/bikepacking, r/MTB, r/ebikes), Shorts/Reels/TikTok,
  Pinkbike/MTBR, позже Product Hunt. Материалы готовы: ролик 4K + PDF + лендинг.

---

## Отложено сознательно (НЕ делать без запроса)

- **«Затык в логике»** — владелец что-то заметил в поле, детали не рассказал, просил вернуться после публикации. **СПРОСИТЬ.**
- R8-минификация (только с полевым тестом) · GPS `distanceFilter` (трогает вход стейт-машины) ·
  рефакторинг `RideScreen` · снятие диагностики (`diag.ts`) перед широким релизом.

---

## Правила работы по проекту

- **Алгоритм езды идеален и неприкосновенен**: `rideStateMachine.ts`, `rideSession.ts`, GPS-тик, интервалы голоса,
  авто-поворот карты по фазам (PRE_RIDE — наведение на цель, RIDING — курс как у Google). Не трогать.
- Голосовые формулировки не менять без запроса. Все сценарии продолжения (Продолжить / Новая цель / Вернуться)
  идут одинаково через PRE_RIDE, голос всегда говорит «Цель».
- Перед правками — детальное описание и подтверждение владельца.
- `CHANGELOG.md` обновляется тем же коммитом, что и правка.

---

## Сборка подписанного AAB локально

Нужны: JDK 21 (Temurin), Android SDK (`%LOCALAPPDATA%\Android\Sdk`, cmdline-tools + platforms;android-36 +
build-tools;36.0.0), `android/keystore.properties` (по `.example`; ключ в `vektor-keys`, пароль в
README-credentials там же — **в репозиторий не попадает**).

```powershell
npm run build ; npx cap sync android --inline
cd android ; .\gradlew.bat bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```

Заливка в Play (нужен `C:\Users\User\play-api-key.json`, тоже вне репозитория):

```powershell
python scripts/play-publish.py upload --aab <path.aab> --track internal --commit
```
