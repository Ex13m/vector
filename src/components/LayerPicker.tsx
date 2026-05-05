import { useState } from 'react';
import { C, F_MONO } from '../theme';
import type { Settings } from '../store/settings';
import { t } from '../i18n';

type Layer = Settings['layer'];

type Props = {
  lang: Settings['lang'];
  layer: Layer;
  showTrail: boolean;
  onLayer: (l: Layer) => void;
  onTrail: (v: boolean) => void;
};

export default function LayerPicker({ lang, layer, showTrail, onLayer, onTrail }: Props) {
  const [open, setOpen] = useState(false);
  const items: Array<{ key: Layer; tk: 'ride.layer.std' | 'ride.layer.sat' | 'ride.layer.topo' | 'ride.layer.tour' }> = [
    { key: 'std', tk: 'ride.layer.std' },
    { key: 'sat', tk: 'ride.layer.sat' },
    { key: 'topo', tk: 'ride.layer.topo' },
    { key: 'tour', tk: 'ride.layer.tour' },
  ];
  return (
    <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="layer"
        style={{
          width: 42,
          height: 38,
          background: 'rgba(11,13,12,0.85)',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          color: C.ink,
          backdropFilter: 'blur(8px)',
          fontSize: 16,
        }}
      >
        ▦
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 0,
            width: 150,
            background: 'rgba(11,13,12,0.96)',
            border: `1px solid ${C.line2}`,
            borderRadius: 12,
            padding: 4,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              fontFamily: F_MONO,
              fontSize: 8.5,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.inkDim,
              padding: '6px 10px 4px',
            }}
          >
            {t(lang, 'ride.layer.title')}
          </div>
          {items.map((it) => {
            const active = layer === it.key;
            return (
              <button
                key={it.key}
                onClick={() => {
                  onLayer(it.key);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: active ? C.target : 'transparent',
                  color: active ? C.targetInk : C.ink,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontFamily: F_MONO,
                  fontSize: 11,
                  fontWeight: active ? 700 : 400,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {t(lang, it.tk)}
              </button>
            );
          })}
          <hr style={{ border: 'none', borderTop: `1px solid ${C.line2}`, margin: '4px 6px' }} />
          <button
            onClick={() => onTrail(!showTrail)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              color: showTrail ? C.target : C.inkDim,
              border: 'none',
              padding: '8px 10px',
              fontFamily: F_MONO,
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            ∿ {t(lang, 'ride.trail')} · {showTrail ? t(lang, 'common.on') : t(lang, 'common.off')}
          </button>
        </div>
      )}
    </div>
  );
}
