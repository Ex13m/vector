# Google Play — листинг, Data Safety, декларация фоновой геолокации

Черновики для Play Console. Package: `cz.konsalting.vektor` · Разработчик: EXPROMT SERVIS s.r.o. (верифицирован, SHA-256 release-ключа подтверждён).

---

## 1. Листинг (Store listing)

**App name (30):**
- EN: `Vector — cycling beacon`
- RU: `Vector — вело-маяк`

**Short description (80):**
- EN: `Voice compass for cyclists: “target at 3 o'clock, 8 km”. Screen-off friendly.`
- RU: `Голосовой компас для велосипедиста: «цель на 3 часа, 8 км». Экран не нужен.`

**Full description (EN):**
```
Vector is not a turn-by-turn navigator. It's a beacon.

Pick a target on the map, put the phone in your pocket and ride. Vector
speaks the direction clock-style — “target at 3 o'clock, 8 kilometres” —
so YOU choose the route: side streets, parks, gravel. The app just keeps
you pointed the right way.

• Works with the SCREEN OFF — voice guidance continues in your pocket
• Clock-face directions + distance + ETA, at your chosen interval
• Announces when you turn away from the target
• Aiming mode: rotate the phone, hear “target ahead”, and go
• Offline maps: cache the area along the route in advance
• Ride log with track, distance, time; GPX export to Strava & friends
• Continue a trip, ride back to the start, chain new targets
• Russian, English, German voice and interface
• No accounts, no ads, no tracking — your data stays on your device

Background location is used only during an active ride to keep the voice
guidance running while the screen is off (a visible notification is shown).

Made for cyclists who want to explore, not follow arrows.
```

**Full description (RU):**
```
Vector — это не пошаговый навигатор. Это маяк.

Выбери цель на карте, убери телефон в карман и крути педали. Vector
говорит направление «по часам» — «цель на 3 часа, 8 километров» — а
маршрут выбираешь ТЫ: дворы, парки, грунтовки. Приложение просто держит
тебя на курсе.

• Работает с ВЫКЛЮЧЕННЫМ экраном — голос ведёт из кармана
• Направление по циферблату + дистанция + время в пути, интервал настраивается
• Подсказка, если отвернул от цели
• Режим наведения: крути телефон — «цель впереди» — и поехали
• Офлайн-карты: закэшируй область маршрута заранее
• Журнал поездок с треком, дистанцией, временем; экспорт GPX (Strava и др.)
• Продолжение поездки, возврат к старту, цепочки целей
• Русский, английский, немецкий — голос и интерфейс
• Без аккаунтов, рекламы и слежки — данные остаются на устройстве

Фоновая геолокация используется только во время активной поездки, чтобы
голос не прерывался при выключенном экране (показывается уведомление).

Для тех, кто хочет исследовать, а не ехать по стрелкам.
```

**Категория:** Maps & Navigation · **Теги:** cycling, navigation, GPS
**Контакт:** ex333m@gmail.com
**Privacy Policy URL:** `https://boisterous-heliotrope-499640.netlify.app/privacy.html` (проверено: страница живая, деплоится с каждым push в main)

**Графика (готовит Игорь):**
- Иконка 512×512 PNG (есть icon-512.png — проверить, что без прозрачных полей требований)
- Feature graphic 1024×500
- Скриншоты телефона: минимум 2, лучше 5–8 (Pick с целью · наведение · RIDING с HUD · экран прибытия · журнал поездок · настройки)

---

## 2. Data Safety (форма в Console)

| Вопрос | Ответ |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Location | НЕ собирается в смысле формы: обрабатывается на устройстве, не передаётся разработчику и третьим лицам, не хранится вне устройства |
| Data encrypted in transit? | n/a (данные не передаются) |
| Data deletion mechanism | Удаление приложения / удаление поездок внутри приложения |

Примечание для ревью (если спросят): карта и поиск адресов делают стандартные HTTP-запросы к OSM-сервисам (тайлы, Nominatim) — как браузер; разработчик данных не получает. Это раскрыто в Privacy Policy.

---

## 3. Декларация фоновой геолокации (Sensitive permissions form)

**Разрешения:** ACCESS_FINE_LOCATION + FOREGROUND_SERVICE_LOCATION (фоновый доступ через foreground-сервис с уведомлением).

**Core functionality (выбрать):** Navigation / directions.

**Текст обоснования (EN, ~500 зн.):**
```
Vector is a voice-guided cycling navigator. Its core feature is guiding
the rider by VOICE while the phone is in a pocket with the screen off —
looking at a screen while cycling is unsafe. A foreground service with a
persistent notification receives GPS updates during an active ride only,
computes bearing/distance to the user-selected target and speaks them.
Location is processed on-device only, never stored on servers or shared.
Guidance stops when the user finishes the ride.
```

**Видео-демо (записывает Игорь, ~30–60 сек, ссылка YouTube unlisted):**
1. Открыть приложение → выбрать цель → старт поездки.
2. Показать уведомление foreground-сервиса.
3. ВЫКЛЮЧИТЬ экран → идти/ехать → слышна голосовая навигация при тёмном экране.
4. Включить экран → нажать «Завершить» → уведомление исчезло.

---

## 4. Порядок публикации

1. Собрать подписанный AAB (см. HANDOFF.md §Сборка) — `app-release.aab`.
2. Play Console → Create app (`Vector`, App/Free) → пройти Declarations.
3. **Internal testing** → загрузить AAB → добавить свой e-mail в тестеры → установить с Play, прогнать поездку.
4. Заполнить: Store listing (тексты выше) + графика · Data Safety (§2) · Content rating (анкета: утилита, Everyone) · Target audience 18+ (проще всего) · Ads: No.
5. App content → Sensitive permissions → декларация фоновой геолокации (§3) + ссылка на видео.
6. Production → Create release → тот же AAB → отправить на ревью (1–7 дней; фоновая геолокация может добавить итерацию).
