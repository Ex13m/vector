// 02 Cache — скачивание тайлов видимой области для оффлайн.
// Дизайн: full-bleed карта, те же маркеры/вектор что на 01, auto-fit на оба,
// pinch меняет область кэширования, top-card с live-счётчиком,
// «Сохранить область» внизу, лимит 2000 тайлов, auto-skip если всё уже в кэше.

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { styleFor } from '../lib/mapStyles';
import {
  tilesForBox,
  downloadTiles,
  fmtBytes,
  bytesEstimate,
  MAX_TILES,
  type LngLatBox,
  type TilePoint,
} from '../lib/tiles';
import { tileUrl } from '../lib/mapStyles';
import { distanceM, fmtDist, type LatLng } from '../lib/geo';
import { haptic } from '../lib/feedback';
import type { Settings } from '../App';
import { C, F_DISP, F_MONO } from '../theme';

type Props = {
  settings: Settings;
  target: LatLng;
  targetName: string | null; // принимаем для единообразия с App.tsx; на этом экране не показываем
  box: LngLatBox;
  onSkip: () => void;
  onDone: () => void;
  onBack: () => void;
};

// Адаптивный диапазон зумов: «что видно — то и кэшируется». Берём 3 уровня
// вокруг текущего зума карты, чтоб лимит 2000 тайлов работал и на 50 км,
// и на 5 км — просто с разной детализацией.
function adaptiveZooms(currentZoom: number): number[] {
  const z = Math.max(8, Math.min(18, Math.round(currentZoom)));
  return [Math.max(8, z - 1), z, Math.min(18, z + 1)];
}

export default function CacheScreen({ settings, target, box, onSkip, onDone, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const distancePillRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  const [currentBox, setCurrentBox] = useState<LngLatBox>(box);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [hintHidden, setHintHidden] = useState(false);
  const [checkedAutoSkip, setCheckedAutoSkip] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // GPS — для маркера «вы».
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Map mount + initial fitBounds (вы + цель в кадре, padding 60).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [target.lng, target.lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('load', () => {
      addVectorSource(map);
      // Маркер цели — контейнер совпадает по размеру с пульсом, иконка центрована флексом.
      const tg = document.createElement('div');
      tg.style.cssText = 'position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none';
      tg.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${C.target};animation:pulse 2s infinite ease-out"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${C.target}" stroke-width="2.5" style="filter:drop-shadow(0 0 8px ${C.glow})">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="3" fill="${C.target}"/>
        </svg>`;
      targetMarkerRef.current = new maplibregl.Marker({ element: tg, anchor: 'center' }).setLngLat([target.lng, target.lat]).addTo(map);
    });

    map.on('styledata', () => {
      addVectorSource(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vector line через MapLibre source — пиксель-в-пиксель с маркерами.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const src = map.getSource('vector') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (me) {
        src.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[me.lng, me.lat], [target.lng, target.lat]] },
          properties: {},
        });
      }
    };
    update();
    map.on('styledata', update);
    return () => {
      map.off('styledata', update);
    };
  }, [me, target]);

  // Пилюля расстояния по геогр. середине.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) {
      distancePillRef.current?.remove();
      distancePillRef.current = null;
      return;
    }
    const midLng = (me.lng + target.lng) / 2;
    const midLat = (me.lat + target.lat) / 2;
    const d = fmtDist(distanceM(me, target), settings.units);
    if (!distancePillRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `background:${C.bg};border:1.5px solid ${C.target};border-radius:999px;padding:4px 12px;font-family:${F_MONO};font-size:11px;font-weight:600;color:${C.target};white-space:nowrap;pointer-events:none`;
      el.textContent = `${d.v} ${d.u}`;
      distancePillRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([midLng, midLat]).addTo(map);
    } else {
      distancePillRef.current.setLngLat([midLng, midLat]);
      distancePillRef.current.getElement().textContent = `${d.v} ${d.u}`;
    }
  }, [me, target, settings.units]);

  // Слушатель pan карты для обновления currentBox + скрытия hint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => {
      const b = map.getBounds();
      setCurrentBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
      setHintHidden(true);
    };
    map.on('move', onMove);
    return () => {
      map.off('move', onMove);
    };
  }, []);

  // FitBounds на вы + цель когда узнали GPS.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    const sw: [number, number] = [Math.min(me.lng, target.lng), Math.min(me.lat, target.lat)];
    const ne: [number, number] = [Math.max(me.lng, target.lng), Math.max(me.lat, target.lat)];
    map.fitBounds([sw, ne], { padding: 60, animate: false, maxZoom: 16 });
    // Сразу обновим box.
    const b = map.getBounds();
    setCurrentBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }, [me, target]);

  // Маркер «вы» — ромб-стрелка на цель.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      const deg = bearingPx(me, target);
      el.style.cssText = 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;position:relative;pointer-events:none';
      el.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(72,222,148,0.18)"></div>
        <svg width="26" height="26" viewBox="0 0 24 24" style="transform: rotate(${deg}deg)">
          <polygon points="12,2 18,20 12,16 6,20" fill="${C.ok}" stroke="${C.bg}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
      meMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([me.lng, me.lat]).addTo(map);
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
      const svg = meMarkerRef.current.getElement().querySelector('svg');
      if (svg) (svg as unknown as HTMLElement).style.transform = `rotate(${bearingPx(me, target)}deg)`;
    }
  }, [me, target]);

  // Слой.
  useEffect(() => {
    if (mapRef.current) mapRef.current.setStyle(styleFor(settings.layer));
  }, [settings.layer]);

  // Тайлы для текущей видимой области.
  const [mapZoom, setMapZoom] = useState<number>(12);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => setMapZoom(map.getZoom());
    update();
    map.on('zoom', update);
    map.on('moveend', update);
    return () => {
      map.off('zoom', update);
      map.off('moveend', update);
    };
  }, []);

  const zooms = useMemo(() => adaptiveZooms(mapZoom), [mapZoom]);
  const tilesPlanned = useMemo(() => tilesForBox(currentBox, zooms), [currentBox, zooms]);
  const total = tilesPlanned.length;
  const sizeBytes = bytesEstimate(total);
  const tooBig = total > MAX_TILES;

  // Auto-skip: один раз проверим, есть ли все нужные тайлы в кэше.
  useEffect(() => {
    if (checkedAutoSkip) return;
    if (!me) return; // подождём fit
    setCheckedAutoSkip(true);
    void allTilesCached(settings.layer, tilesPlanned.slice(0, 200)).then((allHave) => {
      if (allHave && tilesPlanned.length <= 200) onDone();
    });
  }, [checkedAutoSkip, me, settings.layer, tilesPlanned, onDone]);

  async function start() {
    if (tooBig) return;
    haptic('medium', settings.haptics);
    abortRef.current = new AbortController();
    setProgress({ done: 0, total });
    await downloadTiles(
      settings.layer,
      tilesPlanned,
      (done, total) => setProgress({ done, total }),
      abortRef.current.signal,
    );
    // Завершено — авто-переход.
    setTimeout(onDone, 350);
  }

  function cancel() {
    haptic('light', settings.haptics);
    abortRef.current?.abort();
    setProgress(null);
  }

  const ready = progress && progress.done >= progress.total && progress.total > 0;
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const zoomRange = `${zooms[0]}–${zooms[zooms.length - 1]}`;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, color: C.ink, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />


      {/* Top card */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top))',
          left: 12,
          right: 12,
          background: 'rgba(17,20,19,0.92)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${tooBig ? C.danger : C.line2}`,
          borderRadius: 10,
          padding: '10px 12px',
          zIndex: 10,
          transition: 'border-color 200ms',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: F_MONO,
            fontSize: 10,
            color: C.inkDim,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span>{tooBig ? 'Область слишком большая' : 'Область кэширования'}</span>
          <span style={{ color: tooBig ? C.danger : C.target }}>~{fmtBytes(sizeBytes)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: F_MONO, color: tooBig ? C.danger : C.ink, fontWeight: 500, fontSize: 13 }}>
            ~{total} тайлов
          </span>
          <span style={{ fontFamily: F_MONO, color: C.ink, fontWeight: 500, fontSize: 13 }}>zoom {zoomRange}</span>
        </div>
      </div>

      {/* Back */}
      <button
        onClick={onBack}
        aria-label="back"
        style={{
          position: 'absolute',
          left: 12,
          top: 'calc(72px + env(safe-area-inset-top))',
          width: 38,
          height: 38,
          background: 'rgba(17,20,19,0.85)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          color: C.ink,
          fontSize: 18,
          zIndex: 10,
        }}
      >
        ←
      </button>

      {/* Pinch hint */}
      {!hintHidden && !progress && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(96px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(17,20,19,0.85)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${C.line2}`,
            borderRadius: 999,
            padding: '6px 14px',
            fontFamily: F_MONO,
            fontSize: 10,
            color: C.inkDim,
            letterSpacing: '0.1em',
            zIndex: 5,
            whiteSpace: 'nowrap',
          }}
        >
          ← <span style={{ color: C.target }}>PINCH</span> расширить / сжать охват →
        </div>
      )}

      {/* Distance hint when close to target */}
      {/* Bottom CTA / progress */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 'calc(12px + env(safe-area-inset-bottom))',
          zIndex: 10,
        }}
      >
        {progress && !ready && (
          <div
            style={{
              background: 'rgba(11,13,12,0.96)',
              border: `1px solid ${C.line2}`,
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: F_MONO,
                fontSize: 11,
                color: C.inkDim,
                letterSpacing: '0.08em',
              }}
            >
              <span>
                {progress.done} / {progress.total} tiles
              </span>
              <span style={{ color: C.target }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: C.line2, borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: C.target,
                  transition: 'width 200ms linear',
                }}
              />
            </div>
          </div>
        )}

        {!progress && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                haptic('light', settings.haptics);
                onSkip();
              }}
              style={{
                width: 110,
                height: 48,
                background: 'rgba(17,20,19,0.95)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${C.line2}`,
                color: C.ink,
                borderRadius: 10,
                fontFamily: F_MONO,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Пропустить
            </button>
            <button
              onClick={start}
              disabled={tooBig}
              style={{
                flex: 1,
                height: 48,
                background: tooBig ? C.bg2 : C.target,
                color: tooBig ? C.inkDim : '#fff',
                border: tooBig ? `1px solid ${C.line2}` : 'none',
                borderRadius: 10,
                fontFamily: F_DISP,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.02em',
                boxShadow: tooBig ? 'none' : `0 0 24px ${C.glow}`,
              }}
            >
              {tooBig ? 'Слишком большая область' : 'Сохранить область'}
            </button>
          </div>
        )}

        {progress && !ready && (
          <button
            onClick={cancel}
            style={{
              width: '100%',
              height: 48,
              background: 'rgba(201,58,26,0.14)',
              color: C.danger,
              border: `1px solid rgba(201,58,26,0.4)`,
              borderRadius: 10,
              fontFamily: F_DISP,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Отмена
          </button>
        )}

        {ready && (
          <div
            style={{
              width: '100%',
              height: 48,
              background: C.ok,
              color: C.bg,
              border: 'none',
              borderRadius: 10,
              fontFamily: F_DISP,
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            ✓ Готово
          </div>
        )}
      </div>
    </div>
  );
}

function bearingPx(a: LatLng, b: LatLng): number {
  // Простой bearing (для маркера); полноценная формула не нужна на этом экране.
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function addVectorSource(map: MlMap): void {
  if (!map.getSource('vector')) {
    map.addSource('vector', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
    });
  }
  if (!map.getLayer('vector-line')) {
    map.addLayer({
      id: 'vector-line',
      type: 'line',
      source: 'vector',
      paint: {
        'line-color': C.target,
        'line-width': 2.5,
        'line-opacity': 0.85,
        'line-dasharray': [3, 2],
      },
    });
  }
}

function tileUrlVariants(layer: Parameters<typeof tileUrl>[0], z: number, x: number, y: number): string[] {
  // MapLibre чередует subdomain a/b/c — кэш может быть под любым.
  const base = tileUrl(layer, z, x, y);
  const m = base.match(/^https:\/\/([abc])\.([^/]+)/);
  if (!m) return [base];
  return ['a', 'b', 'c'].map((s) => base.replace(/^https:\/\/[abc]\./, `https://${s}.`));
}

async function allTilesCached(layer: Parameters<typeof tileUrl>[0], probe: TilePoint[]): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open('map-tiles');
    for (const t of probe) {
      const urls = tileUrlVariants(layer, t.z, t.x, t.y);
      let found = false;
      for (const u of urls) {
        if (await cache.match(u)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  } catch {
    return false;
  }
}
