// SplashScreen — экран при холодном запуске.
// 1) Тёмный фон, иконка проявляется (scale 0.85→1, opacity 0→1)
// 2) Glow расцветает за иконкой
// 3) Splash «просветляется» (fade out 600ms) → раскрывает PickScreen

import { useEffect, useState } from 'react';
import { C, F_DISP } from '../theme';

type Props = { onDone: () => void };

const DURATION_MS = 1700;

export default function SplashScreen({ onDone }: Props) {
  const [fadingOut, setFadingOut] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    // Запуск fade-out через DURATION_MS
    const t1 = window.setTimeout(() => setFadingOut(true), DURATION_MS);
    // Полный анмаунт после анимации fade-out (600ms)
    const t2 = window.setTimeout(() => {
      setUnmounted(true);
      onDone();
    }, DURATION_MS + 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  if (unmounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: C.bg,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: fadingOut ? 'none' : 'auto',
      }}
    >
      {/* Glow за иконкой */}
      <div
        style={{
          position: 'absolute',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.glow} 0%, transparent 60%)`,
          filter: 'blur(20px)',
          opacity: 0,
          animation: 'splashGlow 1400ms 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      />

      {/* Иконка */}
      <div
        style={{
          width: 140,
          height: 140,
          opacity: 0,
          transform: 'scale(0.85)',
          animation: 'splashIconIn 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        <VectorIconSvg />
      </div>

      {/* Wordmark */}
      <div
        style={{
          marginTop: 28,
          fontFamily: F_DISP,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '0.32em',
          color: C.ink,
          opacity: 0,
          animation: 'splashTextIn 800ms 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        VECTOR
      </div>

      <div
        style={{
          marginTop: 10,
          fontFamily: F_DISP,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.4em',
          color: C.inkDim,
          opacity: 0,
          animation: 'splashTextIn 800ms 750ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        VOICE CYCLING BEACON
      </div>

      <style>{`
        @keyframes splashIconIn {
          0%   { opacity: 0; transform: scale(0.85); }
          60%  { opacity: 1; transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashGlow {
          0%   { opacity: 0; transform: scale(0.6); }
          70%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0.7; transform: scale(1); }
        }
        @keyframes splashTextIn {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashSweep {
          0%   { transform: rotate(-30deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes splashRingDraw {
          0%   { stroke-dashoffset: 980; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes splashCorePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

// Inline SVG — те же элементы что в /public/icon.svg, но с анимацией
// отдельных частей (кольца чертятся, стрелка проявляется со sweep).
function VectorIconSvg() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%">
      {/* Тёмный квадрат-фон (как в icon.svg) */}
      <rect width="512" height="512" rx="96" fill="#0A0C0B" />

      {/* Внешнее кольцо — чертится */}
      <circle
        cx="256" cy="256" r="156"
        fill="none" stroke="#1F2422" strokeWidth="2"
        strokeDasharray="980"
        style={{ animation: 'splashRingDraw 1100ms 200ms ease-out forwards', opacity: 0 }}
      />
      {/* Внутреннее кольцо — чертится с задержкой */}
      <circle
        cx="256" cy="256" r="118"
        fill="none" stroke="#2A302D" strokeWidth="1.5"
        strokeDasharray="740"
        style={{ animation: 'splashRingDraw 900ms 400ms ease-out forwards', opacity: 0 }}
      />

      {/* Cardinal marks (12/6/9/3) — fade in */}
      <g stroke="#FF6B1A" strokeWidth="6" strokeLinecap="round"
        style={{ opacity: 0, animation: 'splashTextIn 500ms 600ms ease-out forwards' }}>
        <line x1="256" y1="80" x2="256" y2="130" />
        <line x1="256" y1="382" x2="256" y2="432" />
        <line x1="80" y1="256" x2="130" y2="256" />
        <line x1="382" y1="256" x2="432" y2="256" />
      </g>

      {/* Центральный «прицел» */}
      <circle cx="256" cy="256" r="18"
        fill="none" stroke="#FF6B1A" strokeWidth="6"
        style={{ opacity: 0, animation: 'splashTextIn 400ms 800ms ease-out forwards' }}
      />
      <circle cx="256" cy="256" r="6" fill="#FF6B1A"
        style={{
          opacity: 0,
          transformOrigin: '256px 256px',
          animation: 'splashTextIn 300ms 900ms ease-out forwards, splashCorePulse 1800ms 1200ms ease-in-out infinite',
        }}
      />

      {/* Стрелка-вектор — sweep из 0 в конечный угол */}
      <g style={{
        transformOrigin: '256px 256px',
        opacity: 0,
        animation: 'splashTextIn 500ms 1000ms ease-out forwards, splashSweep 700ms 1000ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      }}>
        <line x1="256" y1="256" x2="350" y2="190"
          stroke="#FF6B1A" strokeWidth="8" strokeLinecap="round" />
        <polygon points="350,190 332,200 340,178" fill="#FF6B1A" />
      </g>
    </svg>
  );
}
