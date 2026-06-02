import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.konsalting.vektor',
  appName: 'Vector',
  webDir: 'dist',
  // Bundled mode: web assets inside APK, no server needed.
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0A0C0B',
    // CRITICAL for background GPS: legacy bridge prevents WebView from
    // halting location updates after ~5 minutes when screen is off.
    // Without this, @capgo/background-geolocation stops firing callbacks.
    useLegacyBridge: true,
  },
  plugins: {
    // Отключаем встроенную обработку insets — приложение рисуется на весь
    // экран (edge-to-edge, принудительно на Android 15+). Отступы от
    // статусбара/навбара — через CSS env(safe-area-inset-*).
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
