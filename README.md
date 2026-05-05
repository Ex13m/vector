# Vector

Голосовой навигатор-маяк для велосипеда и пешего туризма. Вместо стрелок и градусов — направление **«по часам»**: «цель на 11 часов, 4.8 км». Работает офлайн как PWA.

[![deploy](https://api.netlify.com/api/v1/badges/deploy-status.svg)](https://app.netlify.com)

---

## Что внутри

- **3 экрана** из дизайн-хэндоффа: выбор цели → офлайн-кэш карты → поездка.
- **Реальное** позиционирование (`Geolocation.watchPosition`) и направление (`DeviceOrientationEvent`).
- **MapLibre GL** + растровые тайлы OpenStreetMap / Esri Satellite / OpenTopoMap / Waymarked Trails.
- **Офлайн-кэш карты**: тайлы в IndexedDB через `idb-keyval` + Workbox-кэш в Service Worker.
- **Голосовое сопровождение**: `SpeechSynthesis` (Web Speech API), интервал и голос настраиваются.
- **Хаптика** при смене «часа» цели.
- **PWA**: устанавливается на главный экран, обновления через тост, оффлайн-загрузка.
- **Локализация** RU/EN, авто-выбор по `navigator.language`.
- **Сохранение** избранных точек и поездок в IndexedDB.

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
  App.tsx              — роутер + глобальный state + регистрация SW
  main.tsx             — entry, импорт стилей MapLibre
  styles.css           — токены и сбросы
  theme.ts             — цвета, шрифты
  i18n.ts              — словари RU/EN, фукнция t(lang, key, vars)
  lib/
    geo.ts             — bearing, haversine, форматирование
    geolocation.ts     — обёртка watchPosition
    orientation.ts     — DeviceOrientation + iOS permission
    speech.ts          — SpeechSynthesis
    map.ts             — MapLibre style для слоёв std/sat/topo/tour
    tiles.ts           — расчёт тайлов для bbox + загрузка в IDB
  store/
    settings.ts        — localStorage
    favorites.ts       — IndexedDB (idb-keyval)
    trips.ts           — IndexedDB
  components/
    ClockDial.tsx      — мини-циферблат (top-right)
    BigClockDial.tsx   — fullscreen peek (long-press)
    BottomHud.tsx      — нижняя панель с TO TARGET / O'CLOCK / ETA
    StatusPill.tsx     — LIVE / PAUSED / NO SIGNAL
    LayerPicker.tsx    — поповер выбора слоя карты
    SettingsSheet.tsx  — bottom-sheet настроек
    UpdateToast.tsx    — тост обновления PWA
    InstallPrompt.tsx  — баннер «Установить» (с iOS-fallback)
  screens/
    PickScreen.tsx     — карта, тап = цель, избранное, ⊕ найти меня
    CacheScreen.tsx    — bbox + slider детализации, прогресс кэширования
    RideScreen.tsx     — главный экран с GPS/ориентацией/голосом
prototype/             — оригинальный HTML-прототип из дизайн-хэндоффа
public/                — иконки PWA
```

---

## Дизайн-токены

См. `src/theme.ts`. Источник истины — `prototype/DESIGN-HANDOFF.md`.

---

## Что дальше

- **Поиск адреса** в PickScreen (Nominatim).
- **Векторные тайлы** (PMTiles) вместо растровых — компактнее в офлайне.
- **История поездок** как отдельный экран.
- **Capacitor** для упаковки в `.ipa` / `.apk` если потребуется выход в сторы.

---

## Лицензия

MIT.
