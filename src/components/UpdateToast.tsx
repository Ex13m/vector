import { C, F_MONO } from '../theme';

export default function UpdateToast({ onApply }: { onApply: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(20px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(11,13,12,0.94)',
        border: `1px solid ${C.line2}`,
        color: C.ink,
        fontFamily: F_MONO,
        fontSize: 11,
        letterSpacing: '0.08em',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        animation: 'fadeUp 240ms ease',
      }}
    >
      <span style={{ textTransform: 'uppercase' }}>Доступно обновление</span>
      <button
        onClick={onApply}
        style={{
          border: 'none',
          background: C.target,
          color: C.targetInk,
          fontWeight: 700,
          fontFamily: F_MONO,
          fontSize: 11,
          letterSpacing: '0.08em',
          padding: '6px 12px',
          borderRadius: 8,
        }}
      >
        ОБНОВИТЬ
      </button>
    </div>
  );
}
