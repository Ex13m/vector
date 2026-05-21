import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vector.cycling',
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
  plugins: {},
};

export default config;
