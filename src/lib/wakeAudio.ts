// Тихий аудио-loop, чтобы вкладка считалась «media-active» и не глохла при
// заблокированном экране — иначе speechSynthesis ставится на паузу и
// setInterval троттлится. Goal: голос работает в наушниках с погашенным экраном.
//
// Решение: <audio> элемент с silent MP3 (намного надёжнее AudioContext-осциллятора
// на iOS Safari и Android Chrome PWA).
// Silent MP3 = минимальный валидный mp3 (44 байта), loop=true.
// Этого достаточно, чтобы браузер держал вкладку «audio-active».

// Минимальный валидный silent MP3 в base64 (44 байта).
// Источник: https://github.com/anars/blank-audio
const SILENT_MP3_B64 =
  'SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZFR1bmVzLmNvbSAvIFRoZSBJbnRlcm5ldCdzIFNvdW5kYmFua//uQwAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQCkAAAAAAAAAJxThjWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let audioEl: HTMLAudioElement | null = null;

export function startWakeAudio(): void {
  if (audioEl) return;
  try {
    const el = document.createElement('audio');
    el.src = `data:audio/mpeg;base64,${SILENT_MP3_B64}`;
    el.loop = true;
    el.volume = 0.001; // почти беззвучно, но не 0 — иначе браузер может игнорировать
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    // autoplay запрещён без жеста; play() вызовем при первом взаимодействии
    document.body.appendChild(el);
    audioEl = el;
    // Пробуем сразу — сработает если уже был жест пользователя
    void el.play().catch(() => {
      // Не критично — повторим в resumeWakeAudio() при первом тапе
    });
  } catch {
    audioEl = null;
  }
}

export function resumeWakeAudio(): void {
  if (!audioEl) return;
  if (audioEl.paused) {
    void audioEl.play().catch(() => {});
  }
}

export function stopWakeAudio(): void {
  if (!audioEl) return;
  try {
    audioEl.pause();
    audioEl.src = '';
    if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
  } catch {
    // ignore
  }
  audioEl = null;
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
