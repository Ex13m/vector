import { useEffect, useState } from 'react';
import { C, F_DISP, F_MONO } from '../theme';
import type { Settings } from '../App';
import { VOICE_INTERVAL_MAX, VOICE_INTERVAL_STEP } from '../App';
import { listVoices, onVoicesReady, type VoiceLang } from '../lib/voice';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
};

export default function SettingsSheet({ settings, onChange, onClose }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices(settings.lang));

  useEffect(() => {
    setVoices(listVoices(settings.lang));
    return onVoicesReady(() => setVoices(listVoices(settings.lang)));
  }, [settings.lang]);

  const intervalLabel =
    settings.intervalSec === 0
      ? 'off'
      : `${Math.round(settings.intervalSec / 60)} min`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
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
          maxHeight: '88vh',
          background: C.bg,
          borderTop: `1px solid ${C.line2}`,
          borderRadius: '20px 20px 0 0',
          padding: '14px 16px calc(20px + env(safe-area-inset-bottom))',
          overflowY: 'auto',
          animation: 'fadeUp 240ms ease',
        }}
      >
        <div style={{ width: 40, height: 4, background: C.line2, borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: F_DISP, fontSize: 24, fontWeight: 600, color: C.ink }}>Settings</div>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              width: 38,
              height: 38,
              background: 'transparent',
              border: `1px solid ${C.line2}`,
              borderRadius: 10,
              color: C.ink,
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        {/* Language */}
        <Section>
          <Label>Language</Label>
          <Segmented
            options={[
              { value: 'ru', label: 'RU' },
              { value: 'en', label: 'EN' },
              { value: 'de', label: 'DE' },
            ]}
            value={settings.lang}
            onChange={(v) => onChange({ lang: v as VoiceLang })}
          />
        </Section>

        {/* Voice every */}
        <Section>
          <RowBetween>
            <Label>Voice every</Label>
            <span style={{ fontFamily: F_MONO, fontSize: 13, color: C.target, letterSpacing: '0.04em' }}>
              {intervalLabel}
            </span>
          </RowBetween>
          <input
            type="range"
            min={0}
            max={VOICE_INTERVAL_MAX}
            step={VOICE_INTERVAL_STEP}
            value={settings.intervalSec}
            onChange={(e) => onChange({ intervalSec: Number(e.target.value) })}
            style={{ width: '100%', accentColor: C.target, marginTop: 8 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: 4 }}>
            <span>off</span>
            <span>5</span>
            <span>10</span>
            <span>15 min</span>
          </div>
        </Section>

        {/* Units */}
        <Section>
          <Label>Units</Label>
          <Segmented
            options={[
              { value: 'metric', label: 'M · KM' },
              { value: 'imperial', label: 'ft · mi' },
            ]}
            value={settings.units}
            onChange={(v) => onChange({ units: v as 'metric' | 'imperial' })}
          />
        </Section>

        {/* Haptics */}
        <Section>
          <RowBetween>
            <Label>Haptics</Label>
            <Toggle value={settings.haptics} onChange={(v) => onChange({ haptics: v })} />
          </RowBetween>
        </Section>

        {/* Voice picker (опционально) */}
        {voices.length > 0 && (
          <Section>
            <Label>Voice</Label>
            <select
              value={settings.voiceURI ?? ''}
              onChange={(e) => onChange({ voiceURI: e.target.value || null })}
              style={{
                width: '100%',
                marginTop: 8,
                background: C.bg2,
                color: C.ink,
                border: `1px solid ${C.line2}`,
                borderRadius: 10,
                padding: '10px 12px',
                fontFamily: F_MONO,
                fontSize: 12,
              }}
            >
              <option value="">Auto</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 22 }}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: F_DISP, fontSize: 16, fontWeight: 600, color: C.ink }}>{children}</span>
  );
}

function RowBetween({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
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
        width: 52,
        height: 30,
        borderRadius: 999,
        border: 'none',
        background: value ? C.target : C.bg3,
        position: 'relative',
        transition: 'background 150ms',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 25 : 3,
          width: 24,
          height: 24,
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
    <div
      style={{
        display: 'flex',
        gap: 0,
        marginTop: 10,
        background: 'transparent',
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              border: 'none',
              background: active ? C.bg3 : 'transparent',
              color: active ? C.ink : C.inkDim,
              fontFamily: F_DISP,
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              padding: '12px 10px',
              borderRadius: 10,
              transition: 'background 150ms, color 150ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
