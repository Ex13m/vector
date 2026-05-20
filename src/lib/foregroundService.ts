// Capacitor Foreground Service — keeps the app alive with screen off.
//
// On native Android: starts a persistent notification with foregroundServiceType="location"
// so the OS won't kill our process. GPS + voice guidance keep working in the background.
//
// On web (PWA): no-op. The existing wakeAudio hack handles background as best it can.

import { Capacitor } from '@capacitor/core';

let _running = false;

/** True when running inside a native Capacitor shell (Android APK) */
export const isNative = Capacitor.isNativePlatform();

/**
 * Start the foreground service. Call when the ride begins.
 * Safe to call on web — silently no-ops.
 */
export async function startForegroundService(): Promise<void> {
  if (_running || !isNative) return;

  try {
    // Dynamic import — tree-shaken on web, only loaded in native APK
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );

    await ForegroundService.startForegroundService({
      id: 7001,
      title: 'Vector',
      body: 'Navigation active — guiding you to the target',
      smallIcon: 'ic_stat_vector',
      buttons: [
        {
          title: 'Stop',
          id: 1,
        },
      ],
    });

    _running = true;
  } catch (e) {
    console.warn('[ForegroundService] start failed:', e);
  }
}

/**
 * Update the notification body (e.g. distance remaining).
 */
export async function updateForegroundService(body: string): Promise<void> {
  if (!_running || !isNative) return;

  try {
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );

    await ForegroundService.updateForegroundService({
      id: 7001,
      title: 'Vector',
      body,
      smallIcon: 'ic_stat_vector',
    });
  } catch {
    // non-critical
  }
}

/**
 * Stop the foreground service. Call when the ride ends or user exits.
 * Safe to call multiple times / on web.
 */
export async function stopForegroundService(): Promise<void> {
  if (!_running || !isNative) return;

  try {
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );

    await ForegroundService.stopForegroundService();
    _running = false;
  } catch (e) {
    console.warn('[ForegroundService] stop failed:', e);
    _running = false;
  }
}

/** Whether the foreground service is currently running */
export function isForegroundServiceRunning(): boolean {
  return _running;
}
