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
  setLastKnownPos,
  type LatLng,
} from '../lib/geo';
import { startHeading, smoothedBearingFromTrail, needsIosPermission, requestIosPermission, getLastHeading } from '../lib/orientation';
import {
  type RidePhase,
  type TransitionSignal,
  createInitialState,
  tickMachine,
} from '../lib/rideStateMachine';
import { speak, buildPhrase } from '../lib/voice';
import { saveTrip, renameTrip, type Trip, type TrailPoint } from '../lib/storage';
import { saveRideSession, clearRideSession, type RideSession } from '../lib/rideSession';
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
  /** Восстановленная сессия (после убийства вкладки ОС) */
  savedSession: RideSession | null;
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
  savedSession,
  onSettings,
  onSettingsChange,
  onExit,
  onReverseRide,
  onJournal,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  // ── Trail: ref вместо state. GPS пишет сюда напрямую, не вызывая re-render
  // всего RideScreen (1600 строк). Производные (bearing, speed) вычисляются
  // в GPS-callback и пишутся в отдельные лёгкие state.
  const trailRef = useRef<TrailPoint[]>(
    savedSession?.trail ?? (resumeTrail ? resumeTrail.slice() : []),
  );
  const [trailBearing, setTrailBearing] = useState<number | null>(null);
  const [liveSpeedMps, setLiveSpeedMps] = useState(0);
  const showTrailRef = useRef(settings.showTrail);
  const [heading, setHeading] = useState(() => getLastHeading() ?? 0);
  const [mapZoom, setMapZoom] = useState(14);
  // autoFollow=true: карта следует за GPS + bearing вращается по courseHeading.
  // Отключается при ручных жестах (pan/rotate), включается кнопкой центровки.
  const [autoFollow, setAutoFollow] = useState(true);
  // lockView=true: ручные жесты (pan/rotate) ЗАБЛОКИРОВАНЫ, только zoom.
  const [lockView, setLockView] = useState(false);
  const [time, setTime] = useState(savedSession?.elapsedSec ?? 0);
  const [paused, setPaused] = useState(savedSession?.paused ?? false);
  const [silenced, setSilenced] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [tripName, setTripName] = useState('');
  const [peek, setPeek] = useState(false);
  const [needPerm, setNeedPerm] = useState(false);
  const [gpsLost, setGpsLost] = useState(true);
  const [showQuitModal, setShowQuitModal] = useState(false);
  // mapKey меняется каждый раз когда карта создаётся заново (StrictMode remount).
  // Нужен чтобы useEffect([me, target]) принудительно перезапустился после remount.
  const [mapKey, setMapKey] = useState(0);
  const [pendingWakeSpeak, setPendingWakeSpeak] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  // compassFired: true с первого события компаса.
  // Пока false — стрелка показывает абсолютный bearing к цели (видна сразу),
  // после — переключается на компасный режим «наведения».
  const [compassFired, setCompassFired] = useState(false);

  // ── Ride state machine (PRE_RIDE / RIDING / SHORT_STOP / LONG_STOP)
  const [ridePhase, setRidePhase] = useState<RidePhase>(savedSession?.ridePhase ?? 'PRE_RIDE');
  const machineRef = useRef(savedSession?.machineState ?? createInitialState(null));
  const lastRidingBearingRef = useRef(0);
  const resumeVoiceTimerRef = useRef<number | null>(null);
  // Ref-обёртка для handleTransitionSignal чтобы GPS-callback не зависел от state
  const transitionHandlerRef = useRef<(sig: TransitionSignal) => void>(() => {});

  const startedAtRef = useRef<number>(savedSession?.startedAt ?? Date.now());
  const speedMaxRef = useRef(savedSession?.speedMaxMps ?? 0);
  const lastVoiceRef = useRef(0);
  const lastGpsAtRef = useRef(0);
  // ── Incremental ridden accumulator: считаем дельту в GPS-callback вместо
  // прохода по всему trail на каждый re-render (O(n) → O(1) per fix).
  const riddenRef = useRef<number>(0);
  const lastTrailPointRef = useRef<TrailPoint | null>(null);
  // Один раз инициализируем из сохранённого трека (при восстановлении сессии).
  if (riddenRef.current === 0 && lastTrailPointRef.current === null) {
    const initial = savedSession?.trail ?? resumeTrail ?? [];
    if (initial.length > 0) {
      let total = 0;
      for (let i = 1; i < initial.length; i++) {
        const d = distanceM(initial[i - 1], initial[i]);
        if (d > 1 && d < 300) total += d;
      }
      riddenRef.current = total;
      lastTrailPointRef.current = initial[initial.length - 1];
    }
  }
  const [riddenM, setRiddenM] = useState<number>(() => riddenRef.current);
  const longPressTimer = useRef<number | null>(null);
  const lastClockRef = useRef<number | null>(null);
  const savedTripIdRef = useRef<string | null>(null);
  const frozenEtaRef = useRef<number | null>(null);

  const arrivedRef = useRef(false);
  useEffect(() => {
    arrivedRef.current = arrived;
  }, [arrived]);

  // ── Refs для 60Hz alignment-haptic в rawHandler (в обход React).
  // Haptic наведения должен срабатывать точно в момент визуального совмещения
  // с целью — на полной частоте компаса (~60 Hz), а не на 16 Hz React-state.
  // Иначе при умеренном вращении (>45°/с) зона ±2° проскальзывает мимо
  // дискретных 16 Hz семплов и haptic не срабатывает, хотя карта показывает
  // совмещение.
  const bearingToTargetRef = useRef(0);
  const meAvailableRef = useRef(false);
  const rawAlignedRef = useRef(false);
  const hapticsRef = useRef(settings.haptics);
  useEffect(() => { hapticsRef.current = settings.haptics; }, [settings.haptics]);

  // ── Фоновый аудио + Media Session, чтобы голос не глох с погашенным экраном.
  useEffect(() => {
    startWakeAudio();
    setupMediaSession('Vector · к цели');
    return () => stopWakeAudio();
  }, []);

  // ── Screen Wake Lock: не даём экрану гаснуть пока идёт поездка.
  // API поддерживается Chrome 84+, Safari 16.4+, Edge 84+.
  // Lock автоматически отпускается при скрытии вкладки — перезапрашиваем
  // при visibilitychange. Во время паузы отпускаем чтобы экран мог погаснуть.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;

    const requestLock = async () => {
      if (released || paused || arrived) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } catch {
        // не поддерживается / отклонено / low battery
      }
    };

    requestLock();

    const onVis = () => {
      if (document.visibilityState === 'visible') requestLock();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release();
    };
  }, [paused, arrived]);

  // ── GPS: одиночная подписка. State machine тикается на каждом фиксе.
  // Трек пишется только в RIDING / SHORT_STOP. Pause — отдельный оверрайд.
  //
  // Gap detection: если между фиксами >SLEEP_GAP_MS — экран был выключен,
  // GPS остановлен, реального простоя не было. Сбрасываем slowSince и
  // phaseEnteredAt чтобы state machine не прыгнул в SHORT_STOP/LONG_STOP.
  const SLEEP_GAP_MS = 15_000;
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const prevGpsAt = lastGpsAtRef.current;
        const now = Date.now();
        lastGpsAtRef.current = now;
        setGpsLost(false);
        const p: TrailPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: now };
        setMe({ lat: p.lat, lng: p.lng });
        setLastKnownPos(p);
        const rawSpeed = pos.coords.speed ?? 0;
        if (rawSpeed > speedMaxRef.current) speedMaxRef.current = rawSpeed;

        // ── Gap detection: экран был выключен → сброс таймеров state machine
        const gapMs = prevGpsAt > 0 ? now - prevGpsAt : 0;
        const isSleepGap = gapMs > SLEEP_GAP_MS;
        if (isSleepGap) {
          const m = machineRef.current;
          machineRef.current = {
            ...m,
            slowSince: null,            // не считать паузу остановкой
            phaseEnteredAt: now,         // сбросить таймер SHORT→LONG
            fastFixCount: 0,
            resumeFixCount: 0,
          };
        }

        // ── Tick state machine
        const machine = machineRef.current;
        // Установить якорь при первом фиксе
        if (!machine.anchorPoint) {
          machine.anchorPoint = { lat: p.lat, lng: p.lng };
        }
        const anchor = machine.anchorPoint;
        const distFromAnchor = anchor ? distanceM(anchor, p) : 0;
        const { nextState, signal } = tickMachine(machine, {
          pos: p, speedMps: rawSpeed, timestamp: now, distFromAnchor,
        });
        machineRef.current = nextState;
        if (nextState.phase !== machine.phase) {
          setRidePhase(nextState.phase);
        }
        if (signal) transitionHandlerRef.current(signal);

        // ── Запись трека: только RIDING и SHORT_STOP
        if (paused) return;
        const phase = nextState.phase;
        if (phase === 'PRE_RIDE' || phase === 'LONG_STOP') return;
        // Дедупликация и accumulator ridden вне setTrail callback —
        // иначе StrictMode (двойной вызов) удвоит дельту.
        const lastPt = lastTrailPointRef.current;
        const minDist = phase === 'SHORT_STOP' ? 5 : 2;
        if (lastPt) {
          const d = distanceM(lastPt, p);
          if (d < minDist) return; // слишком близко — не добавляем
          if (d > 1 && d < 300) {
            riddenRef.current += d;
            setRiddenM(riddenRef.current);
          }
        }
        lastTrailPointRef.current = p;
        const t = trailRef.current;
        t.push(p);

        // Производные: bearing и speed — лёгкие state, re-render только HUD.
        setTrailBearing(smoothedBearingFromTrail(t, 15));
        if (t.length >= 2) {
          const a = t[t.length - 2], b = t[t.length - 1];
          const dt = (b.t - a.t) / 1000;
          const spd = (dt >= 0.5 && dt <= 30) ? Math.min(40, distanceM(a, b) / dt) : 0;
          setLiveSpeedMps(spd);
          if (spd > speedMaxRef.current) speedMaxRef.current = spd;
        }

        // Обновляем trail на карте напрямую (без React re-render).
        if (showTrailRef.current) {
          const src = mapRef.current?.getSource('trail') as maplibregl.GeoJSONSource | undefined;
          if (src) {
            trailCoordsRef.current.push([p.lng, p.lat]);
            src.setData({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: trailCoordsRef.current },
              properties: {},
            });
          }
        }
      },
      () => setGpsLost(true),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      if (resumeVoiceTimerRef.current) window.clearTimeout(resumeVoiceTimerRef.current);
    };
  }, [paused]);

  // ── GPS-lost watchdog: если давно не было фикса — поднять флаг.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastGpsAtRef.current === 0) return; // ещё не было ни одного фикса
      if (Date.now() - lastGpsAtRef.current > GPS_LOST_MS) setGpsLost(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Auto-save сессии. Стабильный interval — не пересоздаётся при каждом
  // обновлении trail/time/etc. Чтение из refs, чтобы было видно «свежие»
  // значения без перезапуска эффекта (избегаем JSON.stringify в setInterval
  // setup/teardown цикле).
  const sessionSnapshotRef = useRef({
    target, targetName, reverse, time, ridePhase, paused, arrived,
  });
  useEffect(() => {
    sessionSnapshotRef.current = {
      target, targetName, reverse, time, ridePhase, paused, arrived,
    };
  }, [target, targetName, reverse, time, ridePhase, paused, arrived]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = sessionSnapshotRef.current;
      if (s.arrived) return;
      saveRideSession({
        target: s.target,
        targetName: s.targetName,
        reverse: s.reverse,
        trail: trailRef.current,
        elapsedSec: s.time,
        machineState: machineRef.current,
        ridePhase: s.ridePhase,
        speedMaxMps: speedMaxRef.current,
        startedAt: startedAtRef.current,
        paused: s.paused,
        savedAt: Date.now(),
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  // Зеркало ridePhase в ref — compass rawHandler (полная частота, вне React)
  // читает фазу, чтобы писать bearing камеры из компаса только в компас-фазах.
  const ridePhaseRef = useRef(ridePhase);
  ridePhaseRef.current = ridePhase;

  // Подписка на компас: throttled-handler → React-state (HUD, голос);
  // rawHandler (полная частота ~60 Hz) → bearing камеры напрямую в ref,
  // в обход React — карта вращается плавно 60 fps без ступенек 16 Hz.
  //
  // Alignment-haptic тоже живёт в rawHandler: на 60 Hz проверяет rel-угол
  // к цели и вибрирует в момент визуального совмещения. Раньше haptic
  // проверялся в React-эффекте (16 Hz) — при умеренном вращении зона ±2°
  // проскальзывала мимо дискретных семплов, haptic не срабатывал.
  const beginHeading = useCallback(() => {
    return startHeading(
      (h) => {
        setCompassFired(true);
        setHeading(h);
      },
      (h) => {
        const ph = ridePhaseRef.current;
        if (ph === 'PRE_RIDE' || ph === 'LONG_STOP') {
          camTargetBearingRef.current = h;
          // ── 60 Hz alignment haptic: проверяем rel к цели на полной частоте
          // компаса. Haptic НЕ зависит от silenced (mute = только голос).
          if (meAvailableRef.current) {
            const r = ((bearingToTargetRef.current - h) % 360 + 360) % 360;
            const aligned = r < 2 || r > 358;       // ±2°
            const outOfZone = r > 5 && r < 355;     // ±5° гистерезис
            if (aligned && !rawAlignedRef.current) {
              rawAlignedRef.current = true;
              haptic('success', hapticsRef.current);
            } else if (outOfZone) {
              rawAlignedRef.current = false;
            }
          }
        }
      },
    );
  }, []);

  // ── iOS heading permission.
  // Один callback-объект: setCompassFired — стабильная setState-функция, можно
  // использовать в closure без включения в deps-массив.
  useEffect(() => {
    if (needsIosPermission()) {
      setNeedPerm(true);
    } else {
      return beginHeading();
    }
  }, [beginHeading]);

  async function grantHeading() {
    const ok = await requestIosPermission();
    setNeedPerm(false);
    if (ok) beginHeading();
  }

  // ── Карта.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [target.lng, target.lat],
      zoom: 14,
      bearing: getLastHeading() ?? 0, // прогретый компас (warm-up в App.tsx)
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    setMapKey((k) => k + 1); // сигнализируем маркер-эффекту о новой карте

    // Маркер цели — добавляем СРАЗУ (до load), чтобы гарантированно был виден.
    // Простой solid-круг, как в ArrivedOverlay — надёжнее DOM-трюков с 1×1.
    const tgEl = document.createElement('div');
    tgEl.style.cssText = [
      'width:20px', 'height:20px', 'border-radius:50%',
      `background:${C.target}`,
      `border:3px solid #fff`,
      `box-shadow:0 0 0 2px ${C.target},0 0 14px ${C.glow}`,
      'pointer-events:none',
    ].join(';');
    targetMarkerRef.current = new maplibregl.Marker({ element: tgEl, anchor: 'center' })
      .setLngLat([target.lng, target.lat])
      .addTo(map);

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

      // Пульсирующее кольцо вокруг маркера цели (canvas-слой, добавляется при load).
      map.addSource('target-pt', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [target.lng, target.lat] }, properties: {} },
      });
      map.addLayer({
        id: 'target-halo',
        type: 'circle',
        source: 'target-pt',
        paint: {
          'circle-radius': 22,
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': C.target,
          'circle-stroke-opacity': 0.6,
        },
      });
    });

    // При ручном жесте (pan или rotate) — выход из autoFollow.
    // originalEvent есть ТОЛЬКО при действии пользователя (touch/mouse).
    // Программный jumpTo/easeTo триггерит те же события но БЕЗ originalEvent.
    const onUserGesture = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setAutoFollow(false);
    };
    map.on('dragstart', onUserGesture);
    map.on('rotatestart', onUserGesture);
    // Zoom level tracking
    map.on('zoom', () => setMapZoom(Math.round(map.getZoom())));

    return () => {
      map.off('dragstart', onUserGesture);
      map.off('rotatestart', onUserGesture);
      map.remove();
      mapRef.current = null;
      meMarkerRef.current = null;
      targetMarkerRef.current = null;
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
      if (!map.getSource('target-pt')) {
        map.addSource('target-pt', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: [target.lng, target.lat] }, properties: {} },
        });
        map.addLayer({
          id: 'target-halo',
          type: 'circle',
          source: 'target-pt',
          paint: {
            'circle-radius': 22,
            'circle-color': 'transparent',
            'circle-stroke-width': 2,
            'circle-stroke-color': C.target,
            'circle-stroke-opacity': 0.6,
          },
        });
      }
    });
  }, [settings.layer, target]);

  // ── Маркер «вы» — фиксированная стрелка ↑ (всегда «вверх»).
  // Карта вращается вокруг маркера по courseHeading — как Google Navigation.
  // Никакого CSS rotate — вся ротация через map.setBearing().
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:32px;height:32px;pointer-events:none';
      const glow = document.createElement('div');
      glow.style.cssText = [
        'position:absolute', 'inset:0', 'border-radius:50%',
        'background:rgba(72,222,148,0.15)',
        'box-shadow:0 0 0 5px rgba(72,222,148,0.08),0 0 14px rgba(72,222,148,0.4)',
      ].join(';');
      el.appendChild(glow);
      // Стрелка ↑ — зафиксирована вверх, не вращается
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '26');
      svg.setAttribute('height', '26');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.cssText = 'position:absolute;left:3px;top:3px';
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '12,2 18,20 12,16 6,20');
      poly.setAttribute('fill', C.ok);
      poly.setAttribute('stroke', C.bg);
      poly.setAttribute('stroke-width', '1.5');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
      el.appendChild(svg);
      meMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([me.lng, me.lat])
        .addTo(map);
      // Начальный кадр
      const d = distanceM(me, target);
      if (d > 800) {
        const sw: [number, number] = [Math.min(me.lng, target.lng), Math.min(me.lat, target.lat)];
        const ne: [number, number] = [Math.max(me.lng, target.lng), Math.max(me.lat, target.lat)];
        map.fitBounds([sw, ne], { padding: 80, maxZoom: 16, duration: 800 });
      } else {
        map.flyTo({ center: [me.lng, me.lat], zoom: 15, duration: 800 });
      }
    } else if (!autoFollow) {
      // autoFollow: позицию маркера ведёт rAF-цикл камеры (плавно).
      // Вне autoFollow обновляем здесь — карта не движется, а маркер да.
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me, target, mapKey, autoFollow]);

  // ── Trail coords buffer: инкрементальные push делаются в GPS-callback.
  // Этот эффект обрабатывает только переключение showTrail и styledata-rebuild.
  const trailCoordsRef = useRef<[number, number][]>([]);
  useEffect(() => {
    showTrailRef.current = settings.showTrail;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!settings.showTrail) {
      trailCoordsRef.current = [];
    } else {
      // Rebuild при включении showTrail (или после styledata reload).
      trailCoordsRef.current = trailRef.current.map((p) => [p.lng, p.lat]);
    }
    src.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: trailCoordsRef.current },
      properties: {},
    });
  }, [settings.showTrail]);

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

  // ── Sec timer (стопается на pause и в PRE_RIDE/LONG_STOP).
  useEffect(() => {
    if (paused || ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP') return;
    const id = setInterval(() => setTime((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused, ridePhase]);

  // Auto-hide chrome убран — по требованию иконки всегда видны.

  // ── Расчёты. liveSpeedMps и speedMaxRef обновляются в GPS-callback.

  // ── 4-phase heading. courseHeading = «куда направлен курс» = bearing карты
  // (course-up навигация: карта вращается, маркер «вы» зафиксирован вверх).
  //   RIDING:     сглаженный вектор по треку (15 м назад → текущая позиция)
  //   SHORT_STOP: замороженный последний вектор езды (светофор — карта стоит)
  //   PRE_RIDE / LONG_STOP: компас — карта вращается по ориентации телефона.
  //     Пользователь крутит телефон, цель встаёт на 12 → голос «Цель впереди».
  const courseHeading = useMemo(() => {
    switch (ridePhase) {
      case 'RIDING': {
        if (trailBearing !== null) lastRidingBearingRef.current = trailBearing;
        return trailBearing ?? heading;
      }
      case 'SHORT_STOP':
        return lastRidingBearingRef.current;
      case 'PRE_RIDE':
      case 'LONG_STOP':
      default:
        return heading; // компас из orientation.ts — без девайс-коррекции
    }
  }, [ridePhase, trailBearing, heading]);

  const bearing = me ? bearingTo(me, target) : 0;
  // Sync bearing/me в refs для 60Hz rawHandler (alignment haptic).
  bearingToTargetRef.current = bearing;
  meAvailableRef.current = me !== null;
  const rel = ((bearing - courseHeading) % 360 + 360) % 360;
  const clockNum = me ? relativeToClock(rel) : 12;
  const clockHM = me ? relativeToClockHM(rel) : '12:00';
  const distM = me ? distanceM(me, target) : 0;
  const dist = fmtDist(distM, settings.units);
  const near = !!(me && distM < NEAR_M);

  // ── Auto-follow: единый rAF-цикл камеры.
  // GPS приходит ~1 Hz, courseHeading ~16 Hz. Раньше центр снапался jumpTo
  // раз в секунду → карта ехала рывками. Теперь камера каждый кадр (~60 fps)
  // экспоненциально лерпит центр и bearing к целевым значениям → плавно.
  // Один цикл владеет камерой — нет конфликта jumpTo/easeTo между эффектами.
  //
  // BEARING_K различается по фазе:
  //   PRE_RIDE / LONG_STOP (компас): 1.0 — bearing ставится НАПРЯМУЮ, без лерпа.
  //     Так было в первых map-rotation сборках (v0.5.13: jumpTo bearing=courseHeading)
  //     и так работало точно. v0.5.18 навесил лерп на bearing вместе с позицией —
  //     он нужен только позиции (GPS 1 Hz, дёргается), а bearing идёт 16 Hz уже
  //     сглаженным 1€-фильтром. Лерп лишь добавлял лаг → карта «не синхронна».
  //   RIDING / SHORT_STOP (трек): 0.18 — плавность, трек-bearing идёт 1 Hz, дёргается.
  const camTargetPosRef = useRef<{ lng: number; lat: number } | null>(
    me ? { lng: me.lng, lat: me.lat } : null,
  );
  const camTargetBearingRef = useRef(courseHeading);
  const bearingKRef = useRef(
    ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP' ? 1.0 : 0.18,
  );
  useEffect(() => {
    if (me) camTargetPosRef.current = { lng: me.lng, lat: me.lat };
  }, [me]);
  useEffect(() => {
    // В PRE_RIDE/LONG_STOP bearing камеры пишет compass rawHandler на полной
    // частоте (~60 Hz). Здесь — только трек-фазы: иначе 16 Hz перезапись из
    // courseHeading давала бы микро-рывок поверх плавного 60 Hz потока.
    if (ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP') return;
    camTargetBearingRef.current = courseHeading;
  }, [courseHeading, ridePhase]);
  useEffect(() => {
    bearingKRef.current = ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP' ? 1.0 : 0.18;
    // Сброс alignment-гистерезиса при смене фазы — при входе в LONG_STOP
    // (из RIDING) первое совмещение с целью гарантированно сработает.
    rawAlignedRef.current = false;
  }, [ridePhase]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFollow) return;
    let raf = 0;
    // Стартуем с текущего положения карты — плавный перехват из любого
    // состояния (вступительный flyTo, ручной пан, recenter).
    let curLng = map.getCenter().lng;
    let curLat = map.getCenter().lat;
    let curBearing = map.getBearing();
    const POS_K = 0.12;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return; // экран погашен — не тратим CPU
      const tPos = camTargetPosRef.current;
      if (!tPos) return;
      const dLng = tPos.lng - curLng;
      const dLat = tPos.lat - curLat;
      // shortest-path delta bearing в [-180, 180]
      const dB = ((camTargetBearingRef.current - curBearing) % 360 + 540) % 360 - 180;
      if (Math.abs(dLng) < 1e-7 && Math.abs(dLat) < 1e-7 && Math.abs(dB) < 0.05) return;
      curLng += dLng * POS_K;
      curLat += dLat * POS_K;
      curBearing = (curBearing + dB * bearingKRef.current + 360) % 360;
      map.jumpTo({ center: [curLng, curLat], bearing: curBearing });
      // Маркер «вы» — всегда на реальной GPS-позиции, не на интерполированной.
      // Камера лерпится плавно, но маркер точен — иначе визуальный рассинхрон
      // с треком (трек из реальных GPS-точек, маркер из лерпа = хвост отставания).
      const realPos = camTargetPosRef.current;
      if (realPos) meMarkerRef.current?.setLngLat([realPos.lng, realPos.lat]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoFollow, mapKey]);

  // lockView: блокируем drag/rotation жесты. Cleanup-pattern — гарантирует
  // обратное включение, даже если что-то пойдёт не так с toggle-логикой.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lockView) return;
    map.dragPan.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    return () => {
      map.dragPan.enable();
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    };
  }, [lockView]);

  // ridden теперь incremental accumulator (см. riddenRef в GPS-callback).
  const ridden = riddenM;

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
    clearRideSession(); // поездка завершена — сессия больше не нужна
    if (settings.haptics && navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 90]);
    if (!silenced) {
      // Голос «Вы у цели»
      const phrase = settings.lang === 'ru' ? 'Вы у цели' : settings.lang === 'de' ? 'Sie sind am Ziel' : 'You have arrived';
      speak(phrase, settings.lang, settings.voiceURI);
    }
  }, [silenced, settings.haptics, settings.lang, settings.voiceURI]);

  // ── Поездка достигнута: <ARRIVED_M, только в RIDING.
  // В PRE_RIDE GPS-джиттер может «приблизить» к цели — игнорируем.
  useEffect(() => {
    if (!me || arrived || paused) return;
    if (ridePhase !== 'RIDING') return;
    if (distM < ARRIVED_M) triggerArrived();
  }, [me, distM, arrived, paused, ridePhase, triggerArrived]);

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
      trail: trailRef.current,
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

  // ── handleTransitionSignal — реакция на смену фазы state machine.
  // Хранится в ref, чтобы GPS-callback не зависел от state.
  useEffect(() => {
    transitionHandlerRef.current = (sig: TransitionSignal) => {
      if (!sig) return;
      switch (sig.type) {
        case 'START_RIDING': {
          // Голос «Поехали!» + вектор на цель через 3с + вибрация
          if (settings.haptics && navigator.vibrate) navigator.vibrate([40, 80, 40]);
          if (!silenced) {
            const phrase =
              settings.lang === 'ru' ? 'Поехали!' :
              settings.lang === 'de' ? 'Los geht\'s!' : 'Let\'s go!';
            speak(phrase, settings.lang, settings.voiceURI);
            lastVoiceRef.current = Date.now();
            // Через 1.5с — первая навигационная фраза (вектор на цель).
            // Пауза нужна чтобы «Поехали!» успело прозвучать целиком.
            if (resumeVoiceTimerRef.current) window.clearTimeout(resumeVoiceTimerRef.current);
            resumeVoiceTimerRef.current = window.setTimeout(() => {
              lastVoiceRef.current = Date.now();
              speakRef.current();
            }, 1500);
          }
          break;
        }
        case 'RESUME_RIDING': {
          // Задержанное голосовое — через 3с озвучить текущую позицию
          if (resumeVoiceTimerRef.current) window.clearTimeout(resumeVoiceTimerRef.current);
          if (!silenced) {
            resumeVoiceTimerRef.current = window.setTimeout(() => {
              lastVoiceRef.current = Date.now();
              speakRef.current();
            }, 3000);
          }
          break;
        }
        case 'ENTER_SHORT_STOP':
          // Bearing уже заморожен через courseHeading useMemo
          break;
        case 'ENTER_LONG_STOP':
          // Голос и таймер уже останавливаются через ridePhase guard
          break;
      }
    };
  }, [settings.haptics, settings.lang, settings.voiceURI, silenced]);

  // hasFix — стабильный флаг (false→true один раз когда пришёл первый GPS).
  // Используется вместо `me` в deps voice/countdown effects чтобы interval
  // не пересоздавался на каждом фиксе (иначе он никогда не «доживёт» до
  // intervalSec * 1000 ms).
  const [hasFix, setHasFix] = useState<boolean>(() => !!savedSession?.trail?.length);
  useEffect(() => {
    if (me && !hasFix) setHasFix(true);
  }, [me, hasFix]);

  useEffect(() => {
    if (silenced || paused || arrived || settings.intervalSec === 0 || !hasFix) return;
    if (ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP') return;
    if (lastVoiceRef.current === 0 && !pendingWakeSpeak) {
      lastVoiceRef.current = Date.now();
      speakRef.current();
    }
    const id = window.setInterval(() => {
      lastVoiceRef.current = Date.now();
      speakRef.current();
    }, settings.intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [silenced, paused, arrived, settings.intervalSec, hasFix, pendingWakeSpeak, ridePhase]);

  // ── Обратный таймер до следующего голоса (обновляется каждые 500 мс).
  // Скрыт в PRE_RIDE / LONG_STOP — голос там молчит.
  const [nextVoiceSec, setNextVoiceSec] = useState<number | null>(null);
  useEffect(() => {
    if (silenced || paused || arrived || settings.intervalSec === 0 || !hasFix
        || ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP') {
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
  }, [silenced, paused, arrived, settings.intervalSec, hasFix, ridePhase]);

  // ── Haptics: лёгкая вибрация на смену часа — только в RIDING.
  // В PRE_RIDE / LONG_STOP пользователь крутит телефон → часы меняются
  // каждую секунду → haptic спамит мотором. Отключаем.
  useEffect(() => {
    if (ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP') return;
    if (lastClockRef.current !== null && lastClockRef.current !== clockNum) {
      haptic('light', settings.haptics);
    }
    lastClockRef.current = clockNum;
  }, [clockNum, settings.haptics, ridePhase]);

  // ── Chime «цель на 12» — те же ±2° trigger + ±5° hysteresis что и у голоса
  // в PRE_RIDE/LONG_STOP. Без dwell — в движении быстрый звук-отзыв уместнее
  // чем ожидание 200ms. Гистерезис предотвращает спам у границы зоны.
  const wasOnTargetRef = useRef(false);
  useEffect(() => {
    if (ridePhase !== 'RIDING') {
      wasOnTargetRef.current = false;
      return;
    }
    const onTarget = rel < 2 || rel > 358;
    const offTarget = rel > 5 && rel < 355;  // ±5° hysteresis (2.5× trigger)
    if (onTarget && !wasOnTargetRef.current) {
      wasOnTargetRef.current = true;
      haptic('success', settings.haptics);
      if (!silenced) chimeOnTarget();
    } else if (offTarget) {
      wasOnTargetRef.current = false;
    }
  }, [rel, ridePhase, settings.haptics, silenced]);

  // ── Голос «Цель впереди» в PRE_RIDE / LONG_STOP — edge-detection БЕЗ dwell.
  // Сценарий «вожу телефоном туда-сюда»: каждое пересечение вектора (вход в ±2°)
  // мгновенно даёт голос. Гистерезис ±5° перезаряжает триггер
  // (надо выйти за 5° чтобы снова сработало). Как metal detector beep.
  //
  // HAPTIC живёт отдельно в rawHandler (60 Hz) — см. beginHeading.
  // Здесь только голос, на 16 Hz React-state (speech synthesis сам имеет лаг).
  // Mute (`silenced`) отключает голос, но НЕ haptic — вибрация всегда работает.
  const wasAlignedRef = useRef(false);
  useEffect(() => {
    if (ridePhase !== 'PRE_RIDE' && ridePhase !== 'LONG_STOP') {
      wasAlignedRef.current = false;
      return;
    }
    if (!me || silenced || !compassFired) return;
    const aligned = rel < 2 || rel > 358;       // ±2° — снайперское наведение
    const outOfZone = rel > 5 && rel < 355;     // ±5° гистерезис (2.5× зоны)

    if (aligned && !wasAlignedRef.current) {
      wasAlignedRef.current = true;
      // Haptic уже сработал из rawHandler на полной частоте ~60 Hz.
      const phrase =
        settings.lang === 'ru' ? 'Цель впереди' :
        settings.lang === 'de' ? 'Ziel voraus' : 'Target ahead';
      speak(phrase, settings.lang, settings.voiceURI);
    } else if (outOfZone) {
      wasAlignedRef.current = false;
    }
  }, [rel, ridePhase, me, silenced, compassFired, settings.lang, settings.voiceURI]);

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
      // jumpTo вместо easeTo: следующий compass-tick через 60ms триггерит свой
      // easeTo bearing → прервал бы анимацию центровки. Snap нагляднее и проще.
      mapRef.current.jumpTo({
        center: [me.lng, me.lat],
        bearing: courseHeading,
        zoom: 15,
      });
      setAutoFollow(true);
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

      {/* Zoom badge — под layer-кнопкой слева сверху */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 'calc(60px + env(safe-area-inset-top))',
          background: 'rgba(17,20,19,0.92)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${C.line2}`,
          borderRadius: 8,
          padding: '4px 9px',
          fontFamily: F_MONO,
          fontSize: 11,
          fontWeight: 600,
          color: C.target,
          letterSpacing: '0.08em',
          fontVariantNumeric: 'tabular-nums',
          zIndex: 6,
          pointerEvents: 'none',
          minWidth: 38,
          textAlign: 'center',
        }}
      >
        Z{mapZoom}
      </div>

      {/* Lock view toggle — слева от центровки */}
      {me && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic('light', settings.haptics);
            setLockView((prev) => {
              const next = !prev;
              // При входе в lock — автоматически центрируемся
              if (next) setAutoFollow(true);
              return next;
            });
          }}
          aria-label="lock view"
          style={{
            position: 'absolute',
            right: 72, // 14 + 48 + 10 — слева от ⊕
            bottom: 'calc(180px + env(safe-area-inset-bottom))',
            width: 48,
            height: 48,
            background: lockView ? 'rgba(72,222,148,0.16)' : 'rgba(11,13,12,0.9)',
            border: `1px solid ${lockView ? C.ok : C.line2}`,
            color: lockView ? C.ok : C.inkDim,
            borderRadius: 999,
            backdropFilter: 'blur(8px)',
            boxShadow: lockView
              ? `0 4px 14px rgba(0,0,0,0.4),0 0 10px ${C.okGlow}`
              : '0 4px 14px rgba(0,0,0,0.4)',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {lockView ? (
            // Замок закрыт
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : (
            // Замок открыт
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 7.5-2" />
            </svg>
          )}
        </button>
      )}

      {/* Recenter FAB — всегда видна (когда есть GPS).
          Подсвечивается когда autoFollow выключен — показатель «нажми чтоб вернуться». */}
      {me && (
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
            background: !autoFollow ? 'rgba(11,13,12,0.9)' : 'rgba(11,13,12,0.85)',
            border: `1px solid ${!autoFollow ? C.target : C.line2}`,
            color: !autoFollow ? C.target : C.inkDim,
            borderRadius: 999,
            backdropFilter: 'blur(8px)',
            boxShadow: !autoFollow
              ? `0 4px 14px rgba(0,0,0,0.4),0 0 12px ${C.glow}`
              : '0 4px 14px rgba(0,0,0,0.4)',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {/* Crosshair icon — центровка */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
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

      {/* Info strip — всегда видна: скорость · пройдено · время | 🔊 таймер */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(76px + env(safe-area-inset-bottom))`,
          height: 28,
          background: 'rgba(11,13,12,0.92)',
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          zIndex: 6,
          fontFamily: F_MONO,
          fontSize: 11,
          letterSpacing: '0.07em',
          color: C.inkDim,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {/* Левая часть: скорость · пройдено · время  ИЛИ  статус наведения.
            LONG_STOP — тот же режим наведения что PRE_RIDE (компас крутит
            карту), поэтому подсказка «наведите на цель» показывается в обоих. */}
        <span>
          {ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP' ? (
            <>
              {!me
                ? '⏳ ожидание GPS'
                : ridePhase === 'LONG_STOP'
                ? '⏸ стоянка · наведите на цель'
                : '🧭 наведите телефон на цель'}
            </>
          ) : (
            <>
              {liveSpeed.v}&thinsp;{liveSpeed.u}
              <span style={{ color: C.line2, margin: '0 5px' }}>·</span>
              {riddenFmt.v}&thinsp;{riddenFmt.u}
              <span style={{ color: C.line2, margin: '0 5px' }}>·</span>
              {fmtTime(time)}
            </>
          )}
        </span>

        {/* Правая часть: таймер до голоса (только если активен) */}
        {nextVoiceSec !== null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={nextVoiceSec <= 5 ? C.target : C.inkDim} strokeWidth="2.5">
              <path d="M3 10v4h4l5 5V5l-5 5H3z" /><path d="M16 8a5 5 0 010 8" />
            </svg>
            <span style={{ color: nextVoiceSec <= 5 ? C.target : C.inkDim, fontWeight: 600 }}>
              {fmtCountdown(nextVoiceSec)}
            </span>
          </span>
        )}
      </div>

      {/* HUD bar — над info strip */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(76px + 28px + env(safe-area-inset-bottom))`,
          background: 'rgba(11,13,12,0.92)',
          backdropFilter: 'blur(10px)',
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          zIndex: 6,
        }}
      >
        {ridePhase === 'PRE_RIDE' || ridePhase === 'LONG_STOP' ? (
          <TargetingHud
            dist={dist}
            clockHM={clockHM}
            rel={rel}
            mePresent={!!me}
          />
        ) : (
          <>
            <HudCell label="TO TARGET" value={dist.v} unit={dist.u} />
            <HudCell label="AT O'CLOCK" value={clockHM} accent />
            <HudCell label="ETA" value={etaMin == null ? '—' : String(etaMin)} unit={etaMin == null ? '' : 'min'} />
          </>
        )}
      </div>

      {/* Toolbar 4 buttons */}
      <Toolbar
        paused={paused}
        silenced={silenced}
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
          trail={trailRef.current}
          onJournal={() => {
            haptic('light', settings.haptics);
            onJournal();
          }}
          onNew={() => {
            haptic('medium', settings.haptics);
            onExit();
          }}
          onReverse={
            trailRef.current.length > 0
              ? () => {
                  haptic('medium', settings.haptics);
                  const tr = trailRef.current;
                  onReverseRide({ lat: tr[0].lat, lng: tr[0].lng }, tr);
                }
              : null
          }
        />
      )}

    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * TargetingHud — показывается в PRE_RIDE и LONG_STOP вместо обычного HUD.
 *
 * Стрелка «вы» всегда = компас (ориентация телефона).
 * Пользователь вращает телефон пока стрелка не совпадёт с вектором к цели →
 * HUD показывает «↑ прямо!» + голос «Цель впереди» (из родителя).
 */
function TargetingHud({
  dist,
  clockHM,
  rel,
  mePresent,
}: {
  dist: { v: string; u: string };
  clockHM: string;
  rel: number;
  mePresent: boolean;
}) {
  const aligned = rel < 2 || rel > 358;   // ±2° — синхронно с голосовым триггером
  const turnRight = !aligned && rel <= 180;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        gap: 12,
        minHeight: 58,
      }}
    >
      {/* Левая секция: дистанция */}
      <div style={{ minWidth: 64 }}>
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 9,
            letterSpacing: '0.18em',
            color: C.inkDim,
            textTransform: 'uppercase',
            marginBottom: 3,
          }}
        >
          до цели
        </div>
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 20,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {mePresent ? dist.v : '—'}
          {mePresent && (
            <span style={{ fontSize: 11, color: C.inkDim, fontWeight: 500, marginLeft: 2 }}>
              {dist.u}
            </span>
          )}
        </div>
      </div>

      {/* Разделитель */}
      <div style={{ width: 1, alignSelf: 'stretch', background: C.line }} />

      {/* Правая секция: наведение */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 9,
            letterSpacing: '0.18em',
            color: C.inkDim,
            textTransform: 'uppercase',
            marginBottom: 3,
          }}
        >
          наведение
        </div>

        {!mePresent ? (
          <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkDim, letterSpacing: '0.04em' }}>
            жду GPS…
          </div>
        ) : aligned ? (
          /* Стрелка совпала с вектором → голос уже сказан родителем */
          <div
            style={{
              fontFamily: F_MONO,
              fontSize: 20,
              fontWeight: 700,
              color: C.ok,
              letterSpacing: '-0.01em',
              animation: 'liveBlink 1.6s ease-in-out infinite',
            }}
          >
            ↑ прямо!
          </div>
        ) : (
          /* Подсказка куда повернуть */
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div
              style={{
                fontFamily: F_MONO,
                fontSize: 20,
                fontWeight: 700,
                color: C.target,
                letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {clockHM}
            </div>
            <div
              style={{
                fontFamily: F_MONO,
                fontSize: 11,
                color: C.inkDim,
                letterSpacing: '0.04em',
              }}
            >
              {turnRight ? '→ вправо' : '← влево'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  onPause,
  onSay,
  onMute,
  onStop,
}: {
  paused: boolean;
  silenced: boolean;
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
      <ToolButton onClick={onSay} label="VOICE">
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
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
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
        gap: 3,
        fontFamily: F_MONO,
        fontSize: 9,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}
    >
      {children}
      {label}
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

    // ── Маркер цели: простой DOM-элемент, добавляется сразу (не ждёт load).
    // Это гарантирует видимость даже если стиль карты не загрузился.
    const tgEl = document.createElement('div');
    tgEl.style.cssText = [
      `width:22px`,
      `height:22px`,
      `border-radius:50%`,
      `background:${C.target}`,
      `border:3px solid #fff`,
      `box-shadow:0 0 0 2px ${C.target},0 0 12px ${C.glow}`,
      `pointer-events:none`,
    ].join(';');
    new maplibregl.Marker({ element: tgEl, anchor: 'center' })
      .setLngLat([target.lng, target.lat])
      .addTo(m);

    // Маркер старта — тоже сразу.
    if (trail.length > 0) {
      const stEl = document.createElement('div');
      stEl.style.cssText = [
        `width:14px`,
        `height:14px`,
        `border-radius:50%`,
        `background:${C.ok}`,
        `border:2px solid #fff`,
        `box-shadow:0 0 8px ${C.okGlow}`,
        `pointer-events:none`,
      ].join(';');
      new maplibregl.Marker({ element: stEl, anchor: 'center' })
        .setLngLat([trail[0].lng, trail[0].lat])
        .addTo(m);
    }

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
