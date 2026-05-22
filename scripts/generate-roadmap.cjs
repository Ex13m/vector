/**
 * Generate Vector-Roadmap.docx — полная дорожная карта проекта.
 * Run: node scripts/generate-roadmap.cjs
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  ExternalHyperlink, TabStopType, TabStopPosition,
} = require('docx');

// ── Palette ──
const BRAND_GREEN = '00C853';
const BRAND_DARK = '0A0C0B';
const ACCENT_ORANGE = 'FF6D00';
const GRAY_600 = '757575';
const GRAY_200 = 'EEEEEE';
const GRAY_100 = 'F5F5F5';
const WHITE = 'FFFFFF';
const TABLE_HEADER_BG = '1B5E20';

// ── Borders ──
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Helpers ──
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: TABLE_HEADER_BG, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: 'center',
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: WHITE, font: 'Arial', size: 20 })],
    })],
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: opts.bold || false,
        color: opts.color || BRAND_DARK,
        font: 'Arial',
        size: opts.size || 20,
      })],
      alignment: opts.align || AlignmentType.LEFT,
    })],
  });
}

function heading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    children: [new TextRun({ text, font: 'Arial' })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.afterSpacing || 120 },
    children: [new TextRun({
      text,
      font: 'Arial',
      size: opts.size || 22,
      bold: opts.bold || false,
      color: opts.color || '333333',
      italics: opts.italics || false,
    })],
  });
}

function bulletItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: '333333' })],
  });
}

function richBullet(runs, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: runs,
  });
}

function bold(text) {
  return new TextRun({ text, font: 'Arial', size: 22, bold: true, color: '333333' });
}

function normal(text) {
  return new TextRun({ text, font: 'Arial', size: 22, color: '333333' });
}

// ── Numbering configs ──
const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'bullets2',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'antiBullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '–',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'sprintNums',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'steps',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
  ],
};

// ── Styles ──
const styles = {
  default: { document: { run: { font: 'Arial', size: 22 } } },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: 'Arial', color: BRAND_DARK },
      paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 26, bold: true, font: 'Arial', color: '1B5E20' },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: 'Arial', color: '333333' },
      paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
    },
  ],
};

// ══════════════════════════════════════════════════════════
// CONTENT
// ══════════════════════════════════════════════════════════

const PAGE_W = 12240;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9360

const children = [];

// ── Title ──
children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0 },
  children: [new TextRun({ text: 'VECTOR', font: 'Arial', size: 52, bold: true, color: BRAND_DARK })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 80 },
  children: [new TextRun({
    text: '— Дорожная карта развития —',
    font: 'Arial', size: 28, color: GRAY_600,
  })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({
    text: 'Голосовой вело-маяк: навигация по часовому циферблату',
    font: 'Arial', size: 22, italics: true, color: GRAY_600,
  })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 400 },
  children: [new TextRun({
    text: 'Версия: 0.5.45  |  Май 2026',
    font: 'Arial', size: 22, bold: true, color: ACCENT_ORANGE,
  })],
}));

// ══════════════════════════════════════════════════════════
// SECTION 1: VISION
// ══════════════════════════════════════════════════════════
children.push(heading('Видение и позиционирование', HeadingLevel.HEADING_1));

children.push(heading('Что такое Vector?', HeadingLevel.HEADING_2));
children.push(para('Vector — это PWA + Android-приложение для велосипедистов, которое работает как голосовой маяк. Вместо пошаговых инструкций («через 200 м поверните налево») оно показывает направление на цель в формате часового циферблата: «цель на 3 часа», «цель на 10 часов».'));

children.push(heading('Ключевое отличие', HeadingLevel.HEADING_3));
children.push(para('Навигация по маяку (beacon), а не по маршруту (route). Велосипедист всегда знает где цель и сколько до неё, но сам решает как ехать. Телефон в кармане, экран выключен, голос ведёт.'));

children.push(heading('Анти-фичи (чего мы не делаем)', HeadingLevel.HEADING_3));
children.push(bulletItem('Нет turn-by-turn: мы не строим маршрут и не диктуем повороты', 'antiBullets'));
children.push(bulletItem('Нет социальной ленты: никаких лайков, комментариев, лидербордов', 'antiBullets'));
children.push(bulletItem('Нет подписки: одноразовая оплата или бесплатно', 'antiBullets'));
children.push(bulletItem('Нет рекламы: никогда', 'antiBullets'));
children.push(bulletItem('Нет внешних датчиков: только телефон', 'antiBullets'));

// ── Market analysis ──
children.push(heading('Анализ рынка', HeadingLevel.HEADING_2));
children.push(para('Ниша голосовой навигации по часовому циферблату полностью пуста. Единственный конкурент в концепции маяка — Beeline ($99 физическое устройство + $5/мес). Конкуренты в маркетах (Komoot, Ride with GPS, OsmAnd) — все работают по модели turn-by-turn. Vector занимает собственную нишу: eyes-free, hands-free вело-навигация.'));

// Comparison table
const compColWidths = [2000, 3680, 3680];
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: compColWidths,
  rows: [
    new TableRow({ children: [headerCell('', compColWidths[0]), headerCell('Beeline', compColWidths[1]), headerCell('Vector', compColWidths[2])] }),
    new TableRow({ children: [cell('Тип', compColWidths[0], { bold: true }), cell('Физическое устройство', compColWidths[1]), cell('PWA + Android APK (Capacitor)', compColWidths[2])] }),
    new TableRow({ children: [cell('Цена', compColWidths[0], { bold: true }), cell('$99 + $5/мес', compColWidths[1]), cell('Бесплатно / $2.99 PRO', compColWidths[2])] }),
    new TableRow({ children: [cell('Индикация', compColWidths[0], { bold: true }), cell('LED-компас на руле', compColWidths[1]), cell('Голос + экран + вибрация', compColWidths[2])] }),
    new TableRow({ children: [cell('Фоновая работа', compColWidths[0], { bold: true }), cell('Только через Bluetooth', compColWidths[1]), cell('Foreground service (Android)', compColWidths[2])] }),
    new TableRow({ children: [cell('Голос', compColWidths[0], { bold: true }), cell('Нет', compColWidths[1]), cell('Часовой циферблат + дистанция + ETA', compColWidths[2])] }),
  ],
}));

children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

// ══════════════════════════════════════════════════════════
// SECTION 2: CURRENT STATE
// ══════════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading('Текущее состояние (v0.5.45)', HeadingLevel.HEADING_1));

children.push(heading('Работающие функции', HeadingLevel.HEADING_2));
children.push(bulletItem('Выбор цели на карте или поиском (Nominatim)', 'bullets'));
children.push(bulletItem('Кэширование тайлов для оффлайн-работы', 'bullets'));
children.push(bulletItem('4-фазный цикл поездки: PRE_RIDE → RIDING → SHORT_STOP → LONG_STOP', 'bullets'));
children.push(bulletItem('Голосовые объявления: часовое направление, дистанция, ETA, прибытие', 'bullets'));
children.push(bulletItem('Чим: звуковой сигнал при совпадении курса с вектором на цель (±5°)', 'bullets'));
children.push(bulletItem('Continuation rides: мульти-сегментные поездки с маркерами waypoints', 'bullets'));
children.push(bulletItem('Ride session persistence: восстановление поездки после крэша/килла процесса', 'bullets'));
children.push(bulletItem('Настройки: язык (ru/en/de), голос, единицы, вибрация, интервалы', 'bullets'));
children.push(bulletItem('PWA: установка на домашний экран, Service Worker, оффлайн-шелл', 'bullets'));
children.push(bulletItem('Android APK через Capacitor с foreground service (фоновый GPS + голос)', 'bullets'));
children.push(bulletItem('CI/CD: GitHub Actions — автосборка debug + release APK на каждый push', 'bullets'));

children.push(heading('Технологический стек', HeadingLevel.HEADING_2));
children.push(bulletItem('React 18 + TypeScript + Vite 5', 'bullets2'));
children.push(bulletItem('Capacitor v8.3.4 (Android APK с нативными API)', 'bullets2'));
children.push(bulletItem('@capawesome-team/capacitor-android-foreground-service (фоновая работа)', 'bullets2'));
children.push(bulletItem('MapLibre GL JS (открытый vector tiles)', 'bullets2'));
children.push(bulletItem('Web Speech API (голос)', 'bullets2'));
children.push(bulletItem('DeviceOrientation API (компас) + GPS-bearing (в движении)', 'bullets2'));
children.push(bulletItem('Workbox / vite-plugin-pwa (Service Worker)', 'bullets2'));
children.push(bulletItem('idb-keyval (кэш тайлов, настройки, сессии)', 'bullets2'));
children.push(bulletItem('Хостинг: Netlify (PWA) + GitHub Actions (APK CI/CD)', 'bullets2'));

children.push(heading('Архитектура разработки', HeadingLevel.HEADING_2));
children.push(para('Разработка ведётся через PWA (Vite HMR, горячая перезагрузка в браузере). Когда всё работает — Capacitor sync + Gradle build собирает APK для дистрибуции. Web-ассеты включаются внутрь APK (bundled mode), сервер не нужен.'));

children.push(heading('Известные проблемы (тестирование APK)', HeadingLevel.HEADING_2));
children.push(richBullet([bold('Голос в WebView. '), normal('РЕШЕНО (v0.5.45): Web Speech API не работает в Android WebView (баг Chromium #487255) → нативный TTS через @capacitor-community/text-to-speech.')], 'bullets'));
children.push(richBullet([bold('GPS с выключенным экраном. '), normal('РЕШЕНО (v0.5.45): watchPosition троттлится через ~5 минут → нативный @capgo/background-geolocation + useLegacyBridge.')], 'bullets'));
children.push(richBullet([bold('Обновление APK без удаления. '), normal('ОЖИДАЕТ: debug APK подписывается случайным ключом на каждой сборке CI → Android не даёт обновить поверх, требует удаления (теряются данные). Нужен фиксированный debug keystore в репозитории.')], 'bullets'));

// ══════════════════════════════════════════════════════════
// SECTION 3: ROADMAP
// ══════════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading('Дорожная карта развития', HeadingLevel.HEADING_1));

// v1.0
children.push(heading('v1.0 — Стабильный релиз + Google Play', HeadingLevel.HEADING_2));
children.push(para('Цель: довести качество до продакшн-уровня и опубликовать в Google Play через Capacitor.', { italics: true, color: GRAY_600 }));
children.push(richBullet([bold('Полевые испытания. '), normal('Тесты на реальных поездках (Android APK + iOS PWA). Проверка foreground service с выключенным экраном.')], 'bullets'));
children.push(richBullet([bold('Багфиксы. '), normal('Устранение всех найденных проблем: GPS, компас, голос, энергопотребление.')], 'bullets'));
children.push(richBullet([bold('i18n. '), normal('Полный перевод UI на английский (обязательно для Google Play). Сейчас UI на русском, голос на ru/en/de.')], 'bullets'));
children.push(richBullet([bold('Privacy Policy. '), normal('Документ конфиденциальности (требуется для Google Play). Vector не собирает данные.')], 'bullets'));
children.push(richBullet([bold('Листинг Google Play. '), normal('Скриншоты, описание, иконка 512×512, feature graphic 1024×500. Аккаунт разработчика ($25).')], 'bullets'));

// v1.1
children.push(heading('v1.1 — Quick Targets + PRO', HeadingLevel.HEADING_2));
children.push(para('Цель: монетизация + удобство повторных поездок.', { italics: true, color: GRAY_600 }));
children.push(richBullet([bold('Избранные цели (Quick Targets). '), normal('Сохранение частых точек (дом, работа). Бесплатно: 3, PRO: без лимита.')], 'bullets'));
children.push(richBullet([bold('GPX-экспорт (PRO). '), normal('Запись GPS-трека и скачивание в .gpx для Strava/Komoot.')], 'bullets'));
children.push(richBullet([bold('PRO-разблокировка ($2.99). '), normal('Одноразовая покупка через Google Play Billing API.')], 'bullets'));
children.push(richBullet([bold('Все слои карт + выбор голоса (PRO).')], 'bullets'));

// v1.2
children.push(heading('v1.2 — 3D Audio (эксперимент)', HeadingLevel.HEADING_2));
children.push(para('Цель: пространственный звук для интуитивного направления.', { italics: true, color: GRAY_600 }));
children.push(richBullet([bold('Web Audio + HRTF. '), normal('PannerNode с HRTF-моделью. Цель «звучит» слева/справа/сзади в наушниках.')], 'bullets'));
children.push(para('Экспериментальная PRO-фича, требует наушники.'));

// v1.3
children.push(heading('v1.3 — Мульти-маршрут (Waypoints)', HeadingLevel.HEADING_2));
children.push(para('Цель: цепочка точек для сложных маршрутов.', { italics: true, color: GRAY_600 }));
children.push(richBullet([bold('Цепочка точек. '), normal('Массив waypoints с авто-переключением при приближении (<50 м).')], 'bullets'));
children.push(richBullet([bold('Редактор точек. '), normal('Добавление/удаление/перетаскивание waypoints на карте.')], 'bullets'));
children.push(richBullet([bold('Сохранение маршрутов в IndexedDB.')], 'bullets'));

// v1.4
children.push(heading('v1.4 — Статистика поездок', HeadingLevel.HEADING_2));
children.push(richBullet([bold('История поездок. '), normal('Список с датой, дистанцией, временем, скоростью.')], 'bullets'));
children.push(richBullet([bold('Мини-карта трека + недельная/месячная сводка.')], 'bullets'));

// v2.0
children.push(heading('v2.0 — Live Share', HeadingLevel.HEADING_2));
children.push(para('Цель: отправка позиции другу в реальном времени.', { italics: true, color: GRAY_600 }));
children.push(richBullet([bold('Ссылка на позицию. '), normal('Короткая ссылка → друг видит вас на карте (WebSocket relay).')], 'bullets'));
children.push(richBullet([bold('Друг как цель. '), normal('Навигация на движущуюся цель (другого велосипедиста).')], 'bullets'));
children.push(richBullet([bold('Приватность. '), normal('Ссылка истекает через N часов, нет аккаунтов, нет истории.')], 'bullets'));

// ── Summary table ──
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading('Сводная таблица', HeadingLevel.HEADING_2));
const sumColWidths = [1200, 3200, 2560, 2400];
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: sumColWidths,
  rows: [
    new TableRow({ children: [headerCell('Версия', sumColWidths[0]), headerCell('Ключевые фичи', sumColWidths[1]), headerCell('Монетизация', sumColWidths[2]), headerCell('Платформа', sumColWidths[3])] }),
    new TableRow({ children: [cell('v1.0', sumColWidths[0], { bold: true }), cell('Стабильность, i18n, листинг', sumColWidths[1]), cell('Бесплатно', sumColWidths[2]), cell('PWA + Google Play', sumColWidths[3])] }),
    new TableRow({ children: [cell('v1.1', sumColWidths[0], { bold: true }), cell('Quick Targets, GPX, PRO', sumColWidths[1]), cell('$2.99 one-time', sumColWidths[2]), cell('PWA + Google Play', sumColWidths[3])] }),
    new TableRow({ children: [cell('v1.2', sumColWidths[0], { bold: true }), cell('3D Audio (HRTF)', sumColWidths[1]), cell('PRO-фича', sumColWidths[2]), cell('PWA + Google Play', sumColWidths[3])] }),
    new TableRow({ children: [cell('v1.3', sumColWidths[0], { bold: true }), cell('Multi-waypoints', sumColWidths[1]), cell('PRO-фича', sumColWidths[2]), cell('PWA + Google Play', sumColWidths[3])] }),
    new TableRow({ children: [cell('v1.4', sumColWidths[0], { bold: true }), cell('Статистика поездок', sumColWidths[1]), cell('PRO-фича', sumColWidths[2]), cell('+ App Store (Capacitor)', sumColWidths[3])] }),
    new TableRow({ children: [cell('v2.0', sumColWidths[0], { bold: true }), cell('Live Share', sumColWidths[1]), cell('PRO-фича', sumColWidths[2]), cell('Все платформы', sumColWidths[3])] }),
  ],
}));

// ══════════════════════════════════════════════════════════
// SECTION 4: MONETIZATION
// ══════════════════════════════════════════════════════════
children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
children.push(heading('Монетизация: Honest Freemium', HeadingLevel.HEADING_1));

children.push(heading('Принципы', HeadingLevel.HEADING_2));
children.push(bulletItem('Основная навигация бесплатна навсегда', 'bullets'));
children.push(bulletItem('PRO = $2.99 одноразово, не подписка', 'bullets'));
children.push(bulletItem('Никакой рекламы, никакого сбора данных', 'bullets'));

// Free vs PRO table
children.push(heading('Бесплатно vs PRO', HeadingLevel.HEADING_2));
const freeProWidths = [4000, 2680, 2680];
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: freeProWidths,
  rows: [
    new TableRow({ children: [headerCell('Функция', freeProWidths[0]), headerCell('Бесплатно', freeProWidths[1]), headerCell('PRO ($2.99)', freeProWidths[2])] }),
    new TableRow({ children: [cell('Навигация по маяку', freeProWidths[0]), cell('✓', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Голосовые объявления', freeProWidths[0]), cell('✓', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Оффлайн-карты', freeProWidths[0]), cell('✓', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Фоновая работа (foreground service)', freeProWidths[0]), cell('✓', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Избранные цели', freeProWidths[0]), cell('3 цели', freeProWidths[1], { align: AlignmentType.CENTER }), cell('Без лимита', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('GPX-экспорт', freeProWidths[0]), cell('—', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Все слои карт', freeProWidths[0]), cell('—', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('Выбор голоса', freeProWidths[0]), cell('—', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('3D Audio / Multi-waypoints / Статистика', freeProWidths[0]), cell('—', freeProWidths[1], { align: AlignmentType.CENTER }), cell('✓', freeProWidths[2], { align: AlignmentType.CENTER })] }),
  ],
}));

// ══════════════════════════════════════════════════════════
// SECTION 5: PUBLICATION
// ══════════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading('Подготовка к публикации', HeadingLevel.HEADING_1));

children.push(heading('Этап 1: PWA (уже работает)', HeadingLevel.HEADING_2));
children.push(para('Vector доступен как PWA на Netlify. Пользователь открывает URL, нажимает «Добавить на домашний экран». Бесплатно, мгновенные обновления.'));

children.push(heading('Этап 2: Google Play через Capacitor (в процессе)', HeadingLevel.HEADING_2));
children.push(para('Capacitor v8.3.4 оборачивает веб-приложение в нативный Android-контейнер с доступом к нативным API. Ключевое преимущество перед TWA: foreground service гарантирует работу GPS + голоса с выключенным экраном.'));

children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [normal('Зарегистрировать Google Play Developer Account ($25)')],
}));
children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [normal('Подготовить материалы листинга: иконка 512×512, feature graphic, 4+ скриншота, описание EN/RU')],
}));
children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [normal('Написать Privacy Policy')],
}));
children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [normal('Подписать release APK ключом разработчика')],
}));
children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [normal('Загрузить AAB в Google Play Console → Internal Testing → Production')],
}));
children.push(new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 120 },
  children: [normal('Пройти ревью Google (1—3 дня)')],
}));

children.push(heading('Этап 3: App Store через Capacitor (позже)', HeadingLevel.HEADING_2));
children.push(para('Для iOS — Capacitor оборачивает в WKWebView. Apple Developer Program: $99/год, требуется macOS + Xcode. Отложено до v1.4+.'));

// ══════════════════════════════════════════════════════════
// SECTION 6: TECH DEBT
// ══════════════════════════════════════════════════════════
children.push(heading('Технический долг и улучшения', HeadingLevel.HEADING_1));

children.push(heading('Рефакторинг', HeadingLevel.HEADING_2));
children.push(richBullet([bold('RideScreen.tsx (2 456 строк). '), normal('Разбить на модули: ArrivedOverlay, Toolbar, HUD → отдельные файлы. GPS/compass → custom hooks.')], 'bullets'));
children.push(richBullet([bold('Единый GPS provider. '), normal('Сейчас 3 экрана независимо вызывают watchPosition. Нужен единый provider в App.tsx.')], 'bullets'));

children.push(heading('i18n', HeadingLevel.HEADING_2));
children.push(para('Сейчас: голос на ru/en/de, UI на русском (~30 захардкоженных строк) + ~6 на английском (SettingsSheet). Для v1.0 нужен полный перевод UI на EN. В планах: чешский (cs), испанский (es).'));

children.push(heading('Тесты', HeadingLevel.HEADING_2));
children.push(para('Нет юнит-тестов. Нужны хотя бы для geo.ts (расчёты расстояний/bearing), orientation.ts (фильтры), voice.ts (форматирование).'));

children.push(heading('Ошибки', HeadingLevel.HEADING_2));
children.push(para('Нет error boundary и error tracking. Минимум: React ErrorBoundary + Sentry free tier.'));

// ══════════════════════════════════════════════════════════
// SECTION 7: RISKS
// ══════════════════════════════════════════════════════════
children.push(heading('Риски и ограничения', HeadingLevel.HEADING_1));

const riskWidths = [2400, 2400, 4560];
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: riskWidths,
  rows: [
    new TableRow({ children: [headerCell('Риск', riskWidths[0]), headerCell('Влияние', riskWidths[1]), headerCell('Митигация', riskWidths[2])] }),
    new TableRow({ children: [cell('Компас ненадёжен', riskWidths[0]), cell('Наведение не работает', riskWidths[1]), cell('Fallback на GPS-bearing; подсказка калибровки', riskWidths[2])] }),
    new TableRow({ children: [cell('Apple ограничивает PWA', riskWidths[0]), cell('iOS пользователи недоступны', riskWidths[1]), cell('Capacitor-оболочка для App Store', riskWidths[2])] }),
    new TableRow({ children: [cell('TTS-качество на Android', riskWidths[0]), cell('Роботный голос', riskWidths[1]), cell('Рекомендация Google TTS; PRO — выбор голоса', riskWidths[2])] }),
    new TableRow({ children: [cell('Батарея', riskWidths[0]), cell('GPS + компас садят', riskWidths[1]), cell('Снижение поллинга в паузах; отключение компаса в RIDING', riskWidths[2])] }),
    new TableRow({ children: [cell('Foreground service килл', riskWidths[0]), cell('Пропадает GPS в фоне', riskWidths[1]), cell('Ride session persistence; auto-resume при возврате', riskWidths[2])] }),
  ],
}));

// ══════════════════════════════════════════════════════════
// SECTION 8: SPRINT
// ══════════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading('Приоритеты ближайшего спринта', HeadingLevel.HEADING_1));

const sprintWidths = [600, 4760, 2000, 2000];
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: sprintWidths,
  rows: [
    new TableRow({ children: [headerCell('#', sprintWidths[0]), headerCell('Задача', sprintWidths[1]), headerCell('Статус', sprintWidths[2]), headerCell('Приоритет', sprintWidths[3])] }),
    new TableRow({ children: [cell('1', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Capacitor + CI/CD (автосборка APK)', sprintWidths[1]), cell('✅ Готово', sprintWidths[2], { color: '1B5E20', bold: true }), cell('P0', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('2', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Нативный TTS + фоновый GPS (плагины Capacitor)', sprintWidths[1]), cell('✅ Готово', sprintWidths[2], { color: '1B5E20', bold: true }), cell('P0', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('3', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Полевые испытания APK (голос, фоновый GPS, экран выкл.)', sprintWidths[1]), cell('⏳ Сейчас', sprintWidths[2], { color: ACCENT_ORANGE, bold: true }), cell('P0', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('4', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Багфиксы по результатам испытаний APK', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P0', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('5', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Фиксированный debug keystore — обновление APK без удаления (сохранение данных)', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P1', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('6', sprintWidths[0], { align: AlignmentType.CENTER }), cell('i18n: перевод UI на EN', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P1', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('7', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Privacy Policy + Terms of Service', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P1', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('8', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Google Play Developer Account + листинг', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P1', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('9', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Рефакторинг RideScreen + единый GPS provider', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P2', sprintWidths[3], { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [cell('10', sprintWidths[0], { align: AlignmentType.CENTER }), cell('Публикация v1.0 в Google Play', sprintWidths[1]), cell('⏳ Ожидает', sprintWidths[2], { color: GRAY_600 }), cell('P1', sprintWidths[3], { align: AlignmentType.CENTER })] }),
  ],
}));

children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [] }));
children.push(para('После успешной публикации v1.0 переходим к v1.1 (Quick Targets + GPX + PRO-разблокировка).', { italics: true, color: GRAY_600 }));

// ══════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ══════════════════════════════════════════════════════════

const doc = new Document({
  numbering,
  styles,
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 15840 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Vector — Дорожная карта', font: 'Arial', size: 18, color: GRAY_600 }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_GREEN, space: 4 } },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'v0.5.45 | Май 2026 | ', font: 'Arial', size: 16, color: GRAY_600 }),
            new TextRun({ text: 'Стр. ', font: 'Arial', size: 16, color: GRAY_600 }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: GRAY_600 }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const out = 'C:\\dev\\vector\\Vector-Roadmap.docx';
  fs.writeFileSync(out, buffer);
  console.log(`Written ${(buffer.length / 1024).toFixed(1)} KB -> ${out}`);
});
