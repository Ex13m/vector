import type { Lang } from '../i18n';

export type Settings = {
  intervalSec: number;
  units: 'metric' | 'imperial';
  haptics: boolean;
  lang: Lang;
  voiceURI: string | null;
  layer: 'std' | 'sat' | 'topo' | 'tour';
  showTrail: boolean;
};

const KEY = 'vector.settings.v1';

export const defaultSettings: Settings = {
  intervalSec: 900,
  units: 'metric',
  haptics: true,
  lang: (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en',
  voiceURI: null,
  layer: 'std',
  showTrail: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // quota / private mode: silently ignore
  }
}
