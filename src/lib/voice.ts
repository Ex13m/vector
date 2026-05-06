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

export function buildPhrase(opts: {
  lang: VoiceLang;
  clock: number;
  distM: number;
  reverse?: boolean;
}): string {
  const { lang, clock, distM, reverse } = opts;
  const distKm = distM / 1000;
  const distStr =
    lang === 'ru'
      ? distM < 1000
        ? `${Math.round(distM)} метров`
        : `${distKm.toFixed(1)} километров`
      : lang === 'de'
      ? distM < 1000
        ? `${Math.round(distM)} Meter`
        : `${distKm.toFixed(1)} Kilometer`
      : distM < 1000
      ? `${Math.round(distM)} meters`
      : `${distKm.toFixed(1)} kilometers`;
  if (lang === 'ru') {
    return reverse
      ? `От точки ${distStr}, на ${clock} часов`
      : `Цель на ${clock} часов, ${distStr}`;
  }
  if (lang === 'de') {
    return reverse
      ? `${distStr} vom Start, ${clock} Uhr`
      : `Ziel auf ${clock} Uhr, ${distStr}`;
  }
  return reverse
    ? `${distStr} from start, ${clock} o'clock`
    : `Target at ${clock} o'clock, ${distStr}`;
}

export function listVoices(lang: VoiceLang = 'ru'): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const code = lang;
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(code));
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
