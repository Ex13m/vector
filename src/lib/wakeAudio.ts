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

// Минимальный валидный silent MP3 (1 секунда, 8 kHz mono, 8 kbps).
// Используется вместо AudioContext-осциллятора — браузеры надёжнее
// держат вкладку активной с реальным <audio> элементом.
const SILENT_MP3 =
  'data:audio/mpeg;base64,' +
  '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgIC' +
  'AgICAgICAgICAgICAgICAgICAgICAv//uQxAMAAANIAAAAAAAAAA0gAAAAAExBTUUzLjk4LjIA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let audioEl: HTMLAudioElement | null = null;
let _playing = false;

function tryPlay(): void {
  if (!audioEl || _playing) return;
  void audioEl.play().then(() => {
    _playing = true;
  }).catch(() => {
    // Жест не захвачен — попробуем снова при следующем взаимодействии
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
    el.src = SILENT_MP3;
    el.loop = true;
    el.volume = 0.001; // почти беззвучно, но не 0
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('x-webkit-airplay', 'deny');
    document.body.appendChild(el);
    audioEl = el;

    // Авто-resume: входящий звонок или системное прерывание паузит audio.
    // После завершения звонка пробуем возобновить с задержкой.
    el.addEventListener('pause', () => {
      _playing = false;
      setTimeout(() => {
        if (audioEl && !_playing) tryPlay();
      }, 1500);
    });

    // При возврате в foreground — тоже пробуем resume.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && audioEl && !_playing) {
        tryPlay();
      }
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
