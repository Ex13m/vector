// Мягкое обновление приложения из Google Play (In-App Updates).
//
// Нативная часть — AppUpdatePlugin.java. Здесь только тонкая обёртка.
//
// Зачем это нужно, если Play обновляет сам: автообновление приходит когда
// придёт — по Wi-Fi, на зарядке, в окно обслуживания, — и версия на телефоне
// может неделями отставать. Здесь проверка происходит при каждом запуске.
//
// Режим только мягкий: Play скачивает в фоне, приложением можно пользоваться,
// и лишь по готовности файла показывается полоска «Перезапустить». Жёсткий
// режим (полноэкранный прогресс с блокировкой) для велонавигатора не годится —
// человек в этот момент может стоять на перекрёстке и хотеть поехать.
//
// В вебе (PWA) обновление приезжает через service worker — это другой
// механизм, живёт в App.tsx рядом. Здесь для веба честный no-op.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { dlog } from './diag';

type UpdateState = { available: boolean; downloaded: boolean; reason?: string };

interface AppUpdatePluginApi {
  check(): Promise<UpdateState>;
  start(): Promise<{ started: boolean; reason?: string }>;
  complete(): Promise<{ completed: boolean }>;
  addListener(
    event: 'updateDownloaded',
    cb: (e: { ready: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const AppUpdate = registerPlugin<AppUpdatePluginApi>('AppUpdate');

const native = () => Capacitor.isNativePlatform();

/**
 * Спросить Play про обновление и, если оно есть, начать фоновую загрузку.
 *
 * `onReady` вызывается, когда файл скачан и приложение можно перезапускать —
 * либо сразу, если он скачался в прошлый раз, а человек так и не перезапустил.
 *
 * Возвращает функцию отписки. Ошибки не выбрасываются наружу: нет Play, нет
 * сети, установка не из маркета — это не повод ломать запуск приложения.
 */
export function watchAppUpdate(onReady: () => void): () => void {
  if (!native()) return () => undefined;

  let alive = true;
  let unlisten: (() => void) | null = null;

  void AppUpdate.addListener('updateDownloaded', () => {
    if (alive) onReady();
  })
    .then((handle) => {
      // Пока ждали подписку, могли уже отписаться — тогда снимаем сразу.
      if (!alive) void handle.remove();
      else unlisten = () => void handle.remove();
    })
    .catch((e: unknown) => dlog('UPD', `listener failed: ${String(e)}`));

  void AppUpdate.check()
    .then((r) => {
      dlog('UPD', `check available=${r.available} downloaded=${r.downloaded}${r.reason ? ' ' + r.reason : ''}`);
      if (r.downloaded) {
        if (alive) onReady();
        return;
      }
      if (!r.available) return;
      return AppUpdate.start().then((s) =>
        dlog('UPD', `start=${s.started}${s.reason ? ' ' + s.reason : ''}`),
      );
    })
    .catch((e: unknown) => dlog('UPD', `check failed: ${String(e)}`));

  return () => {
    alive = false;
    if (unlisten) unlisten();
  };
}

/** Установить скачанное обновление. Приложение при этом перезапускается. */
export async function applyAppUpdate(): Promise<void> {
  if (!native()) return;
  try {
    const r = await AppUpdate.complete();
    dlog('UPD', `complete=${r.completed}`);
  } catch (e) {
    dlog('UPD', `complete failed: ${String(e)}`);
  }
}
