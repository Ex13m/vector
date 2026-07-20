// 02 Cache — реальный кэш видимой области.
// Workbox CacheFirst (vite.config.ts) подхватит каждый fetch — карта будет работать оффлайн.

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import { styleFor } from '../lib/mapStyles';
import { tilesForBox, downloadTiles, fmtBytes, bytesEstimate, MAX_TILES, type LngLatBox } from '../lib/tiles';
import type { LatLng } from '../lib/geo';
import type { Settings } from '../App';
import { C, F_DISP, F_MONO } from '../theme';

type Props = {
  settings: Settings;
  target: LatLng;
  box: LngLatBox;
  onSkip: () => void;
  onDone: () => void;
  onBack: () => void;
};

export default function CacheScreen({ settings, target, box, onDone, onSkip, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(settings.layer),
      center: [(box.west + box.east) / 2, (box.south + box.north) / 2],
      zoom: 12,
      attributionControl: false,
      interactive: false,
    });
    mapRef.current = map;
    map.fitBounds(
      [
        [box.west, box.south],
        [box.east, box.north],
      ],
      { padding: 16, animate: false },
    );
    map.on('load', () => {
      // Маркер цели
      const tg = document.createElement('div');
      tg.style.cssText = `width:24px;height:24px;border-radius:50%;border:2px solid ${C.target};background:rgba(255,107,26,0.2);box-shadow:0 0 16px ${C.glow};animation:pulse 2s infinite ease-out`;
      new (maplibregl as { Marker: typeof Marker }).Marker({ element: tg })
        .setLngLat([target.lng, target.lat])
        .addTo(map);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [box, settings.layer, target]);

  // Базовый зум 16 (уровень улиц) ± дельта.
  const zooms = useMemo(() => {
    const BASE = 16;
    const arr: number[] = [];
    for (let dz = -1 + zoomDelta; dz <= 1 + zoomDelta; dz++) {
      const z = BASE + dz;
      if (z >= 8 && z <= 18) arr.push(z);
    }
    return arr;
  }, [zoomDelta]);

  const tilesPlanned = useMemo(() => tilesForBox(box, zooms), [box, zooms]);
  const totalCount = tilesPlanned.length;
  const sizeBytes = bytesEstimate(totalCount);
  const tooBig = totalCount > MAX_TILES;

  const ready = progress && progress.done >= progress.total && progress.total > 0;

  async function start() {
    if (tooBig) return;
    abortRef.current = new AbortController();
    setProgress({ done: 0, total: totalCount });
    await downloadTiles(
      settings.layer,
      tilesPlanned,
      (done, total) => setProgress({ done, total }),
      abortRef.current.signal,
    );
  }

  function cancel() {
    abortRef.current?.abort();
    setProgress(null);
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: C.bg,
        color: C.ink,
        display: 'flex',
        flexDirection: 'column',
        padding: 'calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))',
      }}
    >
      {/* head */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button
          onClick={onBack}
          aria-label="back"
          style={{
            width: 38,
            height: 38,
            background: 'transparent',
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 10,
            fontSize: 18,
          }}
        >
          ←
        </button>
        <div
          style={{
            flex: 1,
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: C.inkDim,
          }}
        >
          02 / ОФЛАЙН
        </div>
        <div style={{ width: 38 }} />
      </div>

      <div style={{ fontFamily: F_DISP, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 14 }}>
        Caching
      </div>

      {/* preview map */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1.1 / 1',
          maxHeight: 360,
          borderRadius: 14,
          overflow: 'hidden',
          border: `2px dashed ${C.target}`,
          background: 'rgba(255,107,26,0.06)',
        }}
      >
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: F_DISP, fontSize: 16, color: C.ink }}>Видимая область</div>
        <div
          style={{
            fontFamily: F_MONO,
            fontSize: 13,
            color: tooBig ? C.danger : C.target,
            letterSpacing: '0.06em',
          }}
        >
          ~{fmtBytes(sizeBytes)} · {totalCount} tiles
        </div>
      </div>

      {/* zoom slider */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setZoomDelta((z) => Math.max(-2, z - 1))}
          aria-label="less detail"
          style={{
            width: 44,
            height: 44,
            background: C.bg2,
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 12,
            fontSize: 22,
            fontWeight: 300,
          }}
        >
          −
        </button>
        <input
          type="range"
          min={-2}
          max={2}
          step={1}
          value={zoomDelta}
          onChange={(e) => setZoomDelta(Number(e.target.value))}
          style={{ flex: 1, accentColor: C.target }}
        />
        <button
          onClick={() => setZoomDelta((z) => Math.min(2, z + 1))}
          aria-label="more detail"
          style={{
            width: 44,
            height: 44,
            background: C.bg2,
            border: `1px solid ${C.line2}`,
            color: C.ink,
            borderRadius: 12,
            fontSize: 22,
            fontWeight: 300,
          }}
        >
          +
        </button>
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: F_MONO,
          fontSize: 10,
          letterSpacing: '0.12em',
          color: C.inkDim,
          textTransform: 'uppercase',
        }}
      >
        <span>− меньше деталей</span>
        <span style={{ color: zoomDelta === 0 ? C.ink : C.inkDim }}>
          {zoomDelta === 0 ? 'СТАНДАРТ' : zoomDelta > 0 ? `+${zoomDelta}` : zoomDelta}
        </span>
        <span>+ больше деталей</span>
      </div>

      {progress && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontFamily: F_MONO,
                fontSize: 56,
                fontWeight: 500,
                color: C.ink,
                letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {progress.done}
            </span>
            <span style={{ fontFamily: F_MONO, fontSize: 13, color: C.inkDim }}>/ {progress.total} tiles</span>
          </div>
          <div style={{ height: 2, background: C.line2, borderRadius: 1, marginTop: 8 }}>
            <div
              style={{
                height: '100%',
                width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
                background: ready ? C.ok : C.target,
                transition: 'width 200ms linear, background 300ms',
              }}
            />
          </div>
        </div>
      )}

      {tooBig && !progress && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'rgba(201,58,26,0.12)',
            border: `1px solid rgba(201,58,26,0.4)`,
            borderRadius: 10,
            color: C.danger,
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: '0.04em',
          }}
        >
          Область слишком большая — лимит {MAX_TILES} тайлов. Увеличьте «− меньше деталей» или приблизьтесь.
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            height: 56,
            background: C.bg2,
            color: C.inkDim,
            border: `1px solid ${C.line2}`,
            borderRadius: 12,
            fontFamily: F_MONO,
            fontSize: 12,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Пропустить
        </button>
        {!progress && (
          <button
            onClick={start}
            disabled={tooBig}
            style={{
              flex: 2,
              height: 56,
              background: tooBig ? C.bg2 : C.target,
              color: tooBig ? C.inkDim : C.targetInk,
              border: tooBig ? `1px solid ${C.line2}` : 'none',
              borderRadius: 12,
              fontFamily: F_DISP,
              fontWeight: 700,
              fontSize: 16,
              boxShadow: tooBig ? 'none' : `0 0 24px ${C.glow}`,
              letterSpacing: '0.02em',
            }}
          >
            ↓ Caching ({fmtBytes(sizeBytes)})
          </button>
        )}
        {progress && !ready && (
          <button
            onClick={cancel}
            style={{
              flex: 2,
              height: 56,
              background: 'rgba(201,58,26,0.14)',
              color: C.danger,
              border: `1px solid rgba(201,58,26,0.4)`,
              borderRadius: 12,
              fontFamily: F_DISP,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Отмена
          </button>
        )}
        {ready && (
          <button
            onClick={onDone}
            style={{
              flex: 2,
              height: 56,
              background: C.target,
              color: C.targetInk,
              border: 'none',
              borderRadius: 12,
              fontFamily: F_DISP,
              fontWeight: 700,
              fontSize: 16,
              boxShadow: `0 0 24px ${C.glow}`,
            }}
          >
            Старт →
          </button>
        )}
      </div>
    </div>
  );
}
