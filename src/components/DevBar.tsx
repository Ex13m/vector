/**
 * DEV-only панель управления GPS-симулятором.
 * Рендерится только когда import.meta.env.DEV === true.
 * Показывает текущие координаты, кнопки управления скоростью и направлением.
 */

import { useEffect, useRef, useState } from 'react';
import type { GeoMockHandle } from '../lib/geoMock';

export default function DevBar() {
  const handle = useRef<GeoMockHandle | null>(null);
  const [state, setState] = useState({ lat: 0, lng: 0, heading: 0, speed: 0 });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    handle.current = window.__geoMock ?? null;
    if (!handle.current) return;
    setState(handle.current.getState());
    const id = setInterval(() => {
      if (handle.current) setState(handle.current.getState());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!handle.current) return null;

  const h = handle.current;

  const bar: React.CSSProperties = {
    position: 'fixed',
    bottom: visible ? 0 : -88,
    left: 0,
    right: 0,
    height: 96,
    background: 'rgba(10,10,10,0.97)',
    borderTop: '1px solid #ff6b2b',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    transition: 'bottom 200ms ease',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#ccc',
    padding: '6px 10px 4px',
    gap: 4,
    userSelect: 'none',
  };

  const btn: React.CSSProperties = {
    background: '#222',
    border: '1px solid #444',
    color: '#eee',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'monospace',
    flexShrink: 0,
  };

  const spd = (v: number) => () => { h.setSpeed(v); setState(h.getState()); };
  const turn = (d: number) => () => { h.setHeading((state.heading + d + 360) % 360); setState(h.getState()); };

  return (
    <div style={bar}>
      {/* Toggle tab */}
      <button
        onClick={() => setVisible(v => !v)}
        style={{
          position: 'absolute',
          top: -22,
          right: 12,
          background: 'rgba(255,107,43,0.9)',
          border: 'none',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: '6px 6px 0 0',
          cursor: 'pointer',
          letterSpacing: '0.1em',
        }}
      >
        {visible ? '▼ GPS SIM' : '▲ GPS SIM'}
      </button>

      {/* Coords */}
      <div style={{ color: '#ff6b2b', letterSpacing: '0.06em' }}>
        {state.lat.toFixed(5)}, {state.lng.toFixed(5)}
        {'  '}
        <span style={{ color: '#888' }}>hdg</span> {Math.round(state.heading)}°
        {'  '}
        <span style={{ color: '#888' }}>spd</span> {(state.speed * 3.6).toFixed(1)} км/ч
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#555', marginRight: 2 }}>SPEED:</span>
        <button style={btn} onClick={spd(0)}>СТОП</button>
        <button style={btn} onClick={spd(1.4)}>5 км/ч</button>
        <button style={btn} onClick={spd(4.2)}>15 км/ч</button>
        <button style={btn} onClick={spd(8.3)}>30 км/ч</button>
        <span style={{ color: '#555', marginLeft: 8, marginRight: 2 }}>ПОВОРОТ:</span>
        <button style={btn} onClick={turn(-30)}>◄ -30°</button>
        <button style={btn} onClick={turn(30)}>+30° ►</button>
        <button style={btn} onClick={turn(180)}>↩ разворот</button>
      </div>
    </div>
  );
}
