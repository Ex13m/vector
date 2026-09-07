// Докладывает в dist/ файлы, которые нужны САЙТУ, но не приложению:
// лендинг, политику конфиденциальности и промо-материалы.
//
// Зачем отдельный шаг. Всё, что лежит в public/, Vite копирует в dist/, а
// Capacitor копирует dist/ целиком внутрь APK. Промо-видео весило 15 МБ и
// ехало в каждую установку, раздувая приложение с ~4 МБ до 19 МБ — при том,
// что приложению эти файлы не нужны вообще: их читает только сайт.
//
// Поэтому они переехали в web/, а этот скрипт вызывается ТОЛЬКО в сборке
// Netlify (см. netlify.toml). Локальный `npm run build` их не трогает, значит
// `npx cap sync` всегда получает чистый dist.

import { cp, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'web');
const to = resolve(root, 'dist');

try {
  await access(from);
} catch {
  console.error('web/ не найдена — копировать нечего');
  process.exit(1);
}

await cp(from, to, { recursive: true });
console.log('web/ → dist/: лендинг, политика и промо добавлены в сайт');
