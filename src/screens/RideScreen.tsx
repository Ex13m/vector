import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { C, F_DISP, F_MONO } from '../theme';
import { t } from '../i18n';
import { styleFor } from '../lib/map';
import {
  bearingTo,
  bearingToClock,
  fmtDistance,
  fmtETA,
  fmtSpeed,
  fmtTime,
  haversine,
  relativeBearing,
  speedUnit,
  type LatLng,
} from '../lib/geo';
import { watchLocation, type Fix } from '../lib/geolocation';
import { requestOrientationPermission, watchHeading } from '../lib/orientation';
import { speak } from '../lib/speech';
import type { Settings } from '../store/settings';
import { saveTrip, type Trip } from '../store/trips';
import StatusPill from '../components/StatusPill';
import LayerPicker from '../components/LayerPicker';
import BottomHud from '../components/BottomHud';
import ClockDial from '../components/ClockDial';
import BigClockDial from '../components/BigClockDial';

type Props = {
  settings: Settings;
  target: LatLng;
  reverse: boolean;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onExit: () => void;
};

const NEAR_M = 50;

export default function RideScreen({ settings, target, reverse, onSettings, onSettingsChange, onExit }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const youMarker = useRef<Marker | null>(null);
  const targetMarker = useRef<Marker | null>(null);

  const [fix, setFix] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [permWarn, setPermWarn] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [peek, setPeek] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [tripName, setTripName] = useState('');
  const [showTrail, setShowTrail] = useState(settings.showTrail);

  const trail = useRef<Array<{ lat: number; lng: number; t: number }>>([]);
  const distM = useRef(0);
  const speedMaxRef = useRef(0);
  const startedAtRef = useRef<number>(Date.now());
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const lastVoiceRef = useRef(0);
  const lastClockRef = useRef<number | null>(null);

  const effectiveTarget: LatLng = reverse && fix ? { lat: fix.lat, lng: fix.lng } : target;
  const effectiveStart: LatLng | null = reverse ? target : null;

  useEffect(() => {
    const stop = watchLocation(
      (f) => {
        setFix((prev) => {
          if (prev) {
            const d = haversine(prev, f);
            if (d > 1 && d < 300) distM.current += d;
            if (f.speed != null && f.speed > speedMaxRef.current) speedMaxRef.current = f.speed;
          }
          if (showTrail) {
            trail.current.push({ lat: f.lat, lng: f.lng, t: f.ts });
            if (trail.current.length > 600) trail.current = trail.current.slice(-600);
          }
          return f;
        });
        setPermWarn(null);
      },
      (err) => {
        if (err === 'denied' || err === 'unsupported') setPermWarn(t(settings.lang, 'ride.permDenied'));
      },
    );
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrail]);

  useEffect(() => {
    void requestOrientationPermission().then((ok) => {
      if (!ok) setPermWarn((p) => p ?? t(settings.lang, 'ride.compassHelp'));
    });
    return watchHeading(setHeading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: styleFor(settings.layer),
      center: [(target.lng + (fix?.lng ?? target.lng)) / 2, (target.lat + (fix?.lat ?? target.lat)) / 2],
      zoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('load', () => {
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
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tm = targetMarker.current;
    if (tm) tm.remove();
    const el = document.createElement('div');
    el.style.cssText = 'width:34px;height:34px;display:flex;align-items:center;justify-content:center;pointer-events:none';
    el.innerHTML = `
      <div style="position:absolute;width:34px;height:34px;border-radius:50%;border:2px solid ${C.target};animation:pulse 1500ms ease-out infinite"></div>
      <div style="position:relative;width:14px;height:14px;border-radius:50%;background:${C.target};box-shadow:0 0 16px rgba(255,107,26,0.6)"></div>`;
    targetMarker.current = new maplibregl.Marker({ element: el }).setLngLat([effectiveTarget.lng, effectiveTarget.lat]).addTo(map);
    return () => {
      targetMarker.current?.remove();
      targetMarker.current = null;
    };
  }, [effectiveTarget.lat, effectiveTarget.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    if (!youMarker.current) {
      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${C.ok};border:2px solid #0A0C0B;box-shadow:0 0 0 4px rgba(72,222,148,0.2),0 0 14px rgba(72,222,148,0.6)`;
      youMarker.current = new maplibregl.Marker({ element: el }).setLngLat([fix.lng, fix.lat]).addTo(map);
    } else {
      youMarker.current.setLngLat([fix.lng, fix.lat]);
    }
  }, [fix]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix || !chromeVisible) return;
    map.easeTo({ center: [fix.lng, fix.lat], duration: 800 });
  }, [fix, chromeVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: showTrail ? trail.current.map((p) => [p.lng, p.lat]) : [],
      },
      properties: {},
    });
  }, [fix, showTrail]);

  const distLeft = fix ? haversine(fix, effectiveTarget) : 0;
  const absBearing = fix ? bearingTo(fix, effectiveTarget) : 0;
  const useHeading = fix?.heading ?? heading;
  const rel = relativeBearing(absBearing, useHeading);
  const clock = bearingToClock(rel);
  const near = !arrived && fix && distLeft < 500;

  useEffect(() => {
    if (!fix || arrived || paused) return;
    if (distLeft < NEAR_M && (!reverse || (effectiveStart && haversine(fix, effectiveStart) < NEAR_M))) {
      setArrived(true);
      if (!muted && settings.intervalSec > 0) speak(t(settings.lang, 'speech.arrived'), { lang: settings.lang, voiceURI: settings.voiceURI });
      if (settings.haptics && navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 90]);
    }
  }, [fix, distLeft, arrived, paused, reverse, effectiveStart, muted, settings.intervalSec, settings.lang, settings.voiceURI, settings.haptics]);

  useEffect(() => {
    if (paused || arrived || muted || settings.intervalSec === 0 || !fix) return;
    const sayPhrase = () => {
      const tk = clock === 1 ? 'speech.targetSingle' : 'speech.target';
      speak(t(settings.lang, tk, { clock, dist: fmtDistance(distLeft, settings.units) }), {
        lang: settings.lang,
        voiceURI: settings.voiceURI,
      });
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
  }, [paused, arrived, muted, settings.intervalSec, settings.lang, settings.voiceURI, settings.units, clock, distLeft, fix]);

  useEffect(() => {
    if (!settings.haptics) return;
    if (lastClockRef.current !== null && lastClockRef.current !== clock) {
      if (navigator.vibrate) navigator.vibrate(clock === 12 ? [12, 30, 24] : 10);
    }
    lastClockRef.current = clock;
  }, [clock, settings.haptics]);

  useEffect(() => {
    if (!chromeVisible) return;
    const id = window.setTimeout(() => setChromeVisible(false), 5000);
    return () => window.clearTimeout(id);
  }, [chromeVisible, paused]);

  useEffect(() => {
    if (paused) {
      pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [paused]);

  const elapsedSec = useMemo(() => {
    const now = Date.now();
    const accum = pausedAccumRef.current + (paused && pauseStartRef.current ? now - pauseStartRef.current : 0);
    return Math.max(0, Math.floor((now - startedAtRef.current - accum) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, paused]);

  const avgMps = elapsedSec > 0 ? distM.current / elapsedSec : 0;
  const liveSpeed = fix?.speed ?? 0;

  const sayNow = useCallback(() => {
    const tk = clock === 1 ? 'speech.targetSingle' : 'speech.target';
    speak(t(settings.lang, tk, { clock, dist: fmtDistance(distLeft, settings.units) }), {
      lang: settings.lang,
      voiceURI: settings.voiceURI,
    });
  }, [clock, distLeft, settings.lang, settings.voiceURI, settings.units]);

  const onStop = async () => {
    const trip: Trip = {
      id: crypto.randomUUID(),
      name: tripName || `Ride · ${new Date().toLocaleDateString(settings.lang === 'ru' ? 'ru-RU' : 'en-US')}`,
      startedAt: startedAtRef.current,
      finishedAt: Date.now(),
      distM: Math.round(distM.current),
      durationSec: elapsedSec,
      speedAvgMps: avgMps,
      speedMaxMps: speedMaxRef.current,
      trail: trail.current.slice(),
      reverse,
      target,
    };
    await saveTrip(trip);
    onExit();
  };

  const longPressTimer = useRef<number | null>(null);
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
    const id = window.setTimeout(() => setPeek(false), 2200);
    return () => window.clearTimeout(id);
  }, [peek]);

  const status: 'live' | 'paused' | 'noSignal' = paused ? 'paused' : !fix ? 'noSignal' : 'live';
  const statusLabel =
    status === 'paused'
      ? t(settings.lang, 'ride.paused')
      : status === 'noSignal'
      ? t(settings.lang, 'ride.noSignal')
      : t(settings.lang, 'ride.live');

  return (
    <div
      onClick={() => setChromeVisible(true)}
      style={{ position: 'relative', width: '100%', height: '100%', background: C.bg }}
    >
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

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
          }}
        >
          ←
        </button>
        <StatusPill state={status} label={statusLabel} />
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
          }}
        >
          ⚙
        </button>
      </div>

      <div
        style={{
          opacity: chromeVisible ? 1 : 0.18,
          transition: 'opacity 400ms',
        }}
      >
        <LayerPicker
          lang={settings.lang}
          layer={settings.layer}
          showTrail={showTrail}
          onLayer={(l) => onSettingsChange({ layer: l })}
          onTrail={(v) => {
            setShowTrail(v);
            onSettingsChange({ showTrail: v });
          }}
        />
      </div>

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
        <ClockDial bearing={rel} pulse near={!!near} />
      </div>

      {permWarn && chromeVisible && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(60px + env(safe-area-inset-top))',
            left: 12,
            right: 70,
            background: 'rgba(201,58,26,0.14)',
            border: `1px solid rgba(201,58,26,0.4)`,
            color: C.warn,
            padding: '8px 12px',
            borderRadius: 10,
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.06em',
            zIndex: 4,
          }}
        >
          {permWarn}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: `calc(72px + env(safe-area-inset-bottom))`,
          zIndex: 4,
        }}
      >
        <BottomHud
          near={!!near}
          left={{ label: t(settings.lang, 'ride.toTarget'), value: fmtDistance(distLeft, settings.units).split(' ')[0], unit: fmtDistance(distLeft, settings.units).split(' ').slice(1).join(' ') }}
          center={{ label: t(settings.lang, 'ride.atOClock'), value: String(clock), accent: true }}
          right={{ label: t(settings.lang, 'ride.eta'), value: fmtETA(distLeft, avgMps || liveSpeed) }}
        />
      </div>

      <Toolbar
        lang={settings.lang}
        units={settings.units}
        paused={paused}
        muted={muted}
        liveSpeed={liveSpeed}
        ridden={distM.current}
        elapsed={elapsedSec}
        onPause={() => setPaused((v) => !v)}
        onStop={onStop}
        onMute={() => setMuted((v) => !v)}
        onSay={sayNow}
      />

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
          <BigClockDial bearing={rel} clock={clock} near={!!near} />
        </div>
      )}

      {arrived && (
        <ArrivedOverlay
          lang={settings.lang}
          distM={distM.current}
          durationSec={elapsedSec}
          avgMps={avgMps}
          name={tripName}
          onName={setTripName}
          onSave={onStop}
          onNew={onExit}
        />
      )}
    </div>
  );
}

function Toolbar({
  lang,
  units,
  paused,
  muted,
  liveSpeed,
  ridden,
  elapsed,
  onPause,
  onStop,
  onMute,
  onSay,
}: {
  lang: Settings['lang'];
  units: Settings['units'];
  paused: boolean;
  muted: boolean;
  liveSpeed: number;
  ridden: number;
  elapsed: number;
  onPause: () => void;
  onStop: () => void;
  onMute: () => void;
  onSay: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 64,
        background: 'rgba(17,20,19,0.96)',
        borderTop: `1px solid ${C.line}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px calc(0px + env(safe-area-inset-bottom))',
        gap: 6,
        zIndex: 5,
      }}
    >
      <ToolBtn onClick={onPause} accent>
        {paused ? '▶' : '⏸'}
        <span>{paused ? t(lang, 'ride.play') : t(lang, 'ride.pause')}</span>
      </ToolBtn>
      <Stat label={t(lang, 'ride.speed')} value={fmtSpeed(liveSpeed, units)} unit={speedUnit(units)} />
      <Stat label={t(lang, 'ride.ridden')} value={fmtDistance(ridden, units).split(' ')[0]} unit={fmtDistance(ridden, units).split(' ').slice(1).join(' ')} accent />
      <Stat label={t(lang, 'ride.time')} value={fmtTime(elapsed)} />
      <ToolBtn onClick={onSay}>🔊<span>{t(lang, 'ride.sayNow')}</span></ToolBtn>
      <ToolBtn onClick={onMute}>{muted ? '🔕' : '🔔'}<span>{t(lang, 'ride.mute')}</span></ToolBtn>
      <button
        onClick={onStop}
        style={{
          height: 48,
          minWidth: 70,
          background: 'rgba(201,58,26,0.14)',
          color: C.warn,
          border: `1px solid rgba(201,58,26,0.4)`,
          borderRadius: 10,
          fontFamily: F_MONO,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        ◼ {t(lang, 'ride.stop')}
      </button>
    </div>
  );
}

function ToolBtn({ onClick, children, accent = false }: { onClick: () => void; children: React.ReactNode; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 48,
        minWidth: 48,
        background: 'transparent',
        color: accent ? C.target : C.ink,
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        fontFamily: F_MONO,
        fontSize: 8.5,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        padding: '4px 6px',
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, unit, accent = false }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '0 4px',
      }}
    >
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 8.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: C.inkDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: F_DISP,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          color: accent ? C.target : C.ink,
          marginTop: 1,
        }}
      >
        {value}
        {unit && <span style={{ fontFamily: F_MONO, fontSize: 9, color: C.inkDim, marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ArrivedOverlay({
  lang,
  distM,
  durationSec,
  avgMps,
  name,
  onName,
  onSave,
  onNew,
}: {
  lang: Settings['lang'];
  distM: number;
  durationSec: number;
  avgMps: number;
  name: string;
  onName: (s: string) => void;
  onSave: () => void;
  onNew: () => void;
}) {
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
        justifyContent: 'center',
        gap: 18,
        padding: '24px',
        animation: 'fadeIn 280ms ease',
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          border: `2px solid ${C.target}`,
          boxShadow: '0 0 40px rgba(255,107,26,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 46,
          color: C.target,
        }}
      >
        ✓
      </div>
      <div style={{ fontFamily: F_DISP, fontSize: 28, fontWeight: 600 }}>{t(lang, 'arrived.title')}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkDim, letterSpacing: '0.1em' }}>
        {fmtTime(durationSec)} · {(avgMps * 3.6).toFixed(1)} km/h · {(distM / 1000).toFixed(2)} km
      </div>
      <input
        value={name}
        placeholder={t(lang, 'arrived.namePh')}
        onChange={(e) => onName(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 320,
          height: 48,
          background: C.bg2,
          color: C.ink,
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          padding: '0 14px',
          fontFamily: F_DISP,
          fontSize: 14,
        }}
      />
      <button
        onClick={onSave}
        style={{
          width: '100%',
          maxWidth: 320,
          height: 56,
          background: C.target,
          color: C.targetInk,
          border: 'none',
          borderRadius: 12,
          fontFamily: F_DISP,
          fontWeight: 700,
          fontSize: 16,
          boxShadow: '0 0 24px rgba(255,107,26,0.35)',
        }}
      >
        ↓ {t(lang, 'arrived.save')}
      </button>
      <button
        onClick={onNew}
        style={{
          width: '100%',
          maxWidth: 320,
          height: 48,
          background: 'transparent',
          color: C.ink,
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          fontFamily: F_MONO,
          fontSize: 12,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {t(lang, 'arrived.new')}
      </button>
    </div>
  );
}
