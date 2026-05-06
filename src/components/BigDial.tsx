import { C, F_DISP } from '../theme';

type Props = { bearingRel: number; clockText: string; near?: boolean };

export default function BigDial({ bearingRel, clockText, near = false }: Props) {
  const S = 280;
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 4;
  const accent = near ? C.ok : C.target;
  const numbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const numR = R - 32;
  const tickR = R - 14;
  const ticks: React.ReactElement[] = [];
  for (let i = 0; i < 60; i++) {
    const a = ((i * 6 - 90) * Math.PI) / 180;
    const major = i % 5 === 0;
    const x1 = cx + Math.cos(a) * tickR;
    const y1 = cy + Math.sin(a) * tickR;
    const x2 = cx + Math.cos(a) * (tickR - (major ? 8 : 4));
    const y2 = cy + Math.sin(a) * (tickR - (major ? 8 : 4));
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={major ? C.inkDim : C.line2}
        strokeWidth={major ? 1.4 : 0.7}
      />,
    );
  }
  const aRad = ((bearingRel - 90) * Math.PI) / 180;
  const tipR = numR - 18;
  const tipX = cx + Math.cos(aRad) * tipR;
  const tipY = cy + Math.sin(aRad) * tipR;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line2} strokeWidth={2} />
        {ticks}
        {numbers.map((n, i) => {
          const a = ((i * 30 - 90) * Math.PI) / 180;
          return (
            <text
              key={n}
              x={cx + Math.cos(a) * numR}
              y={cy + Math.sin(a) * numR + 6}
              textAnchor="middle"
              fontFamily={F_DISP}
              fontSize={n === 12 ? 22 : 18}
              fontWeight={n === 12 ? 700 : 500}
              fill={C.ink}
            >
              {n}
            </text>
          );
        })}
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 14px ${near ? 'rgba(72,222,148,0.6)' : 'rgba(255,107,26,0.6)'})` }}
        />
        <circle cx={tipX} cy={tipY} r={5} fill={accent} />
        <circle cx={cx} cy={cy} r={6} fill={C.ink} />
      </svg>
      <div
        style={{
          fontFamily: F_DISP,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          color: accent,
          textShadow: `0 0 24px ${near ? C.okGlow : C.glow}`,
        }}
      >
        {clockText}
      </div>
    </div>
  );
}
