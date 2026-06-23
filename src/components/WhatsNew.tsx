// Модалка «Что нового» — показывается ОДИН раз после обновления (см. логику в
// PickScreen: только если была прошлая версия, и только после первого GPS-фикса,
// чтобы не наложиться на запрос разрешения GPS на первом запуске).

import { C, F_DISP, F_MONO } from '../theme';
import { t, type UiLang } from '../lib/i18n';
import { RELEASE_NOTES } from '../lib/releaseNotes';

export default function WhatsNew({ lang, onClose }: { lang: UiLang; onClose: () => void }) {
  const notes = RELEASE_NOTES[lang] ?? RELEASE_NOTES.en;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          background: C.bg,
          border: `1px solid ${C.line2}`,
          borderRadius: 20,
          padding: '22px 20px calc(18px + env(safe-area-inset-bottom))',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          animation: 'fadeUp 240ms ease',
        }}
      >
        <div style={{ fontFamily: F_DISP, fontSize: 22, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
          {t('whatsNew.title')}
        </div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.target, letterSpacing: '0.08em', marginBottom: 18 }}>
          v{__APP_VERSION__}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          {notes.map((n, i) => (
            <div key={i} style={{ fontFamily: F_DISP, fontSize: 14, color: C.ink, lineHeight: 1.45 }}>
              {n}
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: 46,
            background: C.target,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontFamily: F_DISP,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {t('whatsNew.gotIt')}
        </button>
      </div>
    </div>
  );
}
