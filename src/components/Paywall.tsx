// Экран покупки полной версии. Показывается, когда бесплатные поездки кончились
// и пользователь пытается начать следующую (см. lib/rideQuota.ts).
//
// Тон намеренно мягкий: приложение ничем не урезано, человек уже проехал пять
// поездок и знает, за что платит. Кнопка «Позже» доступна один раз — дальше
// остаётся только покупка, но и она разовая, без подписки.
//
// Стиль повторяет модалку «Что нового», чтобы не плодить визуальных языков.

import { C, F_DISP, F_MONO } from '../theme';
import { t } from '../lib/i18n';
import { quotaState, LATER_BONUS } from '../lib/rideQuota';

type Props = {
  /** Запустить покупку. Экран сам не знает, как устроен биллинг. */
  onBuy: () => void;
  /** «Позже»: +2 поездки. Не передавать, если бонус уже израсходован. */
  onLater: (() => void) | null;
  /** Восстановить покупку — переустановка или новое устройство. */
  onRestore: () => void;
  /** Закрыть без действия (крестик, тап по фону). */
  onClose: () => void;
  /**
   * Цена, как её отдал Google Play (валюта и налоги зависят от страны).
   * null — магазин не ответил; тогда кнопка обходится без суммы, потому что
   * показывать цифру, которой не подтвердил Play, нельзя.
   */
  price?: string | null;
  /** Идёт обращение к Google Play — блокируем повторные нажатия. */
  busy?: boolean;
  /** Текст ошибки от биллинга, если покупка не удалась. */
  error?: string | null;
};

export default function Paywall({
  onBuy, onLater, onRestore, onClose, price = null, busy = false, error = null,
}: Props) {
  const { ridesDone } = quotaState();

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.66)',
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
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.target, letterSpacing: '0.08em', marginBottom: 8 }}>
          {t('paywall.ridesUsed').replace('{n}', String(ridesDone))}
        </div>

        <div style={{ fontFamily: F_DISP, fontSize: 22, fontWeight: 600, color: C.ink, marginBottom: 10 }}>
          {t('paywall.title')}
        </div>

        <div style={{ fontFamily: F_DISP, fontSize: 14, color: C.inkDim, lineHeight: 1.5, marginBottom: 20 }}>
          {t('paywall.body')}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              fontFamily: F_MONO, fontSize: 11, lineHeight: 1.5, color: '#FF8A6B',
              border: '1px solid rgba(255,138,107,0.35)', borderRadius: 10,
              padding: '9px 11px', marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={onBuy}
          disabled={busy}
          style={{
            width: '100%',
            height: 50,
            background: C.target,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontFamily: F_DISP,
            fontSize: 15,
            fontWeight: 700,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t('paywall.working') : price ? `${t('paywall.buy')} — ${price}` : t('paywall.buy')}
        </button>

        {onLater && (
          <button
            onClick={onLater}
            disabled={busy}
            style={{
              width: '100%',
              height: 44,
              marginTop: 10,
              background: 'none',
              color: C.inkDim,
              border: `1px solid ${C.line2}`,
              borderRadius: 12,
              fontFamily: F_DISP,
              fontSize: 14,
            }}
          >
            {t('paywall.later').replace('{n}', String(LATER_BONUS))}
          </button>
        )}

        {/* Восстановление обязано быть на виду: после переустановки или на новом
            устройстве это единственный способ вернуть оплаченный доступ. */}
        <button
          onClick={onRestore}
          disabled={busy}
          style={{
            width: '100%',
            height: 38,
            marginTop: 8,
            background: 'none',
            color: C.target,
            border: 'none',
            fontFamily: F_DISP,
            fontSize: 13,
          }}
        >
          {t('paywall.restore')}
        </button>

        <div
          style={{
            fontFamily: F_MONO, fontSize: 10, color: C.inkDim, letterSpacing: '0.04em',
            textAlign: 'center', marginTop: 8, lineHeight: 1.6,
          }}
        >
          {t('paywall.oneTime')}
        </div>
      </div>
    </div>
  );
}
