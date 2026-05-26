/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { version } from './package.json';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'Vector — voice cycling beacon',
        short_name: 'Vector',
        description: 'Голосовой навигатор-маяк «по часам» вместо градусов и стрелок.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0C0B',
        theme_color: '#0A0C0B',
        categories: ['navigation', 'travel'],
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // MapLibre worker chunks могут быть >2MB (дефолт). Без этого
        // workbox молча выкидывает их из precache → офлайн ломается.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^https?:\/\//, /\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.host === 'tile.openstreetmap.org' ||
              url.host.endsWith('basemaps.cartocdn.com') ||
              url.host === 'a.tile.opentopomap.org' ||
              url.host === 'b.tile.opentopomap.org' ||
              url.host === 'c.tile.opentopomap.org' ||
              url.host === 'tile.opentopomap.org' ||
              url.host === 'server.arcgisonline.com' ||
              url.host.endsWith('tile-cyclosm.openstreetmap.fr'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 8192, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: { host: true, port: 5173 },
  // Юнит-тесты (Vitest). Чистые функции — окружение 'node', без DOM.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
