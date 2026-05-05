# Handoff: Vector — навигация «по часам»

## Что это

Vector — мобильное приложение, которое заменяет компас на «часовую» метафору: вместо градусов и стрелок пользователь слышит и видит «цель на 11 часов, 4.5 км». Главный сценарий — велоспорт/прогулки/походы оффлайн: выбрал точку → закэшировал карту → поехал → голос с заданным интервалом подсказывает направление и расстояние.

В этой папке — **дизайн-референс в виде HTML-прототипа**, не production-код. Задача разработчика: **воссоздать этот дизайн в нативном кросс-платформенном стеке** (рекомендация ниже), сохранив пиксельную точность визуала, ритм, тайминги, тактильные сигналы и поведение.

## Fidelity

**High-fidelity.** Все цвета, типографика, отступы, тайминги анимаций, тексты, состояния и интеракции зафиксированы. Воссоздавать пиксель-в-пиксель.

---

## Рекомендуемый стек и пайплайн (под запрос пользователя)

Пользователь хочет:
1. Кроссплатформенно (iOS/Android/Web).
2. Установка по ссылке (без сторов).
3. Автоматическое обновление внутри приложения.
4. Публикация на GitHub → автодеплой на Netlify.
5. Опционально: Docker-контейнер для self-host.

### Решение: PWA на Vite + React + vite-plugin-pwa

PWA — единственная опция, которая закрывает всё сразу (стор не нужен, ссылка — это URL, обновление — `workbox-window`).

```
Stack:
- Vite 5 + React 18 + TypeScript
- vite-plugin-pwa (Workbox, manifest, service worker)
- MapLibre GL JS (offline-tiles, MIT, бесплатные тайлы OSM/MapTiler)
- Web Speech API (SpeechSynthesis) для голоса — бесплатно, работает оффлайн на iOS/Android
- Geolocation API + DeviceOrientation для bearing
- IndexedDB (через idb-keyval) — для тайлов и истории поездок
- Capacitor (опционально, чтобы упаковать в .ipa/.apk если когда-нибудь захочется в стор)
```

### Деплой пайплайн (Git → Netlify)

1. **Репозиторий**: `github.com/<user>/vector`. Один main-branch.
2. **Netlify**: подключить репо. Build command `npm run build`, publish dir `dist`. Включить «Deploy previews on PR» и «Production deploy on push to main».
3. **Кастомный домен** (опционально): `vector.app` или `vector.<user>.com`. HTTPS — обязателен (PWA не ставится без TLS).
4. **Push на main → Netlify билдит → пользователи получают новый SW при следующем открытии**. См. ниже про авто-апгрейд.

### Установка по ссылке

- Открыть `https://vector.netlify.app` на телефоне → меню браузера → «Установить приложение» / «Add to Home Screen».
- В коде показать кастомный prompt по событию `beforeinstallprompt`.
- iOS Safari: prompt API нет — показать инструкцию-туториал «Поделиться → На экран Домой».

### Авто-апгрейд

`vite-plugin-pwa` с `registerType: 'prompt'`:

```ts
// vite.config.ts
VitePWA({
  registerType: 'prompt',
  manifest: { name: 'Vector', short_name: 'Vector', theme_color: '#0a0c0b', background_color: '#0a0c0b', display: 'standalone', icons: [...] },
  workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
})
```

В рантайме:

```ts
import { registerSW } from 'virtual:pwa-register';
const updateSW = registerSW({
  onNeedRefresh() {
    // Показать non-blocking тост в стиле приложения:
    // «Доступно обновление · Обновить»
    // По клику → updateSW(true) — перезагрузка с новым билдом
  },
  onOfflineReady() { /* тост: «Готово к работе оффлайн» */ },
});
```

Тост — компактный pill внизу экрана, оранжевый акцент `#FF6B1A`, шрифт mono, 11px, padding 10×16, border-radius 12. Не блокирует UI.

### Docker (self-host)

`Dockerfile` (multi-stage build → nginx alpine):

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

`nginx.conf` должен отдавать `index.html` для всех маршрутов (SPA fallback) и правильные `Cache-Control` для `sw.js` (`no-cache`).

---

## Файлы в этой папке

`design_reference/` — HTML-прототип. Открыть `Vector.html` в браузере чтобы увидеть все экраны. Tweaks-панель (значок справа) переключает screen / язык / симуляцию / dark.

- `Vector.html` — корневой шелл, импорты, состояние верхнего уровня
- `app.jsx` — роутер между экранами
- `screens.jsx` — все экраны и компоненты карты
- `android-frame.jsx` — рамка устройства (только для прототипа, в реале не нужна)
- `tweaks-panel.jsx` — отладочная панель (в реале не нужна)

---

## Дизайн-токены

```ts
export const C = {
  bg:      '#0A0C0B',  // основной фон
  bg2:     '#111413',  // карточки, бары
  bg3:     '#181C1A',  // приподнятые поверхности
  ink:     '#F2F0EA',  // основной текст
  inkDim:  '#7A7E78',  // вторичный текст / лейблы
  inkMute: '#4A4E48',  // отключённый текст
  line:    '#1F2422',  // тонкие разделители
  line2:   '#2A302D',  // акцентные разделители / бордеры
  target:  '#FF6B1A',  // главный акцент (бренд)
  glow:    'rgba(255,107,26,0.35)', // оранжевое свечение
  ok:      '#48DE94',  // success / near-target
};
```

### Типографика

```ts
F_DISP = "'Space Grotesk','Manrope',system-ui,sans-serif"; // заголовки и крупные числа
F_MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace"; // лейблы, время, числа в HUD
```

Шкала: 9, 10, 11, 12, 14, 16, 18, 20, 22, 28, 30, 34, 38, 56, 64, 96.
Лейблы — F_MONO 9–11px, `letter-spacing: 0.16–0.22em`, `text-transform: uppercase`.
Числа — F_DISP 28–96px, `font-weight: 700`, `letter-spacing: -0.04em`, `font-variant-numeric: tabular-nums`.

### Радиусы

`8` — внутренние элементы; `10` — кнопки, чипы; `12` — поля ввода, тосты; `14` — карточки HUD; `999` — pill / badge.

### Тени и свечения

```css
boxShadow: 0 4px 14px rgba(0,0,0,0.4)           /* плавающие элементы */
boxShadow: 0 0 24px rgba(255,107,26,0.35)        /* акцентные блоки */
boxShadow: 0 0 32px rgba(72,222,148,0.35)        /* near-target glow */
backdropFilter: blur(8–12px)                      /* поверх карты */
```

### Спейсинг

`4, 6, 8, 10, 12, 14, 16, 18, 20, 24` — кратность 2.

---

## Экраны

### 01. Pick (выбор цели)

**Цель**: пользователь выбирает точку на карте или из избранного.

**Layout**:
- Хедер (сверху, padding `10px 12px`): кнопка-чип «Назад» 38×38, центральный pill «01 / Цель», справа кнопка ⚙ 38×38.
- Поле поиска: высота 48, `borderRadius:12`, `bg:bg2`, `border:1px solid line2`, иконка-лупа 16px слева, отступ 14.
- Карта: занимает всё оставшееся пространство, центральный crosshair `#FF6B1A`.
- Список избранных (sheet снизу): drag-handle 40×4 `inkDim`, заголовок «Избранное» F_DISP 14, элементы списка 56×full-width, тап → центрирует карту.
- CTA внизу: кнопка `Старт` высотой 56, `bg:target`, `color:#1A0A00`, F_DISP 16 700, `borderRadius:12`. Над кнопкой превью: «Цель на 11 часов · 4.82 км» F_MONO 11.

### 02. Cache (офлайн-карта)

**Цель**: скачать тайлы видимой области карты.

**Layout**:
- Хедер «02 / Офлайн», заголовок «Caching» F_DISP 28 600.
- Превью карты 396×320 с подсветкой видимого rect (рамка `2px dashed target`, заливка `rgba(255,107,26,0.06)`).
- Контролы:
  - Лейбл «Видимая область» F_DISP 14 + справа `~1.6 MB · 90 tiles` F_MONO 12 цвет target.
  - Слайдер детализации: кнопка `−` 36×36, `<input type=range min=-2 max=2 step=1>` accent target, кнопка `+` 36×36.
  - Подписи под слайдером: «− меньше деталей» / «СТАНДАРТ / +1 / −1» / «+ больше деталей», F_MONO 10 inkDim.
- CTA `↓ Caching (1.6 MB)`, такая же геометрия как Pick.
- В состоянии загрузки: огромное число прогресса F_MONO 56 500, `<tilesDone> / <total> tiles` F_MONO 11, тонкий progress-bar высотой 2px, при 100% — кнопка становится `Старт →`.

### 03. Ride (главный экран)

**Layout сверху вниз**:

1. **Top bar** (10/12 padding, `gap:8`, `opacity` тает в 0.18 через 5с без тапа, transition 400ms):
   - Кнопка «←» 42×38, `border:1px solid line2`, `borderRadius:10`.
   - Центральный статус-pill: зелёная (`#48DE94`) или оранжевая (если paused) точка 6×6 с `boxShadow:0 0 8px цвет`, текст «LIVE» / «PAUSED» / «EXIT» F_MONO 10 0.18em uppercase, padding 6/12, `borderRadius:999`, `bg:rgba(11,13,12,0.85)`.
   - Кнопка «⚙» 42×38.

2. **Floating layer button** (left:12, top:8 относительно карты, тоже тает):
   - 42×38 квадратная кнопка, иконка `<svg>` сложенной карты (см. screens.jsx `LayerButton`).
   - Тап → поповер 140px ширины, `bg:rgba(11,13,12,0.96)`, `border:1px solid line2`, `borderRadius:12`, `padding:4`. Заголовок «СЛОЙ КАРТЫ» F_MONO 8.5 0.22em.
   - 4 пункта (Карта / Спутник / Топо / Турист), каждый 8/10 padding, иконка 16×16 + лейбл F_MONO 11 0.08em uppercase. Активный — `bg:target`, текст `#1A0A00`, weight 700.
   - Под пунктами `<hr>` `bg:line2 margin:4 6`. Дальше тогл «След · вкл/выкл» — иконка-волна, цвет переключается target/inkDim.

3. **Floating mini clock-dial** (right:12, top:6):
   - Круг 56×56, `bg:rgba(11,13,12,0.88)`, `border:1px solid line2`.
   - 12 рисок (часовые отметки), main риски 1.4px ink, остальные 0.9px inkDim.
   - Точка-12 (1.4px ink) у верха.
   - Стрелка от центра в направлении `bearing`: толщина 2px, цвет target, наконечник-треугольник 5×3.2px.
   - Центральный круг 1.8px ink.
   - **Long-press 380ms** → fullscreen ClockDial peek (см. ниже).

4. **Карта** на весь экран. MapLibre с offline-source, маркер «вы» — зелёная капля + конус направления, цель — оранжевый crosshair с пульсацией (`@keyframes pulse: 0%→100%`, scale 1→1.15, stroke-opacity 1→0). Пройденный трек — зелёная линия 2px, рисуется только если `showTrail`.

5. **Bottom HUD pill** (left/right:14, bottom:14, `padding:8/2`, `borderRadius:14`, `bg:rgba(11,13,12,0.78)`, `backdropFilter:blur(12px)`):
   - 3 равные ячейки + 2 разделителя.
   - Ячейка: лейбл F_MONO 9 0.2em (inkDim или target) + значение F_DISP 28 700 (-0.04em) + единица F_MONO 11 (inkDim).
   - Лейблы: «TO TARGET», «AT · O'CLOCK» (target color, glow), «ETA».
   - Разделитель: 1px вертикальный, `linear-gradient` от `transparent → line2 → target → line2 → transparent`, opacity 0.55.
   - **Near-target (<500m)**: фон → `rgba(15,32,24,0.85)`, border-glow → `0 0 32px rgba(72,222,148,0.35)`, акцентный цвет → `#48DE94`, transition 400ms.

6. **Tool bar внизу**: высота ~64, `borderTop:1px line`, `bg:rgba(17,20,19,0.94)`. Слева направо:
   - PAUSE/PLAY 54px, иконка + label F_MONO 8.5 0.16em.
   - SPEED `21 km/h` (Tele).
   - RIDDEN `1.68 km` (target highlight).
   - TIME `02:51`.
   - Voice + Mute 44px стопкой.
   - STOP 70px, `bg:rgba(201,58,26,0.14)`, текст `#FF5A3A`, иконка-квадрат 16×16.

### Arrived overlay

Полноэкранный `bg:bg`, по центру:
- Круг 100×100, `border:2px target`, `boxShadow:0 0 40px glow`, внутри ✓ 46px target.
- «Arrived!» F_DISP 28 600.
- `00:14 · 25.3 KM/H · 4.82 km` F_MONO 12 inkDim 0.1em.
- Поле «Поездка · 5 мая» (input, 48px, `bg:bg2`, `border:1px line2`).
- Кнопка `↓ Save ride` (primary).
- Кнопка «New target» (ghost: `border:1px line2 bg:transparent`).

### ClockDial peek (long-press на циферблат)

Полноэкранный overlay `bg:rgba(8,10,9,0.92) backdropFilter:blur(6px)`, fadeIn 220ms. По центру — большой циферблат 280×280:
- Внешнее кольцо `border:2px line2`.
- 12 цифр часов F_DISP 18 (1, 2, 3, …, 12) на радиусе 100, цвет ink. 12 — крупнее, weight 700.
- Часовые риски на радиусе 114.
- Стрелка-цель: треугольник от центра в направлении bearing, target color, glow, пульсация.
- Маркер «вы» в центре — точка 6px ink.
- Авто-закрытие через 2200ms или тап.

### Settings sheet

Bottom-sheet, drag-down to dismiss, max-height 80vh:
- Заголовок «Настройки» F_DISP 18.
- Row «Интервал голоса»: лейбл слева, значение справа («15:00 мин» / «вык»), под лейблом range slider 0–1800 step 60, accent target.
- Row «Единицы»: segmented `[Метрические | Миль]`, активная вкладка `bg:target color:#1A0A00`.
- Row «Хаптика»: тогл (ON: target, OFF: line2).
- Row «Язык»: чипы `[РУС | EN]`.
- Row «Голос»: dropdown с list of SpeechSynthesisVoices.

---

## Поведение и интеракции

### Голос / Speech

```ts
const utter = new SpeechSynthesisUtterance(`Цель на ${clock} часов, ${dist}`);
utter.voice = selectedVoice;
utter.rate = 1.0;
speechSynthesis.speak(utter);
```

Каждые `intervalSec` секунд (по умолчанию 900 = 15 мин) — фраза. После старта поездки — сразу одна фраза. Кнопка «sayNow» в HUD — дополнительный тап. При `silence=true` — ничего не говорит, но в HUD всё считается.

### Bearing / Clock

```ts
function bearingToClock(bearing: number): number {
  // bearing в [-180, 180] относительно «прямо вперёд» = 12 часов
  const norm = ((bearing + 360) % 360);
  const hr = Math.round(norm / 30) % 12;
  return hr === 0 ? 12 : hr;
}
```

В реале: bearing = `bearingTo(currentLocation, target) − deviceHeading`. `deviceHeading` через `DeviceOrientationEvent.alpha` (с поправкой на `webkitCompassHeading` на iOS).

### Хаптика

При смене значения часов (Ride):
```ts
useEffect(() => {
  if (lastClockHr.current !== null && lastClockHr.current !== clock) {
    if (navigator.vibrate) navigator.vibrate(clock === 12 ? [12, 30, 24] : 10);
  }
  lastClockHr.current = clock;
}, [clock]);
```

### Auto-hide chrome

```ts
useEffect(() => {
  if (!chromeVisible) return;
  const id = setTimeout(() => setChromeVisible(false), 5000);
  return () => clearTimeout(id);
}, [chromeVisible, paused]);
// onClick по корню Ride: setChromeVisible(true)
```

Top bar, layer button, mini-dial — `opacity: visible?1:0.18`, `transition: opacity 400ms`. Bottom HUD не тает (всегда виден).

### Near-target

```ts
const near = !reverse && distM < 500 && !arrived;
```

Применяется к: bottom HUD pill (фон, glow, акцентный цвет), к разделителям (цвет градиента), к target-маркеру на карте (пульс быстрее).

### Long-press peek

```ts
const onMouseDown = () => { pressTimer.current = setTimeout(() => setPeekDial(true), 380); };
const onMouseUp = () => clearTimeout(pressTimer.current);
// Тоже onTouchStart/End.
// Закрытие: setTimeout(close, 2200) при открытии + onClick на overlay.
```

### Trail

Накапливается каждый tick локации в массив `[{lat,lng,t}]`. Хранится в `useState`, ограничен последними 120 точками. Рисуется как `<line>` SVG / `<MapLibre source:line>`. Toggle в layer popover.

### Cache

Видимая область карты определяется через `map.getBounds()`. Тайлы для bbox × zoom-levels (`current ± zoomDelta`) скачиваются последовательно через `fetch(tileUrl).then(blob → IndexedDB)`. Прогресс — `tilesDone / total`. Используем `workbox-strategies` `CacheFirst` для тайлов, чтобы офлайн-режим работал без отдельной инфраструктуры.

---

## State (верхний уровень)

```ts
type Settings = {
  intervalSec: 900,            // голос каждые 15 мин
  units: 'metric' | 'imperial',
  haptics: true,
  lang: 'ru' | 'en',
  voiceId: string | null,
};

type Trip = {
  id: string,
  name: string,
  startedAt: number,
  finishedAt: number | null,
  distM: number,
  speedAvg: number,
  trail: Array<{lat,lng,t}>,
  reverse: boolean,
};

type AppState = {
  screen: 'pick' | 'cache' | 'ride',
  layer: 'std' | 'sat' | 'topo' | 'tour',
  target: {lat,lng} | null,
  reverse: boolean,
  trips: Trip[],
  settings: Settings,
};
```

Хранение: `idb-keyval` для trips и тайлов, `localStorage` для settings.

---

## Минимальный getting-started для разработчика

```bash
# 1. Создать проект
npm create vite@latest vector -- --template react-ts
cd vector
npm install
npm i maplibre-gl idb-keyval
npm i -D vite-plugin-pwa workbox-window @types/node

# 2. Сконфигурировать vite.config.ts с PWA plugin (см. выше)
# 3. Скопировать дизайн-токены из README в src/theme.ts
# 4. Воссоздать экраны по спецификации, используя screens.jsx как референс
# 5. git init && git remote add origin git@github.com:USER/vector.git
# 6. Создать сайт на app.netlify.com → New site from Git → выбрать репо
# 7. Push на main — Netlify автоматически собирает и публикует
```

После этого URL Netlify (`https://vector-xxx.netlify.app`) можно открывать на телефоне и устанавливать как приложение. Каждый push на main → новый деплой → пользователи получают update-toast.

---

## Что НЕ нужно копировать из дизайн-референса

- `android-frame.jsx`, `tweaks-panel.jsx` — это инструменты прототипа.
- Inline-стили в JSX — в реальном проекте использовать CSS Modules / Tailwind / styled-components в зависимости от выбранного подхода.
- React 18.3.1 через `<script>` теги в Vector.html — заменить на нормальный bundler.
- Симулятор движения (random drift bearing/distance) — заменить на реальные `geolocation.watchPosition` + `deviceorientation`.
