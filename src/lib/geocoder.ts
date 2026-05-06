// Бесплатный геокодер OSM Nominatim. Лимит 1 req/sec.
// Не делать авто-suggest на каждое нажатие — только по Enter / кнопке.

export type GeoResult = {
  display_name: string;
  lat: number;
  lng: number;
};

export async function searchPlace(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '0');
  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept-Language': navigator.language || 'ru,en' },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return data.map((r) => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch {
    return [];
  }
}
