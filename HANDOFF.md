# HANDOFF — продолжение работы на новом компьютере

> Для новой сессии Claude Code: прочитай этот файл + `CLAUDE.md` + `docs/PLAY-LISTING.md`.
> Состояние на 07.07.2026, v0.5.94, ветка `main` (всё запушено).

## Где мы
Полевые баги закрыты, приложение стабильно. **Цель недели — публикация в Google Play.**
Полный аудит проекта (техдолг/безопасность/батарея) сделан 07.07.2026 → отчёт
`Vector-audit-v0.5.93.pdf` (в Загрузках старого ПК); обязательные security-фиксы уже влиты (v0.5.94).

## Что уже готово к публикации
- ✅ Верификация разработчика: EXPROMT SERVIS s.r.o., package `cz.konsalting.vektor`, SHA-256 ключа подтверждён.
- ✅ Release keystore: `vektor-release.jks` (НЕ в репо!) + креды — папка `vektor-keys` (скопировать на новый ПК вручную).
- ✅ Gradle release-подпись: `android/app/build.gradle` читает `android/keystore.properties` (gitignored; шаблон — `keystore.properties.example`).
- ✅ Privacy Policy: `public/privacy.html` — деплоится с PWA на Netlify → URL `https://<домен>/privacy.html`.
- ✅ Тексты листинга + Data Safety + декларация фоновой геолокации: `docs/PLAY-LISTING.md`.
- ✅ Аудит-фиксы v0.5.94: allowBackup=false · User-Agent для Nominatim · @capacitor/cli → devDeps (prod npm audit чист).

## Сборка подписанного AAB (локально)
```powershell
# новый ПК: git clone https://github.com/Ex13m/vector.git && npm install
# скопировать vektor-keys → создать android/keystore.properties по образцу .example
npm run build
npx cap sync android
cd android
./gradlew bundleRelease   # → android/app/build/outputs/bundle/release/app-release.aab
```
APK для прямой установки собирает CI (GitHub Actions) на каждый push в main (~4 мин).

## Что осталось (порядок — в docs/PLAY-LISTING.md §4)
1. Собрать AAB → Play Console → Internal testing → проверить на телефоне.
2. Скриншоты (5–8) + feature graphic 1024×500.
3. Заполнить Store listing / Data Safety / Content rating (готовые тексты в PLAY-LISTING.md).
4. Декларация фоновой геолокации + видео-демо 30–60 с (сценарий там же) — главный риск ревью.
5. Production → ревью.

## Осознанно отложено (НЕ делать без запроса Игоря)
- Минификация R8 (аудит-фикс №4) — только с полевым тестом release-сборки.
- GPS distanceFilter (фикс №5) — влияет на вход стейт-машины; после релиза, осторожно.
- Рефакторинг RideScreen (2 675 строк) + единый GPS-провайдер; убрать diag.ts перед Production-релизом ПОСЛЕ стабилизации.
- Paywall — v1.1. Запуск бесплатный.

## Правила работы (кратко; полные — CLAUDE.md)
- Общение по-русски; код/коммиты по-английски; CHANGELOG в том же коммите; версию бампать каждый релиз.
- **Алгоритмы езды/голоса не трогать** без явного запроса. Предлагать → ждать «да» → делать ровно это.
- Секреты (jks, пароли) никогда не коммитить. CI release-подпись через GitHub Secrets НЕ настраивать без явного разрешения.
- Вопросы — обычным текстом, не попапом.

## Известные пороги (не менять)
Прибытие <30 м · SHORT_STOP 5 с · LONG_STOP 3 мин · возобновление 50 м + >8 км/ч × 3 фикса · голос-интервал 60 с (дефолт) · угол поворота 65°.
