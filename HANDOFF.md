# HANDOFF — продолжение работы (актуально на 25.07.2026, v0.5.98)

> Для новой сессии Claude Code: прочитай этот файл + `CLAUDE.md` + `docs/PLAY-LISTING.md`.
> Ветка `main`, всё запушено (HEAD ≈ a7a0c11+). Память Claude: `~/.claude/projects/C--dev-vector/memory/`.

## ГЛАВНОЕ: приложение УЖЕ В GOOGLE PLAY (internal testing)
- Package `cz.konsalting.vektor`, приложение «Vector» создано в Console (Free), релиз **3 (1.0)** активен на внутреннем тестировании, пользователь установил с Play и полево протестировал (на машине, 90+ км/ч — всё работает).
- Тестер: ex333m@gmail.com, ссылка приглашения: https://play.google.com/apps/internaltest/4701522240783756478
- Собран и НЕ залит: `Downloads/vector-vc4-release.aab` (v0.5.98, versionCode 4 — фиксы i18n-хвостов). Залить обновлением в Internal testing.

## Что осталось до Production (порядок)
1. **Листинг** (Console → Развитие → Основная страница): иконка `Downloads/vector-play-icon-512.png`, графика `Downloads/vector-play-feature-1024x500.png`, скрины — `Downloads/my-screens-en/` (23 шт, реальные полевые, EN; лучшие: TARGET SET / straight! / ETA / Arrived / Saved / сплэш) или `output/img/screens/` (симуляторные, Прага). Тексты: `docs/PLAY-LISTING.md` §1.
2. **Контент приложения**: Privacy URL `https://boisterous-heliotrope-499640.netlify.app/privacy.html` (живая) · Data Safety §2 · Content rating · аудитория 18+ · Ads No.
3. **Декларация foreground/background location + ВИДЕО**: текст §3; видео пользователь пишет XRecorder'ом (звук=микрофон!) или второй камерой: уведомление → VOICE → экран выкл → фраза на чёрном → Finish. → YouTube Unlisted → ссылка в форму.
4. **Production**: Create release → bundle из библиотеки (vc4) → ревью 1–7 дней.

## v1.1 сразу после отправки MVP (решения пользователя зафиксированы)
- **Paywall «полная версия»** (НЕ донат): 5 бесплатных поездок → экран «Unlock full version $4.99» (Google Play Billing, one-time product) → «Позже» = +2 поездки. Покупка навсегда, restore при переустановке.
- **Промо-ролик** (Higgsfield, ~72 кредита осталось — экономить): 2–3 клипа image-to-video из `output/img/bike-*.png` + скрины + титры; 9:16 + 16:9. Делать К ВЫХОДУ из ревью (к старту рекламы).
- **Реклама**: FB-группы (Bikepacking, MTB Community, Electric Bike Enthusiasts, eBike Smile eMTB, Cycle Touring Companions + чешские), Reddit (r/bikepacking r/MTB r/ebikes), Shorts/Reels/TikTok, Pinkbike/MTBR, позже Product Hunt. Промо-PDF: `output/Vector-promo.pdf`.

## Отложено сознательно (НЕ делать без запроса)
- **«Затык в логике»** — пользователь что-то заметил в поле, детали НЕ рассказал, просил после публикации. СПРОСИТЬ.
- R8-минификация (только с полевым тестом) · GPS distanceFilter (трогает вход стейт-машины) · рефакторинг RideScreen · снятие диагностики (diag.ts) перед широким релизом.

## Сборка подписанного AAB локально
Нужны: JDK 21 (Temurin), Android SDK (`%LOCALAPPDATA%\Android\Sdk`, cmdline-tools + platforms;android-36 + build-tools;36.0.0), `android/keystore.properties` (по `.example`; ключ в `vektor-keys`, пароль в README-credentials там же).
```powershell
npm run build ; npx cap sync android --inline
cd android ; .\gradlew.bat bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```
⚠️ Каждая заливка в Play = НОВЫЙ versionCode (android/app/build.gradle), «сожжённые» коды не переиспользуются.
CI (GitHub Actions) на каждый push собирает ТЕСТОВЫЙ APK (debug-подпись) — для прямой установки.

## ВНЕ git (перенести на новый комп отдельно!)
1. **`C:\Users\User\vektor-keys\`** — release-ключ + пароли. КРИТИЧНО, невосстановимо. 2–3 копии.
2. `android/keystore.properties` — пересоздать по `.example` (или скопировать; в .gitignore).
3. Память Claude: `C:\Users\User\.claude\projects\C--dev-vector\memory\` — решения/предпочтения (если не переносится — этот файл покрывает суть).
4. Android SDK — поставить заново или собирать через CI.

## Правила работы (кратко; полные — CLAUDE.md)
Русский в общении; код/коммиты EN; CHANGELOG в том же коммите; версию бампать; **алгоритмы езды/голоса не трогать**; предлагать → ждать «да»; секреты никогда в репо; вопросы обычным текстом.

## Пороги (не менять)
Прибытие <30 м · SHORT_STOP 5 с · LONG_STOP 3 мин · возобновление 50 м + >8 км/ч ×3 · интервал голоса 60 с · поворот 65°.
