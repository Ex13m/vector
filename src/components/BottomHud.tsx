import { C, F_DISP, F_MONO } from '../theme';

type Cell = { label: string; value: string; unit?: string; accent?: boolean };
type Props = { left: Cell; center: Cell; right: Cell; near: boolean };

export default function BottomHud({ left, center, right, near }: Props) {
  const cells = [left, center, right];
  return (
    <div
      style={{
        display: 'flex',
        background: near ? 'rgba(15,32,24,0.85)' : 'rgba(11,13,12,0.78)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${near ? 'rgba(72,222,148,0.4)' : C.line2}`,
        borderRadius: 14,
        padding: '10px 6px',
        boxShadow: near ? '0 0 32px rgba(72,222,148,0.35)' : 'none',
        transition: 'background 400ms, box-shadow 400ms, border-color 400ms',
      }}
    >
      {cells.map((c, i) => (
        <div key={i} style={{ flex: 1, position: 'relative', textAlign: 'center', padding: '0 4px' }}>
          {i > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '12%',
                bottom: '12%',
                width: 1,
                background: `linear-gradient(180deg,transparent 0%,${C.line2} 35%,${near ? C.ok : C.target} 50%,${C.line2} 65%,transparent 100%)`,
                opacity: 0.55,
              }}
            />
          )}
          <div
            style={{
              fontFamily: F_MONO,
              fontSize: 9,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: c.accent ? (near ? C.ok : C.target) : C.inkDim,
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontFamily: F_DISP,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
              color: c.accent ? (near ? C.ok : C.target) : C.ink,
              lineHeight: 1.05,
              marginTop: 2,
            }}
          >
            {c.value}
          </div>
          {c.unit && (
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: -2 }}>{c.unit}</div>
          )}
        </div>
      ))}
    </div>
  );
}
