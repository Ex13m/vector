import { useCallback, useEffect, useMemo, useState } from 'react';
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

export type Settings = {
  intervalSec: number; // 0..600 step 10
  units: 'metric' | 'imperial';
  haptics: boolean;
  lang: VoiceLang; // RU/EN/DE — для голоса
  voiceURI: string | null;
  layer: Layer;
  showTrail: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  intervalSec: 900 > 600 ? 600 : 900, // спека: max 600
  units: 'metric',
  haptics: true,
  lang: (navigator.language || 'ru').toLowerCase().startsWith('de')
    ? 'de'
    : (navigator.language || 'ru').toLowerCase().startsWith('en')
    ? 'en'
    : 'ru',
  voiceURI: null,
  layer: 'std',
  showTrail: true,
};

const SETTINGS_KEY = 'vector.settings.v2';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, intervalSec: 600 };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    if (s.intervalSec > 600) s.intervalSec = 600;
    if (s.intervalSec < 0) s.intervalSec = 0;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS, intervalSec: 600 };
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
  const [screen, setScreen] = useState<Screen>('pick');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [target, setTarget] = useState<LatLng | null>(null);
  const [reverse, setReverse] = useState(false);
  const [resumeTrail, setResumeTrail] = useState<Array<{ lat: number; lng: number; t: number }> | null>(null);
  const [pickBox, setPickBox] = useState<LngLatBox | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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

  const goCache = useCallback((tg: LatLng, box: LngLatBox) => {
    setTarget(tg);
    setReverse(false);
    setResumeTrail(null);
    setPickBox(box);
    setScreen('cache');
  }, []);

  const goRide = useCallback(() => setScreen('ride'), []);
  const goPick = useCallback(() => {
    setScreen('pick');
    setTarget(null);
    setResumeTrail(null);
    setReverse(false);
  }, []);

  const onResumeTrip = useCallback(
    (_tripTarget: LatLng, tripTrail: Array<{ lat: number; lng: number; t: number }>) => {
      // Reverse mode: цель — стартовая точка трека.
      const start = tripTrail[0];
      setTarget({ lat: start.lat, lng: start.lng });
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
          reverse={reverse}
          resumeTrail={resumeTrail}
          onSettings={() => setShowSettings(true)}
          onSettingsChange={updateSettings}
          onExit={goPick}
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
      />
    );
  }, [screen, settings, target, reverse, resumeTrail, pickBox, goCache, goRide, goPick, onResumeTrip, updateSettings]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {body}
      {showSettings && (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
      {needRefresh && <UpdateToast onApply={() => updateServiceWorker(true)} />}
      <InstallPrompt />
    </div>
  );
}
