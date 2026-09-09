// Покупка полной версии через Google Play Billing.
//
// Нативная часть — BillingPlugin.java (свой плагин поверх Play Billing 9.1.0).
// Здесь только тонкая обёртка: подписка на события владения и проброс их в
// rideQuota, чтобы остальное приложение про биллинг вообще не знало.
//
// Почему свой плагин, а не готовый: для одного разового товара вся логика —
// это четыре вызова Play Billing, а любой сторонний плагин добавляет чужого
// мейнтейнера в цепочку публикации и свои сроки миграции. Разбор вариантов
// с проверкой по первоисточникам — в ROADMAP.
//
// В вебе (PWA) покупки нет: там всё бесплатно, no-op возвращает «недоступно».

import { registerPlugin, Capacitor } from '@capacitor/core';
import { setUnlocked } from './rideQuota';
import { dlog } from './diag';
import { t } from './i18n';

/** ID товара в Play Console. Изменить его после создания нельзя. */
export const PRODUCT_ID = 'vektor_full_unlock';

type Entitlement = { owned: boolean; pending: boolean; source: 'purchase' | 'query' };
type BillingError = { code: number; message: string };

export type ProductInfo = {
  productId: string;
  /** Цена уже отформатирована Play с учётом страны, валюты и налогов. */
  formattedPrice: string;
  priceMicros: number;
  currency: string;
};

interface BillingPluginApi {
  init(): Promise<{ available: boolean; reason?: string }>;
  getProduct(o: { productId: string }): Promise<ProductInfo>;
  purchase(o: { productId: string }): Promise<void>;
  restore(): Promise<{ owned: boolean; pending: boolean }>;
  addListener(
    event: 'entitlementChanged',
    cb: (e: Entitlement) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    event: 'billingError',
    cb: (e: BillingError) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Billing = registerPlugin<BillingPluginApi>('Billing');

const native = () => Capacitor.isNativePlatform();

/** Есть ли вообще магазин. В вебе покупки не существует — там всё бесплатно. */
export const billingAvailable = (): boolean => native();

/**
 * Подписчики на изменение владения.
 *
 * Play сообщает исход оплаты СОБЫТИЕМ, а не ответом на вызов purchase():
 * тот резолвится в момент открытия окна магазина, до того как человек нажал
 * «Оплатить». Без этой подписки React не узнаёт о покупке никогда — экран
 * покупки остаётся висеть после успешной оплаты, и человек нажимает «Купить»
 * второй раз.
 */
type EntitlementCb = (owned: boolean) => void;
const watchers = new Set<EntitlementCb>();

/** Подписаться на владение. Возвращает функцию отписки. */
export function onEntitlement(cb: EntitlementCb): () => void {
  watchers.add(cb);
  return () => {
    watchers.delete(cb);
  };
}

let ready = false;

/**
 * Подключиться к Play и начать слушать изменения владения.
 * Вызывать один раз при старте приложения; повторные вызовы безвредны.
 */
export async function initBilling(): Promise<boolean> {
  if (!native() || ready) return ready;
  try {
    await Billing.addListener('entitlementChanged', (e) => {
      dlog('BILL', `entitlement owned=${e.owned} pending=${e.pending} src=${e.source}`);
      // Доступ выдаём только по подтверждённой покупке. PENDING — оплата ещё
      // не прошла (например, наличными в терминале), доступа быть не должно.
      setUnlocked(e.owned);
      watchers.forEach((w) => {
        try {
          w(e.owned);
        } catch {
          // один сломанный подписчик не должен ронять остальных
        }
      });
    });
    await Billing.addListener('billingError', (e) => {
      dlog('BILL', `error ${e.code}: ${e.message}`);
    });
    const { available, reason } = await Billing.init();
    ready = available;
    dlog('BILL', `init available=${available}${reason ? ' ' + reason : ''}`);
    return available;
  } catch (e) {
    dlog('BILL', `init failed: ${String(e)}`);
    return false;
  }
}

/** Цена из Play. null, если магазин недоступен — тогда экран покажет запасной текст. */
export async function getPrice(): Promise<ProductInfo | null> {
  if (!native()) return null;
  try {
    return await Billing.getProduct({ productId: PRODUCT_ID });
  } catch (e) {
    dlog('BILL', `getProduct failed: ${String(e)}`);
    return null;
  }
}

/**
 * Открыть окно оплаты. Резолвится сразу после открытия — исход придёт
 * событием entitlementChanged, которое само обновит состояние квоты.
 */
export async function buyFullVersion(): Promise<void> {
  // Текст пойдёт человеку на экран, поэтому берём из словаря, а не хардкодим
  // по-русски: в вебе приложение так же говорит по-английски и по-немецки.
  if (!native()) throw new Error(t('paywall.webOnly'));
  await Billing.purchase({ productId: PRODUCT_ID });
}

/**
 * Восстановить покупку — после переустановки или на новом устройстве.
 * Это же единственный способ узнать о покупке без серверной части.
 */
export async function restorePurchase(): Promise<{ owned: boolean; pending: boolean }> {
  if (!native()) return { owned: false, pending: false };
  const res = await Billing.restore();
  setUnlocked(res.owned);
  return res;
}
