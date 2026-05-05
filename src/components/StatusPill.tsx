import { C, F_MONO } from '../theme';

type Props = { state: 'live' | 'paused' | 'noSignal'; label: string };

export default function StatusPill({ state, label }: Props) {
  const color = state === 'live' ? C.ok : state === 'paused' ? C.target : C.warn;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(11,13,12,0.85)',
        border: `1px solid ${C.line2}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <span
        style={{
          fontFamily: F_MONO,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: C.ink,
        }}
      >
        {label}
      </span>
    </div>
  );
}
