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
  },
  plugins: {},
};

export default config;
