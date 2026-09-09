import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Capacitor } from '@capacitor/core';
// Экраны — lazy: каждый в своём чанке. На старте грузится только PickScreen,
// код RideScreen (2.7k строк) и CacheScreen откладывается до перехода.
const PickScreen = lazy(() => import('./screens/PickScreen'));
const CacheScreen = lazy(() => import('./screens/CacheScreen'));
const RideScreen = lazy(() => import('./screens/RideScreen'));
import SettingsSheet from './components/SettingsSheet';
import UpdateToast from './components/UpdateToast';
import InstallPrompt from './components/InstallPrompt';
import type { LatLng } from './lib/geo';
import type { Layer } from './lib/mapStyles';
import type { LngLatBox } from './lib/tiles';
import type { VoiceLang } from './lib/voice';
import { VOICE_INTERVAL_MAX, VOICE_INTERVAL_STEP, DEFAULT_VOICE_INTERVAL } from './lib/constants';
import { initWakeAudio, resumeWakeAudio } from './lib/wakeAudio';
import { loadRideSession, clearRideSession, type RideSession } from './lib/rideSession';
import { dlog } from './lib/diag';
import type { TrailPoint, Trip } from './lib/storage';
import { setUiLang, t } from './lib/i18n';
import { startHeading } from './lib/orientation';
import Paywall from './components/Paywall';
import { quotaState, useLater } from './lib/rideQuota';
import { initBilling, getPrice, buyFullVersion, restorePurchase, onEntitlement, billingAvailable } from './lib/billing';
import { watchAppUpdate, applyAppUpdate } from './lib/appUpdate';

const DevBar = import.meta.env.DEV  /* tree-shaken in prod */
  ? lazy(() => import('./components/DevBar'))
  : null;

export type Settings = {
  intervalSec: number; // 0..900 step 60 (0–15 мин, шаг 1 мин)
  units: 'metric' | 'imperial';
  haptics: boolean;
  lang: VoiceLang; // RU/EN/DE — для голоса
  voiceURI: string | null;
  layer: Layer;
  showTrail: boolean;
  /** Порог поворота для доп-озвучки цели, градусы (0 = выкл, шаг 5).
   *  Условие срабатывания: |изменение курса| >= порога → фраза цели через ~2с. */
  turnAngleDeg: number;
};

const DEFAULT_SETTINGS: Settings = {
  intervalSec: DEFAULT_VOICE_INTERVAL,
  units: 'metric',
  haptics: true,
  // Дефолт — английский; ru/de только если система на этих языках.
  lang: (navigator.language || 'en').toLowerCase().startsWith('ru')
    ? 'ru'
    : (navigator.language || 'en').toLowerCase().startsWith('de')
    ? 'de'
    : 'en',
  voiceURI: null,
  layer: 'sat', // дефолт — спутник (по требованию)
  showTrail: true,
  turnAngleDeg: 65, // доп-озвучка цели при повороте курса ≥ 65°
};

const SETTINGS_KEY = 'vector.settings.v3';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    if (s.intervalSec > VOICE_INTERVAL_MAX) s.intervalSec = VOICE_INTERVAL_MAX;
    if (s.intervalSec < 0) s.intervalSec = 0;
    // защёлкнем на шаг
    s.intervalSec = Math.round(s.intervalSec / VOICE_INTERVAL_STEP) * VOICE_INTERVAL_STEP;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

type Screen = 'pick' | 'cache' | 'ride';

export default function App() {
  // Создаём <audio> сразу при старте — play() будет вызван из жеста «Старт».
  // dlog mount: ловим перезапуск JS (если APP-mount в логе дважды) и язык —
  // диагностика бага «язык сам переключается ru→en посреди поездки».
  useEffect(() => {
    initWakeAudio();
    dlog('APP', `mount lang=${loadSettings().lang} nav=${navigator.language}`);
  }, []);

  // Настройки читаем ПЕРВЫМИ и сразу ставим язык: loadRideSession() ниже может
  // дописать оборванную поездку в журнал, а её имя берётся из словаря — при
  // обратном порядке англичанин получал запись с русским названием.
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  setUiLang(settings.lang); // текущий язык UI для t() — каждый рендер, до рендера детей

  // ── Восстановление активной поездки после убийства вкладки ОС.
  // Состояние, а НЕ useMemo: сохранённая сессия обязана умирать вместе с
  // поездкой. Раньше она читалась один раз за запуск и подставлялась в КАЖДЫЙ
  // следующий монтаж экрана поездки — новая поездка стартовала с треком,
  // временем и фазой предыдущей, минуя PRE_RIDE целиком.
  const [savedSession, setSavedSession] = useState<RideSession | null>(() => loadRideSession());

  const [screen, setScreen] = useState<Screen>(savedSession ? 'ride' : 'pick');
  const [target, setTarget] = useState<LatLng | null>(savedSession?.target ?? null);
  const [targetName, setTargetName] = useState<string | null>(savedSession?.targetName ?? null);
  const [reverse, setReverse] = useState(savedSession?.reverse ?? false);
  const [resumeTrail, setResumeTrail] = useState<Array<{ lat: number; lng: number; t: number }> | null>(savedSession?.trail ?? null);
  const [pickBox, setPickBox] = useState<LngLatBox | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // При выходе на Pick из Журнала — попросить открыть sheet на табе trips.
  const [openJournal, setOpenJournal] = useState(false);
  // Continuation: данные для продолжения поездки (новая цель / вернуться к старту).
  const [contTrail, setContTrail] = useState<TrailPoint[] | null>(null);
  const [contRiddenM, setContRiddenM] = useState(0);
  const [contElapsedSec, setContElapsedSec] = useState(0);
  const [contSpeedMax, setContSpeedMax] = useState(0);
  // Маркеры точек смены маршрута (где пользователь переключил цель).
  const [contWaypoints, setContWaypoints] = useState<LatLng[]>([]);
  // id/имя исходной поездки при продолжении — чтобы дописывать в ТУ ЖЕ запись.
  const [contTripId, setContTripId] = useState<string | null>(null);
  const [contTripName, setContTripName] = useState<string | null>(null);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    // Диагностика: ловим, кто и когда меняет язык (баг ru→en посреди поездки).
    if ('lang' in patch) dlog('APP', `updateSettings lang=${patch.lang}`);
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, reg) {
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
  });

  // В APK обновление приезжает из Google Play: файлы на диске уже новые, но
  // старый service worker продолжает отдавать свой precache. Отсюда два симптома
  // после установки из маркета: висит тост «Доступно обновление» И не показывается
  // «Что нового» (в исполняемом коде оставался прежний __APP_VERSION__).
  // Спрашивать здесь нечего — пользователь уже обновился, применяем молча.
  // Сам SW не отключаем: он же отдаёт офлайн-тайлы (runtimeCaching 'map-tiles').
  // Не трогаем во время поездки — перезагрузка страницы прервала бы навигацию.
  const isNative = Capacitor.isNativePlatform();
  useEffect(() => {
    if (!isNative || !needRefresh || screen === 'ride') return;
    dlog('APP', 'native: applying waiting SW silently (update came from Play)');
    void updateServiceWorker(true);
  }, [isNative, needRefresh, screen, updateServiceWorker]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // ── Прогрев компаса. Подписываемся на курс как только выбрана цель —
  // это будит магнитометр, и пока пользователь на экране кэширования он
  // успевает откалиброваться. К старту PRE_RIDE компас уже тёплый, и
  // course-up карта ориентируется верно с первого кадра. Холодный
  // магнитометр на старте раньше давал кривую ориентацию.
  // Отключаем когда RideScreen берёт управление — иначе два listener'а
  // одновременно пишут в _sharedSmoothed (warm-up + RideScreen).
  useEffect(() => {
    if (!target || screen === 'ride') return;
    return startHeading(() => {});
  }, [target, screen]);

  /**
   * Закрыть сохранённую сессию и в хранилище, и в памяти.
   * Одного clearRideSession() мало: объект оставался жить в состоянии App и
   * воскресал в следующей поездке.
   */
  const dropSavedSession = useCallback(() => {
    clearRideSession();
    setSavedSession(null);
  }, []);

  // ── Платная версия ────────────────────────────────────────────────────
  // Ворота стоят ровно на «Старт →»: до этого момента приложение работает
  // полностью, ничего не урезано. Начатую поездку не прерываем никогда —
  // проверка только на входе.
  const [paywall, setPaywall] = useState(false);
  const [paywallBusy, setPaywallBusy] = useState(false);
  const [paywallError, setPaywallError] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  // Куда пользователь собирался, когда упёрся в лимит: после покупки или
  // «Позже» продолжаем ровно туда, а не выкидываем его на выбор цели заново.
  const pendingRide = useRef<[LatLng, string | null, LngLatBox] | null>(null);
  /** То же для «Продолжить» из журнала — второй способ начать поездку. */
  const pendingResume = useRef<Trip | null>(null);

  useEffect(() => {
    void initBilling().then((ok) => {
      if (ok) void getPrice().then((p) => setPrice(p?.formattedPrice ?? null));
    });
  }, []);

  // ── Мягкое обновление из Play.
  // Проверяем один раз при запуске: Play качает новую версию в фоне, человек
  // продолжает пользоваться, и только когда файл готов — снизу появляется
  // полоска «Перезапустить». Жёсткий режим сознательно не используем: он
  // запирает человека в экране прогресса, а тот может стоять на перекрёстке.
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => watchAppUpdate(() => setUpdateReady(true)), []);

  /**
   * Запустить поездку из журнала. Цель — старт трека (возврат), и НАСЛЕДУЕМ
   * контекст поездки (id/дистанция/время/скорость), чтобы persistTrip
   * перезаписал ТУ ЖЕ запись (один растущий трек), а не плодил новую, и чтобы
   * ETA был верным (avgMps = ridden/time на согласованных итогах).
   * Trip не хранит elapsedSec — реконструируем из distM/avgSpeed.
   */
  const startResumedTrip = useCallback((trip: Trip) => {
    const trail = trip.trail;
    const start = trail[0];
    setTarget({ lat: start.lat, lng: start.lng });
    setTargetName(t('target.start'));
    setReverse(false);
    setContTripId(trip.id);
    setContTripName(trip.name);
    setContRiddenM(trip.distM);
    setContElapsedSec(trip.speedAvgMps > 0 ? Math.round(trip.distM / trip.speedAvgMps) : 0);
    setContSpeedMax(trip.speedMaxMps);
    setContWaypoints([]);
    setResumeTrail(trail);
    setScreen('ride');
  }, []);

  /**
   * Пустить пользователя туда, куда он шёл до появления экрана покупки.
   * Оба намерения снимаем СРАЗУ, до разбора веток: иначе невыполненное
   * уезжает в следующий раз и человек попадает не туда, куда собирался.
   */
  const resumePendingRide = useCallback(() => {
    setPaywall(false);
    const trip = pendingResume.current;
    const args = pendingRide.current;
    pendingResume.current = null;
    pendingRide.current = null;
    if (trip) {
      resumeWakeAudio();
      startResumedTrip(trip);
      return;
    }
    if (!args) return;
    resumeWakeAudio();
    const [tg, name, box] = args;
    setTarget(tg);
    setTargetName(name);
    setReverse(false);
    setResumeTrail(contTrail ?? null);
    setPickBox(box);
    setScreen('cache');
  }, [contTrail, startResumedTrip]);

  /**
   * Исход оплаты Play присылает СОБЫТИЕМ, а не ответом на purchase(): тот
   * резолвится в момент открытия окна магазина, ещё до того как человек нажал
   * «Оплатить». Без этой подписки экран покупки оставался висеть после
   * успешной оплаты — человек платил и снова видел кнопку «Купить».
   */
  const paywallOpenRef = useRef(false);
  paywallOpenRef.current = paywall;
  useEffect(
    () =>
      onEntitlement((owned) => {
        if (!owned || !paywallOpenRef.current) return;
        setPaywallBusy(false);
        setPaywallError(null);
        resumePendingRide();
      }),
    [resumePendingRide],
  );

  const goCache = useCallback((tg: LatLng, name: string | null, box: LngLatBox) => {
    // Ворота лимита — только на НАСТОЯЩЕМ старте новой поездки и только там,
    // где есть магазин.
    //   • продолжение («Новая цель») лимит не тратит и упираться в экран
    //     покупки посреди дороги не должно — это та же поездка;
    //   • в вебе покупки не существует, поэтому ворота заперли бы человека
    //     навсегда: купить нечего, восстановить нечего, «Позже» одноразовое.
    const continuing = contTrail !== null || contTripId !== null;
    if (billingAvailable() && !continuing && !quotaState().canRide) {
      pendingRide.current = [tg, name, box];
      pendingResume.current = null; // новое намерение отменяет прежнее
      setPaywallError(null);
      setPaywall(true);
      return;
    }
    resumeWakeAudio(); // внутри жеста «Старт →» — запускаем фоновый аудио
    setTarget(tg);
    setTargetName(name);
    setReverse(false);
    // При продолжении — прокидываем существующий трек.
    if (contTrail) {
      setResumeTrail(contTrail);
    } else {
      setResumeTrail(null);
    }
    setPickBox(box);
    setScreen('cache');
  }, [contTrail, contTripId]);

  const goRide = useCallback(() => setScreen('ride'), []);
  const goPick = useCallback(() => {
    dropSavedSession();
    setScreen('pick');
    setTarget(null);
    setTargetName(null);
    setResumeTrail(null);
    setReverse(false);
    setContTrail(null);
    setContRiddenM(0);
    setContElapsedSec(0);
    setContSpeedMax(0);
    setContWaypoints([]);
    setContTripId(null);
    setContTripName(null);
  }, [dropSavedSession]);
  const goPickJournal = useCallback(() => {
    dropSavedSession();
    setOpenJournal(true);
    setScreen('pick');
    setTarget(null);
    setTargetName(null);
    setResumeTrail(null);
    setReverse(false);
    setContTrail(null);
    setContRiddenM(0);
    setContElapsedSec(0);
    setContSpeedMax(0);
    setContWaypoints([]);
    setContTripId(null);
    setContTripName(null);
  }, [dropSavedSession]);

  // ── Continuation: продолжение поездки с накопленным треком.
  // «Новая цель» — открывает PickScreen с треком на карте.
  const goContinuePick = useCallback(
    (trail: TrailPoint[], riddenM: number, elapsedSec: number, speedMax: number, waypoints: LatLng[], tripId: string | null, tripName: string) => {
      dropSavedSession();
      setContTrail(trail);
      setContRiddenM(riddenM);
      setContElapsedSec(elapsedSec);
      setContSpeedMax(speedMax);
      setContWaypoints(waypoints);
      setContTripId(tripId);
      setContTripName(tripName);
      setTarget(null);
      setTargetName(null);
      setResumeTrail(null);
      setReverse(false);
      setScreen('pick');
    },
    [dropSavedSession],
  );

  // «Вернуться к старту» — цель = trail[0], через Cache → PRE_RIDE.
  const goContinueHome = useCallback(
    (trail: TrailPoint[], riddenM: number, elapsedSec: number, speedMax: number, waypoints: LatLng[], tripId: string | null, tripName: string) => {
      if (trail.length === 0) return;
      // Симметрично «Новой цели»: без этого убийство приложения на экране
      // кэширования воскрешало СТАРУЮ сессию, и приложение вело к прежней
      // цели вместо точки старта — команда «Вернуться» молча пропадала.
      dropSavedSession();
      resumeWakeAudio();
      const start = trail[0];
      setTarget({ lat: start.lat, lng: start.lng });
      setTargetName(t('target.start'));
      setReverse(false);
      setContWaypoints(waypoints);
      setContTripId(tripId);
      setContTripName(tripName);
      setResumeTrail(trail);
      setContTrail(null); // не нужен на PickScreen
      setContRiddenM(riddenM);
      setContElapsedSec(elapsedSec);
      setContSpeedMax(speedMax);
      // Нужен box для CacheScreen
      const lngs = trail.map(p => p.lng).concat(start.lng);
      const lats = trail.map(p => p.lat).concat(start.lat);
      setPickBox({
        west: Math.min(...lngs), south: Math.min(...lats),
        east: Math.max(...lngs), north: Math.max(...lats),
      });
      setScreen('cache');
    },
    [dropSavedSession],
  );

  /**
   * «Продолжить» у записи в журнале — второй вход в поездку, и он тоже обязан
   * спрашивать про лимит. Журнал открывается сам после каждого финиша, так что
   * без этой проверки достаточно было жать «Продолжить» — и приложение не
   * просило денег никогда.
   */
  const onResumeTrip = useCallback(
    (trip: Trip) => {
      if (!trip.trail || trip.trail.length === 0) return;
      if (billingAvailable() && !quotaState().canRide) {
        pendingResume.current = trip;
        pendingRide.current = null; // новое намерение отменяет прежнее
        setPaywallError(null);
        setPaywall(true);
        return;
      }
      startResumedTrip(trip);
    },
    [startResumedTrip],
  );

  const body = useMemo(() => {
    if (screen === 'cache' && target && pickBox) {
      return (
        <CacheScreen
          settings={settings}
          target={target}
          targetName={targetName}
          box={pickBox}
          onSkip={goRide}
          onDone={goRide}
          // Полный сброс, а не просто смена экрана: иначе унаследованные
          // id/дистанция/время продолжения утекали в следующую поездку, и она
          // перезаписывала чужую запись в журнале обрезанным треком. Терять
          // нечего — «Вернуться» и «Новая цель» сохраняют поездку до перехода.
          onBack={goPick}
          continuationTrail={contTrail ?? resumeTrail}
        />
      );
    }
    if (screen === 'ride' && target) {
      return (
        <RideScreen
          settings={settings}
          target={target}
          targetName={targetName}
          reverse={reverse}
          resumeTrail={resumeTrail}
          savedSession={savedSession}
          onSettings={() => setShowSettings(true)}
          onSettingsChange={updateSettings}
          onJournal={goPickJournal}
          onContinuePick={goContinuePick}
          onContinueHome={goContinueHome}
          contRiddenM={contRiddenM}
          contElapsedSec={contElapsedSec}
          contSpeedMax={contSpeedMax}
          contWaypoints={contWaypoints}
          continuationTripId={contTripId}
          continuationTripName={contTripName}
        />
      );
    }
    return (
      <PickScreen
        settings={settings}
        onSettings={() => setShowSettings(true)}
        onSettingsChange={updateSettings}
        onConfirm={goCache}
        onResumeTrip={onResumeTrip}
        openJournal={openJournal}
        onJournalConsumed={() => setOpenJournal(false)}
        continuationTrail={contTrail}
        continuationWaypoints={contWaypoints}
      />
    );
  }, [screen, settings, target, targetName, reverse, resumeTrail, pickBox, openJournal, contTrail, contWaypoints, contRiddenM, contElapsedSec, contSpeedMax, contTripId, contTripName, goCache, goRide, goPick, goPickJournal, goContinuePick, goContinueHome, onResumeTrip, updateSettings, savedSession]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* fallback — тёмный фон в цвет приложения, без белой вспышки при
          загрузке lazy-чанка экрана. */}
      <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#0a0c0b' }} />}>
        {body}
      </Suspense>
      {showSettings && (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
      {paywall && (
        <Paywall
          price={price}
          busy={paywallBusy}
          error={paywallError}
          onBuy={() => {
            setPaywallBusy(true);
            setPaywallError(null);
            void buyFullVersion()
              .then(() => {
                // Окно Play открылось. Исход придёт событием и обновит квоту —
                // проверяем, разблокировало ли, когда пользователь вернётся.
                setPaywallBusy(false);
                if (quotaState().canRide) resumePendingRide();
              })
              .catch((e: unknown) => {
                setPaywallBusy(false);
                setPaywallError(String(e instanceof Error ? e.message : e));
              });
          }}
          onRestore={() => {
            setPaywallBusy(true);
            setPaywallError(null);
            void restorePurchase()
              .then((r) => {
                setPaywallBusy(false);
                if (r.owned) resumePendingRide();
                else setPaywallError(t('paywall.noPurchase'));
              })
              .catch((e: unknown) => {
                setPaywallBusy(false);
                setPaywallError(String(e instanceof Error ? e.message : e));
              });
          }}
          onLater={quotaState().laterAvailable ? () => { useLater(); resumePendingRide(); } : null}
          onClose={() => {
            // Гасим ОБА намерения. Пока «Продолжить» из журнала оставалось
            // жить, следующая покупка (или одноразовое «Позже») увозила
            // человека к старой поездке вместо выбранной им цели, да ещё и
            // дописывала трек в чужую запись журнала.
            setPaywall(false);
            pendingRide.current = null;
            pendingResume.current = null;
          }}
        />
      )}
      {needRefresh && <UpdateToast onApply={() => updateServiceWorker(true)} />}
      {/* Перезапуск посреди поездки недопустим — предлагаем только вне неё. */}
      {updateReady && screen !== 'ride' && (
        <UpdateToast
          onApply={() => void applyAppUpdate()}
          labelKey="update.ready"
          actionKey="update.restart"
        />
      )}
      <InstallPrompt />
      {DevBar && <Suspense fallback={null}><DevBar /></Suspense>}
    </div>
  );
}
