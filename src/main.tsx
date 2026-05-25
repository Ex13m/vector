import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles/globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// DEV-only: симулятор GPS — патчит navigator.geolocation до рендера
if (import.meta.env.DEV) {
  const { installDevGPS } = await import('./lib/geoMock');
  installDevGPS();
}

// ── Native: диагностика safe-area ─────────────────────────────────────────
// Логируем значение env(safe-area-inset-top) для диагностики.
// Если 0 — SafeArea плагин не отработал или WebView < 140.
if (Capacitor.isNativePlatform()) {
  requestAnimationFrame(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    requestAnimationFrame(() => {
      const h = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);
      console.log('[safe-area] env(safe-area-inset-top) =', h, 'px');
      if (h === 0) {
        console.warn('[safe-area] env() returned 0 — plugin may not be injecting insets');
      }
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
