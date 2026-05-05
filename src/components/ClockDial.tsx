import { C } from '../theme';

type Props = { bearing: number; size?: number; pulse?: boolean; near?: boolean };

export default function ClockDial({ bearing, size = 56, pulse = false, near = false }: Props) {
  const r = size / 2;
  const ticks: number[] = [];
  for (let i = 0; i < 60; i++) ticks.push(i);
  const accent = near ? C.ok : C.target;
  const tipR = r - 6;
  const arrowEnd = {
    x: r + Math.sin((bearing * Math.PI) / 180) * tipR,
    y: r - Math.cos((bearing * Math.PI) / 180) * tipR,
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={r} cy={r} r={r - 1} fill="rgba(11,13,12,0.88)" stroke={C.line2} strokeWidth={1} />
      {ticks.map((i) => {
        const a = (i * 6 * Math.PI) / 180;
        const isHour = i % 5 === 0;
        const len = isHour ? 4.5 : 2;
        const x1 = r + Math.sin(a) * (r - 2);
        const y1 = r - Math.cos(a) * (r - 2);
        const x2 = r + Math.sin(a) * (r - 2 - len);
        const y2 = r - Math.cos(a) * (r - 2 - len);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={isHour ? C.ink : C.inkDim}
            strokeWidth={isHour ? 1.4 : 0.7}
          />
        );
      })}
      <circle cx={r} cy={3} r={1.4} fill={C.ink} />
      <line
        x1={r}
        y1={r}
        x2={arrowEnd.x}
        y2={arrowEnd.y}
        stroke={accent}
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: pulse ? `drop-shadow(0 0 6px ${near ? 'rgba(72,222,148,0.6)' : 'rgba(255,107,26,0.6)'})` : undefined }}
      />
      <circle cx={arrowEnd.x} cy={arrowEnd.y} r={2.4} fill={accent} />
      <circle cx={r} cy={r} r={1.8} fill={C.ink} />
    </svg>
  );
}
