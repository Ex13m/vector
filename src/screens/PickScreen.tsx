// 01 Pick — выбор цели на карте.
// Дизайн: full-bleed карта, компактный topbar (поиск + слой + ★),
// подсказки внутри той же капсулы что поиск, оранжевый пунктир «вы → цель»
// с пилюлей расстояния, ромб-стрелка «вы» (поворот на цель),
// оранжевый прицел цели с pulse + drag по long-press,
// карточка снизу с reverse-geocode названием.

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { resumeWakeAudio } from '../lib/wakeAudio';
import { styleFor, type Layer } from '../lib/mapStyles';
import { searchPlace, reverseGeocode, type GeoResult } from '../lib/geocoder';
import {
  listTargets,
  saveTarget,
  deleteTarget,
  listTrips,
  deleteTrip,
  tripToGpx,
  type SavedTarget,
  type Trip,
  type TrailPoint,
} from '../lib/storage';
import { bearingTo, distanceM, fmtDist, type LatLng } from '../lib/geo';
import type { Settings } from '../App';
import type { LngLatBox } from '../lib/tiles';
import { haptic } from '../lib/feedback';
import { needsIosPermission, requestIosPermission } from '../lib/orientation';
import { C, F_DISP, F_MONO } from '../theme';

type Props = {
  settings: Settings;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onConfirm: (target: LatLng, name: string | null, box: LngLatBox) => void;
  onResumeTrip: (target: LatLng, trail: TrailPoint[]) => void;
  /** Открыть Saved sheet сразу на табе «Поездки» (из Журнала на Arrived). */
  openJournal?: boolean;
  onJournalConsumed?: () => void;
};

export default function PickScreen({
  settings,
  onSettings,
  onSettingsChange,
  onConfirm,
  onResumeTrip,
  openJournal = false,
  onJournalConsumed,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  // targetMarkerRef — прозрачный drag-хэндл поверх circle layer.
  const targetMarkerRef = useRef<Marker | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const meArrowRef = useRef<SVGElement | null>(null);
  const distancePillRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [target, setTarget] = useState<LatLng | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [showFavSheet, setShowFavSheet] = useState(false);
  const [favSheetTab, setFavSheetTab] = useState<'targets' | 'trips'>('targets');
  const [layerOpen, setLayerOpen] = useState(false);
  const [saved, setSaved] = useState<SavedTarget[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const dragTimerRef = useRef<number | null>(null);

  // GPS — пользовательская точка.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Компас с LPF — сглаживаем шум сенсора, обрабатываем wraparound 0/360.
  useEffect(() => {
    let smoothed = NaN;
    let raf = 0;
    const handle = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      let h: number;
      if (ios != null && ios >= 0) {
        h = ios;
      } else if (e.alpha != null) {
        h = (360 - e.alpha) % 360;
      } else return;
      if (Number.isNaN(smoothed)) {
        smoothed = h;
      } else {
        let diff = h - smoothed;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        smoothed = (smoothed + 0.12 * diff + 360) % 360;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCompassHeading(Math.round(smoothed * 10) / 10));
    };
    window.addEventListener('deviceorientationabsolute', handle as EventListener, true);
    window.addEventListener('deviceorientation', handle as EventListener, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener, true);
      window.removeEventListener('deviceorientation', handle as EventListener, true);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Карта.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = me ?? { lat: 55.7558, lng: 37.6176 };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [start.lng, start.lat],
      zoom: me ? 15 : 4,
      bearing: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('click', (e) => {
      haptic('light', true);
      // Closе подсказки и поповеры на тап по карте.
      setSuggestOpen(false);
      setLayerOpen(false);
      setTarget({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('load', () => {
      map.setBearing(0);
      addVectorSource(map);
      addTargetSource(map);
    });

    map.on('styledata', () => {
      map.setBearing(0);
      addVectorSource(map);
      addTargetSource(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Слой.
  useEffect(() => {
    if (mapRef.current) mapRef.current.setStyle(styleFor(settings.layer));
  }, [settings.layer]);

  // Маркер «вы» — ромб-стрелка с поворотом на цель (или фиксированный «вверх» если нет цели).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:32px;height:32px;pointer-events:none';
      el.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(72,222,148,0.15);box-shadow:0 0 0 5px rgba(72,222,148,0.08),0 0 14px rgba(72,222,148,0.4)"></div>
        <svg width="26" height="26" viewBox="0 0 24 24"
             style="position:absolute;left:3px;top:3px;transform:rotate(0deg);transition:transform 200ms ease-out">
          <polygon points="12,2 18,20 12,16 6,20" fill="${C.ok}" stroke="${C.bg}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
      meArrowRef.current = el.querySelector('svg');
      meMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([me.lng, me.lat]).addTo(map);
      map.flyTo({ center: [me.lng, me.lat], zoom: 15, bearing: 0, duration: 800 });
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me]);

  // Поворот стрелки на цель.
  useEffect(() => {
    const svg = meArrowRef.current;
    if (!svg) return;
    let deg = 0;
    if (me && target) deg = bearingTo(me, target);
    (svg as unknown as HTMLElement).style.transform = `rotate(${deg}deg)`;
  }, [me, target]);

  // Маркер цели: визуал — circle layer на canvas (гарантированно виден),
  // drag — прозрачный DOM-хэндл поверх.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Убираем старый drag-хэндл.
    targetMarkerRef.current?.remove();
    targetMarkerRef.current = null;

    // Обновляем GeoJSON source цели (создаётся в addTargetSource).
    const updateTargetLayer = () => {
      const src = map.getSource('target-pt') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (target) {
        src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [target.lng, target.lat] }, properties: {} });
      } else {
        src.setData({ type: 'FeatureCollection', features: [] });
      }
    };
    updateTargetLayer();
    map.on('styledata', updateTargetLayer);

    if (!target) return () => { map.off('styledata', updateTargetLayer); };

    // Прозрачный drag-хэндл — 48×48 px, нет визуала, только для drag.
    const el = document.createElement('div');
    el.style.cssText = 'width:48px;height:48px;cursor:grab;opacity:0;';
    const marker = new maplibregl.Marker({ element: el, draggable: false, anchor: 'center' })
      .setLngLat([target.lng, target.lat])
      .addTo(map);
    targetMarkerRef.current = marker;

    const onDown = () => {
      if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
      dragTimerRef.current = window.setTimeout(() => {
        marker.setDraggable(true);
        el.style.cursor = 'grabbing';
        if (navigator.vibrate) navigator.vibrate(30);
      }, 380);
    };
    const onUp = () => {
      if (dragTimerRef.current) {
        window.clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      marker.setDraggable(false);
      el.style.cursor = 'grab';
      setTarget({ lat: ll.lat, lng: ll.lng });
    });

    return () => {
      map.off('styledata', updateTargetLayer);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
      marker.remove();
    };
  }, [target]);

  // Reverse-geocode названия цели.
  useEffect(() => {
    setTargetName(null);
    if (!target) return;
    reverseAbortRef.current?.abort();
    const ac = new AbortController();
    reverseAbortRef.current = ac;
    void reverseGeocode(target.lat, target.lng, ac.signal).then((n) => {
      if (!ac.signal.aborted) setTargetName(n);
    });
    return () => ac.abort();
  }, [target]);

  // Загрузка saved/trips на открытие шита.
  useEffect(() => {
    void listTargets().then(setSaved);
    void listTrips().then(setTrips);
  }, [showFavSheet]);

  // Открыть sheet на табе «Поездки» если пришли с кнопки «Журнал».
  useEffect(() => {
    if (!openJournal) return;
    setFavSheetTab('trips');
    setShowFavSheet(true);
    onJournalConsumed?.();
  }, [openJournal, onJournalConsumed]);

  // Debounced suggestions.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = search.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      void searchPlace(q, { signal: ac.signal, near: me }).then((r) => {
        if (!ac.signal.aborted) setSuggestions(r);
      });
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search, me]);

  // Esc → скрыть подсказки.
  useEffect(() => {
    if (!suggestOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSuggestOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [suggestOpen]);

  // Vector line — теперь MapLibre source. Обновляется на каждое me/target.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const src = map.getSource('vector') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (me && target) {
        src.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[me.lng, me.lat], [target.lng, target.lat]] },
          properties: {},
        });
      } else {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
      }
    };
    update();
    map.on('styledata', update);
    return () => {
      map.off('styledata', update);
    };
  }, [me, target]);

  // Пилюля расстояния — Marker по геогр. середине.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!me || !target) {
      distancePillRef.current?.remove();
      distancePillRef.current = null;
      return;
    }
    const midLng = (me.lng + target.lng) / 2;
    const midLat = (me.lat + target.lat) / 2;
    const distM = distanceM(me, target);
    const d = fmtDist(distM, settings.units);
    if (!distancePillRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `background:${C.bg};border:1.5px solid ${C.target};border-radius:999px;padding:4px 12px;font-family:${F_MONO};font-size:11px;font-weight:600;color:${C.target};white-space:nowrap;pointer-events:none`;
      el.textContent = `${d.v} ${d.u}`;
      distancePillRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([midLng, midLat]).addTo(map);
    } else {
      distancePillRef.current.setLngLat([midLng, midLat]);
      const el = distancePillRef.current.getElement();
      el.textContent = `${d.v} ${d.u}`;
    }
  }, [me, target, settings.units]);

  const distM = me && target ? distanceM(me, target) : 0;
  const dist = me && target ? fmtDist(distM, settings.units) : null;

  function pickSuggestion(r: GeoResult) {
    haptic('light', settings.haptics);
    setTarget({ lat: r.lat, lng: r.lng });
    setTargetName(r.name);
    setSuggestions([]);
    setSearch('');
    setSuggestOpen(false);
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 14, duration: 800 });
  }

  function pickSavedTarget(s: SavedTarget) {
    haptic('light', settings.haptics);
    setTarget({ lat: s.lat, lng: s.lng });
    setTargetName(s.name);
    setShowFavSheet(false);
    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 14, duration: 800 });
  }

  function start() {
    if (!target || !mapRef.current) return;
    haptic('medium', settings.haptics);
    resumeWakeAudio(); // <-- внутри жеста: запускаем фоновый аудио здесь
    const b = mapRef.current.getBounds();
    onConfirm(target, targetName, {
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
    });
  }

  async function saveCurrent() {
    if (!target) return;
    haptic('light', settings.haptics);
    const def = targetName ?? 'Точка';
    const name = window.prompt('Название точки:', def);
    if (!name) return;
    await saveTarget({
      id: String(Date.now()),
      name: name.trim().slice(0, 60),
      lat: target.lat,
      lng: target.lng,
      createdAt: Date.now(),
    });
    setSaved(await listTargets());
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, color: C.ink, overflow: 'hidden' }}>
      {/* Map fills the screen */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Top bar: поиск + слой + ★ */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top))',
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          zIndex: 10,
        }}
      >
        {/* Search capsule (с подсказками внутри) */}
        <div
          style={{
            flex: 1,
            background: 'rgba(17,20,19,0.85)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${C.line2}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}
          onClick={() => setSuggestOpen(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
            <SearchIcon active={search.length > 0} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              placeholder="Введите цель"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: C.ink,
                fontFamily: F_DISP,
                fontSize: 13,
                minWidth: 0,
              }}
            />
          </div>
          {suggestOpen && suggestions.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.line}`, background: 'rgba(11,13,12,0.96)' }}>
              {suggestions.map((r, i) => (
                <SuggestionRow
                  key={`${r.lat}-${r.lng}-${i}`}
                  query={search.trim()}
                  result={r}
                  distFromMe={me ? distanceM(me, { lat: r.lat, lng: r.lng }) : null}
                  units={settings.units}
                  divider={i < suggestions.length - 1}
                  onClick={() => pickSuggestion(r)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Layer button */}
        <div style={{ position: 'relative' }}>
          <IconButton
            onClick={() => {
              setLayerOpen((v) => !v);
              setSuggestOpen(false);
            }}
            active={layerOpen}
            ariaLabel="layer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="2,8 12,3 22,8 12,13" />
              <polyline points="2,16 12,21 22,16" />
            </svg>
          </IconButton>
          {layerOpen && (
            <LayerPopover
              layer={settings.layer}
              onPick={(l) => {
                onSettingsChange({ layer: l });
                setLayerOpen(false);
              }}
            />
          )}
        </div>

        {/* Star (favorites) */}
        <IconButton
          onClick={() => {
            setShowFavSheet(true);
            setSuggestOpen(false);
            setLayerOpen(false);
          }}
          ariaLabel="favorites"
          color={C.target}
        >
          ★
        </IconButton>
      </div>

      {/* Мини-компас */}
      <div
        onClick={async () => { if (needsIosPermission()) await requestIosPermission(); }}
        style={{
          position: 'absolute',
          top: 62,
          right: 12,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(17,20,19,0.85)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${C.line2}`,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 28,
            height: 28,
            transform: compassHeading !== null ? `rotate(${-compassHeading}deg)` : undefined,
            transition: compassHeading !== null ? 'transform 120ms linear' : 'none',
          }}
        >
          <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', fontFamily: F_MONO, fontSize: 9, fontWeight: 700, color: C.target, lineHeight: '10px' }}>N</span>
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 3, height: 8, background: C.target, borderRadius: '2px 2px 0 0' }} />
          <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: 'rgba(17,20,19,0.9)', border: `1px solid ${C.line2}` }} />
          <div style={{ position: 'absolute', top: 21, left: '50%', transform: 'translateX(-50%)', width: 3, height: 7, background: C.inkDim, borderRadius: '0 0 2px 2px' }} />
        </div>
      </div>

      {/* Settings (внизу слева, не в спеке — но нужен доступ) */}
      <button
        onClick={onSettings}
        aria-label="settings"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 'calc(96px + env(safe-area-inset-bottom))',
          width: 38,
          height: 38,
          background: 'rgba(17,20,19,0.85)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          color: C.ink,
          fontSize: 16,
          zIndex: 5,
        }}
      >
        ⚙
      </button>

      {/* Bottom card / CTA */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 'calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(17,20,19,0.96)',
          backdropFilter: 'blur(14px)',
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          padding: '12px 14px',
          zIndex: 8,
        }}
      >
        {target ? (
          <>
            <div
              style={{
                fontFamily: F_MONO,
                fontSize: 9.5,
                color: C.inkDim,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Цель выбрана
            </div>
            <div
              style={{
                color: C.ink,
                fontFamily: F_DISP,
                fontSize: 14,
                fontWeight: 500,
                margin: '4px 0 10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {targetName ?? 'Точка на карте'} {dist && <span style={{ color: C.inkDim }}>· {dist.v} {dist.u}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={saveCurrent}
                aria-label="save"
                style={{
                  width: 48,
                  height: 44,
                  background: C.bg2,
                  border: `1px solid ${C.line2}`,
                  color: C.target,
                  borderRadius: 10,
                  fontSize: 18,
                }}
              >
                ★
              </button>
              <button
                onClick={start}
                style={{
                  flex: 1,
                  height: 44,
                  background: C.target,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontFamily: F_DISP,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  boxShadow: `0 0 24px ${C.glow}`,
                }}
              >
                Старт →
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: F_MONO,
              fontSize: 11,
              letterSpacing: '0.18em',
              color: C.inkDim,
              textTransform: 'uppercase',
            }}
          >
            ⊕&nbsp; TAP THE MAP
          </div>
        )}
      </div>

      {/* Favorites sheet */}
      {showFavSheet && (
        <SavedSheet
          saved={saved}
          trips={trips}
          settings={settings}
          initialTab={favSheetTab}
          onClose={() => setShowFavSheet(false)}
          onPickTarget={pickSavedTarget}
          onResumeTrip={(trip) => {
            setShowFavSheet(false);
            if (trip.trail.length > 0) {
              const start = trip.trail[0];
              onResumeTrip({ lat: start.lat, lng: start.lng }, trip.trail);
            }
          }}
          onRemoveTarget={async (id) => {
            await deleteTarget(id);
            setSaved(await listTargets());
          }}
          onRemoveTrip={async (id) => {
            await deleteTrip(id);
            setTrips(await listTrips());
          }}
          onSaveCurrent={target ? saveCurrent : null}
        />
      )}
    </div>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? C.target : C.inkDim} strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconButton({
  onClick,
  active,
  ariaLabel,
  color,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  ariaLabel: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 38,
        height: 38,
        background: 'rgba(17,20,19,0.85)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${active ? C.target : C.line2}`,
        borderRadius: 10,
        color: color ?? (active ? C.target : C.ink),
        fontSize: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function SuggestionRow({
  query,
  result,
  distFromMe,
  units,
  divider,
  onClick,
}: {
  query: string;
  result: GeoResult;
  distFromMe: number | null;
  units: 'metric' | 'imperial';
  divider: boolean;
  onClick: () => void;
}) {
  const distFmt = distFromMe != null ? fmtDist(distFromMe, units) : null;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: 'transparent',
        border: 'none',
        borderBottom: divider ? `1px solid ${C.line}` : 'none',
        color: C.ink,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {result.icon ? (
          <span style={{ fontSize: 14, flexShrink: 0, width: 16, textAlign: 'center' }}>{result.icon}</span>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.target} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2C8 2 5 5 5 10c0 5 7 12 7 12s7-7 7-12c0-5-3-8-7-8z" />
          </svg>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F_DISP, fontSize: 12, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>
            <Highlight text={result.name} query={query} />
          </div>
          <div
            style={{
              fontFamily: F_MONO,
              fontSize: 10,
              color: C.inkDim,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {result.context}
            {distFmt && (
              <>
                {result.context && ' · '}
                {distFmt.v} {distFmt.u}
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <b style={{ color: C.target, fontWeight: 700 }}>{text.slice(idx, idx + query.length)}</b>
      {text.slice(idx + query.length)}
    </>
  );
}

function LayerPopover({ layer, onPick }: { layer: Layer; onPick: (l: Layer) => void }) {
  const items: Array<{ v: Layer; l: string }> = [
    { v: 'std', l: 'Карта' },
    { v: 'sat', l: 'Спутник' },
    { v: 'topo', l: 'Топо' },
    { v: 'tour', l: 'Турист' },
  ];
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: 0,
        top: 46,
        width: 140,
        background: 'rgba(11,13,12,0.96)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        padding: 4,
        boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
      }}
    >
      {items.map((it) => {
        const active = layer === it.v;
        return (
          <button
            key={it.v}
            onClick={() => onPick(it.v)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              background: active ? C.target : 'transparent',
              color: active ? '#fff' : C.ink,
              fontFamily: F_MONO,
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {it.l}
          </button>
        );
      })}
    </div>
  );
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

// Маркер цели через circle layers — рисуется на canvas, не зависит от DOM.
function addTargetSource(map: MlMap): void {
  if (!map.getSource('target-pt')) {
    map.addSource('target-pt', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('target-halo')) {
    map.addLayer({
      id: 'target-halo',
      type: 'circle',
      source: 'target-pt',
      paint: {
        'circle-radius': 22,
        'circle-color': 'transparent',
        'circle-stroke-width': 2,
        'circle-stroke-color': C.target,
        'circle-stroke-opacity': 0.75,
        'circle-opacity': 0,
      },
    });
  }
  if (!map.getLayer('target-dot')) {
    map.addLayer({
      id: 'target-dot',
      type: 'circle',
      source: 'target-pt',
      paint: {
        'circle-radius': 8,
        'circle-color': C.target,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': C.bg,
        'circle-opacity': 1,
      },
    });
  }
}

// ─── Saved sheet (избранное + поездки) ──────────────────────────────────────

type SheetProps = {
  saved: SavedTarget[];
  trips: Trip[];
  settings: Settings;
  initialTab?: 'targets' | 'trips';
  onClose: () => void;
  onPickTarget: (t: SavedTarget) => void;
  onResumeTrip: (trip: Trip) => void;
  onRemoveTarget: (id: string) => void;
  onRemoveTrip: (id: string) => void;
  onSaveCurrent: (() => void) | null;
};

function SavedSheet({
  saved,
  trips,
  settings,
  initialTab = 'targets',
  onClose,
  onPickTarget,
  onResumeTrip,
  onRemoveTarget,
  onRemoveTrip,
  onSaveCurrent,
}: SheetProps) {
  const [tab, setTab] = useState<'targets' | 'trips'>(initialTab);

  function downloadGpx(trip: Trip) {
    const xml = tripToGpx(trip);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/[^a-z0-9-_ ]/gi, '_')}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '82vh',
          background: C.bg,
          borderTop: `1px solid ${C.line2}`,
          borderRadius: '20px 20px 0 0',
          padding: '14px 16px calc(20px + env(safe-area-inset-bottom))',
          overflowY: 'auto',
          animation: 'fadeUp 240ms ease',
        }}
      >
        <div style={{ width: 40, height: 4, background: C.line2, borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: F_DISP, fontSize: 24, fontWeight: 600 }}>Saved</div>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              width: 38,
              height: 38,
              background: 'transparent',
              border: `1px solid ${C.line2}`,
              borderRadius: 10,
              color: C.ink,
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            background: C.bg2,
            border: `1px solid ${C.line2}`,
            borderRadius: 12,
            padding: 4,
            marginBottom: 14,
          }}
        >
          {([
            { key: 'targets', label: `Цели · ${saved.length}` },
            { key: 'trips', label: `Поездки · ${trips.length}` },
          ] as const).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: active ? C.bg3 : 'transparent',
                  color: active ? C.ink : C.inkDim,
                  fontFamily: F_DISP,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  padding: '12px 10px',
                  borderRadius: 10,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'targets' && (
          <>
            {saved.length === 0 && (
              <div style={{ color: C.inkDim, fontFamily: F_DISP, fontSize: 13, padding: '20px 4px', textAlign: 'center' }}>
                Поставьте цель и нажмите ★
              </div>
            )}
            {saved.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: C.bg2,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    background: 'rgba(255,107,26,0.16)',
                    border: '1px solid rgba(255,107,26,0.35)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.target,
                    fontSize: 18,
                  }}
                >
                  ★
                </div>
                <button
                  onClick={() => onPickTarget(s)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    color: C.ink,
                    padding: 0,
                  }}
                >
                  <div style={{ fontFamily: F_DISP, fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: 2, letterSpacing: '0.04em' }}>
                    {s.lat.toFixed(3)}°N · {s.lng.toFixed(3)}°E
                  </div>
                </button>
                <button
                  onClick={() => onRemoveTarget(s.id)}
                  aria-label="remove"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.inkMute,
                    fontSize: 16,
                    padding: '6px 8px',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {onSaveCurrent && (
              <button
                onClick={onSaveCurrent}
                style={{
                  width: '100%',
                  marginTop: 8,
                  height: 44,
                  background: 'transparent',
                  border: `1px dashed ${C.target}`,
                  borderRadius: 10,
                  color: C.target,
                  fontFamily: F_DISP,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                + Сохранить текущую цель
              </button>
            )}
          </>
        )}

        {tab === 'trips' && (
          <>
            {trips.length === 0 && (
              <div style={{ color: C.inkDim, fontFamily: F_DISP, fontSize: 13, padding: '20px 4px', textAlign: 'center' }}>
                Поездок ещё нет
              </div>
            )}
            {trips.map((t) => {
              const d = fmtDist(t.distM, settings.units);
              return (
                <div
                  key={t.id}
                  style={{
                    background: C.bg2,
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        background: 'rgba(255,107,26,0.12)',
                        border: `1px solid ${C.line2}`,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: C.target,
                        fontSize: 14,
                      }}
                    >
                      ‖
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: F_DISP,
                          fontSize: 14,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.name}
                      </div>
                      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: 2, letterSpacing: '0.04em' }}>
                        {d.v} {d.u} · {fmtMS(tripDurationSec(t))}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveTrip(t.id)}
                      aria-label="remove"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: C.inkMute,
                        fontSize: 14,
                        padding: '4px 8px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onResumeTrip(t)}
                      style={{
                        flex: 2,
                        height: 44,
                        background: C.target,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        fontFamily: F_DISP,
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      ▶ Продолжить
                    </button>
                    <button
                      onClick={() => downloadGpx(t)}
                      style={{
                        flex: 1,
                        height: 44,
                        background: 'transparent',
                        color: C.ink,
                        border: `1px solid ${C.line2}`,
                        borderRadius: 10,
                        fontFamily: F_DISP,
                        fontSize: 13,
                      }}
                    >
                      ↑ GPX
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function tripDurationSec(t: Trip): number {
  if (t.finishedAt && t.finishedAt > t.startedAt) return Math.floor((t.finishedAt - t.startedAt) / 1000);
  return 0;
}

function fmtMS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
