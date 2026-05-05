import { C, F_DISP } from '../theme';

type Props = { bearing: number; clock: number; near: boolean };

export default function BigClockDial({ bearing, clock, near }: Props) {
  const size = 280;
  const r = size / 2;
  const accent = near ? C.ok : C.target;
  const numbers: number[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const numR = 100;
  const tickR = 114;
  const tipR = numR - 12;
  const arrowEnd = {
    x: r + Math.sin((bearing * Math.PI) / 180) * tipR,
    y: r - Math.cos((bearing * Math.PI) / 180) * tipR,
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={r} cy={r} r={r - 4} fill="none" stroke={C.line2} strokeWidth={2} />
      {numbers.map((n, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x = r + Math.sin(a) * numR;
        const y = r - Math.cos(a) * numR + 6;
        const isCurrent = n === clock;
        return (
          <text
            key={n}
            x={x}
            y={y}
            textAnchor="middle"
            fontFamily={F_DISP}
            fontSize={n === 12 ? 22 : 18}
            fontWeight={n === 12 || isCurrent ? 700 : 500}
            fill={isCurrent ? accent : C.ink}
          >
            {n}
          </text>
        );
      })}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i * 6 * Math.PI) / 180;
        const isHour = i % 5 === 0;
        const x1 = r + Math.sin(a) * tickR;
        const y1 = r - Math.cos(a) * tickR;
        const x2 = r + Math.sin(a) * (tickR - (isHour ? 8 : 4));
        const y2 = r - Math.cos(a) * (tickR - (isHour ? 8 : 4));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isHour ? C.inkDim : C.line2} strokeWidth={isHour ? 1.4 : 0.7} />;
      })}
      <line
        x1={r}
        y1={r}
        x2={arrowEnd.x}
        y2={arrowEnd.y}
        stroke={accent}
        strokeWidth={4}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 12px ${near ? 'rgba(72,222,148,0.65)' : 'rgba(255,107,26,0.6)'})` }}
      />
      <polygon
        points={`${arrowEnd.x},${arrowEnd.y} ${arrowEnd.x - 6},${arrowEnd.y + 8} ${arrowEnd.x + 6},${arrowEnd.y + 8}`}
        fill={accent}
        transform={`rotate(${bearing} ${arrowEnd.x} ${arrowEnd.y})`}
        style={{ transformOrigin: `${arrowEnd.x}px ${arrowEnd.y}px` }}
      />
      <circle cx={r} cy={r} r={5} fill={C.ink} />
    </svg>
  );
}
