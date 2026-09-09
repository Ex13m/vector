/// <reference types="vite/client" />

// Версия из package.json — подставляется Vite через define (vite.config.ts).
declare const __APP_VERSION__: string;

// Версия обёртки Android (versionName из build.gradle) — пусто в чистом вебе.
declare const __NATIVE_VERSION__: string;
