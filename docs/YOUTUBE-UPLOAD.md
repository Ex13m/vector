# YouTube — канал и заливка видео для Google Play

## Канал (оформлен 31.08.2026)

| | |
|---|---|
| Название | **Vector Beacon** (просто «Vector» YouTube отклонил как неподходящее) |
| Псевдоним | **@VectorBeacon** · https://www.youtube.com/@VectorBeacon |
| ID | `UCTYUWOgaq_49G5OU3pmCbRg` |
| Аккаунт | konsaltingprofi@gmail.com |
| Аватар | `docs/assets/vector-yt-avatar-800.png` — иконка приложения из `public/icon.svg`, 800×800 |
| Баннер | `docs/assets/vector-yt-banner.jpg` — ночной кадр из 4K-мастера (t=23.2 с) + вордмарк, 2048×1152. Текст держится в безопасной зоне 1235×338, иначе обрезается на ТВ и в мобильном приложении |
| Логотип-водяной знак | `docs/assets/vector-yt-logo-150.png`, 150×150, показ на протяжении всего видео |
| Ссылка в профиле | лендинг · **контакт:** konsaltingprofi@gmail.com |

Ассеты пересобираются скриптами: аватар и логотип — `sharp` из `public/icon.svg`;
баннер — кадр из `output/video/vector-promo/final/vector-promo-4k60.mp4` плюс PIL-композиция.

**Верификация канала обязательна.** Пока номер телефона не подтверждён (youtube.com/verify),
YouTube не даёт ни своих обложек («Подтвердите личность, чтобы добавлять свои значки видео»),
ни кликабельных внешних ссылок в описании. Подтверждено 31.08.2026.

## Залитые ролики

| Ролик | Ссылка | Видимость | Состояние |
|---|---|---|---|
| Промо | https://www.youtube.com/watch?v=G6kVGg6NKQ0 | публично | опубликован; привязан к витрине Play (EN + RU) |
| Демо для ревьюеров | — | доступ по ссылке | не залит |

Обложка промо — `docs/assets/vector-yt-thumb.jpg`: кадр с гребня (t=15 с) плюс хук
«SCREEN OFF. / VOICE ON.» и цитата озвучки. Правило: 2–3 слова крупно, текст слева,
райдер справа — читается в ленте на телефоне.

**Грабли:** расширение **vidIQ** в Chrome само подставляет свой AI-текст прямо в поле описания
и добавляет теги. Перед заполнением метаданных его лучше отключить, иначе описание придётся
переписывать (так и вышло на первом заходе).



Два ролика с разным назначением и разной видимостью. Аккаунт — **konsaltingprofi@gmail.com**
(см. память проекта: всё публичное только на нём).

| | Промо | Демо для ревьюеров |
|---|---|---|
| Файл | `output/video/vector-promo/final/vector-promo-store-1080p.mp4` | запись экрана владельца от 31.08.2026 |
| Видимость | **Публично** (unlisted в карточке магазина не отрендерится) | **Доступ по ссылке** (unlisted) |
| Куда идёт | поле «Видео» в витрине Play | форма Sensitive permissions (обоснование foreground-location) |
| Требования Play | без рекламы, без возрастных ограничений, 16:9, ссылка вида `watch?v=` (не Shorts) | смотрят только ревьюеры, красота не нужна |

---

## Что делает Claude и что делает владелец

Claude ведёт браузер: открывает Studio, выбирает файл, заполняет название, описание, теги,
язык, видимость. **Владелец делает сам** (Claude не вправе):

1. **Создание канала** — принятие Условий использования YouTube.
2. **Декларация «Видео не для детей»** — юридическое заявление (COPPA).
3. **Финальная кнопка «Опубликовать»** — публикация контента от имени владельца.

---

## Метаданные — промо (публично)

**Название** (≤100 символов):
```
Vector — the voice compass for cyclists
```

**Описание:**
```
Vector is not a turn-by-turn navigator. It's a beacon.

Pick a target on the map, put the phone in your pocket and ride. Vector speaks the direction
clock-style — "target at 3 o'clock, 8 kilometres" — so YOU choose the route: side streets,
parks, gravel. The app just keeps you pointed the right way.

Works with the screen off. Offline maps. Ride log with GPX export.
No accounts, no ads, no tracking.

Or turn it around: drop the target on the spot you started from — the car, the camp, the hut —
and just wander. Vector keeps telling you how far you have drifted and which way leads back.

Android · free · English / Русский / Deutsch
Site: https://boisterous-heliotrope-499640.netlify.app/landing.html
```

**Теги:** `cycling, bike navigation, bikepacking, MTB, gravel, voice navigation, offline maps,
compass, Android app, cycling app`

**Язык:** английский · **Аудитория:** не для детей · **Видимость:** публично

---

## Метаданные — демо для ревьюеров (по ссылке)

**Название:**
```
Vector — foreground location demo (Google Play review)
```

**Описание:**
```
Demonstration for the Google Play review team of app cz.konsalting.vektor.

Shows the core use case: the rider picks a target, starts the ride, and puts the phone away.
The foreground service notification stays visible while location tracking continues and the
voice announces the target's clock-face bearing with the screen off. Ending the ride stops
the service and removes the notification.

Location access is used only during an active ride, with a persistent notification.
```

**Видимость:** доступ по ссылке · **Аудитория:** не для детей

---

## После заливки

1. Ссылку на **промо** передать Claude → он вставит её в витрину через Play API
   (`edits().listings()`, поле `video`).
2. Ссылку на **демо** вставить в Console → App content → Sensitive permissions
   (текст обоснования — `docs/PLAY-LISTING.md` §3).
3. Проверить в карточке магазина: обложкой видео служит feature graphic, он уже загружен.
