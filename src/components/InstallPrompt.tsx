import { useEffect, useState } from 'react';
import { C, F_DISP, F_MONO } from '../theme';

type BIPEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const SNOOZE_KEY = 'vector.install.snooze';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  return isIOS && !(navigator as Navigator & { standalone?: boolean }).standalone;
}

function snoozed(): boolean {
  const v = localStorage.getItem(SNOOZE_KEY);
  if (!v) return false;
  return Date.now() - Number(v) < SNOOZE_MS;
}

export default function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvt | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvt);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    if (isIos()) {
      const tm = setTimeout(() => setShowIos(true), 6000);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBip);
        clearTimeout(tm);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setEvt(null);
    setShowIos(false);
  };

  const accept = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  };

  if (!evt && !showIos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
        zIndex: 9000,
        background: 'rgba(11,13,12,0.96)',
        border: `1px solid ${C.line2}`,
        borderRadius: 14,
        padding: 14,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        animation: 'fadeUp 280ms ease',
      }}
    >
      <div style={{ fontFamily: F_DISP, fontSize: 16, fontWeight: 600, marginBottom: 4, color: C.ink }}>
        Установить Vector
      </div>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkDim, letterSpacing: '0.06em', marginBottom: 12 }}>
        {showIos ? 'Поделиться → На экран Домой' : 'Откроется как приложение'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {evt && (
          <button
            onClick={accept}
            style={{
              flex: 1,
              border: 'none',
              background: C.target,
              color: C.targetInk,
              fontFamily: F_DISP,
              fontWeight: 700,
              fontSize: 14,
              padding: '10px 14px',
              borderRadius: 10,
            }}
          >
            Установить
          </button>
        )}
        <button
          onClick={dismiss}
          style={{
            flex: evt ? '0 0 auto' : 1,
            background: 'transparent',
            color: C.inkDim,
            border: `1px solid ${C.line2}`,
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '10px 14px',
            borderRadius: 10,
          }}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
