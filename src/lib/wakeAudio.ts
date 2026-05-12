// Тихий аудио-loop, чтобы вкладка считалась «media-active» и не глохла при
// заблокированном экране — иначе speechSynthesis ставится на паузу и
// setInterval троттлится. Goal: голос работает в наушниках с погашенным экраном.

type AC = typeof AudioContext;
type WindowWithWebkit = typeof window & { webkitAudioContext?: AC };

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;

export function startWakeAudio(): void {
  if (ctx) return;
  const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx = new Ctor();
    gain = ctx.createGain();
    gain.gain.value = 0.0001; // не 0 — иначе iOS считает контекст пустым и усыпит
    osc = ctx.createOscillator();
    osc.frequency.value = 1; // ниже порога слышимости человека
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    osc = null;
    gain = null;
  }
}

export function resumeWakeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function stopWakeAudio(): void {
  try {
    osc?.stop();
  } catch {
    // ignore — уже остановлен
  }
  osc?.disconnect();
  gain?.disconnect();
  void ctx?.close();
  ctx = null;
  osc = null;
  gain = null;
  clearMediaSession();
}

export function setupMediaSession(title: string): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Vector',
      album: 'Voice cycling beacon',
    });
    navigator.mediaSession.playbackState = 'playing';
  } catch {
    // ignore
  }
}

export function clearMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
  } catch {
    // ignore
  }
}
