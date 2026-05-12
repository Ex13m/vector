// 03 Ride — главный экран. Дизайн (Screens Explainer):
// • full-bleed карта, поверх всё с blur
// • LIVE-бейдж сверху (зелёный) / «GPS LOST» (красный) при потере фикса
// • Слой слева сверху, мини-циферблат справа сверху (стрелка на цель)
// • Зелёный пунктирный трек (фактический путь) + оранжевый пунктир «вы → цель»
// • Маркер «вы» — двухрежимная ромб-стрелка: в движении — по вектору двух
//   последних точек, на стоянке — по магнитометру
// • HUD: TO TARGET · AT O'CLOCK (часы:минуты) · ETA
// • Тулбар 4 кнопки: Pause · Voice · Mute · Stop
// • Back → модалка «Продолжить или Завершить?» через pushState + popstate
// • Фоновый голос: тихий AudioContext + Media Session, чтоб экран мог быть погашен
// • Pause останавливает запись трека (а не только голос)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { styleFor } from '../lib/mapStyles';
import {
  bearingTo,
  distanceM,
  fmtDist,
  fmtSpeed,
  fmtTime,
  relativeToClock,
  relativeToClockHM,
  type LatLng,
} from '../lib/geo';
import { startHeading, bearingFromTrail, needsIosPermission, requestIosPermission } from '../lib/orientation';
import { speak, buildPhrase } from '../lib/voice';
import { saveTrip, renameTrip, type Trip, type TrailPoint } from '../lib/storage';
import { startWakeAudio, stopWakeAudio, resumeWakeAudio, setupMediaSession } from '../lib/wakeAudio';
import { haptic, chimeOnTarget } from '../lib/feedback';
import type { Settings } from '../App';
import { C, F_DISP, F_MONO } from '../theme';
import MiniDial from '../components/MiniDial';
import BigDial from '../components/BigDial';

type Props = {
  settings: Settings;
  target: LatLng;
  targetName: string | null;
  reverse: boolean;
  resumeTrail: TrailPoint[] | null;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onExit: () => void;
  onReverseRide: (target: LatLng, trail: TrailPoint[]) => void;
  onJournal: () => void;
};

const ARRIVED_M = 30;
const NEAR_M = 500;
const GPS_LOST_MS = 10_000;

export default function RideScreen({
  settings,
  target,
  targetName,
  reverse,
  resumeTrail,
  onSettings,
  onSettingsChange,
  onExit,
  onReverseRide,
  onJournal,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const meArrowRef = useRef<SVGElement | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>(resumeTrail ? resumeTrail.slice() : []);
  const [heading, setHeading] = useState(0);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [tripName, setTripName] = useState('');
  const [peek, setPeek] = useState(false);
  const [needPerm, setNeedPerm] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [gpsLost, setGpsLost] = useState(true);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [pendingWakeSpeak, setPendingWakeSpeak] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const speedMaxRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const lastGpsAtRef = useRef(0);
  const userPanTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const lastClockRef = useRef<number | null>(null);
  const savedTripIdRef = useRef<string | null>(null);
  const frozenEtaRef = useRef<number | null>(null);

  const arrivedRef = useRef(false);
  useEffect(() => {
    arrivedRef.current = arrived;
  }, [arrived]);

  // ── Фоновый аудио + Media Session, чтобы голос не глох с погашенным экраном.
  useEffect(() => {
    startWakeAudio();
    setupMediaSession('Vector · к цели');
    return () => stopWakeAudio();
  }, []);

  // ── GPS: одиночная подписка. Pause останавливает ЗАПИСЬ трека (но не watch).
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        lastGpsAtRef.current = Date.now();
        setGpsLost(false);
        const p: TrailPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
        setMe({ lat: p.lat, lng: p.lng });
        const s = pos.coords.speed ?? 0;
        if (s > speedMaxRef.current) speedMaxRef.current = s;
        if (paused) return;
        setTrail((tr) => {
          const last = tr[tr.length - 1];
          if (last && distanceM(last, p) < 2) return tr;
          const next = [...tr, p];
          return next.length > 2000 ? next.slice(-2000) : next;
        });
      },
      () => setGpsLost(true),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [paused]);

  // ── GPS-lost watchdog: если давно не было фикса — поднять флаг.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastGpsAtRef.current === 0) return; // ещё не было ни одного фикса
      if (Date.now() - lastGpsAtRef.current > GPS_LOST_MS) setGpsLost(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── iOS heading permission.
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

  // ── Карта.
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
      // Трек (зелёный пунктир)
      map.addSource('trail', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        paint: {
          'line-color': C.ok,
          'line-width': 3,
          'line-opacity': 0.85,
          'line-dasharray': [2, 3],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Вектор «вы → цель» (оранжевый пунктир)
      map.addSource('vector', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: 'vector-line',
        type: 'line',
        source: 'vector',
        paint: {
          'line-color': C.target,
          'line-width': 2.5,
          'line-opacity': 0.7,
          'line-dasharray': [3, 3],
        },
      });

      // Маркер цели — 1×1 anchor + дети с translate(-50%,-50%).
      const tg = document.createElement('div');
      tg.style.cssText = 'position:relative;width:1px;height:1px;pointer-events:none;overflow:visible';
      tg.innerHTML = `
        <div style="position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:2px solid ${C.target};animation:pulse 2s infinite ease-out"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${C.target}" stroke-width="2.5"
             style="position:absolute;left:50%;top:50%;margin:-12px 0 0 -12px;filter:drop-shadow(0 0 10px ${C.glow})">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="3" fill="${C.target}"/>
        </svg>`;
      targetMarkerRef.current = new maplibregl.Marker({ element: tg, anchor: 'center' }).setLngLat([target.lng, target.lat]).addTo(map);
    });

    const onDragStart = () => {
      setUserPanned(true);
      if (userPanTimer.current) window.clearTimeout(userPanTimer.current);
      userPanTimer.current = window.setTimeout(() => setUserPanned(false), 10_000);
    };
    map.on('dragstart', onDragStart);

    return () => {
      map.off('dragstart', onDragStart);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смена слоя.
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
          paint: { 'line-color': C.ok, 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [2, 3] },
        });
      }
      if (!map.getSource('vector')) {
        map.addSource('vector', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
        });
        map.addLayer({
          id: 'vector-line',
          type: 'line',
          source: 'vector',
          paint: { 'line-color': C.target, 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [3, 3] },
        });
      }
    });
  }, [settings.layer]);

  // ── Маркер «вы» — ромб-стрелка, поворот по dual-mode (движение/компас).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:1px;height:1px;pointer-events:none;overflow:visible';
      el.innerHTML = `
        <div style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(72,222,148,0.20);box-shadow:0 0 0 6px rgba(72,222,148,0.10),0 0 14px rgba(72,222,148,0.45)"></div>
        <svg width="26" height="26" viewBox="0 0 24 24"
             style="position:absolute;left:50%;top:50%;margin:-13px 0 0 -13px;transform: rotate(0deg);transition: transform 200ms ease-out">
          <polygon points="12,2 18,20 12,16 6,20" fill="${C.ok}" stroke="${C.bg}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
      meArrowRef.current = el.querySelector('svg');
      meMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([me.lng, me.lat]).addTo(map);
      // Начальный кадр: вы + цель в кадре с запасом — иначе на 50 км цель уезжает.
      const d = distanceM(me, target);
      if (d > 800) {
        const sw: [number, number] = [Math.min(me.lng, target.lng), Math.min(me.lat, target.lat)];
        const ne: [number, number] = [Math.max(me.lng, target.lng), Math.max(me.lat, target.lat)];
        map.fitBounds([sw, ne], { padding: 80, maxZoom: 16, duration: 800 });
      } else {
        map.flyTo({ center: [me.lng, me.lat], zoom: 15, duration: 800 });
      }
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me, target]);

  // ── Trail redraw + vector line redraw.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: settings.showTrail ? trail.map((p) => [p.lng, p.lat]) : [],
        },
        properties: {},
      });
    }
  }, [trail, settings.showTrail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    const src = map.getSource('vector') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[me.lng, me.lat], [target.lng, target.lat]] },
        properties: {},
      });
    }
  }, [me, target]);

  // ── Auto-recenter если пользователь не пэнил недавно.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me || userPanned) return;
    const id = window.setTimeout(() => {
      map.easeTo({ center: [me.lng, me.lat], duration: 700 });
    }, 5_000);
    return () => window.clearTimeout(id);
  }, [me, userPanned]);

  // ── Sec timer (стопается на pause).
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setTime((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Auto-hide chrome убран — по требованию иконки всегда видны.

  // ── Расчёты.
  const liveSpeedMps = useMemo(() => {
    if (trail.length < 2) return 0;
    const a = trail[trail.length - 2];
    const b = trail[trail.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.5 || dt > 30) return 0;
    return Math.min(40, distanceM(a, b) / dt);
  }, [trail]);

  useEffect(() => {
    if (liveSpeedMps > speedMaxRef.current) speedMaxRef.current = liveSpeedMps;
  }, [liveSpeedMps]);

  // Dual-mode heading.
  const courseHeading = useMemo(() => {
    if (liveSpeedMps > 0.5 && trail.length >= 2) {
      return bearingFromTrail(trail[trail.length - 2], trail[trail.length - 1]);
    }
    return heading;
  }, [liveSpeedMps, trail, heading]);

  const bearing = me ? bearingTo(me, target) : 0;
  const rel = ((bearing - courseHeading) % 360 + 360) % 360;
  const clockNum = me ? relativeToClock(rel) : 12;
  const clockHM = me ? relativeToClockHM(rel) : '12:00';
  const distM = me ? distanceM(me, target) : 0;
  const dist = fmtDist(distM, settings.units);
  const near = !!(me && distM < NEAR_M);

  // Rotate «вы» arrow.
  useEffect(() => {
    const svg = meArrowRef.current;
    if (!svg) return;
    (svg as unknown as HTMLElement).style.transform = `rotate(${courseHeading}deg)`;
  }, [courseHeading]);

  const ridden = useMemo(() => {
    let total = 0;
    for (let i = 1; i < trail.length; i++) {
      const d = distanceM(trail[i - 1], trail[i]);
      if (d > 1 && d < 300) total += d;
    }
    return total;
  }, [trail]);

  const avgMps = time > 0 ? ridden / time : 0;

  const etaMin = useMemo(() => {
    if (time < 30) return null;
    if (avgMps >= 0.3) {
      const v = Math.max(1, Math.round(distM / avgMps / 60));
      frozenEtaRef.current = v;
      return v;
    }
    return frozenEtaRef.current;
  }, [time, avgMps, distM]);

  const liveSpeed = fmtSpeed(liveSpeedMps, settings.units);
  const riddenFmt = fmtDist(ridden, settings.units);

  const triggerArrived = useCallback(() => {
    setArrived(true);
    if (settings.haptics && navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 90]);
    if (!silenced) {
      // Голос «Вы у цели»
      const phrase = settings.lang === 'ru' ? 'Вы у цели' : settings.lang === 'de' ? 'Sie sind am Ziel' : 'You have arrived';
      speak(phrase, settings.lang, settings.voiceURI);
    }
  }, [silenced, settings.haptics, settings.lang, settings.voiceURI]);

  // ── Поездка достигнута: <ARRIVED_M, либо вручную Stop.
  useEffect(() => {
    if (!me || arrived || paused) return;
    if (distM < ARRIVED_M) triggerArrived();
  }, [me, distM, arrived, paused, triggerArrived]);

  // ── Auto-save поездки при arrived (один раз).
  useEffect(() => {
    if (!arrived) return;
    if (savedTripIdRef.current) return;
    const id = String(Date.now());
    savedTripIdRef.current = id;
    const defaultName = `Поездка от ${new Date().toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    setTripName(defaultName);
    const trip: Trip = {
      id,
      name: defaultName,
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
    void saveTrip(trip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  // ── Rename trip on tripName change (debounce 400).
  useEffect(() => {
    const id = savedTripIdRef.current;
    if (!id || !tripName) return;
    const t = window.setTimeout(() => void renameTrip(id, tripName), 400);
    return () => window.clearTimeout(t);
  }, [tripName]);

  // ── Voice loop. Стабильный интервал, актуальные данные через ref.
  const speakRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    speakRef.current = () => {
      if (!me) return;
      speak(
        buildPhrase({ lang: settings.lang, clockHM, distM, etaMin, reverse }),
        settings.lang,
        settings.voiceURI,
      );
    };
  }, [me, settings.lang, settings.voiceURI, clockHM, distM, etaMin, reverse]);

  useEffect(() => {
    if (silenced || paused || arrived || settings.intervalSec === 0 || !me) return;
    if (lastVoiceRef.current === 0 && !pendingWakeSpeak) {
      lastVoiceRef.current = Date.now();
      speakRef.current();
    }
    const id = window.setInterval(() => {
      lastVoiceRef.current = Date.now();
      speakRef.current();
    }, settings.intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [silenced, paused, arrived, settings.intervalSec, me, pendingWakeSpeak]);

  // ── Обратный таймер до следующего голоса (обновляется каждые 500 мс).
  const [nextVoiceSec, setNextVoiceSec] = useState<number | null>(null);
  useEffect(() => {
    if (silenced || paused || arrived || settings.intervalSec === 0 || !me) {
      setNextVoiceSec(null);
      return;
    }
    const update = () => {
      if (lastVoiceRef.current === 0) {
        setNextVoiceSec(settings.intervalSec); // ещё не было первой фразы
        return;
      }
      const elapsed = (Date.now() - lastVoiceRef.current) / 1000;
      const remaining = Math.max(0, settings.intervalSec - elapsed);
      setNextVoiceSec(Math.ceil(remaining));
    };
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [silenced, paused, arrived, settings.intervalSec, me]);

  // ── Haptics + звуковой сигнал на смену часа.
  // При переходе на 12 — двойной восходящий beep «цель впереди» + усиленная вибра.
  useEffect(() => {
    if (lastClockRef.current !== null && lastClockRef.current !== clockNum) {
      if (clockNum === 12) {
        haptic('success', settings.haptics);
        if (!silenced) chimeOnTarget();
      } else {
        haptic('light', settings.haptics);
      }
    }
    lastClockRef.current = clockNum;
  }, [clockNum, settings.haptics, silenced]);

  // ── visibilitychange: при пробуждении — отменить накопившуюся речь и
  // дождаться свежего GPS перед следующей фразой.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
      resumeWakeAudio();
      setPendingWakeSpeak(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // После пробуждения, как только GPS обновится — озвучить свежую фразу.
  useEffect(() => {
    if (!pendingWakeSpeak || !me) return;
    setPendingWakeSpeak(false);
    if (silenced || paused || arrived) return;
    lastVoiceRef.current = Date.now();
    speakRef.current();
  }, [pendingWakeSpeak, me, silenced, paused, arrived]);

  // ── Back-кнопка: pushState + popstate. На Arrived — выходим без вопроса.
  useEffect(() => {
    try {
      history.pushState({ vector: 'ride' }, '');
    } catch {
      // ignore
    }
    const onPop = () => {
      if (arrivedRef.current) {
        onExit();
        return;
      }
      setShowQuitModal(true);
      try {
        history.pushState({ vector: 'ride' }, '');
      } catch {
        // ignore
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onExit]);

  const sayNow = useCallback(() => {
    resumeWakeAudio();
    speakRef.current();
  }, []);

  function manualStop() {
    triggerArrived();
  }

  // Long-press peek (full-screen BigDial).
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

  function recenter() {
    if (me && mapRef.current) {
      setUserPanned(false);
      if (userPanTimer.current) window.clearTimeout(userPanTimer.current);
      mapRef.current.easeTo({ center: [me.lng, me.lat], zoom: 15, duration: 600 });
    }
  }

  function handleQuitFinish() {
    setShowQuitModal(false);
    triggerArrived();
  }

  function handleQuitContinue() {
    setShowQuitModal(false);
  }

  return (
    <div
      onClick={() => {
        setChromeVisible(true);
        // iOS: AudioContext.resume() требует user gesture — подтянем при первом тапе.
        resumeWakeAudio();
      }}
      style={{ position: 'absolute', inset: 0, background: C.bg, color: C.ink, overflow: 'hidden' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* LIVE / GPS LOST badge */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top))',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(17,20,19,0.92)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${gpsLost ? C.danger : C.line2}`,
          borderRadius: 999,
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: F_MONO,
          fontSize: 10,
          letterSpacing: '0.2em',
          color: gpsLost ? C.danger : C.ink,
          zIndex: 6,
          opacity: 1,
          transition: 'opacity 400ms, border-color 200ms, color 200ms',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: paused ? C.target : gpsLost ? C.danger : C.ok,
            boxShadow: `0 0 8px ${paused ? C.target : gpsLost ? C.danger : C.ok}`,
            animation: gpsLost || paused ? 'none' : 'liveBlink 1.6s ease-in-out infinite',
          }}
        />
        {paused ? 'PAUSED' : gpsLost ? 'GPS LOST' : 'LIVE'}
      </div>

      {/* Layer button (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top))',
          left: 12,
          zIndex: 6,
          opacity: 1,
          transition: 'opacity 400ms',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setLayerOpen((v) => !v);
          }}
          aria-label="layer"
          style={{
            width: 38,
            height: 38,
            background: 'rgba(17,20,19,0.92)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${layerOpen ? C.target : C.line2}`,
            borderRadius: 10,
            color: layerOpen ? C.target : C.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="2,8 12,3 22,8 12,13" />
            <polyline points="2,16 12,21 22,16" />
          </svg>
        </button>
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

      {/* Mini-dial (top-right) */}
      <div
        onMouseDown={onDialDown}
        onMouseUp={onDialUp}
        onMouseLeave={onDialUp}
        onTouchStart={onDialDown}
        onTouchEnd={onDialUp}
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top))',
          right: 12,
          opacity: 1,
          transition: 'opacity 400ms',
          zIndex: 6,
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
            top: 'calc(70px + env(safe-area-inset-top))',
            left: 12,
            right: 12,
            background: 'rgba(11,13,12,0.96)',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            padding: 14,
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            zIndex: 7,
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
              color: '#fff',
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
            bottom: 'calc(180px + env(safe-area-inset-bottom))',
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

      {/* Settings (нет в спеке топ-бара — оставлю слева внизу) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSettings();
        }}
        aria-label="settings"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 'calc(180px + env(safe-area-inset-bottom))',
          width: 40,
          height: 40,
          background: 'rgba(17,20,19,0.85)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          color: C.ink,
          fontSize: 16,
          zIndex: 5,
          opacity: 1,
          transition: 'opacity 400ms',
        }}
      >
        ⚙
      </button>

      {/* HUD bar (above toolbar) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(76px + env(safe-area-inset-bottom))`,
          background: 'rgba(11,13,12,0.92)',
          backdropFilter: 'blur(10px)',
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          zIndex: 6,
          transition: 'background 300ms',
        }}
      >
        <HudCell label="TO TARGET" value={dist.v} unit={dist.u} />
        <HudCell label="AT O'CLOCK" value={clockHM} accent />
        <HudCell label="ETA" value={etaMin == null ? '—' : String(etaMin)} unit={etaMin == null ? '' : 'min'} />
      </div>

      {/* Toolbar 4 buttons */}
      <Toolbar
        paused={paused}
        silenced={silenced}
        nextVoiceSec={nextVoiceSec}
        onPause={() => {
          haptic('medium', settings.haptics);
          setPaused((p) => !p);
          resumeWakeAudio();
        }}
        onSay={() => {
          haptic('light', settings.haptics);
          sayNow();
        }}
        onMute={() => {
          haptic('light', settings.haptics);
          setSilenced((v) => !v);
          if (!silenced) speechSynthesis.cancel();
        }}
        onStop={() => {
          haptic('heavy', settings.haptics);
          manualStop();
        }}
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

      {/* Quit modal */}
      {showQuitModal && (
        <QuitModal onContinue={handleQuitContinue} onFinish={handleQuitFinish} />
      )}

      {/* Arrived overlay */}
      {arrived && (
        <ArrivedOverlay
          ridden={ridden}
          time={time}
          avgMps={avgMps}
          maxMps={speedMaxRef.current}
          name={tripName}
          onName={setTripName}
          units={settings.units}
          targetName={targetName}
          target={target}
          trail={trail}
          onJournal={() => {
            haptic('light', settings.haptics);
            onJournal();
          }}
          onNew={() => {
            haptic('medium', settings.haptics);
            onExit();
          }}
          onReverse={
            trail.length > 0
              ? () => {
                  haptic('medium', settings.haptics);
                  onReverseRide({ lat: trail[0].lat, lng: trail[0].lng }, trail);
                }
              : null
          }
        />
      )}

      {/* Diag panel (hidden in production-ish): live speed for debug-feel.
          Keeping minimal info in chrome — visible only when chromeVisible. */}
      {chromeVisible && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(60px + env(safe-area-inset-top))',
            right: 12,
            display: 'flex',
            gap: 8,
            fontFamily: F_MONO,
            fontSize: 10,
            color: C.inkDim,
            letterSpacing: '0.08em',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          <span>
            {liveSpeed.v} {liveSpeed.u}
          </span>
          <span>·</span>
          <span>{riddenFmt.v} {riddenFmt.u}</span>
          <span>·</span>
          <span>{fmtTime(time)}</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function HudCell({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '10px 4px', textAlign: 'center', borderLeft: `1px solid ${C.line}` }}>
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 9,
          letterSpacing: '0.2em',
          color: C.inkDim,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 22,
          fontWeight: 700,
          color: accent ? C.target : C.ink,
          letterSpacing: '-0.02em',
          marginTop: 3,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit && <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkDim, fontWeight: 500, marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

function fmtCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `0:${String(s).padStart(2, '0')}`;
}

function Toolbar({
  paused,
  silenced,
  nextVoiceSec,
  onPause,
  onSay,
  onMute,
  onStop,
}: {
  paused: boolean;
  silenced: boolean;
  nextVoiceSec: number | null;
  onPause: () => void;
  onSay: () => void;
  onMute: () => void;
  onStop: () => void;
}) {
  const countdown = nextVoiceSec !== null ? fmtCountdown(nextVoiceSec) : null;
  const nearFire = nextVoiceSec !== null && nextVoiceSec <= 5;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(76px + env(safe-area-inset-bottom))`,
        background: 'rgba(11,13,12,0.96)',
        borderTop: `1px solid ${C.line}`,
        display: 'flex',
        zIndex: 7,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ToolButton onClick={onPause} active={paused} label={paused ? 'PLAY' : 'PAUSE'}>
        {paused ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </ToolButton>
      <ToolButton onClick={onSay} label="VOICE" sublabel={countdown ?? undefined} sublabelAccent={nearFire}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10v4h4l5 5V5l-5 5H3z" />
          <path d="M16 8a5 5 0 010 8" />
        </svg>
      </ToolButton>
      <ToolButton onClick={onMute} active={silenced} label="MUTE">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10v4h4l5 5V5l-5 5H3z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      </ToolButton>
      <button
        onClick={onStop}
        style={{
          flex: 1,
          background: 'rgba(201,58,26,0.14)',
          border: 'none',
          borderLeft: `1px solid ${C.line}`,
          color: C.danger,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          fontFamily: F_MONO,
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" />
        </svg>
        STOP
      </button>
    </div>
  );
}

function ToolButton({
  onClick,
  active,
  label,
  sublabel,
  sublabelAccent,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  sublabel?: string;
  sublabelAccent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: 'transparent',
        border: 'none',
        color: active ? C.target : C.ink,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontFamily: F_MONO,
        fontSize: 9,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}
    >
      {children}
      {label}
      {sublabel && (
        <span style={{
          fontSize: 9,
          letterSpacing: '0.05em',
          color: sublabelAccent ? C.target : C.inkDim,
          fontVariantNumeric: 'tabular-nums',
          marginTop: -1,
        }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

function QuitModal({ onContinue, onFinish }: { onContinue: () => void; onFinish: () => void }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: C.bg,
          border: `1px solid ${C.line2}`,
          borderRadius: 16,
          padding: 22,
        }}
      >
        <div style={{ fontFamily: F_DISP, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Завершить поездку?</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkDim, letterSpacing: '0.08em', marginBottom: 18 }}>
          Прогресс сохранится автоматически.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onContinue}
            style={{
              flex: 1,
              height: 48,
              background: 'transparent',
              border: `1px solid ${C.line2}`,
              color: C.ink,
              borderRadius: 10,
              fontFamily: F_DISP,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Продолжить
          </button>
          <button
            onClick={onFinish}
            style={{
              flex: 1,
              height: 48,
              background: C.danger,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontFamily: F_DISP,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Завершить
          </button>
        </div>
      </div>
    </div>
  );
}

function LayerPopover({
  layer,
  onPick,
}: {
  layer: Parameters<typeof styleFor>[0];
  onPick: (l: Parameters<typeof styleFor>[0]) => void;
}) {
  const items: Array<{ v: Parameters<typeof styleFor>[0]; l: string }> = [
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
        left: 0,
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

function ArrivedOverlay({
  ridden,
  time,
  avgMps,
  maxMps,
  name,
  onName,
  units,
  targetName,
  target,
  trail,
  onJournal,
  onNew,
  onReverse,
}: {
  ridden: number;
  time: number;
  avgMps: number;
  maxMps: number;
  name: string;
  onName: (s: string) => void;
  units: 'metric' | 'imperial';
  targetName: string | null;
  target: LatLng;
  trail: TrailPoint[];
  onJournal: () => void;
  onNew: () => void;
  onReverse: (() => void) | null;
}) {
  const dist = fmtDist(ridden, units);
  const avg = fmtSpeed(avgMps, units);
  const max = fmtSpeed(maxMps, units);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mlMapRef = useRef<MlMap | null>(null);
  // Замораживаем trail и target при монтировании — GPS продолжает работать
  // после прибытия и trail обновляется, что пересоздавало карту каждую секунду.
  const frozenTrail = useRef(trail);
  const frozenTarget = useRef(target);

  useEffect(() => {
    if (!mapRef.current || mlMapRef.current) return;
    const trail = frozenTrail.current;
    const target = frozenTarget.current;
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: styleFor('sat'),
      center: [target.lng, target.lat],
      zoom: 13,
      attributionControl: false,
      interactive: false,
    });
    mlMapRef.current = m;

    const lastTrailPt = trail.length > 0 ? trail[trail.length - 1] : null;

    m.on('load', () => {
      // Зелёный пунктирный трек.
      if (trail.length > 1) {
        m.addSource('trip', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: trail.map((p) => [p.lng, p.lat]) },
            properties: {},
          },
        });
        m.addLayer({
          id: 'trip-line',
          type: 'line',
          source: 'trip',
          paint: { 'line-color': C.ok, 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 3] },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
      // Оранжевый пунктир «последняя точка → цель».
      if (lastTrailPt) {
        m.addSource('vector', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[lastTrailPt.lng, lastTrailPt.lat], [target.lng, target.lat]],
            },
            properties: {},
          },
        });
        m.addLayer({
          id: 'vector-line',
          type: 'line',
          source: 'vector',
          paint: { 'line-color': C.target, 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [3, 3] },
        });
      }
      // Маркер цели — circle layer (рисуется на canvas, без DOM-позиционирования).
      m.addSource('target-pt', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [target.lng, target.lat] }, properties: {} },
      });
      // Пульс-кольцо (большой полупрозрачный круг).
      m.addLayer({
        id: 'target-halo',
        type: 'circle',
        source: 'target-pt',
        paint: {
          'circle-radius': 18,
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': C.target,
          'circle-stroke-opacity': 0.65,
        },
      });
      // Внутренний заполненный круг (прицел).
      m.addLayer({
        id: 'target-dot',
        type: 'circle',
        source: 'target-pt',
        paint: {
          'circle-radius': 7,
          'circle-color': C.target,
          'circle-stroke-width': 2,
          'circle-stroke-color': C.bg,
          'circle-opacity': 0.95,
        },
      });
      // Маркер старта.
      if (trail.length > 0) {
        const start = trail[0];
        m.addSource('start-pt', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: [start.lng, start.lat] }, properties: {} },
        });
        m.addLayer({
          id: 'start-dot',
          type: 'circle',
          source: 'start-pt',
          paint: {
            'circle-radius': 6,
            'circle-color': C.ok,
            'circle-stroke-width': 2,
            'circle-stroke-color': C.bg,
          },
        });
      }
    });

    // FitBounds — сразу, не ждём load (работает на пустой карте).
    if (trail.length > 0) {
      const lngs = [target.lng, ...trail.map((p) => p.lng)];
      const lats = [target.lat, ...trail.map((p) => p.lat)];
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 32, animate: false, maxZoom: 16 },
      );
    }
    return () => {
      m.remove();
      mlMapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // пустые deps — карта создаётся один раз, trail/target зафиксированы в ref
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
        padding: '32px 24px calc(24px + env(safe-area-inset-bottom))',
        animation: 'fadeIn 280ms ease',
      }}
    >
      <div style={{ flex: 1, minHeight: 8 }} />

      {/* Mini-map: маршрут + цель */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 360,
          height: 180,
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${C.line2}`,
          marginBottom: 14,
        }}
      >
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: C.target,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 16px ${C.glow}`,
          }}
        >
          <span style={{ fontSize: 18, color: '#fff' }}>✓</span>
        </div>
      </div>

      <div style={{ fontFamily: F_DISP, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Прибыли!</div>
      {targetName && (
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.1em',
            color: C.inkDim,
            marginBottom: 16,
          }}
        >
          {targetName}
        </div>
      )}

      {/* Summary grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          width: '100%',
          maxWidth: 360,
          marginBottom: 14,
        }}
      >
        <Stat label="Время" value={fmtTime(time)} />
        <Stat label="Дистанция" value={`${dist.v} ${dist.u}`} />
        <Stat label="Средняя" value={`${avg.v} ${avg.u}`} />
        <Stat label="Макс." value={`${max.v} ${max.u}`} />
      </div>

      <input
        value={name}
        placeholder="Имя поездки"
        onChange={(e) => onName(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 360,
          height: 44,
          background: C.bg2,
          color: C.ink,
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          padding: '0 12px',
          fontFamily: F_DISP,
          fontSize: 13,
          marginBottom: 14,
        }}
      />

      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 360, marginBottom: 8 }}>
        <button
          onClick={onJournal}
          style={{
            flex: 1,
            height: 48,
            background: C.bg2,
            color: C.ink,
            border: `1px solid ${C.line2}`,
            borderRadius: 10,
            fontFamily: F_DISP,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Журнал
        </button>
        <button
          onClick={onNew}
          style={{
            flex: 1,
            height: 48,
            background: C.target,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontFamily: F_DISP,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: `0 0 24px ${C.glow}`,
          }}
        >
          Новая цель
        </button>
      </div>

      {onReverse && (
        <button
          onClick={onReverse}
          style={{
            width: '100%',
            maxWidth: 360,
            height: 44,
            background: 'transparent',
            color: C.ok,
            border: `1px dashed ${C.ok}`,
            borderRadius: 10,
            fontFamily: F_DISP,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ↩ Вернуться к старту
        </button>
      )}
      <div style={{ flex: 1 }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: C.bg2,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.16em', color: C.inkDim, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: F_MONO,
          fontSize: 18,
          fontWeight: 700,
          color: C.ink,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
