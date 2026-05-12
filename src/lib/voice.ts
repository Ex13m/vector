// Web Speech API. Бесплатно, оффлайн на iOS/Android.
// На iOS первый вызов должен быть из жеста, иначе ничего не произнесёт.

export type VoiceLang = 'ru' | 'en' | 'de';

export function speak(text: string, lang: VoiceLang = 'ru', voiceURI?: string | null) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-US';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  if (voiceURI) {
    const v = speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURI);
    if (v) utter.voice = v;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
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
