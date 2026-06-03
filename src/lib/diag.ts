// Лёгкий кольцевой лог для полевой диагностики (GPS ↔ голос).
// Цель: на велике/в машине прокатиться, потом выгрузить .txt и увидеть
// таймлайн — замолкает ли голос из-за пропажи GPS-фиксов или из-за того,
// что триггер не сработал / схлопнулся min-gap'ом.
//
// Всегда включён (стоимость ничтожна: push в массив). Это временная
// debug-фича — убрать перед релизом «на продажу».

declare const __APP_VERSION__: string;

type DiagEntry = { t: number; tag: string; msg: string };

const RING_MAX = 8000; // ~1–2 часа при ~1–2 записях/сек
let ring: DiagEntry[] = [];
let t0 = 0;
let enabled = true;

export function setDiagEnabled(on: boolean): void {
  enabled = on;
}

export function dlog(tag: string, msg = ''): void {
  if (!enabled) return;
  const t = Date.now();
  if (t0 === 0) t0 = t;
  ring.push({ t, tag, msg });
  // Амортизированная обрезка (не shift на каждый push).
  if (ring.length > RING_MAX) ring.splice(0, Math.floor(RING_MAX / 4));
}

export function diagCount(): number {
  return ring.length;
}

export function clearDiag(): void {
  ring = [];
  t0 = 0;
}

/** Версия приложения для шапки лога (чтобы знать, какая сборка тестировалась). */
function diagAppVersion(): string {
  try { return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'; }
  catch { return '?'; }
}

/** Срез лога с момента startMs (для пер-поездочного лога). rel — от первой
 *  записи среза. Если поездка длиннее ring-буфера, начало могло быть обрезано. */
export function getDiagTextSince(startMs: number, label = ''): string {
  const slice = ring.filter((e) => e.t >= startMs);
  const base = slice.length ? slice[0].t : startMs;
  const header =
    `Vector trip diagnostics${label ? ` — ${label}` : ''}\n` +
    `app: ${diagAppVersion()}\n` +
    `entries: ${slice.length}\n` +
    `start: ${new Date(startMs).toISOString()}\n` +
    `dumped: ${new Date().toISOString()}\n` +
    `\n` +
    `[+rel  wall] TAG  detail\n` +
    `------------------------------------------------\n`;
  const lines = slice.map((e) => {
    const rel = ((e.t - base) / 1000).toFixed(1).padStart(8);
    const wall = new Date(e.t).toLocaleTimeString('ru-RU', { hour12: false });
    return `[${rel}s ${wall}] ${e.tag}\t${e.msg}`;
  });
  return header + lines.join('\n') + '\n';
}

/** Текстовый дамп: [+отн.сек  стенные часы] TAG  detail. */
export function getDiagText(): string {
  const header =
    `Vector diagnostics\n` +
    `app: ${diagAppVersion()}\n` +
    `entries: ${ring.length}\n` +
    `start: ${t0 ? new Date(t0).toISOString() : '-'}\n` +
    `dumped: ${new Date().toISOString()}\n` +
    `\n` +
    `[+rel  wall] TAG  detail\n` +
    `------------------------------------------------\n`;
  const lines = ring.map((e) => {
    const rel = ((e.t - t0) / 1000).toFixed(1).padStart(8);
    const wall = new Date(e.t).toLocaleTimeString('ru-RU', { hour12: false });
    return `[${rel}s ${wall}] ${e.tag}\t${e.msg}`;
  });
  return header + lines.join('\n') + '\n';
}
