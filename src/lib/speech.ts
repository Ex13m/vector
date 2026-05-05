import type { Lang } from '../i18n';

export function speak(text: string, opts: { lang: Lang; voiceURI?: string | null; rate?: number } = { lang: 'ru' }) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang === 'ru' ? 'ru-RU' : 'en-US';
    u.rate = opts.rate ?? 1.0;
    u.pitch = 1.0;
    if (opts.voiceURI) {
      const v = speechSynthesis.getVoices().find((vv) => vv.voiceURI === opts.voiceURI);
      if (v) u.voice = v;
    }
    speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function listVoices(lang: Lang): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const all = speechSynthesis.getVoices();
  const prefix = lang === 'ru' ? 'ru' : 'en';
  return all.filter((v) => v.lang.toLowerCase().startsWith(prefix));
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
