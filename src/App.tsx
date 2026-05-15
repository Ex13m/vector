import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import PickScreen from './screens/PickScreen';
import CacheScreen from './screens/CacheScreen';
import RideScreen from './screens/RideScreen';
import SettingsSheet from './components/SettingsSheet';
import UpdateToast from './components/UpdateToast';
import InstallPrompt from './components/InstallPrompt';
import type { LatLng } from './lib/geo';
import type { Layer } from './lib/mapStyles';
import type { LngLatBox } from './lib/tiles';
import type { VoiceLang } from './lib/voice';
import { VOICE_INTERVAL_MAX, VOICE_INTERVAL_STEP, DEFAULT_VOICE_INTERVAL } from './lib/constants';
import { initWakeAudio, resumeWakeAudio } from './lib/wakeAudio';
import { loadRideSession, clearRideSession } from './lib/rideSession';
import { startHeading } from './lib/orientation';

const DevBar = import.meta.env.DEV  /* tree-shaken in prod */
  ? lazy(() => import('./components/DevBar'))
  : null;

export type Settings = {
  intervalSec: number; // 0..900 step 60 (0–15 мин, шаг 1 мин)
  units: 'metric' | 'imperial';
  haptics: boolean;
  lang: VoiceLang; // RU/EN/DE — для голоса
  voiceURI: string | null;
  layer: Layer;
  showTrail: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  intervalSec: DEFAULT_VOICE_INTERVAL,
  units: 'metric',
  haptics: true,
  lang: (navigator.language || 'ru').toLowerCase().startsWith('de')
    ? 'de'
    : (navigator.language || 'ru').toLowerCase().startsWith('en')
    ? 'en'
    : 'ru',
  voiceURI: null,
  layer: 'sat', // дефолт — спутник (по требованию)
  showTrail: true,
};

const SETTINGS_KEY = 'vector.settings.v3';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    if (s.intervalSec > VOICE_INTERVAL_MAX) s.intervalSec = VOICE_INTERVAL_MAX;
    if (s.intervalSec < 0) s.intervalSec = 0;
    // защёлкнем на шаг
    s.intervalSec = Math.round(s.intervalSec / VOICE_INTERVAL_STEP) * VOICE_INTERVAL_STEP;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

type Screen = 'pick' | 'cache' | 'ride';

export default function App() {
  // Создаём <audio> сразу при старте — play() будет вызван из жеста «Старт».
  useEffect(() => { initWakeAudio(); }, []);

  // ── Восстановление активной поездки после убийства вкладки ОС.
  const savedSession = useMemo(() => loadRideSession(), []);

  const [screen, setScreen] = useState<Screen>(savedSession ? 'ride' : 'pick');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [target, setTarget] = useState<LatLng | null>(savedSession?.target ?? null);
  const [targetName, setTargetName] = useState<string | null>(savedSession?.targetName ?? null);
  const [reverse, setReverse] = useState(savedSession?.reverse ?? false);
  const [resumeTrail, setResumeTrail] = useState<Array<{ lat: number; lng: number; t: number }> | null>(savedSession?.trail ?? null);
  const [pickBox, setPickBox] = useState<LngLatBox | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // При выходе на Pick из Журнала — попросить открыть sheet на табе trips.
  const [openJournal, setOpenJournal] = useState(false);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, reg) {
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // ── Прогрев компаса. Подписываемся на курс как только выбрана цель —
  // это будит магнитометр, и пока пользователь на экране кэширования он
  // успевает откалиброваться. К старту PRE_RIDE компас уже тёплый, и
  // course-up карта ориентируется верно с первого кадра. Холодный
  // магнитометр на старте раньше давал кривую ориентацию.
  // Отключаем когда RideScreen берёт управление — иначе два listener'а
  // одновременно пишут в _sharedSmoothed (warm-up + RideScreen).
  useEffect(() => {
    if (!target || screen === 'ride') return;
    return startHeading(() => {});
  }, [target, screen]);

  const goCache = useCallback((tg: LatLng, name: string | null, box: LngLatBox) => {
    resumeWakeAudio(); // внутри жеста «Старт →» — запускаем фоновый аудио
    setTarget(tg);
    setTargetName(name);
    setReverse(false);
    setResumeTrail(null);
    setPickBox(box);
    setScreen('cache');
  }, []);

  const goRide = useCallback(() => setScreen('ride'), []);
  const goPick = useCallback(() => {
    clearRideSession();
    setScreen('pick');
    setTarget(null);
    setTargetName(null);
    setResumeTrail(null);
    setReverse(false);
  }, []);
  const goPickJournal = useCallback(() => {
    clearRideSession();
    setOpenJournal(true);
    setScreen('pick');
    setTarget(null);
    setTargetName(null);
    setResumeTrail(null);
    setReverse(false);
  }, []);

  const goReverseRide = useCallback(
    (tg: LatLng, trail: Array<{ lat: number; lng: number; t: number }>) => {
      setTarget(tg);
      setTargetName('Старт');
      setReverse(true);
      setResumeTrail(trail);
      setScreen('ride');
    },
    [],
  );

  const onResumeTrip = useCallback(
    (_tripTarget: LatLng, tripTrail: Array<{ lat: number; lng: number; t: number }>) => {
      // Reverse mode: цель — стартовая точка трека.
      const start = tripTrail[0];
      setTarget({ lat: start.lat, lng: start.lng });
      setTargetName('Старт');
      setReverse(true);
      setResumeTrail(tripTrail);
      setScreen('ride');
    },
    [],
  );

  const body = useMemo(() => {
    if (screen === 'cache' && target && pickBox) {
      return (
        <CacheScreen
          settings={settings}
          target={target}
          targetName={targetName}
          box={pickBox}
          onSkip={goRide}
          onDone={goRide}
          onBack={() => setScreen('pick')}
        />
      );
    }
    if (screen === 'ride' && target) {
      return (
        <RideScreen
          settings={settings}
          target={target}
          targetName={targetName}
          reverse={reverse}
          resumeTrail={resumeTrail}
          savedSession={savedSession}
          onSettings={() => setShowSettings(true)}
          onSettingsChange={updateSettings}
          onExit={goPick}
          onReverseRide={goReverseRide}
          onJournal={goPickJournal}
        />
      );
    }
    return (
      <PickScreen
        settings={settings}
        onSettings={() => setShowSettings(true)}
        onSettingsChange={updateSettings}
        onConfirm={goCache}
        onResumeTrip={onResumeTrip}
        openJournal={openJournal}
        onJournalConsumed={() => setOpenJournal(false)}
      />
    );
  }, [screen, settings, target, targetName, reverse, resumeTrail, pickBox, openJournal, goCache, goRide, goPick, goPickJournal, goReverseRide, onResumeTrip, updateSettings]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {body}
      {showSettings && (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
      {needRefresh && <UpdateToast onApply={() => updateServiceWorker(true)} />}
      <InstallPrompt />
      {DevBar && <Suspense fallback={null}><DevBar /></Suspense>}
    </div>
  );
}
