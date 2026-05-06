// 01 Pick — выбор цели на карте.
// Layout по скриншотам: "01 / Цель" lead, big "Where to?" title,
// "Search place" input, постоянная панель слоёв справа, бейдж ★ N · M слева,
// "TAP THE MAP" hint снизу когда цели нет, Saved bottom-sheet с табами
// Цели/Поездки + trip resume + GPX.

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { styleFor, type Layer } from '../lib/mapStyles';
import { searchPlace, type GeoResult } from '../lib/geocoder';
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
import { distanceM, fmtDist, type LatLng } from '../lib/geo';
import type { Settings } from '../App';
import type { LngLatBox } from '../lib/tiles';
import { C, F_DISP, F_MONO } from '../theme';

type Props = {
  settings: Settings;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onConfirm: (target: LatLng, box: LngLatBox) => void;
  onResumeTrip: (target: LatLng, trail: TrailPoint[]) => void;
};

export default function PickScreen({ settings, onSettings, onSettingsChange, onConfirm, onResumeTrip }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  const [target, setTarget] = useState<LatLng | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<SavedTarget[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showSheet, setShowSheet] = useState(false);

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

  // Карта.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = me ?? { lat: 55.7558, lng: 37.6176 };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [start.lng, start.lat],
      zoom: me ? 16 : 4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('click', (e) => setTarget({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Когда узнали me — letим к нему один раз.
  useEffect(() => {
    if (!mapRef.current || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${C.ok};border:2px solid ${C.bg};box-shadow:0 0 0 4px rgba(72,222,148,0.18),0 0 14px rgba(72,222,148,0.55)`;
      meMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(mapRef.current);
      mapRef.current.flyTo({ center: [me.lng, me.lat], zoom: 16, duration: 800 });
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me]);

  // Смена слоя.
  useEffect(() => {
    if (mapRef.current) mapRef.current.setStyle(styleFor(settings.layer));
  }, [settings.layer]);

  // Маркер цели.
  useEffect(() => {
    if (!mapRef.current) return;
    targetMarkerRef.current?.remove();
    targetMarkerRef.current = null;
    if (!target) return;
    const el = document.createElement('div');
    el.style.cssText = `position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center`;
    el.innerHTML = `
      <div style="position:absolute;width:34px;height:34px;border-radius:50%;border:2px solid ${C.target};animation:pulse 2s infinite ease-out"></div>
      <div style="position:relative;width:24px;height:24px;border-radius:50%;background:rgba(255,107,26,0.2);border:2px solid ${C.target};box-shadow:0 0 16px ${C.glow}"></div>`;
    targetMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([target.lng, target.lat])
      .addTo(mapRef.current);
  }, [target]);

  // Загрузка saved при открытии шита.
  useEffect(() => {
    void listTargets().then(setSaved);
    void listTrips().then(setTrips);
  }, [showSheet]);

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    const r = await searchPlace(search.trim());
    setSearchResults(r);
    setSearching(false);
  }

  function flyTo(p: LatLng, zoom = 14) {
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom, duration: 800 });
    setTarget(p);
    setSearchResults([]);
    setSearch('');
  }

  function start() {
    if (!target || !mapRef.current) return;
    const b = mapRef.current.getBounds();
    onConfirm(target, {
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
    });
  }

  async function saveCurrent() {
    if (!target) return;
    const name = prompt('Название точки:', '');
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

  const distM = me && target ? distanceM(me, target) : 0;
  const dist = me && target ? fmtDist(distM, settings.units) : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: C.bg,
        color: C.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* HEAD: статус "01 / Цель", "Where to?", search */}
      <div
        style={{
          padding: 'calc(14px + env(safe-area-inset-top)) 16px 12px',
          background: C.bg,
          zIndex: 6,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div
            style={{
              fontFamily: F_MONO,
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.inkDim,
            }}
          >
            01 / Цель
          </div>
          <button
            onClick={onSettings}
            aria-label="settings"
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
            ⚙
          </button>
        </div>
        <div
          style={{
            fontFamily: F_DISP,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: C.ink,
            marginBottom: 14,
          }}
        >
          Where to?
        </div>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.inkDim,
              fontSize: 16,
              pointerEvents: 'none',
            }}
          >
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch();
            }}
            placeholder="Search place"
            style={{
              width: '100%',
              height: 48,
              padding: '0 14px 0 40px',
              background: C.bg2,
              border: `1px solid ${C.line2}`,
              borderRadius: 12,
              color: C.ink,
              fontFamily: F_DISP,
              fontSize: 14,
            }}
          />
          {searching && (
            <span
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.target,
                fontFamily: F_MONO,
                fontSize: 11,
              }}
            >
              …
            </span>
          )}
        </div>
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 16,
              right: 16,
              marginTop: 6,
              maxHeight: 320,
              overflowY: 'auto',
              background: C.bg2,
              border: `1px solid ${C.line2}`,
              borderRadius: 12,
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              zIndex: 12,
            }}
          >
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => flyTo({ lat: r.lat, lng: r.lng })}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < searchResults.length - 1 ? `1px solid ${C.line}` : 'none',
                  color: C.ink,
                  fontFamily: F_DISP,
                  fontSize: 13,
                }}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAP + overlays */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Saved badge — слева сверху над картой */}
        <button
          onClick={() => setShowSheet(true)}
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(11,13,12,0.85)',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 12,
            padding: '8px 12px',
            fontFamily: F_MONO,
            fontSize: 13,
            letterSpacing: '0.06em',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ color: C.target }}>★</span>
          <span>{saved.length}</span>
          <span style={{ color: C.inkDim }}>·</span>
          <span style={{ color: C.ink }}>{trips.length}</span>
        </button>

        {/* Layer panel — постоянно видна справа */}
        <LayerPanel layer={settings.layer} onLayer={(l) => onSettingsChange({ layer: l })} />

        {/* Bottom hint / preview */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '14px 16px calc(18px + env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, rgba(10,12,11,0.95) 60%, rgba(10,12,11,0.0) 100%)',
            zIndex: 4,
          }}
        >
          {target ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontFamily: F_MONO,
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: C.inkDim,
                }}
              >
                <span>Цель выбрана</span>
                {dist && (
                  <span style={{ color: C.target }}>
                    {dist.v} {dist.u}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={saveCurrent}
                  aria-label="save"
                  style={{
                    width: 56,
                    height: 56,
                    background: C.bg2,
                    border: `1px solid ${C.line2}`,
                    color: C.ink,
                    borderRadius: 12,
                    fontSize: 22,
                  }}
                >
                  ★
                </button>
                <button
                  onClick={start}
                  style={{
                    flex: 1,
                    height: 56,
                    background: C.target,
                    color: C.targetInk,
                    border: 'none',
                    borderRadius: 12,
                    fontFamily: F_DISP,
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    boxShadow: `0 0 24px ${C.glow}`,
                  }}
                >
                  Старт →
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: F_MONO,
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: C.inkDim,
              }}
            >
              ⊕&nbsp; TAP THE MAP
            </div>
          )}
        </div>
      </div>

      {/* Saved bottom-sheet */}
      {showSheet && (
        <SavedSheet
          saved={saved}
          trips={trips}
          settings={settings}
          onClose={() => setShowSheet(false)}
          onPickTarget={(t) => {
            flyTo({ lat: t.lat, lng: t.lng });
            setShowSheet(false);
          }}
          onResumeTrip={(trip) => {
            setShowSheet(false);
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
        />
      )}
    </div>
  );
}

function LayerPanel({ layer, onLayer }: { layer: Layer; onLayer: (l: Layer) => void }) {
  const items: Array<{ v: Layer; l: string }> = [
    { v: 'std', l: 'STANDARD' },
    { v: 'sat', l: 'SATELLITE' },
    { v: 'topo', l: 'TOPO' },
    { v: 'tour', l: 'TOURING' },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 5,
        background: 'rgba(11,13,12,0.85)',
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        backdropFilter: 'blur(8px)',
        minWidth: 110,
      }}
    >
      {items.map((it) => {
        const active = layer === it.v;
        return (
          <button
            key={it.v}
            onClick={() => onLayer(it.v)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderRadius: 8,
              background: active ? C.target : 'transparent',
              color: active ? C.targetInk : C.ink,
              fontFamily: F_MONO,
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.12em',
              textAlign: 'center',
            }}
          >
            {it.l}
          </button>
        );
      })}
    </div>
  );
}

type SheetProps = {
  saved: SavedTarget[];
  trips: Trip[];
  settings: Settings;
  onClose: () => void;
  onPickTarget: (t: SavedTarget) => void;
  onResumeTrip: (trip: Trip) => void;
  onRemoveTarget: (id: string) => void;
  onRemoveTrip: (id: string) => void;
};

function SavedSheet({ saved, trips, settings, onClose, onPickTarget, onResumeTrip, onRemoveTarget, onRemoveTrip }: SheetProps) {
  const [tab, setTab] = useState<'targets' | 'trips'>('targets');

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
          maxHeight: '80vh',
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

        {/* Tabs */}
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
          {[
            { key: 'targets', label: `Цели · ${saved.length}` },
            { key: 'trips', label: `Поездки · ${trips.length}` },
          ].map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as 'targets' | 'trips')}
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
                  letterSpacing: '0.02em',
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
                    border: `1px solid rgba(255,107,26,0.35)`,
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
                    {s.cachedTiles ? ` · ${((s.cachedTiles * 18) / 1024).toFixed(1)} MB` : ''}
                  </div>
                </button>
                <button
                  onClick={() => onRemoveTarget(s.id)}
                  aria-label="remove"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.inkMute,
                    fontSize: 18,
                    padding: '6px 8px',
                  }}
                >
                  →
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'trips' && (
          <>
            {trips.length === 0 && (
              <div style={{ color: C.inkDim, fontFamily: F_DISP, fontSize: 13, padding: '20px 4px', textAlign: 'center' }}>
                Поездок ещё нет
              </div>
            )}
            {trips.map((t) => (
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F_DISP, fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: 2, letterSpacing: '0.04em' }}>
                      {fmtDist(t.distM, settings.units).v} {fmtDist(t.distM, settings.units).u} · {fmtMS(tripDurationSec(t))}
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
                      color: C.targetInk,
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
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    ↑ GPX
                  </button>
                </div>
              </div>
            ))}
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
