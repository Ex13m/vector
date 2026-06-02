# Vector

Голосовой навигатор-маяк для велосипеда и пешего туризма. Вместо стрелок и градусов — направление **«по часам»**: «цель на 11 часов, 4.8 км». Работает как **Android-приложение** (Capacitor APK) и как офлайн **PWA**. Рассчитан на езду с **выключенным экраном** — телефон в кармане, навигация голосом.

[![deploy](https://api.netlify.com/api/v1/badges/deploy-status.svg)](https://app.netlify.com)

---

## Что внутри

- **3 экрана**: выбор цели → офлайн-кэш карты → поездка.
- **Навигация-маяк, а не маршрут**: всегда знаешь, где цель и сколько до неё, но сам решаешь, как ехать. Никаких «через 200 м направо».
- **Навигация course-up**: карта вращается по курсу, маркер «вы» зафиксирован вверх. Курс — из GPS-вектора в движении, из компаса на стоянке.
- **4-фазная машина состояний** поездки: `PRE_RIDE → RIDING → SHORT_STOP → LONG_STOP`. Фильтрует GPS-джиттер, переключает источник курса (трек / компас) и режим голоса. На стоянках — режим наведения: крутишь телефон, цель встаёт на 12 → голос «Цель впереди».
- **Работа в фоне (экран выключен)** — главная особенность:
  - GPS через нативный foreground-сервис (`@capgo/background-geolocation`) — фиксы идут с погашенным экраном.
  - Нативный TTS (`@capacitor-community/text-to-speech`) — `speechSynthesis` в Android WebView не работает.
  - Тихий keep-alive `<audio>` держит JS-движок WebView живым в фоне.
  - Нативный плагин `BatteryOptimization` — исключение из Doze, чтобы Android не замораживал процесс.
- **Компас с 1€-фильтром** (Casiez et al., CHI 2012): нет дрожи в покое, нет лага при повороте. Курс камеры — на полной частоте (~60 Hz) в обход React.
- **MapLibre GL** + растровые тайлы OpenStreetMap / Esri Satellite / OpenTopoMap / Waymarked Trails.
- **Офлайн-кэш карты**: тайлы в Cache API + Workbox в Service Worker.
- **Полная блокировка экрана** («карман-режим»): кнопка-замок блокирует все кнопки, зум и жесты — работает только наведение. Разблокировка удержанием.
- **Хаптика** при смене «часа» цели и совпадении курса с вектором (±5°).
- **Восстановление сессии**: активная поездка переживает закрытие приложения.
- **Журнал поездок**: сохранение трека, GPX-экспорт, продолжение поездки, диагностический лог по каждому заезду — всё в IndexedDB.
- **Избранные цели** с быстрым запуском.
- **Локализация** RU/EN/DE, авто-выбор по `navigator.language`.

---

## Стек

```
Vite 5 + React 18 + TypeScript 5
Capacitor 8                       — Android APK (нативная оболочка)
  @capgo/background-geolocation   — фоновый GPS (foreground service)
  @capacitor-community/text-to-speech — нативный TTS
  локальный плагин BatteryOptimization (Java) — исключение из Doze
maplibre-gl 4                     — карта
vite-plugin-pwa (Workbox, SW)     — PWA-вариант
idb-keyval 6                      — IndexedDB (поездки, цели, настройки)
Web APIs: Geolocation, DeviceOrientation, Web Speech (в PWA), Vibration
```

---

## Установка и запуск (для разработчика)

Нужно: **Node.js ≥ 20**, npm. Для сборки APK — JDK 21 + Android SDK (или через CI).

```bash
git clone https://github.com/Ex13m/vector.git
cd vector
npm install
npm run dev          # http://localhost:5173 (веб-режим)
```

Проверки:

```bash
npm run lint         # tsc -b --noEmit
npm test             # vitest run (45 тестов: rideStateMachine, geo)
npm run build        # tsc -b && vite build
```

### Сборка APK

APK собирается автоматически в **GitHub Actions** (`.github/workflows/build-apk.yml`) при пуше в `main`:
`npm run build` → `npx cap sync android` → `gradlew assembleDebug/assembleRelease`. Артефакт — в логе прогона.

Локально:

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Деплой

| Цель | Как |
| --- | --- |
| **PWA** | Netlify, `npm run build` → `dist`. Push в `main` → авто-билд → тост «Доступно обновление». |
| **Android APK** | GitHub Actions → артефакт. Google Play — package `cz.konsalting.vektor` (release-подпись настраивается перед публикацией). |

---

## Структура

```
src/
  App.tsx              — роутер экранов (lazy) + глобальный state + регистрация SW
  main.tsx             — entry, импорт стилей MapLibre
  theme.ts             — цвета, шрифты, дизайн-токены
  lib/
    geo.ts             — bearing, haversine, формат дистанции, clock-позиция
    orientation.ts     — компас: DeviceOrientation + 1€-фильтр + iOS permission
    rideStateMachine.ts— 4-фазная машина поездки (чистый reducer, покрыт тестами)
    geolocation.ts     — гибрид GPS: web watchPosition + capgo foreground service
    voice.ts           — голос: нативный TTS (APK) / Web Speech (PWA), фразы, языки
    wakeAudio.ts       — keep-alive <audio>: держит JS живым в фоне
    battery.ts         — обёртка нативного плагина BatteryOptimization (Doze)
    feedback.ts        — хаптика (Vibration / Haptics)
    storage.ts         — IndexedDB: цели, журнал поездок, лог по поездке, GPX
    rideSession.ts     — восстановление активной поездки
    diag.ts            — кольцевой диаг-лог (ВРЕМЕННО, убрать перед релизом)
    tiles.ts / mapStyles.ts / geocoder.ts / constants.ts / geoMock.ts
  components/
    MiniDial / BigDial — циферблаты (стрелка на цель)
    SettingsSheet / UpdateToast / InstallPrompt / DevBar
  screens/
    PickScreen.tsx     — карта, выбор цели, поиск, избранное, журнал
    CacheScreen.tsx    — bbox + адаптивный зум, прогресс кэширования
    RideScreen.tsx     — главный экран: GPS, компас, голос, машина состояний
android/               — Capacitor Android-проект (+ локальный плагин BatteryOptimization)
prototype/             — оригинальный HTML-прототип из дизайн-хэндоффа
```

---

## Дизайн-токены

См. `src/theme.ts`. Источник истины — `prototype/DESIGN-HANDOFF.md`.

---

## Лицензия

MIT.
