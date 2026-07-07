// Бесплатный геокодер OSM Nominatim. Лимит ~1 req/sec.
// PickScreen дебаунсит ввод на 400 мс, чтоб не превышать.

import type { LatLng } from './geo';

export type GeoResult = {
  display_name: string;
  /** Короткое название места — то что подсветить в подсказке. */
  name: string;
  /** Подзаголовок: район/город. */
  context: string;
  /** Иконка-эмодзи типа места (🏪, ☕, ⛽ и т.д.) или пусто для адресов. */
  icon: string;
  lat: number;
  lng: number;
};

const ACCEPT_LANG = (typeof navigator !== 'undefined' && navigator.language) || 'ru,en';

/** Маппинг OSM class+type → эмодзи. */
function poiIcon(cls: string, type: string): string {
  // Shops
  if (cls === 'shop') {
    if (type === 'supermarket' || type === 'convenience') return '🛒';
    if (type === 'car_repair' || type === 'car' || type === 'car_parts') return '🔧';
    if (type === 'bakery') return '🥐';
    if (type === 'pharmacy') return '💊';
    if (type === 'clothes' || type === 'fashion') return '👕';
    if (type === 'electronics') return '📱';
    return '🏪';
  }
  // Amenities
  if (cls === 'amenity') {
    if (type === 'cafe') return '☕';
    if (type === 'restaurant') return '🍽️';
    if (type === 'fast_food') return '🍔';
    if (type === 'fuel') return '⛽';
    if (type === 'bank' || type === 'atm') return '🏦';
    if (type === 'hospital' || type === 'clinic' || type === 'doctors') return '🏥';
    if (type === 'pharmacy') return '💊';
    if (type === 'parking') return '🅿️';
    if (type === 'pub' || type === 'bar') return '🍺';
    return '📍';
  }
  // Tourism/leisure
  if (cls === 'tourism') return '🏛️';
  if (cls === 'leisure') {
    if (type === 'park' || type === 'garden') return '🌳';
    if (type === 'sports_centre' || type === 'stadium') return '⚽';
    return '🎯';
  }
  // Transport
  if (cls === 'railway' || type === 'station' || type === 'halt') return '🚉';
  if (cls === 'aeroway') return '✈️';
  if (type === 'bus_stop' || type === 'bus_station') return '🚌';
  // Place/boundary — обычные адреса, без иконки
  if (cls === 'place' || cls === 'boundary' || cls === 'building' || cls === 'highway') return '';
  return '';
}

// Nominatim usage policy требует идентифицировать приложение (User-Agent).
// В Android WebView (Chromium) fetch разрешает свой User-Agent; браузеры,
// которые запрещают (Safari), молча оставят системный — тоже валидный.
declare const __APP_VERSION__: string;
const NOMINATIM_UA =
  `Vector/${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'} ` +
  '(cycling beacon app; https://github.com/Ex13m/vector)';

export type SearchOptions = {
  signal?: AbortSignal;
  /** Текущая позиция пользователя — bias ближайших результатов. */
  near?: LatLng | null;
};

export async function searchPlace(query: string, opts: SearchOptions = {}): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  // dedupe=0: показать все филиалы сетевых магазинов (Макро, Сільпо, АТБ…),
  // а не схлопывать одноимённые в один результат.
  url.searchParams.set('dedupe', '0');
  // Location bias: viewbox ~100km вокруг позиции, bounded=1 — только результаты
  // внутри региона. bounded=0 («prefer») давало результаты из других стран когда
  // Nominatim считал их релевантнее (например школа в другом городе с похожим именем).
  if (opts.near) {
    const d = 0.9; // ~100km в градусах — шире чтобы не резать пригороды
    url.searchParams.set('viewbox', `${opts.near.lng - d},${opts.near.lat + d},${opts.near.lng + d},${opts.near.lat - d}`);
    url.searchParams.set('bounded', '1');
  }
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': ACCEPT_LANG, 'User-Agent': NOMINATIM_UA }, signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      name?: string;
      class?: string;
      type?: string;
      address?: Record<string, string>;
    }>;
    return data.map((r) => {
      const parts = (r.display_name || '').split(',').map((s) => s.trim());
      const name = r.name?.trim() || parts[0] || r.display_name;
      const icon = poiIcon(r.class || '', r.type || '');
      // Для POI: адрес (улица + номер) чтобы отличить филиалы сети.
      // Для обычных адресов: район/город.
      const a = r.address || {};
      const road = [a.road, a.house_number].filter(Boolean).join(' ');
      const area = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.village || '';
      const ctx = icon && road ? `${road}, ${area}`.replace(/, $/, '') : parts.slice(1, 3).join(', ');
      return {
        display_name: r.display_name,
        name,
        context: ctx,
        icon,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      };
    });
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '17');
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': ACCEPT_LANG, 'User-Agent': NOMINATIM_UA }, signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string; display_name?: string; address?: Record<string, string> };
    if (data.name?.trim()) return data.name.trim();
    const a = data.address || {};
    const parts = [a.road, a.suburb || a.neighbourhood || a.city_district, a.city || a.town || a.village].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
    return null;
  } catch {
    return null;
  }
}
