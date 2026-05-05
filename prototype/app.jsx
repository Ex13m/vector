// Vector — voice cycling beacon. Core primitives + i18n + map.
const { useState, useEffect, useRef, useMemo } = React;

const C = {
  bg:'#0a0c0b', bg2:'#111413', card:'#161a18',
  ink:'#eef0ec', inkDim:'#8a918c', inkMute:'#4d524f',
  line:'#1c211f', line2:'#262c29',
  target:'#ff6b1a', glow:'rgba(255,107,26,.35)', ok:'#7ee2a8',
};
const F_MONO = '"JetBrains Mono", ui-monospace, monospace';
const F_DISP = '"Space Grotesk", "Manrope", system-ui, sans-serif';

const STR = {
  ru:{ pick:'Куда едем?', pickHint:'Тапните по карте', search:'Поиск места',
       confirm:'Поставить цель', save:'Сохранить', layers:'Слой карты',
       layerStd:'Карта', layerSat:'Спутник', layerTopo:'Топо', layerTour:'Турист',
       cache:'Скачивание', cacheHint:'Карта сохраняется для офлайн-езды',
       startRide:'В путь', tilesReady:'тайлов', area:'Область', zoomCache:'Детализация',
       speed:'СКОРОСТЬ', distLeft:'ДО ЦЕЛИ', rideTime:'ВРЕМЯ',
       sayNow:'Сказать', mute:'Тишина', unmute:'Звук', arrived:'На месте!',
       settings:'Настройки', interval:'Голос каждые', off:'выключено',
       lang:'Язык', units:'Единицы', haptics:'Вибрация',
       saved:'Сохранённые', saveTrip:'Сохранить поездку', export:'Экспорт',
       favs:'Избранные цели', noFavs:'Сохраните цель — карта закэшируется и будет работать без интернета',
       savedTargets:'Цель + кэш карты', savedTrips:'Поездки',
       newTarget:'Новая цель', min:'мин', sec:'сек' },
  en:{ pick:'Where to?', pickHint:'Tap the map', search:'Search place',
       confirm:'Set target', save:'Save', layers:'Map layer',
       layerStd:'Standard', layerSat:'Satellite', layerTopo:'Topo', layerTour:'Touring',
       cache:'Caching', cacheHint:'Saving map for offline use',
       startRide:'Start ride', tilesReady:'tiles', area:'Area', zoomCache:'Detail',
       speed:'SPEED', distLeft:'TO TARGET', rideTime:'TIME',
       sayNow:'Say now', mute:'Mute', unmute:'Unmute', arrived:'Arrived!',
       settings:'Settings', interval:'Voice every', off:'off',
       lang:'Language', units:'Units', haptics:'Haptics',
       saved:'Saved', saveTrip:'Save ride', export:'Export',
       favs:'Saved targets', noFavs:'Save a target — its map cache works offline',
       savedTargets:'Target + map cache', savedTrips:'Rides',
       newTarget:'New target', min:'min', sec:'sec' },
  de:{ pick:'Wohin?', pickHint:'Karte tippen', search:'Ort suchen',
       confirm:'Ziel setzen', save:'Speichern', layers:'Kartentyp',
       layerStd:'Standard', layerSat:'Satellit', layerTopo:'Topo', layerTour:'Touring',
       cache:'Caching', cacheHint:'Karte offline speichern',
       startRide:'Los', tilesReady:'Kacheln', area:'Bereich', zoomCache:'Detail',
       speed:'TEMPO', distLeft:'BIS ZIEL', rideTime:'ZEIT',
       sayNow:'Ansage', mute:'Stumm', unmute:'Ton', arrived:'Angekommen!',
       settings:'Einstellungen', interval:'Stimme alle', off:'aus',
       lang:'Sprache', units:'Einheiten', haptics:'Vibration',
       saved:'Gespeichert', saveTrip:'Tour speichern', export:'Export',
       favs:'Gespeicherte Ziele', noFavs:'Ziel speichern — Karte offline nutzbar',
       savedTargets:'Ziel + Karten-Cache', savedTrips:'Touren',
       newTarget:'Neues Ziel', min:'Min', sec:'Sek' },
};

function bearingToClock(deg) {
  const n = ((deg % 360) + 360) % 360;
  const halfHours = Math.round(n / 15);
  let h = Math.floor(halfHours / 2);
  const half = halfHours % 2 === 1;
  if (h === 0 && !half) h = 12;
  return half ? `${h}:30` : `${h}`;
}

function buildPhrase(lang, { clock, distM, reverse }) {
  const km = distM / 1000;
  const distStr = lang==='en'
    ? (distM<1000?`${Math.round(distM)} meters`:`${km.toFixed(1)} kilometers`)
    : lang==='de'
    ? (distM<1000?`${Math.round(distM)} Meter`:`${km.toFixed(1)} Kilometer`)
    : (distM<1000?`${Math.round(distM)} метров`:`${km.toFixed(1)} километра`);
  if (reverse) {
    if (lang==='en') return `Away from start, ${clock} o'clock, ${distStr}.`;
    if (lang==='de') return `Weg vom Start, ${clock} Uhr, ${distStr}.`;
    return `От точки на ${clock} часов, ${distStr}.`;
  }
  if (lang==='en') return `Target at ${clock} o'clock, ${distStr}.`;
  if (lang==='de') return `Ziel auf ${clock} Uhr, ${distStr}.`;
  return `Цель на ${clock} часов, ${distStr}.`;
}

function fmtDist(m) {
  if (m < 1000) return { v: Math.round(m), u: 'm' };
  return { v: (m/1000).toFixed(m<10000?2:1), u: 'km' };
}
function fmtTime(s) {
  const m=Math.floor(s/60), ss=s%60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

// ── MapView: 4 layer styles, contour topography, tap to drop ───────────────
function MapView({ width, height, you, target, onTap, layer='std',
                   downloadProgress=null, dim=false, showCenterCross=false,
                   selectionRect=null, trail=null }) {
  const seed = layer==='sat'?13:layer==='topo'?7:layer==='tour'?21:5;
  const rng = (n)=>{ const x=Math.sin(seed+n)*10000; return x-Math.floor(x); };

  const bg = layer==='sat' ? '#0d1814' : layer==='topo' ? '#1a1612' : layer==='tour' ? '#13191a' : C.bg2;
  const lineCol = layer==='sat' ? '#1d2e26' : layer==='topo' ? '#3a2a1a' : layer==='tour' ? '#1f3530' : C.line;
  const roadCol = layer==='sat' ? '#2a4035' : layer==='topo' ? '#4a3520' : layer==='tour' ? '#3a5650' : C.line2;

  const contours = useMemo(()=>{
    const paths=[];
    const count = layer==='topo' ? 14 : layer==='sat' ? 6 : 9;
    for (let i=0;i<count;i++){
      const cx=rng(i*3)*width, cy=rng(i*3+1)*height;
      const r0=50+rng(i*3+2)*100;
      let d='';
      for (let k=0;k<=28;k++){
        const a=(k/28)*Math.PI*2;
        const r=r0+Math.sin(a*3+i)*18+Math.cos(a*5+i*2)*10;
        const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
        d+=(k===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1)+' ';
      }
      paths.push(<path key={'c'+i} d={d} fill="none" stroke={lineCol} strokeWidth="0.8" opacity="0.7"/>);
    }
    return paths;
  },[width,height,layer]);

  const roads = useMemo(()=>{
    const lines=[];
    const count = layer==='tour' ? 9 : 5;
    for (let i=0;i<count;i++){
      const x1=rng(i*7)*width, y1=rng(i*7+1)*height;
      const x2=rng(i*7+2)*width, y2=rng(i*7+3)*height;
      const isTrail = layer==='tour' && i%2===1;
      lines.push(<line key={'r'+i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isTrail?'#7a4a30':roadCol} strokeWidth={isTrail?'1.5':'2.5'}
        strokeDasharray={isTrail?'4 3':''} opacity="0.7" strokeLinecap="round"/>);
    }
    return lines;
  },[width,height,layer]);

  const handleClick=(e)=>{
    if(!onTap) return;
    const r=e.currentTarget.getBoundingClientRect();
    onTap({x:e.clientX-r.left, y:e.clientY-r.top});
  };

  return (
    <svg width={width} height={height} onClick={handleClick}
         style={{ background:bg, display:'block', filter:dim?'brightness(0.6)':'none',
                  cursor:onTap?'crosshair':'default' }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={lineCol} strokeWidth="0.5" opacity="0.4"/>
        </pattern>
        <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.target} stopOpacity="0.5"/>
          <stop offset="100%" stopColor={C.target} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="url(#grid)"/>
      {contours}
      {roads}

      {downloadProgress!==null && <DownloadOverlay width={width} height={height} progress={downloadProgress}/>}

      {selectionRect && (
        <rect x={selectionRect.x} y={selectionRect.y}
              width={selectionRect.w} height={selectionRect.h}
              fill={C.target} fillOpacity="0.1"
              stroke={C.target} strokeWidth="1.5" strokeDasharray="4 4"/>
      )}

      {trail && trail.length > 1 && (
        <polyline
          points={trail.map(p=>`${p.x},${p.y}`).join(' ')}
          fill="none" stroke={C.ok} strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      )}

      {you && target && (
        <line x1={you.x} y1={you.y} x2={target.x} y2={target.y}
              stroke={C.target} strokeWidth="1.5" strokeDasharray="2 6" opacity="0.8"/>
      )}

      {target && (
        <g transform={`translate(${target.x},${target.y})`}>
          <circle r="36" fill="url(#targetGlow)"/>
          <circle r="10" fill="none" stroke={C.target} strokeWidth="1.5"/>
          <circle r="3" fill={C.target}/>
          <line x1="-18" y1="0" x2="-13" y2="0" stroke={C.target} strokeWidth="1.5"/>
          <line x1="13" y1="0" x2="18" y2="0" stroke={C.target} strokeWidth="1.5"/>
          <line x1="0" y1="-18" x2="0" y2="-13" stroke={C.target} strokeWidth="1.5"/>
          <line x1="0" y1="13" x2="0" y2="18" stroke={C.target} strokeWidth="1.5"/>
        </g>
      )}

      {you && (
        <g transform={`translate(${you.x},${you.y})`}>
          <circle r="22" fill="rgba(126,226,168,0.12)"/>
          <circle r="9" fill={C.ok}/>
          <circle r="9" fill="none" stroke={C.bg} strokeWidth="2"/>
          <path d="M 0 -22 L 6 -10 L -6 -10 Z" fill={C.ok}/>
        </g>
      )}

      {showCenterCross && (
        <g transform={`translate(${width/2},${height/2})`} opacity="0.5">
          <line x1="-10" y1="0" x2="10" y2="0" stroke={C.ink} strokeWidth="1"/>
          <line x1="0" y1="-10" x2="0" y2="10" stroke={C.ink} strokeWidth="1"/>
        </g>
      )}
    </svg>
  );
}

function DownloadOverlay({ width, height, progress }) {
  const cols=8, rows=Math.ceil((height/width)*cols);
  const total=cols*rows, filled=Math.floor((progress/100)*total);
  const tiles=[];
  for (let i=0;i<total;i++){
    const r=Math.floor(i/cols), c=i%cols;
    const isFilled=i<filled;
    tiles.push(<rect key={i} x={(c*width)/cols} y={(r*height)/rows}
      width={width/cols-1} height={height/rows-1}
      fill={isFilled?C.target:'transparent'} opacity={isFilled?0.18:0}
      stroke={C.target} strokeWidth="0.5" strokeOpacity={isFilled?0.6:0.15}/>);
  }
  return <g>{tiles}</g>;
}

Object.assign(window,{ C, F_MONO, F_DISP, STR, MapView, bearingToClock, buildPhrase, fmtDist, fmtTime });
