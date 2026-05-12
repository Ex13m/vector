// Бесплатный геокодер OSM Nominatim. Лимит ~1 req/sec.
// PickScreen дебаунсит ввод на 400 мс, чтоб не превышать.

export type GeoResult = {
  display_name: string;
  /** Короткое название места — то что подсветить в подсказке. */
  name: string;
  /** Подзаголовок: район/город. */
  context: string;
  lat: number;
  lng: number;
};

const ACCEPT_LANG = (typeof navigator !== 'undefined' && navigator.language) || 'ru,en';

export async function searchPlace(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': ACCEPT_LANG }, signal });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      name?: string;
      address?: Record<string, string>;
    }>;
    return data.map((r) => {
      const parts = (r.display_name || '').split(',').map((s) => s.trim());
      const name = r.name?.trim() || parts[0] || r.display_name;
      const ctx = parts.slice(1, 3).join(', ');
      return {
        display_name: r.display_name,
        name,
        context: ctx,
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
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': ACCEPT_LANG }, signal });
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
