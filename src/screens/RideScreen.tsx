// 03 Ride — главный экран. По скриншоту: ←/LIVE-pill/⚙ топ-бар, layer SVG слева,
// MiniDial справа, карта на весь экран с маркером цели и «вы»,
// нижний HUD на 3 ячейки (TO TARGET / AT · O'CLOCK 0:30 h / ETA),
// тулбар PAUSE / SPEED / RIDDEN / TIME / voice-mute стопка / STOP.
// Курс — bearingFromTrail с компасом-fallback. Голос каждые intervalSec.
// iOS heading permission — баннер «Разрешить компас».
// Long-press мини-дила → fullscreen peek. Auto-recenter с FAB «К себе».

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { styleFor, type Layer } from '../lib/mapStyles';
import {
  bearingTo,
  distanceM,
  fmtDist,
  fmtETA,
  fmtSpeed,
  fmtTime,
  relativeToClock,
  relativeToClockHM,
  type LatLng,
} from '../lib/geo';
import { startHeading, bearingFromTrail, needsIosPermission, requestIosPermission } from '../lib/orientation';
import { speak, buildPhrase } from '../lib/voice';
import { saveTrip, type Trip, type TrailPoint } from '../lib/storage';
import type { Settings } from '../App';
import { C, F_DISP, F_MONO } from '../theme';
import MiniDial from '../components/MiniDial';
import BigDial from '../components/BigDial';

type Props = {
  settings: Settings;
  target: LatLng;
  reverse: boolean;
  resumeTrail: TrailPoint[] | null;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onExit: () => void;
};

const NEAR_M = 500;
const ARRIVED_M = 30;

export default function RideScreen({ settings, target, reverse, resumeTrail, onSettings, onSettingsChange, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>(resumeTrail ? resumeTrail.slice() : []);
  const [heading, setHeading] = useState<number>(0);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [tripName, setTripName] = useState('');
  const [peek, setPeek] = useState(false);
  const [needPerm, setNeedPerm] = useState(false);
  const [userPanned, setUserPanned] = useState(false);

  const lastClockRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const speedMaxRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const userPanTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  // GPS
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p: TrailPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
        setMe({ lat: p.lat, lng: p.lng });
        if (pos.coords.speed != null && pos.coords.speed > speedMaxRef.current) {
          speedMaxRef.current = pos.coords.speed;
        }
        setTrail((tr) => {
          const last = tr[tr.length - 1];
          if (last && distanceM(last, p) < 2) return tr;
          const next = [...tr, p];
          return next.length > 1200 ? next.slice(-1200) : next;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // iOS heading permission
  useEffect(() => {
    if (needsIosPermission()) {
      setNeedPerm(true);
    } else {
      const stop = startHeading(setHeading);
      return stop;
    }
  }, []);

  async function grantHeading() {
    const ok = await requestIosPermission();
    setNeedPerm(false);
    if (ok) startHeading(setHeading);
  }

  // Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [target.lng, target.lat],
      zoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('trail', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        paint: { 'line-color': C.ok, 'line-width': 3, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Маркер цели
      const tg = document.createElement('div');
      tg.style.cssText = `position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;pointer-events:none`;
      tg.innerHTML = `
        <div style="position:absolute;width:34px;height:34px;border-radius:50%;border:2px solid ${C.target};animation:pulse 2s infinite ease-out"></div>
        <div style="position:relative;width:24px;height:24px;border-radius:50%;background:rgba(255,107,26,0.2);border:2px solid ${C.target};box-shadow:0 0 16px ${C.glow}"></div>`;
      targetMarkerRef.current = new maplibregl.Marker({ element: tg }).setLngLat([target.lng, target.lat]).addTo(map);
    });

    // Detect user panning
    const onDragStart = () => {
      setUserPanned(true);
      if (userPanTimer.current) window.clearTimeout(userPanTimer.current);
      userPanTimer.current = window.setTimeout(() => setUserPanned(false), 10000);
    };
    map.on('dragstart', onDragStart);

    return () => {
      map.off('dragstart', onDragStart);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layer switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleFor(settings.layer));
    map.once('styledata', () => {
      if (!map.getSource('trail')) {
        map.addSource('trail', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
        });
        map.addLayer({
          id: 'trail-line',
          type: 'line',
          source: 'trail',
          paint: { 'line-color': C.ok, 'line-width': 3, 'line-opacity': 0.85 },
        });
      }
    });
  }, [settings.layer]);

  // Update «вы» marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${C.ok};border:2px solid ${C.bg};box-shadow:0 0 0 4px rgba(72,222,148,0.18),0 0 14px rgba(72,222,148,0.55);position:relative`;
      meMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([me.lng, me.lat])
        .addTo(map);
      map.flyTo({ center: [me.lng, me.lat], zoom: 15, duration: 800 });
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me]);

  // Trail draw
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: settings.showTrail ? trail.map((p) => [p.lng, p.lat]) : [],
      },
      properties: {},
    });
  }, [trail, settings.showTrail]);

  // Auto-recenter when no recent user pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me || userPanned) return;
    const id = window.setTimeout(() => {
      map.easeTo({ center: [me.lng, me.lat], duration: 700 });
    }, 5000);
    return () => window.clearTimeout(id);
  }, [me, userPanned]);

  // Sec timer
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setTime((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Auto-hide chrome
  useEffect(() => {
    if (!chromeVisible) return;
    const id = setTimeout(() => setChromeVisible(false), 5000);
    return () => clearTimeout(id);
  }, [chromeVisible]);

  // ── Расчёты
  const bearing = me ? bearingTo(me, target) : 0;
  const courseHeading =
    trail.length >= 2
      ? bearingFromTrail(trail[trail.length - 2], trail[trail.length - 1])
      : heading;
  const rel = ((bearing - courseHeading) % 360 + 360) % 360;
  const clockNum = me ? relativeToClock(rel) : 12;
  const clockHM = me ? relativeToClockHM(rel) : '0:00';
  const distM = me ? distanceM(me, target) : 0;
  const dist = fmtDist(distM, settings.units);
  const near = !!(me && distM < NEAR_M);

  const ridden = useMemo(() => {
    let total = 0;
    for (let i = 1; i < trail.length; i++) {
      const d = distanceM(trail[i - 1], trail[i]);
      if (d > 1 && d < 300) total += d;
    }
    return total;
  }, [trail]);

  const liveSpeedMps = useMemo(() => {
    if (trail.length < 2) return 0;
    const a = trail[trail.length - 2];
    const b = trail[trail.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.5 || dt > 30) return 0;
    return Math.min(40, distanceM(a, b) / dt);
  }, [trail]);
  const liveSpeed = fmtSpeed(liveSpeedMps, settings.units);
  const riddenFmt = fmtDist(ridden, settings.units);
  const avgMps = time > 0 ? ridden / time : 0;
  const eta = fmtETA(distM, avgMps || liveSpeedMps);

  // Arrived
  useEffect(() => {
    if (!me || arrived || paused) return;
    if (distM < ARRIVED_M) {
      setArrived(true);
      if (settings.haptics && navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 90]);
      if (!silenced) speak(buildPhrase({ lang: settings.lang, clock: clockNum, distM, reverse }), settings.lang, settings.voiceURI);
    }
  }, [me, distM, arrived, paused, silenced, settings.haptics, settings.lang, settings.voiceURI, clockNum, reverse]);

  // Voice loop
  useEffect(() => {
    if (silenced || paused || arrived || settings.intervalSec === 0 || !me) return;
    const sayPhrase = () => {
      speak(buildPhrase({ lang: settings.lang, clock: clockNum, distM, reverse }), settings.lang, settings.voiceURI);
    };
    if (lastVoiceRef.current === 0) {
      lastVoiceRef.current = Date.now();
      sayPhrase();
    }
    const id = window.setInterval(() => {
      lastVoiceRef.current = Date.now();
      sayPhrase();
    }, settings.intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [silenced, paused, arrived, settings.intervalSec, settings.lang, settings.voiceURI, clockNum, distM, me, reverse]);

  // Haptics on clock change
  useEffect(() => {
    if (!settings.haptics) return;
    if (lastClockRef.current !== null && lastClockRef.current !== clockNum) {
      navigator.vibrate?.(clockNum === 12 ? [12, 30, 24] : 10);
    }
    lastClockRef.current = clockNum;
  }, [clockNum, settings.haptics]);

  const sayNow = useCallback(() => {
    speak(buildPhrase({ lang: settings.lang, clock: clockNum, distM, reverse }), settings.lang, settings.voiceURI);
  }, [clockNum, distM, settings.lang, settings.voiceURI, reverse]);

  // Long-press peek
  const onDialDown = () => {
    longPressTimer.current = window.setTimeout(() => setPeek(true), 380);
  };
  const onDialUp = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  useEffect(() => {
    if (!peek) return;
    const id = window.setTimeout(() => setPeek(false), 2400);
    return () => window.clearTimeout(id);
  }, [peek]);

  async function finish() {
    const trip: Trip = {
      id: String(Date.now()),
      name: tripName.trim() || `Поездка · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`,
      startedAt: startedAtRef.current,
      finishedAt: Date.now(),
      distM: Math.round(ridden),
      speedAvgMps: avgMps,
      speedMaxMps: speedMaxRef.current,
      trail,
      reverse,
      finished: true,
      target,
    };
    await saveTrip(trip);
    onExit();
  }

  function recenter() {
    if (me && mapRef.current) {
      setUserPanned(false);
      if (userPanTimer.current) window.clearTimeout(userPanTimer.current);
      mapRef.current.easeTo({ center: [me.lng, me.lat], zoom: 15, duration: 600 });
    }
  }

  const status: 'live' | 'paused' = paused ? 'paused' : 'live';

  return (
    <div
      onClick={() => setChromeVisible(true)}
      style={{ position: 'absolute', inset: 0, background: C.bg, color: C.ink, overflow: 'hidden' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(10px + env(safe-area-inset-top))',
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          opacity: chromeVisible ? 1 : 0.18,
          transition: 'opacity 400ms',
          zIndex: 5,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          aria-label="back"
          style={{
            width: 42,
            height: 38,
            background: 'rgba(11,13,12,0.85)',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 10,
            backdropFilter: 'blur(8px)',
            fontSize: 18,
          }}
        >
          ←
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(11,13,12,0.85)',
            border: `1px solid ${C.line2}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: status === 'paused' ? C.target : C.ok,
              boxShadow: `0 0 8px ${status === 'paused' ? C.target : C.ok}`,
            }}
          />
          <span
            style={{
              fontFamily: F_MONO,
              fontSize: 11,
              letterSpacing: '0.18em',
              color: C.ink,
              textTransform: 'uppercase',
            }}
          >
            {status === 'paused' ? 'PAUSED' : 'LIVE'}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
          aria-label="settings"
          style={{
            width: 42,
            height: 38,
            background: 'rgba(11,13,12,0.85)',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 10,
            backdropFilter: 'blur(8px)',
            fontSize: 18,
          }}
        >
          ⚙
        </button>
      </div>

      {/* Layer button (left under top bar) */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(56px + env(safe-area-inset-top))',
          left: 12,
          opacity: chromeVisible ? 1 : 0.18,
          transition: 'opacity 400ms',
          zIndex: 5,
        }}
      >
        <LayerButton layer={settings.layer} onLayer={(l) => onSettingsChange({ layer: l })} />
      </div>

      {/* Mini dial (right under top bar) */}
      <div
        onMouseDown={onDialDown}
        onMouseUp={onDialUp}
        onMouseLeave={onDialUp}
        onTouchStart={onDialDown}
        onTouchEnd={onDialUp}
        style={{
          position: 'absolute',
          top: 'calc(56px + env(safe-area-inset-top))',
          right: 12,
          opacity: chromeVisible ? 1 : 0.18,
          transition: 'opacity 400ms',
          zIndex: 5,
        }}
      >
        <MiniDial bearingRel={rel} near={near} />
      </div>

      {/* iOS heading permission banner */}
      {needPerm && chromeVisible && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(120px + env(safe-area-inset-top))',
            left: 12,
            right: 12,
            background: 'rgba(11,13,12,0.96)',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            padding: 14,
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            zIndex: 6,
          }}
        >
          <div style={{ fontFamily: F_DISP, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Разрешить компас</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkDim, letterSpacing: '0.04em', marginBottom: 10 }}>
            Без него «по часам» считается только при движении.
          </div>
          <button
            onClick={grantHeading}
            style={{
              width: '100%',
              height: 44,
              background: C.target,
              color: C.targetInk,
              border: 'none',
              borderRadius: 10,
              fontFamily: F_DISP,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Разрешить
          </button>
        </div>
      )}

      {/* Recenter FAB */}
      {userPanned && me && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            recenter();
          }}
          aria-label="recenter"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 200,
            width: 48,
            height: 48,
            background: 'rgba(11,13,12,0.9)',
            border: `1px solid ${C.line2}`,
            color: C.target,
            borderRadius: 999,
            fontSize: 18,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            zIndex: 5,
          }}
        >
          ⊕
        </button>
      )}

      {/* Bottom HUD */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 'calc(80px + env(safe-area-inset-bottom))',
          padding: '10px 4px',
          borderRadius: 14,
          background: near ? 'rgba(15,32,24,0.85)' : 'rgba(11,13,12,0.78)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${near ? 'rgba(72,222,148,0.4)' : C.line2}`,
          boxShadow: near ? `0 0 32px ${C.okGlow}` : 'none',
          transition: 'background 400ms, box-shadow 400ms, border-color 400ms',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 4,
        }}
      >
        <Cell label="TO TARGET" value={dist.v} unit={dist.u} accent={near ? C.ok : C.ink} />
        <Divider color={near ? C.ok : C.target} />
        <Cell label="AT · O'CLOCK" value={clockHM} unit="h" accent={near ? C.ok : C.target} highlight />
        <Divider color={near ? C.ok : C.target} />
        <Cell label="ETA" value={eta} unit="min" accent={near ? C.ok : C.ink} />
      </div>

      {/* Toolbar */}
      <Toolbar
        paused={paused}
        silenced={silenced}
        liveSpeed={liveSpeed}
        ridden={riddenFmt}
        time={time}
        onPause={() => setPaused((p) => !p)}
        onSay={sayNow}
        onMute={() => setSilenced((v) => !v)}
        onStop={() => setArrived(true)}
      />

      {/* Long-press peek */}
      {peek && (
        <div
          onClick={() => setPeek(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8,10,9,0.92)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 220ms ease',
          }}
        >
          <BigDial bearingRel={rel} clockText={clockHM} near={near} />
        </div>
      )}

      {/* Arrived overlay */}
      {arrived && (
        <ArrivedOverlay
          ridden={ridden}
          time={time}
          avgMps={avgMps}
          name={tripName}
          onName={setTripName}
          units={settings.units}
          onSave={finish}
          onNew={onExit}
        />
      )}
    </div>
  );
}

function Cell({ label, value, unit, accent, highlight }: { label: string; value: string; unit: string; accent: string; highlight?: boolean }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: '6px 4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 9,
          letterSpacing: '0.2em',
          color: highlight ? accent : C.inkDim,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          fontFamily: F_DISP,
          fontWeight: 700,
          lineHeight: 0.95,
          letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums',
          color: accent,
          textShadow: highlight ? `0 0 16px ${C.glow}` : 'none',
        }}
      >
        <span style={{ fontSize: 28 }}>{value}</span>
        <span style={{ fontSize: 11, color: C.inkDim, fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}

function Divider({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 1,
        alignSelf: 'stretch',
        margin: '6px 0',
        background: `linear-gradient(180deg, transparent, ${C.line2} 20%, ${color} 50%, ${C.line2} 80%, transparent)`,
        opacity: 0.55,
      }}
    />
  );
}

function LayerButton({ layer, onLayer }: { layer: Layer; onLayer: (l: Layer) => void }) {
  const [open, setOpen] = useState(false);
  const items: Array<{ v: Layer; l: string }> = [
    { v: 'std', l: 'Карта' },
    { v: 'sat', l: 'Спутник' },
    { v: 'topo', l: 'Топо' },
    { v: 'tour', l: 'Турист' },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="layer"
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          border: `1px solid ${open ? C.target : C.line2}`,
          background: 'rgba(11,13,12,0.85)',
          backdropFilter: 'blur(8px)',
          color: open ? C.target : C.ink,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7.5L9 5L15 7.5L21 5V16.5L15 19L9 16.5L3 19V7.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9 5V16.5M15 7.5V19" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 0,
            top: 50,
            width: 140,
            background: 'rgba(11,13,12,0.96)',
            border: `1px solid ${C.line2}`,
            borderRadius: 12,
            padding: 4,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          {items.map((it) => {
            const active = layer === it.v;
            return (
              <button
                key={it.v}
                onClick={() => {
                  onLayer(it.v);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: active ? C.target : 'transparent',
                  color: active ? C.targetInk : C.ink,
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
      )}
    </div>
  );
}

function Toolbar({
  paused,
  silenced,
  liveSpeed,
  ridden,
  time,
  onPause,
  onSay,
  onMute,
  onStop,
}: {
  paused: boolean;
  silenced: boolean;
  liveSpeed: { v: string; u: string };
  ridden: { v: string; u: string };
  time: number;
  onPause: () => void;
  onSay: () => void;
  onMute: () => void;
  onStop: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(74px + env(safe-area-inset-bottom))`,
        background: 'rgba(17,20,19,0.96)',
        borderTop: `1px solid ${C.line}`,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 6,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ToolBtn onClick={onPause} icon={paused ? '▶' : '‖'} label={paused ? 'PLAY' : 'PAUSE'} accent />
      <Stat label="SPEED" value={liveSpeed.v} unit={liveSpeed.u} />
      <Stat label="RIDDEN" value={ridden.v} unit={ridden.u} accent />
      <Stat label="TIME" value={fmtTime(time)} />
      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}` }}>
        <button
          onClick={onSay}
          aria-label="voice"
          style={{
            flex: 1,
            width: 44,
            background: 'transparent',
            border: 'none',
            color: C.ink,
            fontSize: 16,
          }}
        >
          🔊
        </button>
        <button
          onClick={onMute}
          aria-label="mute"
          style={{
            flex: 1,
            width: 44,
            background: 'transparent',
            border: 'none',
            color: silenced ? C.target : C.inkDim,
            fontSize: 16,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          {silenced ? '🔕' : '🔇'}
        </button>
      </div>
      <button
        onClick={onStop}
        style={{
          width: 80,
          background: 'rgba(201,58,26,0.14)',
          color: C.danger,
          border: 'none',
          fontFamily: F_MONO,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 14 }}>◼</span>
        STOP
      </button>
    </div>
  );
}

function ToolBtn({ onClick, icon, label, accent }: { onClick: () => void; icon: string; label: string; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 64,
        background: 'transparent',
        border: 'none',
        borderRight: `1px solid ${C.line}`,
        color: accent ? C.target : C.ink,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontFamily: F_MONO,
        fontSize: 9,
        letterSpacing: '0.16em',
      }}
    >
      <span style={{ fontSize: 18, fontFamily: F_DISP }}>{icon}</span>
      {label}
    </button>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        borderRight: `1px solid ${C.line}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 4px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 9,
          letterSpacing: '0.16em',
          color: C.inkDim,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: F_DISP,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: accent ? C.target : C.ink,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
        }}
      >
        {value}
        {unit && <span style={{ fontFamily: F_MONO, fontSize: 9, color: C.inkDim, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ArrivedOverlay({
  ridden,
  time,
  avgMps,
  name,
  onName,
  units,
  onSave,
  onNew,
}: {
  ridden: number;
  time: number;
  avgMps: number;
  name: string;
  onName: (s: string) => void;
  units: 'metric' | 'imperial';
  onSave: () => void;
  onNew: () => void;
}) {
  const dist = fmtDist(ridden, units);
  const speed = fmtSpeed(avgMps, units);
  const speedLabel = units === 'imperial' ? 'MPH' : 'KM/H';
  const placeholder = `Поездка · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        background: C.bg,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 24px calc(32px + env(safe-area-inset-bottom))',
        animation: 'fadeIn 280ms ease',
      }}
    >
      <div style={{ flex: 1 }} />
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: `2px solid ${C.target}`,
          boxShadow: `0 0 40px ${C.glow}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <span style={{ fontSize: 56, color: C.target }}>✓</span>
      </div>
      <div style={{ fontFamily: F_DISP, fontSize: 32, fontWeight: 600, marginBottom: 10 }}>Arrived!</div>
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 12,
          letterSpacing: '0.16em',
          color: C.inkDim,
          marginBottom: 22,
          textTransform: 'uppercase',
        }}
      >
        {fmtTime(time)} · {speed.v} {speedLabel} · {dist.v} {dist.u}
      </div>
      <input
        value={name}
        placeholder={placeholder}
        onChange={(e) => onName(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 360,
          height: 48,
          background: C.bg2,
          color: C.ink,
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          padding: '0 14px',
          fontFamily: F_DISP,
          fontSize: 14,
          marginBottom: 12,
        }}
      />
      <button
        onClick={onSave}
        style={{
          width: '100%',
          maxWidth: 360,
          height: 56,
          background: C.target,
          color: C.targetInk,
          border: 'none',
          borderRadius: 12,
          fontFamily: F_DISP,
          fontWeight: 700,
          fontSize: 16,
          boxShadow: `0 0 24px ${C.glow}`,
          marginBottom: 10,
        }}
      >
        ↓ Save ride
      </button>
      <button
        onClick={onNew}
        style={{
          width: '100%',
          maxWidth: 360,
          height: 48,
          background: 'transparent',
          color: C.ink,
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          fontFamily: F_DISP,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        New target
      </button>
      <div style={{ flex: 1 }} />
    </div>
  );
}
