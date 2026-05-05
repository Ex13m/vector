// screens.jsx — Vector screens. Futuristic frontier UI.
const { useState: uS, useEffect: uE, useRef: uR } = React;

const btnPrimary = {
  width:'100%', height:54, borderRadius:14, border:'none',
  background:C.target, color:'#1a0a00', fontFamily:F_DISP,
  fontSize:16, fontWeight:600, letterSpacing:'0.01em', cursor:'pointer',
};
const btnGhost = {
  width:'100%', height:48, borderRadius:14, border:`1px solid ${C.line2}`,
  background:'transparent', color:C.ink, fontFamily:F_DISP,
  fontSize:14, fontWeight:500, cursor:'pointer',
};
const screenHeader = (sub, title) => (
  <div style={{ padding:'18px 20px 12px' }}>
    <div style={{ fontFamily:F_MONO, fontSize:11, letterSpacing:'0.18em',
                  color:C.inkDim, textTransform:'uppercase' }}>{sub}</div>
    <div style={{ fontFamily:F_DISP, fontSize:28, fontWeight:600, marginTop:4,
                  letterSpacing:'-0.01em' }}>{title}</div>
  </div>
);

// ─── 01 PICK SCREEN ─────────────────────────────────────────────────────
function PickScreen({ lang, layer, onLayer, onConfirm, savedTargets, savedTrips, onLoadFav, onResumeTrip }) {
  const t = STR[lang];
  const [target, setTarget] = uS(null);
  const [reverse, setReverse] = uS(false);
  const [showFavs, setShowFavs] = uS(false);
  const W = 396, H = 460;
  const you = { x: W*0.42, y: H*0.62 };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column',
                  background:C.bg, color:C.ink }}>
      {screenHeader('01 / Цель', t.pick)}

      <div style={{ margin:'0 16px 12px', height:44, borderRadius:12,
                    background:C.bg2, border:`1px solid ${C.line}`,
                    display:'flex', alignItems:'center', padding:'0 14px', gap:10 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke={C.inkDim} strokeWidth="1.5"/>
          <line x1="11" y1="11" x2="14" y2="14" stroke={C.inkDim} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={{ fontFamily:F_DISP, fontSize:14, color:C.inkMute }}>{t.search}</span>
      </div>

      <div style={{ flex:1, position:'relative', minHeight:0 }}>
        <MapView width={W} height={H} you={you} target={target}
                 layer={layer} onTap={(p)=>setTarget(p)} showCenterCross={!target}/>

        <LayerPills lang={lang} layer={layer} onLayer={onLayer}/>

        <button onClick={()=>setShowFavs(true)} style={{
          position:'absolute', top:12, left:12, height:36, padding:'0 12px',
          borderRadius:10, border:`1px solid ${C.line2}`,
          background:'rgba(11,13,12,0.85)', color:C.ink,
          fontFamily:F_MONO, fontSize:11, letterSpacing:'0.1em', cursor:'pointer',
          display:'flex', alignItems:'center', gap:6,
        }}>
          ★ {savedTargets.length} · {savedTrips.length}
        </button>

        {target && (
          <div style={{ position:'absolute', bottom:12, left:12, padding:'6px 10px',
                        background:'rgba(11,13,12,0.85)', border:`1px solid ${C.line2}`,
                        borderRadius:6, fontFamily:F_MONO, fontSize:10,
                        color:C.inkDim, letterSpacing:'0.04em' }}>
            52.51742° · 13.40213°
          </div>
        )}
      </div>

      {/* Bottom action with reverse toggle */}
      <div style={{ padding:'14px 16px 18px', background:C.bg, borderTop:`1px solid ${C.line}` }}>
        {target ? (
          <>
            <div onClick={()=>setReverse(r=>!r)} style={{
              marginBottom:10, padding:'10px 12px', borderRadius:10,
              border:`1px solid ${reverse?C.target:C.line2}`,
              background:reverse?'rgba(255,107,26,0.08)':'transparent',
              display:'flex', alignItems:'center', gap:10, cursor:'pointer',
            }}>
              <div style={{
                width:18, height:18, borderRadius:4, border:`1.5px solid ${reverse?C.target:C.inkDim}`,
                background:reverse?C.target:'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {reverse && <span style={{ color:'#1a0a00', fontSize:11, fontWeight:700 }}>✓</span>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F_DISP, fontSize:13, fontWeight:500 }}>
                  Обратный режим — «уйти от точки»
                </div>
                <div style={{ fontFamily:F_MONO, fontSize:10, color:C.inkDim, marginTop:2 }}>
                  Голос будет вести от точки, а не к ней
                </div>
              </div>
            </div>
            <button onClick={()=>onConfirm({ target, reverse })} style={btnPrimary}>
              {reverse ? 'СТАРТ ОТ ТОЧКИ' : t.confirm} →
            </button>
          </>
        ) : (
          <div style={{ fontFamily:F_MONO, fontSize:11, color:C.inkMute,
                        textAlign:'center', padding:'14px 0', letterSpacing:'0.1em' }}>
            ⊕ {t.pickHint.toUpperCase()}
          </div>
        )}
      </div>

      {showFavs && (
        <FavoritesSheet lang={lang} items={savedTargets} trips={savedTrips}
          onClose={()=>setShowFavs(false)}
          onPick={(item)=>{ setShowFavs(false); onLoadFav(item); }}
          onResume={(trip)=>{ setShowFavs(false); onResumeTrip(trip); }}/>
      )}
    </div>
  );
}

function LayerPills({ lang, layer, onLayer }) {
  const t = STR[lang];
  const items = [
    { v:'std',  l:t.layerStd },
    { v:'sat',  l:t.layerSat },
    { v:'topo', l:t.layerTopo },
    { v:'tour', l:t.layerTour },
  ];
  return (
    <div style={{ position:'absolute', top:12, right:12, display:'flex',
                  flexDirection:'column', gap:4, padding:4,
                  background:'rgba(11,13,12,0.85)', borderRadius:10,
                  border:`1px solid ${C.line2}`, backdropFilter:'blur(8px)' }}>
      {items.map(i=>(
        <button key={i.v} onClick={()=>onLayer(i.v)} style={{
          height:30, padding:'0 12px', minWidth:78,
          background: layer===i.v ? C.target : 'transparent',
          color: layer===i.v ? '#1a0a00' : C.ink,
          border:'none', borderRadius:7,
          fontFamily:F_MONO, fontSize:10, letterSpacing:'0.08em',
          fontWeight:layer===i.v?600:400, cursor:'pointer',
          textTransform:'uppercase',
        }}>
          {i.l}
        </button>
      ))}
    </div>
  );
}

// ─── 02 CACHE SCREEN ────────────────────────────────────────────────────
function CacheScreen({ lang, layer, target, onDone }) {
  const t = STR[lang];
  const [progress, setProgress] = uS(0);
  const [tilesDone, setTilesDone] = uS(0);
  const [zoomDelta, setZoomDelta] = uS(0); // -2..+2 detail level
  const [started, setStarted] = uS(false);
  const W = 396, H = 320;
  const you = { x: W*0.5, y: H*0.7 };
  const tg = target || { x: W*0.62, y: H*0.28 };

  // Selection = full visible map frame (no narrow strip)
  const selRect = useMemo(()=>({ x:2, y:2, w:W-4, h:H-4 }),[]);

  // Tiles depend only on detail level (zoom), not on rect anymore
  const totalTiles = Math.max(40, Math.floor(140 * Math.pow(2, zoomDelta*0.6)));
  const sizeMB = (totalTiles * 0.018).toFixed(1);

  uE(()=>{
    if (!started) return;
    const id = setInterval(()=>{
      setProgress(p=>{
        if (p>=100){ clearInterval(id); return 100; }
        return Math.min(100, p+2);
      });
      setTilesDone(n=>Math.min(totalTiles, n+Math.floor(8+Math.random()*12)));
    }, 40);
    return ()=>clearInterval(id);
  },[started, totalTiles]);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:C.bg, color:C.ink }}>
      {screenHeader('02 / Офлайн', t.cache)}

      <div style={{ position:'relative' }}>
        <MapView width={W} height={H} you={you} target={tg}
                 layer={layer} dim={!started}
                 downloadProgress={started?progress:null}
                 selectionRect={!started?selRect:null}/>
      </div>

      <div style={{ flex:1, padding:'18px 20px', display:'flex', flexDirection:'column' }}>
        {!started ? (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontFamily:F_DISP, fontSize:14, color:C.ink }}>
                  Видимая область
                </span>
                <span style={{ fontFamily:F_MONO, fontSize:12, color:C.target }}>
                  ~{sizeMB} MB · {totalTiles.toLocaleString()} {t.tilesReady}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={()=>setZoomDelta(d=>Math.max(-2,d-1))}
                  style={{ width:36, height:36, borderRadius:10, border:`1px solid ${C.line2}`,
                           background:'transparent', color:C.ink, fontSize:18, cursor:'pointer' }}>−</button>
                <input type="range" min={-2} max={2} step={1} value={zoomDelta}
                  onChange={e=>setZoomDelta(Number(e.target.value))}
                  style={{ flex:1, accentColor:C.target }}/>
                <button onClick={()=>setZoomDelta(d=>Math.min(2,d+1))}
                  style={{ width:36, height:36, borderRadius:10, border:`1px solid ${C.line2}`,
                           background:'transparent', color:C.ink, fontSize:18, cursor:'pointer' }}>+</button>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between',
                            fontFamily:F_MONO, fontSize:10, color:C.inkDim, marginTop:4 }}>
                <span>− меньше деталей</span>
                <span>{zoomDelta===0?'СТАНДАРТ':zoomDelta>0?`+${zoomDelta}`:`${zoomDelta}`}</span>
                <span>+ больше деталей</span>
              </div>
            </div>
            <div style={{ flex:1 }}/>
            <button onClick={()=>setStarted(true)} style={btnPrimary}>
              ↓ {t.cache} ({sizeMB} MB)
            </button>
          </>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
              <span style={{ fontFamily:F_MONO, fontSize:56, fontWeight:500,
                             color:C.ink, letterSpacing:'-0.04em',
                             fontVariantNumeric:'tabular-nums' }}>
                {Math.floor(progress)}
              </span>
              <span style={{ fontFamily:F_MONO, fontSize:20, color:C.inkDim }}>%</span>
            </div>
            <div style={{ fontFamily:F_MONO, fontSize:11, color:C.inkDim,
                          letterSpacing:'0.06em' }}>
              {tilesDone.toLocaleString()} / {totalTiles.toLocaleString()} {t.tilesReady}
            </div>
            <div style={{ height:2, background:C.line2, marginTop:14, borderRadius:1, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progress}%`, background:C.target,
                            transition:'width 0.04s linear' }}/>
            </div>
            <div style={{ flex:1 }}/>
            <button onClick={onDone} disabled={progress<100} style={{
              ...btnPrimary,
              background: progress<100?C.line2:C.target,
              color: progress<100?C.inkMute:'#1a0a00',
              cursor: progress<100?'default':'pointer',
            }}>
              {progress<100 ? `${Math.floor(progress)}%` : `${t.startRide} →`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 03 RIDE SCREEN — Frontier futuristic ride ──────────────────────────
function RideScreen({ lang, settings, layer, onLayer, onExit, onSettings,
                      simSpeed, dialStyle, onDialStyle, onSaveTrip, reverse }) {
  const t = STR[lang];
  const [time, setTime] = uS(0);
  const [bearing, setBearing] = uS(-30);
  // In reverse mode, distance grows. Otherwise shrinks toward 0.
  const [distM, setDistM] = uS(reverse ? 30 : 4820);
  const [maxDist, setMaxDist] = uS(reverse ? 0 : 4820);
  const [speedKmh, setSpeedKmh] = uS(22);
  const [phrase, setPhrase] = uS(null);
  const [silence, setSilence] = uS(false);
  const [pulse, setPulse] = uS(0);
  const [paused, setPaused] = uS(false);
  const [showCancel, setShowCancel] = uS(false);
  const [trail, setTrail] = uS([]);
  const [chromeVisible, setChromeVisible] = uS(true);
  const [showTrail, setShowTrail] = uS(true);
  const [peekDial, setPeekDial] = uS(false);
  const lastClockHrRef = React.useRef(null);

  // Auto-hide chrome after 5s of inactivity
  uE(()=>{
    if (!chromeVisible) return;
    const id = setTimeout(()=>setChromeVisible(false), 5000);
    return ()=>clearTimeout(id);
  },[chromeVisible, paused]);
  const wakeChrome = ()=>setChromeVisible(true);

  // Haptic on hour-tick changes
  uE(()=>{
    const hr = bearingToClock(bearing);
    if (lastClockHrRef.current !== null && lastClockHrRef.current !== hr && navigator.vibrate) {
      navigator.vibrate(hr === 12 ? [12, 30, 24] : 10);
    }
    lastClockHrRef.current = hr;
  },[bearing]);

  // Movement loop. Pauses when paused.
  uE(()=>{
    if (paused) return;
    const id = setInterval(()=>{
      setTime(s=>s+1);
      setDistM(d=>{
        const delta = speedKmh/3.6 * simSpeed;
        return reverse ? d + delta : Math.max(0, d - delta);
      });
      if (reverse) setMaxDist(m=>m+speedKmh/3.6*simSpeed);
      setBearing(b=>{
        const drift=(Math.random()-0.5)*8*simSpeed;
        return Math.max(-180, Math.min(180, (b+drift)*0.96));
      });
      setSpeedKmh(sp=>Math.max(8, Math.min(34, sp+(Math.random()-0.5)*1.5)));
      setTrail(tr=>{
        const W=396, H=720;
        const i = tr.length;
        const t0 = i*0.04;
        const x = W*0.5 + Math.sin(t0*1.7)*60 - i*0.6;
        const y = H*0.62 + i*1.4 + Math.cos(t0*1.3)*20;
        const next = [...tr, {x, y}];
        return next.length>120 ? next.slice(-120) : next;
      });
    }, 1000/Math.max(1,simSpeed));
    return ()=>clearInterval(id);
  },[simSpeed, paused, reverse]);

  uE(()=>{
    if (silence || !settings.intervalSec || paused) return;
    const interval = settings.intervalSec / Math.max(1,simSpeed);
    const id = setInterval(()=>{
      const clock = bearingToClock(bearing);
      setPhrase(buildPhrase(lang, { clock, distM, reverse }));
      setPulse(p=>p+1);
      setTimeout(()=>setPhrase(null), 4000);
    }, interval*1000);
    return ()=>clearInterval(id);
  },[bearing, distM, lang, settings.intervalSec, simSpeed, silence, paused, reverse]);

  const sayNow = ()=>{
    const clock = bearingToClock(bearing);
    setPhrase(buildPhrase(lang, { clock, distM, reverse }));
    setPulse(p=>p+1);
    setTimeout(()=>setPhrase(null), 4000);
  };

  const clock = bearingToClock(bearing);
  const arrived = !reverse && distM < 30;
  const near = !reverse && distM < 500 && !arrived;
  const dist = fmtDist(distM);
  const etaMin = speedKmh > 0.5 ? Math.max(1, Math.round(distM/1000 / speedKmh * 60)) : null;

  const W = 396, H = 720;
  const you = { x: W*0.5, y: H*0.62 };
  const ar = (bearing-90)*Math.PI/180;
  const proximity = Math.min(1, distM/4800);
  const dist2D = 220 * proximity + 60;
  const target = { x: you.x + Math.cos(ar)*dist2D, y: you.y + Math.sin(ar)*dist2D };

  return (
    <div onClick={wakeChrome} style={{ height:'100%', background:C.bg, color:C.ink, position:'relative',
                  display:'flex', flexDirection:'column', overflow:'hidden' }}>

      <div style={{ position:'absolute', inset:0, zIndex:0 }}>
        <MapView width={W} height={H} you={you} target={target} layer={layer}
                 dim={dialStyle!=='map'} trail={showTrail?trail:[]}/>
        {/* Lighter gradient in map mode so map stays the hero */}
        <div style={{ position:'absolute', inset:0,
          background: dialStyle==='map'
            ? 'linear-gradient(180deg, rgba(10,12,11,0.55) 0%, rgba(10,12,11,0.05) 18%, rgba(10,12,11,0.05) 70%, rgba(10,12,11,0.85) 100%)'
            : 'linear-gradient(180deg, rgba(10,12,11,0.7) 0%, rgba(10,12,11,0.3) 30%, rgba(10,12,11,0.3) 70%, rgba(10,12,11,0.95) 100%)',
          pointerEvents:'none' }}/>
      </div>

      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column',
                    height:'100%' }}>

        {/* TOP BAR — back · status · settings only */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'10px 12px 6px', gap:8,
                      opacity: chromeVisible?1:0.18, transition:'opacity 400ms' }}>
          <button onClick={()=>setShowCancel(true)} style={topBtn}>←</button>
          <div style={{ display:'flex', alignItems:'center', gap:6,
                        padding:'6px 12px', borderRadius:999,
                        background:'rgba(11,13,12,0.85)', border:`1px solid ${C.line2}`,
                        backdropFilter:'blur(8px)' }}>
            <span style={{ width:6, height:6, borderRadius:3, background:paused?C.target:C.ok,
                           boxShadow:`0 0 8px ${paused?C.target:C.ok}` }}/>
            <span style={{ fontFamily:F_MONO, fontSize:10, letterSpacing:'0.18em', color:C.ink }}>
              {paused?'PAUSED':reverse?'EXIT':'LIVE'}
            </span>
          </div>
          <button onClick={onSettings} style={topBtn}>⚙</button>
        </div>

        {/* Main map area — full bleed, with floating layer btn (left) + dial (right) */}
        <div style={{ flex:1, position:'relative', minHeight:0 }}>
          <VectorView bearing={bearing} clock={clock} dist={dist}
                      pulse={pulse} reverse={reverse}
                      near={near} etaMin={etaMin}/>
          <div style={{ position:'absolute', left:12, top:8, zIndex:3,
                        opacity: chromeVisible?1:0.18, transition:'opacity 400ms' }}>
            <LayerButton layer={layer} onLayer={onLayer}
                         showTrail={showTrail} onToggleTrail={()=>setShowTrail(v=>!v)}/>
          </div>
          <div style={{ position:'absolute', right:12, top:6, zIndex:3,
                        opacity: chromeVisible?1:0.18, transition:'opacity 400ms' }}>
            <MiniClockDial bearing={bearing} clock={clock}
                           onPeek={()=>{ setPeekDial(true); setTimeout(()=>setPeekDial(false), 2200); }}/>
          </div>
        </div>

        {/* BOTTOM HUD — telemetry + STOP */}
        <div style={{ display:'flex', alignItems:'stretch',
                      borderTop:`1px solid ${C.line}`,
                      background:'rgba(17,20,19,0.94)', backdropFilter:'blur(8px)' }}>
          <button onClick={()=>setPaused(p=>!p)} style={{
            width:54, border:'none', borderRight:`1px solid ${C.line}`,
            background: paused ? 'rgba(255,107,26,0.16)' : 'transparent',
            color: paused ? C.target : C.ink, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
          }} title={paused?'Продолжить':'Пауза'}>
            {paused ? <PlayIcon/> : <PauseIcon/>}
            <span style={{ fontFamily:F_MONO, fontSize:8.5, letterSpacing:'0.16em',
                           color: paused?C.target:C.inkDim }}>
              {paused?'PLAY':'PAUSE'}
            </span>
          </button>
          <Tele label={t.speed} value={Math.round(speedKmh)} unit="km/h"/>
          <Tele label={reverse?'ОТ ТОЧКИ':'RIDDEN'} value={fmtDist(reverse?distM:(maxDist-distM)).v} unit={fmtDist(reverse?distM:(maxDist-distM)).u} highlight/>
          <Tele label={t.rideTime} value={fmtTime(time)}/>

          {/* voice + mute mini-buttons stacked */}
          <div style={{ display:'flex', flexDirection:'column',
                        borderLeft:`1px solid ${C.line}` }}>
            <button onClick={sayNow} style={{
              flex:1, width:44, border:'none', borderBottom:`1px solid ${C.line}`,
              background:'transparent', color:C.target, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }} title="Сказать сейчас">
              <SoundIcon size={18} color={C.target}/>
            </button>
            <button onClick={()=>setSilence(s=>!s)} style={{
              flex:1, width:44, border:'none',
              background: silence?'rgba(255,107,26,0.12)':'transparent',
              color: silence?C.target:C.inkDim, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }} title={silence?'Включить голос':'Заглушить'}>
              {silence ? <UnmuteIcon/> : <MuteIcon/>}
            </button>
          </div>

          <button onClick={()=>setShowCancel(true)} style={{
            width:70, border:'none', borderLeft:`1px solid ${C.line}`,
            background:'rgba(201,58,26,0.14)', color:'#ff5a3a',
            fontFamily:F_MONO, fontSize:10, fontWeight:700, letterSpacing:'0.14em',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:4, cursor:'pointer',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1.5" fill="#ff5a3a"/>
            </svg>
            STOP
          </button>
        </div>
      </div>

      {/* Pause/play FAB removed — moved into bottom HUD */}

      {phrase && (
        <div style={{ position:'absolute', left:14, right:14, top:96, zIndex:5,
                      padding:'12px 14px', borderRadius:12,
                      background:'rgba(255,107,26,0.12)',
                      border:`1px solid ${C.target}`, backdropFilter:'blur(8px)',
                      animation:'fadeIn 0.3s ease-out' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <SoundIcon/>
            <span style={{ fontFamily:F_MONO, fontSize:10, letterSpacing:'0.18em', color:C.target }}>
              VOICE · {lang.toUpperCase()}
            </span>
          </div>
          <div style={{ fontFamily:F_DISP, fontSize:16, fontWeight:500, color:C.ink, lineHeight:1.3 }}>
            "{phrase}"
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {paused && (
        <div style={{ position:'absolute', inset:0, zIndex:8, pointerEvents:'none',
          background:'rgba(11,13,12,0.4)', backdropFilter:'blur(2px)',
          display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:160 }}>
          <div style={{
            padding:'14px 22px', borderRadius:12,
            border:`1px solid ${C.target}`, background:'rgba(11,13,12,0.92)',
            fontFamily:F_MONO, fontSize:13, letterSpacing:'0.2em', color:C.target,
            textTransform:'uppercase',
          }}>
            ⏸ Пауза · тап для продолжения
          </div>
        </div>
      )}

      {showCancel && (
        <div style={{ position:'absolute', inset:0, zIndex:20,
                      background:'rgba(11,13,12,0.85)', backdropFilter:'blur(8px)',
                      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:C.bg2, border:`1px solid ${C.line2}`, borderRadius:18,
                        padding:24, width:'100%', maxWidth:320 }}>
            <div style={{ fontFamily:F_DISP, fontSize:20, fontWeight:600, marginBottom:8 }}>
              Завершить маршрут?
            </div>
            <div style={{ fontFamily:F_DISP, fontSize:14, color:C.inkDim, marginBottom:18,
                          lineHeight:1.4 }}>
              {fmtTime(time)} в пути · {dist.v} {dist.u} {reverse?'от точки':'осталось'}.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={()=>{
                  onSaveTrip({name:`Поездка · ${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`,
                              time, distM:reverse?distM:(maxDist-distM),
                              speedKmh, trail, reverse, finished:false});
                  onExit();
                }}
                style={btnPrimary}>
                ↓ Сохранить и выйти
              </button>
              <button onClick={onExit} style={{ ...btnGhost, color:'#c93a1a',
                                                borderColor:'rgba(201,58,26,0.5)' }}>
                Выйти без сохранения
              </button>
              <button onClick={()=>setShowCancel(false)} style={btnGhost}>
                Продолжить ехать
              </button>
            </div>
          </div>
        </div>
      )}

      {peekDial && (
        <div onClick={()=>setPeekDial(false)} style={{
          position:'absolute', inset:0, zIndex:9,
          background:'rgba(8,10,9,0.92)', backdropFilter:'blur(6px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          animation:'fadeIn 220ms ease-out',
        }}>
          <ClockDial bearing={bearing} clock={clock} pulse={pulse}
                     speedKmh={speedKmh} distM={distM} reverse={reverse}/>
        </div>
      )}

      {arrived && (
        <div style={{ position:'absolute', inset:0, background:C.bg,
                      display:'flex', flexDirection:'column', alignItems:'center',
                      justifyContent:'center', padding:24, zIndex:30 }}>
          <div style={{ width:110, height:110, borderRadius:55, border:`2px solid ${C.target}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        marginBottom:18 }}>
            <div style={{ fontSize:46, color:C.target }}>✓</div>
          </div>
          <div style={{ fontFamily:F_DISP, fontSize:28, fontWeight:600 }}>{t.arrived}</div>
          <div style={{ fontFamily:F_MONO, fontSize:12, color:C.inkDim, marginTop:6,
                        letterSpacing:'0.1em' }}>
            {fmtTime(time)} · {speedKmh.toFixed(1)} KM/H · {fmtDist(maxDist).v} {fmtDist(maxDist).u}
          </div>
          <div style={{ width:'100%', maxWidth:300, marginTop:24, display:'flex',
                        flexDirection:'column', gap:8 }}>
            <SaveTripBlock onSave={(name)=>onSaveTrip({name, time, distM:maxDist, speedKmh, trail, reverse, finished:true})} t={t}/>
            <button onClick={onExit} style={btnGhost}>{t.newTarget}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const fab = (bg, fg) => ({
  width:50, height:50, borderRadius:25, border:'none', background:bg, color:fg,
  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
  boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
});
const topBtn = {
  width:38, height:38, borderRadius:10, border:`1px solid ${C.line2}`,
  background:'rgba(11,13,12,0.85)', backdropFilter:'blur(8px)',
  color:C.ink, fontSize:18, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
};
const iconBtn = {
  width:36, height:36, borderRadius:10, border:`1px solid ${C.line2}`,
  background:'transparent', color:C.ink, fontSize:17, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
};

function Tele({ label, value, unit, highlight }) {
  return (
    <div style={{ flex:1, padding:'12px 8px', textAlign:'center', borderRight:`1px solid ${C.line}` }}>
      <div style={{ fontFamily:F_MONO, fontSize:9, letterSpacing:'0.14em', color:C.inkDim }}>{label}</div>
      <div style={{ marginTop:3, display:'flex', alignItems:'baseline',
                    justifyContent:'center', gap:3 }}>
        <span style={{ fontFamily:F_MONO, fontSize:highlight?22:18,
                       fontWeight:500, color:highlight?C.target:C.ink,
                       fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
          {value}
        </span>
        {unit && <span style={{ fontFamily:F_MONO, fontSize:10, color:C.inkDim }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── LAYER BUTTON with popover ──────────────────────────────────────────
function LayerButton({ layer, onLayer, showTrail, onToggleTrail }) {
  const [open, setOpen] = uS(false);
  const items = [
    {v:'std',  l:'Карта',   icon:<IconLayerStd/>},
    {v:'sat',  l:'Спутник', icon:<IconLayerSat/>},
    {v:'topo', l:'Топо',    icon:<IconLayerTopo/>},
    {v:'tour', l:'Турист',  icon:<IconLayerTour/>},
  ];
  const cur = items.find(i=>i.v===layer) || items[0];
  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        ...topBtn, width:42, height:38, padding:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        color: open ? C.target : C.ink,
        borderColor: open ? C.target : C.line2,
      }} title="Слой карты">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 7.5L9 5L15 7.5L21 5V16.5L15 19L9 16.5L3 19V7.5Z"
                stroke={open?C.target:C.ink} strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M9 5V16.5M15 7.5V19" stroke={open?C.target:C.ink}
                strokeWidth="1.4" strokeOpacity="0.55"/>
        </svg>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{
            position:'fixed', inset:0, zIndex:11,
          }}/>
          <div style={{
            position:'absolute', top:44, left:0, zIndex:12,
            display:'flex', flexDirection:'column', gap:2, padding:4,
            borderRadius:12, minWidth:140,
            background:'rgba(11,13,12,0.96)', border:`1px solid ${C.line2}`,
            backdropFilter:'blur(12px)',
            boxShadow:'0 12px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontFamily:F_MONO, fontSize:8.5, letterSpacing:'0.22em',
                          color:C.inkDim, padding:'6px 8px 4px' }}>
              СЛОЙ КАРТЫ
            </div>
            {items.map(it=>{
              const active = it.v===layer;
              return (
                <button key={it.v} onClick={()=>{ onLayer && onLayer(it.v); setOpen(false); }}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'8px 10px', border:'none', borderRadius:8, cursor:'pointer',
                    background: active ? C.target : 'transparent',
                    color: active ? '#1a0a00' : C.ink,
                    fontFamily:F_MONO, fontSize:11, letterSpacing:'0.08em',
                    textTransform:'uppercase', fontWeight: active?700:500,
                  }}>
                  <div style={{ width:16, height:16, display:'flex',
                                alignItems:'center', justifyContent:'center' }}>
                    {it.icon}
                  </div>
                  {it.l}
                </button>
              );
            })}
            {/* Trace toggle */}
            <div style={{ height:1, background:C.line2, margin:'4px 6px' }}/>
            <button onClick={()=>{ onToggleTrail && onToggleTrail(); }}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 10px', border:'none', borderRadius:8, cursor:'pointer',
                background:'transparent', color:C.ink,
                fontFamily:F_MONO, fontSize:11, letterSpacing:'0.08em',
                textTransform:'uppercase', fontWeight:500,
              }}>
              <div style={{ width:16, height:16, display:'flex',
                            alignItems:'center', justifyContent:'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 11C4 9 5 4 8 4C11 4 11 11 13 9" stroke={showTrail?C.target:C.inkDim} strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              След · {showTrail?'вкл':'выкл'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── COMPASS CLOCK — small dial, hour & minute hands ───────────────────
// ─── MINI CLOCK-DIAL — analogue 12 hours, hand = bearing to target ──────
function MiniClockDial({ bearing, clock, onPeek }) {
  const pressTimer = React.useRef(null);
  const startPress = ()=>{ pressTimer.current = setTimeout(()=>{ onPeek && onPeek(); }, 380); };
  const endPress = ()=>{ if (pressTimer.current) clearTimeout(pressTimer.current); };
  const S = 56, cx = S/2, cy = S/2, R = S/2 - 2;
  const ticks = [];
  for (let i=0;i<12;i++){
    const a = (i*30 - 90) * Math.PI/180;
    const major = i%3===0;
    const r1 = R - (major?6:3.5);
    const r2 = R - 1.5;
    ticks.push(
      <line key={i}
        x1={cx + Math.cos(a)*r1} y1={cy + Math.sin(a)*r1}
        x2={cx + Math.cos(a)*r2} y2={cy + Math.sin(a)*r2}
        stroke={major?C.ink:C.inkDim} strokeWidth={major?1.4:0.9} strokeLinecap="round"/>
    );
  }
  // 12 marker (top, white dot)
  const aRad = (bearing - 90) * Math.PI/180;
  const tipX = cx + Math.cos(aRad)*(R-7);
  const tipY = cy + Math.sin(aRad)*(R-7);
  return (
    <div style={{
      width:S, height:S, borderRadius:'50%',
      background:'rgba(11,13,12,0.88)', border:`1px solid ${C.line2}`,
      backdropFilter:'blur(8px)',
      boxShadow:'0 4px 14px rgba(0,0,0,0.4)',
      display:'flex', alignItems:'center', justifyContent:'center',
      cursor:'pointer', userSelect:'none', WebkitUserSelect:'none',
    }} title={`Цель на ${clock} часов · удерж. — увеличить`}
       onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={endPress}
       onTouchStart={startPress} onTouchEnd={endPress} onTouchCancel={endPress}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        {ticks}
        {/* 12 dot */}
        <circle cx={cx} cy={cy-R+4} r="1.4" fill={C.ink}/>
        {/* bearing arrow */}
        <line x1={cx} y1={cy} x2={tipX} y2={tipY}
              stroke={C.target} strokeWidth="2" strokeLinecap="round"/>
        <polygon
          points={`${tipX},${tipY} ${tipX - Math.cos(aRad)*5 - Math.sin(aRad)*3.2},${tipY - Math.sin(aRad)*5 + Math.cos(aRad)*3.2} ${tipX - Math.cos(aRad)*5 + Math.sin(aRad)*3.2},${tipY - Math.sin(aRad)*5 - Math.cos(aRad)*3.2}`}
          fill={C.target}/>
        <circle cx={cx} cy={cy} r="1.8" fill={C.ink}/>
      </svg>
    </div>
  );
}

// ─── VERTICAL RAIL (modes / layers) ─────────────────────────────────────
function RailVertical({ label, items, value, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'stretch',
                  width:54, padding:'4px 0', gap:4,
                  alignSelf:'center', maxHeight:'100%' }}>
      <div style={{ fontFamily:F_MONO, fontSize:8, letterSpacing:'0.22em',
                    color:C.inkDim, textAlign:'center', padding:'2px 0 6px' }}>
        {label}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6,
                    padding:4, borderRadius:14,
                    background:'rgba(11,13,12,0.78)', border:`1px solid ${C.line2}`,
                    backdropFilter:'blur(8px)' }}>
        {items.map(it=>{
          const active = value===it.v;
          return (
            <button key={it.v} onClick={()=>onChange && onChange(it.v)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:2, padding:'6px 0', border:'none', cursor:'pointer',
              borderRadius:10,
              background: active ? C.target : 'transparent',
              color:     active ? '#1a0a00' : C.ink,
            }}>
              <div style={{ width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center',
                            color: active ? '#1a0a00' : C.ink, opacity: active?1:0.85 }}>
                {it.icon}
              </div>
              <div style={{ fontFamily:F_MONO, fontSize:8.5, letterSpacing:'0.1em',
                            fontWeight: active?700:500 }}>
                {it.l}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Mode icons
const IconMap = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M2 4.5 L7 3 L11 5 L16 3.5 V13.5 L11 15 L7 13 L2 14.5 Z"/>
    <line x1="7" y1="3" x2="7" y2="13"/>
    <line x1="11" y1="5" x2="11" y2="15"/>
  </svg>
);
const IconDial = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="9" cy="9" r="6.5"/>
    <line x1="9" y1="9" x2="9" y2="4.5"/>
    <line x1="9" y1="9" x2="12" y2="11"/>
    <circle cx="9" cy="9" r="0.8" fill="currentColor"/>
  </svg>
);
const IconNum = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
    <text x="9" y="13" textAnchor="middle" fontFamily={F_MONO} fontSize="10" fontWeight="700" fill="currentColor" stroke="none">11</text>
  </svg>
);

// Layer icons — small distinct glyphs
const IconLayerStd = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="2.5" y="2.5" width="13" height="13" rx="1.5"/>
    <line x1="2.5" y1="9" x2="15.5" y2="9"/>
    <line x1="9" y1="2.5" x2="9" y2="15.5"/>
  </svg>
);
const IconLayerSat = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
    <circle cx="9" cy="9" r="6.5"/>
    <ellipse cx="9" cy="9" rx="6.5" ry="2.5"/>
    <ellipse cx="9" cy="9" rx="2.5" ry="6.5"/>
  </svg>
);
const IconLayerTopo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M2 13 Q5 8 9 9 T16 7"/>
    <path d="M2 10 Q5 6 9 6.5 T16 4.5" opacity="0.7"/>
    <path d="M2 15.5 Q5 11 9 11.8 T16 9.5" opacity="0.5"/>
  </svg>
);
const IconLayerTour = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M3 14 L6 7 L9 11 L13 4"/>
    <circle cx="3" cy="14" r="1.2" fill="currentColor"/>
    <circle cx="13" cy="4" r="1.2" fill="currentColor"/>
  </svg>
);

// ─── CLEAN CLOCK DIAL ───────────────────────────────────────────────────
function ClockDial({ bearing, clock, pulse, speedKmh, distM, reverse }) {
  const cx = 140, cy = 140;
  const rOuter = 128, rNumbers = 100, rTicks = 114;

  // 12-hour numbers — uniform size, cardinal hours (12/3/6/9) brighter
  const hours=[];
  for (let h=1;h<=12;h++){
    const a=(h/12)*360-90, ar=a*Math.PI/180;
    const x=cx+Math.cos(ar)*rNumbers, y=cy+Math.sin(ar)*rNumbers;
    const isCardinal = h===12 || h===3 || h===6 || h===9;
    hours.push(
      <text key={h} x={x} y={y+5} textAnchor="middle"
        fontFamily={F_MONO} fontSize={isCardinal?15:12}
        fill={h===12?C.target:isCardinal?C.ink:C.inkDim}
        fontWeight={isCardinal?600:400}
        letterSpacing="-0.02em">{h}</text>
    );
  }

  // Outer ticks — only 12 major
  const ticks=[];
  for (let i=0;i<12;i++){
    const a=(i/12)*360-90, ar=a*Math.PI/180;
    const len = 8;
    const x1=cx+Math.cos(ar)*rTicks, y1=cy+Math.sin(ar)*rTicks;
    const x2=cx+Math.cos(ar)*(rTicks-len), y2=cy+Math.sin(ar)*(rTicks-len);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={C.ink} strokeWidth={1.2} opacity={0.55}/>);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div style={{ position:'relative', width:280, height:280,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="280" height="280" key={pulse} style={{ overflow:'visible', position:'absolute' }}>
        <defs>
          <radialGradient id="dialGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="65%" stopColor="rgba(255,107,26,0)"/>
            <stop offset="100%" stopColor="rgba(255,107,26,0.12)"/>
          </radialGradient>
        </defs>

        {/* Outer aura */}
        <circle cx={cx} cy={cy} r={rOuter} fill="url(#dialGlow2)"/>

        {/* Single ring */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={C.line2} strokeWidth="1"/>

        {ticks}
        {hours}

        {/* Pulsing ring on voice cue */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={C.target} strokeWidth="2"
          style={{ animation: pulse?'pulse 1s ease-out':'none', transformOrigin:`${cx}px ${cy}px` }}/>

        {/* Needle — clean single arrow */}
        <g transform={`translate(${cx},${cy}) rotate(${bearing})`}
           style={{ transition:'transform 0.6s cubic-bezier(0.4,0,0.2,1)',
                    transformOrigin:'center' }}>
          {/* shaft */}
          <line x1="0" y1="0" x2="0" y2={`-${rNumbers-22}`}
                stroke={C.target} strokeWidth="4" strokeLinecap="round"/>
          {/* arrow head */}
          <path d={`M 0 -${rNumbers-12} L 11 -${rNumbers-32} L -11 -${rNumbers-32} Z`}
                fill={C.target}/>
          {/* tail */}
          <line x1="0" y1="0" x2="0" y2="22" stroke={C.inkDim} strokeWidth="2.5"
                strokeLinecap="round" opacity="0.5"/>
        </g>

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="6" fill={C.bg} stroke={C.target} strokeWidth="1.5"/>
        <circle cx={cx} cy={cy} r="2.5" fill={C.target}/>
      </svg>
      </div>

      {/* Readout below the dial — no overlap with hour numbers */}
      <div style={{ textAlign:'center', marginTop:-18 }}>
        <div style={{ fontFamily:F_MONO, fontSize:9, letterSpacing:'0.3em',
                      color:C.inkDim, marginBottom:4 }}>
          {reverse ? 'AWAY · O\'CLOCK' : 'TARGET · O\'CLOCK'}
        </div>
        <div style={{ fontFamily:F_DISP, fontSize:42, fontWeight:700, color:C.target,
                      lineHeight:1, letterSpacing:'-0.04em',
                      fontVariantNumeric:'tabular-nums',
                      textShadow:`0 0 20px ${C.glow}` }}>
          {clock}
        </div>
      </div>
    </div>
  );
}

// ─── CLEAN NUMERIC DIAL ─────────────────────────────────────────────────
function NumericDial({ clock, distM, bearing, pulse, lang, reverse }) {
  const dist = fmtDist(distM);
  const wide = clock.length >= 4;
  const numSize = wide ? 110 : 170;

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  width:'100%', maxWidth:260, overflow:'hidden' }}>

      {/* Top label */}
      <div style={{ fontFamily:F_MONO, fontSize:11, letterSpacing:'0.32em',
                    color:C.inkDim, marginBottom:6 }}>
        {reverse ? 'УХОД ОТ ТОЧКИ' : 'ЦЕЛЬ НА'}
      </div>

      {/* Big number */}
      <div key={pulse} style={{
        fontFamily:F_DISP, fontSize:numSize, fontWeight:700, color:C.target,
        lineHeight:0.85, letterSpacing:'-0.06em',
        fontVariantNumeric:'tabular-nums',
        textShadow:`0 0 50px ${C.glow}, 0 0 16px rgba(255,107,26,0.6)`,
        width:'100%', textAlign:'center',
      }}>
        {clock}
      </div>

      <div style={{ fontFamily:F_MONO, fontSize:11, letterSpacing:'0.32em',
                    color:C.inkDim, marginTop:8 }}>
        ЧАСОВ
      </div>

      {/* Thin divider */}
      <div style={{ width:140, height:1, marginTop:24,
                    background:`linear-gradient(90deg, transparent, ${C.line2} 20%, ${C.line2} 80%, transparent)` }}/>

      {/* Distance below */}
      <div style={{ marginTop:18, display:'flex', alignItems:'baseline', gap:6,
                    fontVariantNumeric:'tabular-nums' }}>
        <span style={{ fontFamily:F_MONO, fontSize:38, fontWeight:500, color:C.ink,
                       letterSpacing:'-0.02em' }}>
          {dist.v}
        </span>
        <span style={{ fontFamily:F_MONO, fontSize:14, color:C.inkDim,
                       letterSpacing:'0.1em' }}>
          {dist.u}
        </span>
      </div>
    </div>
  );
}

// ─── MAP MODE OVERLAY — minimal HUD, map is hero ────────────────────────
function VectorView({ bearing, clock, dist, pulse, reverse, near, etaMin }) {
  const cellStyle = {
    flex:'1 1 0', minWidth:0, width:0,
    padding:'10px 6px',
    display:'flex', flexDirection:'column', justifyContent:'center',
    alignItems:'center', gap:4, textAlign:'center',
  };
  const accentColor = near ? C.ok : C.target;
  const accentGlow = near ? 'rgba(72,222,148,0.35)' : C.glow;
  const labelStyle = (highlight) => ({
    fontFamily:F_MONO, fontSize:9, letterSpacing:'0.2em',
    color: highlight?accentColor:C.inkDim,
  });
  const valueRow = { display:'flex', alignItems:'baseline', gap:4,
                     fontFamily:F_DISP, fontWeight:700,
                     letterSpacing:'-0.04em', lineHeight:0.95,
                     fontVariantNumeric:'tabular-nums' };
  const divider = (
    <div style={{
      width:1, alignSelf:'stretch', margin:'4px 0',
      background:`linear-gradient(180deg, transparent, ${C.line2} 20%, ${accentColor} 50%, ${C.line2} 80%, transparent)`,
      opacity:0.55,
    }}/>
  );

  return (
    <div key={pulse} style={{
      position:'absolute', left:14, right:14, bottom:14,
      pointerEvents:'none',
      display:'flex', alignItems:'stretch',
      padding:'8px 2px', borderRadius:14,
      background: near?'rgba(15,32,24,0.85)':'rgba(11,13,12,0.78)',
      backdropFilter:'blur(12px)',
      boxShadow: near?`0 0 32px ${accentGlow}`:'none',
      transition:'background 400ms, box-shadow 400ms',
    }}>
      <div style={cellStyle}>
        <div style={labelStyle(false)}>{reverse?'AWAY':'TO TARGET'}</div>
        <div style={{ ...valueRow, color:near?accentColor:C.ink }}>
          <span style={{ fontSize:28 }}>{dist.v}</span>
          <span style={{ fontSize:11, color:C.inkDim, fontWeight:500 }}>{dist.u}</span>
        </div>
      </div>

      {divider}

      <div style={cellStyle}>
        <div style={labelStyle(true)}>AT · O'CLOCK</div>
        <div style={{ ...valueRow, color:accentColor,
                      textShadow:`0 0 16px ${accentGlow}` }}>
          <span style={{ fontSize:28 }}>{clock}</span>
          <span style={{ fontSize:11, color:accentColor, opacity:0.7, fontWeight:500 }}>h</span>
        </div>
      </div>

      {divider}

      <div style={cellStyle}>
        <div style={labelStyle(false)}>ETA</div>
        <div style={{ ...valueRow, color:near?accentColor:C.ink }}>
          <span style={{ fontSize:28 }}>{etaMin!=null?etaMin:'—'}</span>
          <span style={{ fontSize:11, color:C.inkDim, fontWeight:500 }}>min</span>
        </div>
      </div>
    </div>
  );
}

// SaveTripBlock
function SaveTripBlock({ onSave, t }) {
  const [name, setName] = uS(`Поездка · ${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`);
  return (
    <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
      <input value={name} onChange={e=>setName(e.target.value)}
        placeholder="Название поездки"
        style={{
          height:48, padding:'0 14px', borderRadius:12,
          background:C.bg2, border:`1px solid ${C.line2}`,
          color:C.ink, fontFamily:F_DISP, fontSize:15, outline:'none',
        }}/>
      <button onClick={()=>onSave(name)} style={btnPrimary}>
        ↓ {t.saveTrip}
      </button>
    </div>
  );
}

// ─── SETTINGS SHEET ─────────────────────────────────────────────────────
function SettingsSheet({ lang, settings, setSettings, onLang, onClose }) {
  const t = STR[lang];
  const intervalLabel = settings.intervalSec===0
    ? t.off
    : settings.intervalSec<60
    ? `${settings.intervalSec} ${t.sec}`
    : `${Math.floor(settings.intervalSec/60)}:${String(settings.intervalSec%60).padStart(2,'0')} ${t.min}`;

  return (
    <Sheet onClose={onClose} title={t.settings}>
      <Row label={t.lang}>
        <SegRow value={lang} onChange={onLang}
          options={[{value:'ru',label:'RU'},{value:'en',label:'EN'},{value:'de',label:'DE'}]}/>
      </Row>

      <Row label={t.interval} value={intervalLabel}>
        <input type="range" min={0} max={1800} step={60}
          value={settings.intervalSec}
          onChange={e=>setSettings({ ...settings, intervalSec:Number(e.target.value) })}
          style={{ width:'100%', accentColor:C.target }}/>
        <div style={{ display:'flex', justifyContent:'space-between',
                      fontFamily:F_MONO, fontSize:10, color:C.inkDim, marginTop:2 }}>
          <span>0</span><span>5</span><span>10 {t.min}</span>
        </div>
      </Row>

      <Row label={t.units}>
        <SegRow value={settings.units}
          onChange={v=>setSettings({ ...settings, units:v })}
          options={[
            {value:'metric',label:'м · км'},
            {value:'imperial',label:'ft · mi'},
          ]}/>
      </Row>

      <ToggleRow label={t.haptics} value={settings.haptics}
        onChange={v=>setSettings({ ...settings, haptics:v })}/>
    </Sheet>
  );
}

// ─── FAVORITES SHEET (saved targets + trips) ────────────────────────────
function FavoritesSheet({ lang, items, onClose, onPick, trips=[], onResume }) {
  const t = STR[lang];
  const [tab, setTab] = uS('targets');
  return (
    <Sheet onClose={onClose} title={t.saved}>
      <div style={{ display:'flex', gap:4, padding:3, background:C.bg, borderRadius:10,
                    border:`1px solid ${C.line}`, marginBottom:14 }}>
        {['targets','trips'].map(tk=>(
          <button key={tk} onClick={()=>setTab(tk)} style={{
            flex:1, height:34, border:'none',
            background: tab===tk?C.line2:'transparent',
            color: tab===tk?C.ink:C.inkDim,
            fontFamily:F_DISP, fontSize:13, fontWeight:500,
            borderRadius:8, cursor:'pointer',
          }}>
            {tk==='targets'?`Цели · ${items.length}`:`Поездки · ${trips.length}`}
          </button>
        ))}
      </div>

      {tab==='targets' && (
        items.length===0 ? (
          <div style={{ padding:'22px 6px', fontFamily:F_DISP, fontSize:13,
                        color:C.inkDim, textAlign:'center', lineHeight:1.5 }}>
            {t.noFavs}
          </div>
        ) : items.map((it,i)=>(
          <button key={i} onClick={()=>onPick(it)} style={{
            width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:6,
            background:C.card, border:`1px solid ${C.line2}`, borderRadius:10,
            cursor:'pointer', display:'flex', alignItems:'center', gap:12,
          }}>
            <div style={{ width:34, height:34, borderRadius:8, background:'rgba(255,107,26,0.15)',
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:C.target, fontSize:16 }}>★</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:F_DISP, fontSize:14, fontWeight:500, color:C.ink }}>{it.name}</div>
              <div style={{ fontFamily:F_MONO, fontSize:11, color:C.inkDim }}>
                {it.coords} · {it.cacheMB} MB
              </div>
            </div>
            <span style={{ color:C.inkDim }}>→</span>
          </button>
        ))
      )}

      {tab==='trips' && (
        trips.length===0 ? (
          <div style={{ padding:'22px 6px', fontFamily:F_DISP, fontSize:13,
                        color:C.inkDim, textAlign:'center', lineHeight:1.5 }}>
            Поездки появятся после первого финиша
          </div>
        ) : trips.map((tr,i)=>(
          <div key={i} style={{
            padding:'12px 14px', marginBottom:6,
            background:C.card, border:`1px solid ${C.line2}`, borderRadius:10,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:34, height:34, borderRadius:8,
                            background: tr.finished?'rgba(126,226,168,0.15)':'rgba(255,107,26,0.15)',
                            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ color:tr.finished?C.ok:C.target, fontSize:14 }}>
                  {tr.finished?'✓':'⏸'}
                </span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:F_DISP, fontSize:14, fontWeight:500, color:C.ink }}>{tr.name}</div>
                <div style={{ fontFamily:F_MONO, fontSize:11, color:C.inkDim,
                              display:'flex', gap:10, flexWrap:'wrap', marginTop:2 }}>
                  <span>{tr.distance}</span>
                  <span>·</span>
                  <span>{tr.time}</span>
                  {tr.avgKmh && <><span>·</span><span>{tr.avgKmh} km/h</span></>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, marginTop:10 }}>
              {!tr.finished && onResume && (
                <button onClick={()=>onResume(tr)} style={{
                  flex:1, height:34, padding:'0 12px',
                  border:'none', borderRadius:8, background:C.target,
                  color:'#1a0a00', fontFamily:F_DISP, fontSize:12, fontWeight:600, cursor:'pointer',
                }}>
                  ▶ Продолжить
                </button>
              )}
              <button style={{
                flex:1, height:34, padding:'0 12px',
                border:`1px solid ${C.line2}`, borderRadius:8, background:'transparent',
                color:C.ink, fontFamily:F_DISP, fontSize:12, fontWeight:500, cursor:'pointer',
              }}>
                ↑ GPX
              </button>
            </div>
          </div>
        ))
      )}
    </Sheet>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position:'absolute', inset:0, background:'rgba(11,13,12,0.85)',
                  backdropFilter:'blur(8px)', display:'flex', flexDirection:'column', zIndex:10 }}>
      <div style={{ flex:1 }} onClick={onClose}/>
      <div style={{ background:C.bg2, borderTopLeftRadius:22, borderTopRightRadius:22,
                    border:`1px solid ${C.line2}`, borderBottom:'none',
                    padding:'12px 18px 24px', maxHeight:'82%', overflow:'auto' }}>
        <div style={{ width:36, height:4, background:C.line2, borderRadius:2,
                      margin:'0 auto 12px' }}/>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      marginBottom:14 }}>
          <div style={{ fontFamily:F_DISP, fontSize:20, fontWeight:600 }}>{title}</div>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontFamily:F_DISP, fontSize:14, color:C.ink }}>{label}</span>
        {value && <span style={{ fontFamily:F_MONO, fontSize:12, color:C.target }}>{value}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'12px 0', borderTop:`1px solid ${C.line}` }}>
      <span style={{ fontFamily:F_DISP, fontSize:14, color:C.ink }}>{label}</span>
      <button onClick={()=>onChange(!value)} style={{
        width:42, height:24, borderRadius:12, border:'none',
        background: value?C.target:C.line2,
        position:'relative', cursor:'pointer', padding:0,
      }}>
        <div style={{ position:'absolute', top:3, left:value?21:3,
                      width:18, height:18, borderRadius:9, background:'#fff',
                      transition:'left 0.15s' }}/>
      </button>
    </div>
  );
}

function SegRow({ value, options, onChange }) {
  return (
    <div style={{ display:'flex', background:C.bg, borderRadius:10, padding:3,
                  border:`1px solid ${C.line}` }}>
      {options.map(o=>(
        <button key={o.value} onClick={()=>onChange(o.value)} style={{
          flex:1, height:34, border:'none',
          background: value===o.value?C.line2:'transparent',
          color: value===o.value?C.ink:C.inkDim,
          fontFamily:F_DISP, fontSize:13, fontWeight:500, borderRadius:8, cursor:'pointer',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SoundIcon({ size=14, color=C.target }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 6v4h2l3 3V3L5 6H3z" fill={color}/>
      <path d="M11 5c1 1 1 5 0 6" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M13 3c2 2 2 8 0 10" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 7.5v5h2.5l4 4V3.5l-4 4H3z" fill={C.ink}/>
      <line x1="13" y1="7" x2="17" y2="13" stroke={C.ink} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="7" x2="13" y2="13" stroke={C.ink} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function UnmuteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 7.5v5h2.5l4 4V3.5l-4 4H3z" fill="#1a0a00"/>
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="5" y="4" width="3.5" height="12" rx="1" fill={C.ink}/>
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" fill={C.ink}/>
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 3 L17 10 L5 17 Z" fill="#1a0a00"/>
    </svg>
  );
}

Object.assign(window, { PickScreen, CacheScreen, RideScreen, SettingsSheet, FavoritesSheet });
