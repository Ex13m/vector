// Фоновый аудио для работы голоса с погашенным экраном.
//
// ПРОБЛЕМА: speechSynthesis и setInterval троттлятся браузером когда
// страница не видна (экран выключен / другое приложение). Браузер делает
// исключение для вкладок с активным аудио — поэтому нужен тихий цикл.
//
// КРИТИЧНО для iOS/Android: el.play() должен вызываться СИНХРОННО
// внутри пользовательского жеста (touchstart/click). Нельзя вызывать
// из useEffect или setTimeout — браузер заблокирует.
//
// Схема:
//   1. initWakeAudio()  — вызвать при старте приложения (создаёт элемент)
//   2. resumeWakeAudio() — вызвать из ЖЕСТА (кнопки «Старт», тапы на экране)
//   3. startWakeAudio()  — вызывается из RideScreen useEffect как запасной вариант
//
// Авто-старт: при первом touchstart/click на странице пробуем play() автоматически.

// Silent WAV PCM (0.3 c, 8 kHz mono 8-bit). РАНЬШЕ был MP3 data-URI, но он
// падал с NotSupportedError в Android WebView (MP3-декодер ненадёжен для
// data-URI) → keep-alive не запускался → JS замерзал в фоне → голос тухнул.
// WAV PCM поддерживается WebView универсально (без декодера). loop зацикливает.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWAJAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';

import { dlog } from './diag';

let audioEl: HTMLAudioElement | null = null;
let _playing = false;

/** Играет ли фоновый аудио прямо сейчас (для диагностики в MARK/логе). */
export function isWakeAudioPlaying(): boolean {
  // Доверяем реальному состоянию элемента, а не только флагу.
  return !!audioEl && !audioEl.paused;
}

function tryPlay(): void {
  if (!audioEl || _playing) return;
  void audioEl.play().then(() => {
    _playing = true;
    dlog('WAKE', 'play ok');
  }).catch((e) => {
    // Жест не захвачен — попробуем снова при следующем взаимодействии
    dlog('WAKE', `play FAIL ${e instanceof Error ? e.name : ''}`);
  });
}

// Авто-старт на первый жест пользователя (любой тап).
function onFirstGesture() {
  tryPlay();
  if (_playing) {
    document.removeEventListener('touchstart', onFirstGesture, true);
    document.removeEventListener('mousedown', onFirstGesture, true);
  }
}

/** Создаёт <audio> элемент. Можно вызвать без жеста. */
export function initWakeAudio(): void {
  if (audioEl) return;
  try {
    const el = document.createElement('audio');
    el.src = SILENT_WAV;
    el.loop = true;
    el.volume = 0.02; // почти беззвучно, но «реальнее» для аудио-фокуса Android
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('x-webkit-airplay', 'deny');
    document.body.appendChild(el);
    audioEl = el;

    // Авто-resume: входящий звонок или системное прерывание паузит audio.
    // Если аудио замолчит при выключенном экране — Android заморозит JS
    // (GPS-колбэки буферизуются, голос пропадает, трек «дорисовывается»
    // пачкой при включении). Поэтому возобновляем агрессивно.
    el.addEventListener('pause', () => {
      _playing = false;
      dlog('WAKE', 'pause');
      setTimeout(() => { if (audioEl && audioEl.paused) tryPlay(); }, 500);
      setTimeout(() => { if (audioEl && audioEl.paused) tryPlay(); }, 2000);
    });
    el.addEventListener('play', () => { _playing = true; });
    el.addEventListener('ended', () => {
      // loop обычно не даёт ended, но на всякий случай перезапускаем.
      dlog('WAKE', 'ended');
      if (audioEl) { audioEl.currentTime = 0; tryPlay(); }
    });

    // И при выключении (hidden), и при включении (visible) экрана —
    // убеждаемся, что аудио играет. Особенно важно ДО ухода в фон:
    // запустить в фоне без жеста уже нельзя.
    document.addEventListener('visibilitychange', () => {
      if (audioEl && audioEl.paused) tryPlay();
    });

    // Подписываемся на первый жест для автозапуска
    document.addEventListener('touchstart', onFirstGesture, { capture: true, once: false });
    document.addEventListener('mousedown', onFirstGesture, { capture: true, once: false });
  } catch {
    audioEl = null;
  }
}

/**
 * Запустить/возобновить фоновый аудио.
 * ДОЛЖЕН вызываться из обработчика жеста (кнопка, тап).
 */
export function resumeWakeAudio(): void {
  if (!audioEl) initWakeAudio();
  tryPlay();
}

/**
 * Вызывается из RideScreen useEffect как дополнительная инициализация.
 * play() здесь может не сработать (нет жеста), но элемент будет создан
 * и авто-старт сработает при первом тапе пользователя.
 */
export function startWakeAudio(): void {
  initWakeAudio();
  tryPlay(); // может быть заблокировано — ok, авто-старт подхватит
}

export function stopWakeAudio(): void {
  document.removeEventListener('touchstart', onFirstGesture, true);
  document.removeEventListener('mousedown', onFirstGesture, true);
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.src = '';
      if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
    } catch {
      // ignore
    }
    audioEl = null;
    _playing = false;
  }
  clearMediaSession();
}

export function setupMediaSession(_title: string): void {
  // Намеренно НЕ ставим metadata и playbackState.
  // Silent <audio loop> достаточно чтобы держать вкладку живой.
  // Если поставить playbackState='playing' — перехватываем управление
  // у музыкальных плееров (Spotify, Apple Music) на наушниках.
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
