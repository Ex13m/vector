import { useEffect, useState } from 'react';
import { C, F_DISP, F_MONO } from '../theme';
import { t, type Lang } from '../i18n';
import type { Settings } from '../store/settings';
import { listVoices, onVoicesReady } from '../lib/speech';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
};

export default function SettingsSheet({ settings, onChange, onClose }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices(settings.lang));

  useEffect(() => {
    return onVoicesReady(() => setVoices(listVoices(settings.lang)));
  }, [settings.lang]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: C.bg,
          borderTop: `1px solid ${C.line2}`,
          borderRadius: '18px 18px 0 0',
          padding: '14px 16px calc(20px + env(safe-area-inset-bottom))',
          overflowY: 'auto',
          animation: 'fadeUp 240ms ease',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: C.line2,
            borderRadius: 2,
            margin: '0 auto 14px',
          }}
        />
        <div style={{ fontFamily: F_DISP, fontSize: 18, fontWeight: 600, marginBottom: 14 }}>
          {t(settings.lang, 'settings.title')}
        </div>

        <Row label={t(settings.lang, 'settings.interval')} value={settings.intervalSec === 0 ? t(settings.lang, 'settings.intervalOff') : t(settings.lang, 'settings.intervalMin', { m: settings.intervalSec / 60 })}>
          <input
            type="range"
            min={0}
            max={1800}
            step={60}
            value={settings.intervalSec}
            onChange={(e) => onChange({ intervalSec: Number(e.target.value) })}
            style={{ width: '100%', accentColor: C.target }}
          />
        </Row>

        <Row label={t(settings.lang, 'settings.units')}>
          <Segmented
            options={[
              { value: 'metric', label: t(settings.lang, 'settings.unitsM') },
              { value: 'imperial', label: t(settings.lang, 'settings.unitsI') },
            ]}
            value={settings.units}
            onChange={(v) => onChange({ units: v as 'metric' | 'imperial' })}
          />
        </Row>

        <Row label={t(settings.lang, 'settings.haptics')}>
          <Toggle value={settings.haptics} onChange={(v) => onChange({ haptics: v })} />
        </Row>

        <Row label={t(settings.lang, 'settings.lang')}>
          <Segmented
            options={[
              { value: 'ru', label: 'RU' },
              { value: 'en', label: 'EN' },
            ]}
            value={settings.lang}
            onChange={(v) => onChange({ lang: v as Lang })}
          />
        </Row>

        <Row label={t(settings.lang, 'settings.voice')}>
          <select
            value={settings.voiceURI ?? ''}
            onChange={(e) => onChange({ voiceURI: e.target.value || null })}
            style={{
              width: '100%',
              background: C.bg2,
              color: C.ink,
              border: `1px solid ${C.line2}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontFamily: F_MONO,
              fontSize: 12,
            }}
          >
            <option value="">{t(settings.lang, 'settings.voiceAuto')}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
        </Row>

        <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.18em', color: C.inkDim, textTransform: 'uppercase' }}>
            {t(settings.lang, 'settings.about')}
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkDim, marginTop: 6 }}>
            {t(settings.lang, 'settings.version')}: {import.meta.env.VITE_APP_VERSION ?? '0.2.0'}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: 18,
            height: 48,
            background: C.bg2,
            color: C.ink,
            border: `1px solid ${C.line2}`,
            borderRadius: 12,
            fontFamily: F_MONO,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {t(settings.lang, 'common.ok')}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: F_DISP, fontSize: 14 }}>{label}</span>
        {value && <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkDim }}>{value}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        border: 'none',
        background: value ? C.target : C.line2,
        position: 'relative',
        transition: 'background 150ms',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: C.ink,
          transition: 'left 150ms',
        }}
      />
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: C.bg2, padding: 4, borderRadius: 10, border: `1px solid ${C.line2}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              border: 'none',
              background: active ? C.target : 'transparent',
              color: active ? C.targetInk : C.ink,
              fontFamily: F_MONO,
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '8px 10px',
              borderRadius: 8,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
