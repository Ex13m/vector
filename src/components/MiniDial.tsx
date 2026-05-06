import { C } from '../theme';

type Props = { bearingRel: number; near?: boolean };

export default function MiniDial({ bearingRel, near = false }: Props) {
  const S = 56;
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 2;
  const accent = near ? C.ok : C.target;
  const ticks: React.ReactElement[] = [];
  for (let i = 0; i < 12; i++) {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    const major = i % 3 === 0;
    const r1 = R - (major ? 6 : 3.5);
    const r2 = R - 1.5;
    ticks.push(
      <line
        key={i}
        x1={cx + Math.cos(a) * r1}
        y1={cy + Math.sin(a) * r1}
        x2={cx + Math.cos(a) * r2}
        y2={cy + Math.sin(a) * r2}
        stroke={major ? C.ink : C.inkDim}
        strokeWidth={major ? 1.4 : 0.9}
        strokeLinecap="round"
      />,
    );
  }
  const aRad = ((bearingRel - 90) * Math.PI) / 180;
  const tipX = cx + Math.cos(aRad) * (R - 7);
  const tipY = cy + Math.sin(aRad) * (R - 7);
  return (
    <div
      style={{
        width: S,
        height: S,
        borderRadius: '50%',
        background: 'rgba(11,13,12,0.88)',
        border: `1px solid ${C.line2}`,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        {ticks}
        <circle cx={cx} cy={cy - R + 4} r="1.4" fill={C.ink} />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <circle cx={tipX} cy={tipY} r="2.2" fill={accent} />
        <circle cx={cx} cy={cy} r="1.8" fill={C.ink} />
      </svg>
    </div>
  );
}
