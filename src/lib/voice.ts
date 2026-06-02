// Голос: гибридный подход.
//
// • Web (PWA в браузере): Web Speech API (speechSynthesis).
//   На iOS первый вызов должен быть из жеста.
//
// • Native (Android APK через Capacitor): нативный TTS через
//   @capacitor-community/text-to-speech, потому что speechSynthesis
//   в Android WebView НЕ РАБОТАЕТ (известный баг Chromium #487255).
//
// Выбор движка происходит автоматически через Capacitor.isNativePlatform().

import { Capacitor } from '@capacitor/core';
import { dlog } from './diag';
import { resumeWakeAudio } from './wakeAudio';

export type VoiceLang = 'ru' | 'en' | 'de';

const isNative = Capacitor.isNativePlatform();

function langTag(lang: VoiceLang): string {
  return lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-US';
}

/** Web Speech API путь (браузер / iOS Safari) */
function speakWeb(text: string, lang: VoiceLang, voiceURI: string | null | undefined, interrupt: boolean) {
  if (!('speechSynthesis' in window)) return;
  const ss = window.speechSynthesis;
  // Восстановление из «paused»-залипания: Android Chrome усыпляет движок,
  // и тогда speak() принимается в очередь, но не стартует.
  if (ss.paused) ss.resume();
  // Прерываем играющую фразу ТОЛЬКО для приоритетных (старт/прибытие/пауза/
  // ручной голос). Рутинная каденция НЕ рвёт текущую — иначе при наложении
  // триггеров фразы обрывают друг друга (главная причина «залипания»).
  if (interrupt && (ss.speaking || ss.pending)) ss.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = langTag(lang);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  // Гарантируем выбранный голос: по voiceURI, иначе первый под язык.
  const voices = ss.getVoices();
  const v = (voiceURI ? voices.find((x) => x.voiceURI === voiceURI) : undefined)
    ?? voices.find((x) => x.lang.toLowerCase().startsWith(lang));
  if (v) utter.voice = v;
  ss.speak(utter);
}

/** Последняя ошибка нативного TTS — для видимой диагностики на экране. */
export let lastTtsError: string | null = null;

/** Показывает короткий тост с диагностикой (один раз на сообщение). */
function showTtsDiag(msg: string) {
  lastTtsError = msg;
  try {
    let el = document.getElementById('tts-diag');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tts-diag';
      el.style.cssText =
        'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));' +
        'z-index:99999;background:rgba(200,40,40,0.95);color:#fff;font:12px/1.4 monospace;' +
        'padding:8px 10px;border-radius:8px;white-space:pre-wrap;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = 'TTS: ' + msg;
    window.setTimeout(() => { el && el.remove(); }, 6000);
  } catch { /* ignore */ }
}

/** Native TTS путь (Capacitor Android) */
async function speakNative(text: string, lang: VoiceLang, interrupt: boolean) {
  const started = Date.now();
  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    // stop() ТОЛЬКО для приоритетных фраз. Для рутинной каденции не прерываем —
    // иначе наложение двух speak() (stop одного рвёт speak другого) даёт тишину.
    if (interrupt) { try { await TextToSpeech.stop(); } catch { /* ignore */ } }
    // BT A2DP primer: bluetooth-канал «спит» когда аудио не играет, и первые
    // ~200мс TTS-вывода теряются (пользователь слышит обрезанное начало слова).
    // Ведущая запятая создаёт TTS-паузу ~150–200мс, за которую BT-кодек
    // успевает активироваться, и реальный текст начинается без обрезки.
    await TextToSpeech.speak({
      text: `, ${text}`,
      lang: langTag(lang),
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      // category убран: 'ambient' на части устройств глушит TTS (mute switch / stream).
    });
    dlog('TTS', `ok ${Date.now() - started}ms`);
    lastTtsError = null;
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn('[voice] native TTS failed:', e);
    dlog('TTS', `ERR ${msg}`);
    showTtsDiag(msg);
  } finally {
    // TTS забирает аудио-фокус и паузит keep-alive <audio>. Если при
    // выключенном экране его не вернуть — Android заморозит JS (GPS-колбэки
    // буферизуются, голос пропадает до включения экрана). Возобновляем сразу.
    resumeWakeAudio();
  }
}

// ── Коалесцирование: схлопывает наложение триггеров на переходах фаз. ─────────
// Несколько источников (интервал, GPS-дубль, таймер +1.5с, wake) могут вызвать
// speak() с разницей ~1с. Без этого они через stop()/cancel() обрывают друг
// друга → клиппинг/тишина. MIN_GAP сильно меньше минимального интервала
// озвучки (60с), поэтому штатную каденцию не задевает.
let _lastSpeakAt = 0;
const MIN_GAP_MS = 2000;

/**
 * @param opts.priority — приоритетная фраза (старт/прибытие/пауза/ручной голос):
 *   обходит min-gap и прерывает текущую речь. Рутинная каденция (по умолчанию)
 *   пропускается, если только что говорили, и не рвёт играющую фразу.
 */
export function speak(
  text: string,
  lang: VoiceLang = 'ru',
  voiceURI?: string | null,
  opts?: { priority?: boolean },
) {
  const priority = opts?.priority ?? false;
  const now = Date.now();
  if (!priority && now - _lastSpeakAt < MIN_GAP_MS) {
    dlog('SKIP', `gap ${Math.round(now - _lastSpeakAt)}ms "${text.slice(0, 20)}"`);
    return;
  }
  _lastSpeakAt = now;
  dlog('SAY', `${priority ? '! ' : ''}"${text.slice(0, 28)}"`);
  if (isNative) {
    void speakNative(text, lang, priority);
  } else {
    speakWeb(text, lang, voiceURI, priority);
  }
}

/** Немедленно прервать текущую речь (платформо-зависимо: натив TTS / web). */
export function stopSpeaking(): void {
  if (isNative) {
    void import('@capacitor-community/text-to-speech')
      .then(({ TextToSpeech }) => TextToSpeech.stop())
      .catch(() => { /* ignore */ });
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function clockWords(clockHM: string, lang: VoiceLang): string {
  const [hStr, mStr] = clockHM.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (lang === 'ru') {
    if (m === 0) return `на ${h} часов`;
    return `на ${h} часов ${m} минут`;
  }
  if (lang === 'de') {
    if (m === 0) return `${h} Uhr`;
    return `${h} Uhr ${m}`;
  }
  if (m === 0) return `${h} o'clock`;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function distWords(distM: number, lang: VoiceLang): string {
  if (lang === 'ru') {
    if (distM < 1000) return `${Math.round(distM)} метров`;
    const km = Math.floor(distM / 1000);
    const m = Math.round((distM % 1000) / 10) * 10;
    if (m === 0) return `${km} километров`;
    return `${km} километров ${m} метров`;
  }
  if (lang === 'de') {
    if (distM < 1000) return `${Math.round(distM)} Meter`;
    const km = Math.floor(distM / 1000);
    const m = Math.round((distM % 1000) / 10) * 10;
    if (m === 0) return `${km} Kilometer`;
    return `${km} Kilometer ${m} Meter`;
  }
  if (distM < 1000) return `${Math.round(distM)} metres`;
  const km = Math.floor(distM / 1000);
  const m = Math.round((distM % 1000) / 10) * 10;
  if (m === 0) return `${km} kilometres`;
  return `${km} kilometres ${m} metres`;
}

function etaWords(etaMin: number, lang: VoiceLang): string {
  if (lang === 'ru') return `ехать ${etaMin} минут`;
  if (lang === 'de') return `noch ${etaMin} Minuten`;
  return `${etaMin} minutes to go`;
}

export function buildPhrase(opts: {
  lang: VoiceLang;
  clockHM: string;
  distM: number;
  etaMin: number | null;
  reverse?: boolean;
}): string {
  const { lang, clockHM, distM, etaMin, reverse } = opts;
  const clock = clockWords(clockHM, lang);
  const dist = distWords(distM, lang);
  const parts: string[] = [];
  if (lang === 'ru') {
    parts.push(reverse ? `От точки, ${clock}` : `Цель ${clock}`);
  } else if (lang === 'de') {
    parts.push(reverse ? `Vom Start, ${clock}` : `Ziel auf ${clock}`);
  } else {
    parts.push(reverse ? `From start, ${clock}` : `Target at ${clock}`);
  }
  parts.push(dist);
  if (etaMin != null && etaMin > 0 && etaMin < 600) parts.push(etaWords(etaMin, lang));
  return parts.join(', ');
}

export function listVoices(lang: VoiceLang = 'ru'): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
}

export function onVoicesReady(cb: () => void): () => void {
  if (!('speechSynthesis' in window)) return () => {};
  if (speechSynthesis.getVoices().length) {
    cb();
    return () => {};
  }
  const h = () => cb();
  speechSynthesis.addEventListener('voiceschanged', h);
  return () => speechSynthesis.removeEventListener('voiceschanged', h);
}
