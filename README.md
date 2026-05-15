# Vector

Голосовой навигатор-маяк для велосипеда и пешего туризма. Вместо стрелок и градусов — направление **«по часам»**: «цель на 11 часов, 4.8 км». Работает офлайн как PWA.

[![deploy](https://api.netlify.com/api/v1/badges/deploy-status.svg)](https://app.netlify.com)

---

## Что внутри

- **3 экрана** из дизайн-хэндоффа: выбор цели → офлайн-кэш карты → поездка.
- **Реальное** позиционирование (`Geolocation.watchPosition`) и направление (`DeviceOrientationEvent`).
- **Навигация course-up**: карта вращается по курсу, маркер «вы» зафиксирован вверх (как Google Nav). Курс — из GPS-вектора в движении, из компаса на стоянке.
- **4-фазная машина состояний** поездки: `PRE_RIDE → RIDING → SHORT_STOP → LONG_STOP`. Фильтрует GPS-джиттер, переключает источник курса (трек / компас) и режим голоса. На стоянках (PRE_RIDE/LONG_STOP) — режим наведения: крутишь телефон, цель встаёт на 12 → голос «Цель впереди».
- **Компас с 1€-фильтром** (Casiez et al., CHI 2012): адаптивное сглаживание — нет дрожи в покое, нет лага при повороте. Курс камеры идёт на полной частоте (~60 Hz) в обход React — плавное вращение карты.
- **MapLibre GL** + растровые тайлы OpenStreetMap / Esri Satellite / OpenTopoMap / Waymarked Trails.
- **Офлайн-кэш карты**: тайлы в Cache API + Workbox-кэш в Service Worker.
- **Голосовое сопровождение**: `SpeechSynthesis` (Web Speech API), интервал и голос настраиваются.
- **Хаптика** при смене «часа» цели.
- **Восстановление сессии**: активная поездка переживает закрытие вкладки ОС.
- **PWA**: устанавливается на главный экран, обновления через тост, оффлайн-загрузка.
- **Локализация** RU/EN/DE, авто-выбор по `navigator.language`.
- **Сохранение** избранных точек и журнал поездок в IndexedDB.

---

## Стек

```
Vite 5 + React 18 + TypeScript 5
vite-plugin-pwa (Workbox, manifest, SW)
maplibre-gl 4
idb-keyval 6
Web APIs: Geolocation, DeviceOrientation, SpeechSynthesis, Vibration
```

---

## Установка и запуск (для разработчика)

Нужно: **Node.js ≥ 18**, npm.

```bash
git clone https://github.com/Ex13m/vector.git
cd vector
npm install
npm run dev          # http://localhost:5173
```

Production-сборка локально:

```bash
npm run build
npm run preview      # http://localhost:5173 — отдаёт dist/
```

---

## Установка как приложение (для пользователя)

1. Откройте URL сайта на телефоне.
2. **Android (Chrome)** — баннер «Установить» появится сам. Или меню → «Установить приложение».
3. **iOS (Safari)** — кнопка «Поделиться» → «На экран Домой».
4. Разрешите геолокацию (всегда / при использовании) и движение/ориентацию (запросится один раз).

После установки приложение открывается в полноэкранном режиме без адресной строки и работает оффлайн.

---

## Деплой

Репозиторий подключён к Netlify, билд автоматический:

| Параметр       | Значение         |
| -------------- | ---------------- |
| Build command  | `npm run build`  |
| Publish dir    | `dist`           |
| Node version   | `20` (`netlify.toml`) |

Любой `git push` в `main` → Netlify билдит → пользователи получают тост «Доступно обновление» при следующем открытии.

### Self-host (Docker)

Базовый Dockerfile (multi-stage, nginx-alpine):

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` должен делать SPA-fallback на `index.html` и отдавать `sw.js` с `Cache-Control: no-cache`.

---

## Структура

```
src/
  App.tsx              — роутер экранов + глобальный state + регистрация SW
  main.tsx             — entry, импорт стилей MapLibre
  theme.ts             — цвета, шрифты, дизайн-токены
  lib/
    geo.ts             — bearing, haversine, формат дистанции, clock-позиция
    orientation.ts     — компас: DeviceOrientation + 1€-фильтр + iOS permission
    rideStateMachine.ts— 4-фазная машина поездки (чистый reducer)
    tiles.ts           — расчёт тайлов для bbox + загрузка в Cache API
    mapStyles.ts       — MapLibre style для слоёв std/sat/topo/tour
    geocoder.ts        — поиск адресов/POI (Nominatim) с location-bias
    voice.ts           — SpeechSynthesis: фразы, голоса, языки
    feedback.ts        — хаптика (Vibration API)
    wakeAudio.ts       — фоновый аудио-трюк против засыпания вкладки
    storage.ts         — IndexedDB (idb-keyval): избранное, журнал поездок
    constants.ts       — пороги, лимиты, дефолты
    geoMock.ts         — DEV-симуляция GPS-трека
  components/
    MiniDial.tsx       — мини-циферблат (стрелка на цель)
    BigDial.tsx        — fullscreen peek циферблата (long-press)
    SettingsSheet.tsx  — bottom-sheet настроек
    UpdateToast.tsx    — тост обновления PWA
    InstallPrompt.tsx  — баннер «Установить» (с iOS-fallback)
    DevBar.tsx         — DEV-панель (tree-shaken в проде)
  screens/
    PickScreen.tsx     — карта, тап = цель, поиск, избранное, журнал поездок
    CacheScreen.tsx    — bbox + адаптивный зум, прогресс кэширования
    RideScreen.tsx     — главный экран: GPS, компас, голос, машина состояний
prototype/             — оригинальный HTML-прототип из дизайн-хэндоффа
public/                — иконки PWA
```

---

## Дизайн-токены

См. `src/theme.ts`. Источник истины — `prototype/DESIGN-HANDOFF.md`.

---

## Что дальше

- **Векторные тайлы** (PMTiles) вместо растровых — компактнее в офлайне.
- **Подсказка калибровки компаса** при низкой точности магнитометра.
- **Capacitor** для упаковки в `.ipa` / `.apk` если потребуется выход в сторы.

---

## Лицензия

MIT.
