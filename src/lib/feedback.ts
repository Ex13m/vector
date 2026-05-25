// Лёгкие feedback-утилиты: вибрация + короткие beep'ы через WebAudio.
// Никаких внешних аудиофайлов. Уважает Settings.haptics.

import { Capacitor } from '@capacitor/core';

type TapKind = 'light' | 'medium' | 'heavy' | 'success' | 'warn';

// Web fallback паттерны (navigator.vibrate)
const PATTERNS: Record<TapKind, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 22,
  success: [10, 30, 12],
  warn: [30, 40, 30],
};

const isNative = Capacitor.isNativePlatform();

export function haptic(kind: TapKind = 'light', enabled = true): void {
  if (!enabled) return;

  if (isNative) {
    // Нативная вибрация через @capacitor/haptics — работает надёжно
    // на всех Android устройствах (navigator.vibrate может не работать в WebView).
    void import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'light') {
        void Haptics.impact({ style: ImpactStyle.Light });
      } else if (kind === 'medium') {
        void Haptics.impact({ style: ImpactStyle.Medium });
      } else if (kind === 'heavy') {
        void Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (kind === 'success') {
        void Haptics.notification({ type: NotificationType.Success });
      } else if (kind === 'warn') {
        void Haptics.notification({ type: NotificationType.Warning });
      }
    }).catch(() => {
      // fallback — navigator.vibrate
      if ('vibrate' in navigator) navigator.vibrate(PATTERNS[kind]);
    });
    return;
  }

  // Web — navigator.vibrate (PWA)
  if (!('vibrate' in navigator)) return;
  navigator.vibrate(PATTERNS[kind]);
}

// Реюзим AudioContext чтоб не создавать новый на каждый сигнал.
let beepCtx: AudioContext | null = null;
function ensureBeepCtx(): AudioContext | null {
  if (beepCtx) return beepCtx;
  const Ctor =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    beepCtx = new Ctor();
    return beepCtx;
  } catch {
    return null;
  }
}

/** Короткий мелодичный beep — например, сигнал «цель на 12 часов». */
export function chime(notes: Array<{ freq: number; durMs: number; gain?: number }>): void {
  const ctx = ensureBeepCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  let t = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = n.freq;
    osc.type = 'sine';
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(n.gain ?? 0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.durMs / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.durMs / 1000 + 0.02);
    t += n.durMs / 1000;
  }
}

/** Двойной восходящий «цель впереди». */
export function chimeOnTarget(): void {
  chime([
    { freq: 880, durMs: 110 }, // A5
    { freq: 1318, durMs: 160 }, // E6
  ]);
}
