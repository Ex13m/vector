import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import PickScreen from './screens/PickScreen';
import CacheScreen from './screens/CacheScreen';
import RideScreen from './screens/RideScreen';
import SettingsSheet from './components/SettingsSheet';
import UpdateToast from './components/UpdateToast';
import InstallPrompt from './components/InstallPrompt';
import { loadSettings, saveSettings, type Settings } from './store/settings';
import type { LatLng } from './lib/geo';
import { t } from './i18n';

type Screen = 'pick' | 'cache' | 'ride';

export default function App() {
  const [screen, setScreen] = useState<Screen>('pick');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [target, setTarget] = useState<LatLng | null>(null);
  const [reverse, setReverse] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_, reg) {
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  const goCache = useCallback((tg: LatLng, rev: boolean) => {
    setTarget(tg);
    setReverse(rev);
    setScreen('cache');
  }, []);

  const goRide = useCallback(() => setScreen('ride'), []);
  const goPick = useCallback(() => setScreen('pick'), []);

  const body = useMemo(() => {
    if (screen === 'pick')
      return <PickScreen settings={settings} onSettings={() => setShowSettings(true)} onConfirm={goCache} />;
    if (screen === 'cache' && target)
      return (
        <CacheScreen
          settings={settings}
          target={target}
          onSkip={goRide}
          onDone={goRide}
          onBack={goPick}
        />
      );
    if (screen === 'ride' && target)
      return (
        <RideScreen
          settings={settings}
          target={target}
          reverse={reverse}
          onSettings={() => setShowSettings(true)}
          onSettingsChange={updateSettings}
          onExit={goPick}
        />
      );
    return <PickScreen settings={settings} onSettings={() => setShowSettings(true)} onConfirm={goCache} />;
  }, [screen, settings, target, reverse, goCache, goRide, goPick, updateSettings]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {body}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {needRefresh && (
        <UpdateToast
          label={t(settings.lang, 'update.avail')}
          cta={t(settings.lang, 'update.cta')}
          onApply={() => updateServiceWorker(true)}
        />
      )}
      <InstallPrompt lang={settings.lang} />
    </div>
  );
}
