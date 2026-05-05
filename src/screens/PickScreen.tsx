import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { F_DISP, F_MONO, C } from '../theme';
import { t } from '../i18n';
import type { LatLng } from '../lib/geo';
import { bearingTo, fmtDistance, haversine, bearingToClock, relativeBearing } from '../lib/geo';
import { getCurrentFix } from '../lib/geolocation';
import { styleFor } from '../lib/map';
import type { Settings } from '../store/settings';
import { addFavorite, loadFavorites, removeFavorite, type Favorite } from '../store/favorites';

type Props = {
  settings: Settings;
  onSettings: () => void;
  onConfirm: (target: LatLng, reverse: boolean) => void;
};

const FALLBACK_CENTER: LatLng = { lat: 55.751244, lng: 37.618423 };

export default function PickScreen({ settings, onSettings, onConfirm }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const [target, setTarget] = useState<LatLng | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [reverseMode, setReverseMode] = useState(false);

  useEffect(() => {
    void loadFavorites().then(setFavs);
    void getCurrentFix().then((f) => {
      if (f) {
        setMe({ lat: f.lat, lng: f.lng });
        if (mapRef.current) mapRef.current.flyTo({ center: [f.lng, f.lat], zoom: 13, duration: 1200 });
      }
    });
  }, []);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: styleFor(settings.layer),
      center: [me?.lng ?? FALLBACK_CENTER.lng, me?.lat ?? FALLBACK_CENTER.lat],
      zoom: 12,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (meMarker.current) {
      meMarker.current.remove();
      meMarker.current = null;
    }
    if (!me) return;
    const dot = document.createElement('div');
    dot.style.cssText = `
      width:14px;height:14px;border-radius:50%;
      background:${C.ok};box-shadow:0 0 0 4px rgba(72,222,148,0.18),0 0 12px rgba(72,222,148,0.6);
      border:2px solid #0A0C0B`;
    meMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(map);
  }, [me]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleFor(settings.layer));
  }, [settings.layer]);

  const preview = useMemo(() => {
    if (!target || !me) return null;
    const dist = haversine(me, target);
    const abs = bearingTo(me, target);
    const clock = bearingToClock(relativeBearing(abs, 0));
    return { dist, clock };
  }, [target, me]);

  const onSaveFav = async () => {
    if (!target) return;
    const name = prompt(t(settings.lang, 'pick.favorites'), 'New') || 'Saved';
    const fav: Favorite = {
      id: crypto.randomUUID(),
      name: name.slice(0, 40),
      point: target,
      createdAt: Date.now(),
    };
    setFavs(await addFavorite(fav));
  };

  const onRemoveFav = async (id: string) => setFavs(await removeFavorite(id));

  const onPickFav = (fav: Favorite) => {
    setTarget(fav.point);
    mapRef.current?.flyTo({ center: [fav.point.lng, fav.point.lat], zoom: 13, duration: 800 });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: C.bg }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

      <Header lang={settings.lang} onSettings={onSettings} />

      {target && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            pointerEvents: 'none',
          }}
        >
          <Crosshair />
        </div>
      )}

      <BottomSheet
        lang={settings.lang}
        target={target}
        preview={preview}
        favs={favs}
        units={settings.units}
        reverseMode={reverseMode}
        onReverseToggle={() => setReverseMode((v) => !v)}
        onLocate={async () => {
          const f = await getCurrentFix();
          if (f) {
            setMe({ lat: f.lat, lng: f.lng });
            mapRef.current?.flyTo({ center: [f.lng, f.lat], zoom: 14, duration: 800 });
          }
        }}
        onSaveFav={onSaveFav}
        onPickFav={onPickFav}
        onRemoveFav={onRemoveFav}
        onStart={() => target && onConfirm(target, reverseMode)}
      />
    </div>
  );
}

function Header({ lang, onSettings }: { lang: 'ru' | 'en'; onSettings: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(10px + env(safe-area-inset-top))',
        left: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        zIndex: 5,
      }}
    >
      <div
        style={{
          background: 'rgba(11,13,12,0.85)',
          border: `1px solid ${C.line2}`,
          borderRadius: 999,
          padding: '6px 12px',
          fontFamily: F_MONO,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: C.inkDim,
          backdropFilter: 'blur(8px)',
        }}
      >
        01 / {t(lang, 'screen.pick')}
      </div>
      <button
        onClick={onSettings}
        aria-label="Settings"
        style={{
          width: 38,
          height: 38,
          background: 'rgba(11,13,12,0.85)',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          color: C.ink,
          backdropFilter: 'blur(8px)',
        }}
      >
        ⚙
      </button>
    </div>
  );
}

function Crosshair() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="22" fill="none" stroke={C.target} strokeWidth="2" style={{ transformOrigin: 'center', animation: 'pulse 1800ms ease-out infinite' }} />
      <circle cx="28" cy="28" r="6" fill={C.target} />
      <line x1="28" y1="2" x2="28" y2="14" stroke={C.target} strokeWidth="2" />
      <line x1="28" y1="42" x2="28" y2="54" stroke={C.target} strokeWidth="2" />
      <line x1="2" y1="28" x2="14" y2="28" stroke={C.target} strokeWidth="2" />
      <line x1="42" y1="28" x2="54" y2="28" stroke={C.target} strokeWidth="2" />
    </svg>
  );
}

type SheetProps = {
  lang: 'ru' | 'en';
  target: LatLng | null;
  preview: { dist: number; clock: number } | null;
  favs: Favorite[];
  units: 'metric' | 'imperial';
  reverseMode: boolean;
  onReverseToggle: () => void;
  onLocate: () => void;
  onSaveFav: () => void;
  onPickFav: (fav: Favorite) => void;
  onRemoveFav: (id: string) => void;
  onStart: () => void;
};

function BottomSheet({
  lang,
  target,
  preview,
  favs,
  units,
  reverseMode,
  onReverseToggle,
  onLocate,
  onSaveFav,
  onPickFav,
  onRemoveFav,
  onStart,
}: SheetProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '12px 12px calc(14px + env(safe-area-inset-bottom)) 12px',
        background: 'linear-gradient(to top, rgba(10,12,11,0.95) 60%, rgba(10,12,11,0.6) 90%, transparent)',
        zIndex: 4,
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={onLocate}
          style={{
            flex: 1,
            background: C.bg2,
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 10,
            padding: '10px 12px',
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          ⊕ {t(lang, 'pick.useGps')}
        </button>
        <button
          onClick={onReverseToggle}
          style={{
            flex: 1,
            background: reverseMode ? C.target : C.bg2,
            border: `1px solid ${reverseMode ? C.target : C.line2}`,
            color: reverseMode ? C.targetInk : C.ink,
            borderRadius: 10,
            padding: '10px 12px',
            fontFamily: F_MONO,
            fontSize: 11,
            fontWeight: reverseMode ? 700 : 400,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          ⇄ {t(lang, 'pick.reverse')}
        </button>
      </div>

      <div style={{ maxHeight: 160, overflow: 'auto', marginBottom: 10 }}>
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: C.inkDim,
            padding: '4px 4px 8px',
          }}
        >
          {t(lang, 'pick.favorites')} {favs.length > 0 && `· ${favs.length}`}
        </div>
        {favs.length === 0 && (
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkMute, padding: '4px 4px' }}>
            {t(lang, 'pick.empty')}
          </div>
        )}
        {favs.map((fav) => (
          <div
            key={fav.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 4px',
              borderTop: `1px solid ${C.line}`,
            }}
          >
            <button
              onClick={() => onPickFav(fav)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: C.ink,
                textAlign: 'left',
                fontFamily: F_DISP,
                fontSize: 14,
                padding: 0,
              }}
            >
              <div>{fav.name}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.inkDim, marginTop: 2 }}>
                {fav.point.lat.toFixed(4)}°N · {fav.point.lng.toFixed(4)}°E
              </div>
            </button>
            <button
              onClick={() => onRemoveFav(fav.id)}
              aria-label="remove"
              style={{
                background: 'transparent',
                border: 'none',
                color: C.inkMute,
                fontSize: 16,
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {preview && (
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 11,
            color: C.inkDim,
            letterSpacing: '0.1em',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {t(lang, 'pick.preview', { clock: preview.clock, dist: fmtDistance(preview.dist, units) })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {target && (
          <button
            onClick={onSaveFav}
            aria-label="save favorite"
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
            ☆
          </button>
        )}
        <button
          disabled={!target}
          onClick={onStart}
          style={{
            flex: 1,
            height: 56,
            background: target ? C.target : C.bg2,
            color: target ? C.targetInk : C.inkMute,
            border: target ? 'none' : `1px solid ${C.line2}`,
            borderRadius: 12,
            fontFamily: F_DISP,
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: '0.04em',
            boxShadow: target ? '0 0 24px rgba(255,107,26,0.35)' : undefined,
          }}
        >
          {t(lang, 'pick.start')}
        </button>
      </div>
    </div>
  );
}
