import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap } from 'maplibre-gl';
import { F_DISP, F_MONO, C } from '../theme';
import { t } from '../i18n';
import { styleFor } from '../lib/map';
import { tilesForBox, downloadTiles, bytesFmt } from '../lib/tiles';
import type { LatLng } from '../lib/geo';
import type { Settings } from '../store/settings';

type Props = {
  settings: Settings;
  target: LatLng;
  onSkip: () => void;
  onDone: () => void;
  onBack: () => void;
};

export default function CacheScreen({ settings, target, onSkip, onDone, onBack }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bytes, setBytes] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: styleFor(settings.layer),
      center: [target.lng, target.lat],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [target, settings.layer]);

  const tilesEstimate = useMemo(() => {
    if (!mapRef.current) return { tiles: 0, mb: 0 };
    const map = mapRef.current;
    const bounds = map.getBounds();
    const center = Math.round(map.getZoom());
    const zooms: number[] = [];
    for (let dz = -1 + zoomDelta; dz <= 1 + zoomDelta; dz++) {
      const z = center + dz;
      if (z >= 0 && z <= 18) zooms.push(z);
    }
    const tiles = tilesForBox(
      { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
      zooms,
    );
    return { tiles: tiles.length, mb: (tiles.length * 18) / 1024 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomDelta, progress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => setZoomDelta((z) => z);
    map.on('moveend', onMove);
    map.on('zoomend', onMove);
    return () => {
      map.off('moveend', onMove);
      map.off('zoomend', onMove);
    };
  }, []);

  const start = async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const center = Math.round(map.getZoom());
    const zooms: number[] = [];
    for (let dz = -1 + zoomDelta; dz <= 1 + zoomDelta; dz++) {
      const z = center + dz;
      if (z >= 0 && z <= 18) zooms.push(z);
    }
    const tiles = tilesForBox(
      { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
      zooms,
    );
    setProgress({ done: 0, total: tiles.length });
    abortRef.current = new AbortController();
    const res = await downloadTiles(tiles, (done, total) => setProgress({ done, total }), abortRef.current.signal);
    setBytes(res.bytes);
  };

  const cancel = () => {
    abortRef.current?.abort();
    setProgress(null);
  };

  const ready = progress && progress.done === progress.total && progress.total > 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: C.bg }}>
      <div style={{ position: 'absolute', inset: 0, padding: 16, paddingTop: 'calc(16px + env(safe-area-inset-top))', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button
            onClick={onBack}
            aria-label="back"
            style={{
              width: 38,
              height: 38,
              background: C.bg2,
              border: `1px solid ${C.line2}`,
              color: C.ink,
              borderRadius: 10,
            }}
          >
            ←
          </button>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: F_MONO,
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.inkDim,
            }}
          >
            02 / {t(settings.lang, 'screen.cache')}
          </div>
          <div style={{ width: 38 }} />
        </div>

        <div style={{ fontFamily: F_DISP, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 12 }}>
          {t(settings.lang, 'cache.title')}
        </div>

        <div
          ref={mapEl}
          style={{
            position: 'relative',
            width: '100%',
            height: 280,
            borderRadius: 14,
            overflow: 'hidden',
            border: `2px dashed ${C.target}`,
          }}
        />

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: F_DISP, fontSize: 14, color: C.ink }}>{t(settings.lang, 'cache.area')}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.target, letterSpacing: '0.06em' }}>
            ~{tilesEstimate.mb.toFixed(1)} MB · {tilesEstimate.tiles} tiles
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setZoomDelta((z) => Math.max(-2, z - 1))}
            style={{ width: 36, height: 36, background: C.bg2, border: `1px solid ${C.line2}`, color: C.ink, borderRadius: 8 }}
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
            style={{ width: 36, height: 36, background: C.bg2, border: `1px solid ${C.line2}`, color: C.ink, borderRadius: 8 }}
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
            color: C.inkDim,
            letterSpacing: '0.08em',
          }}
        >
          <span>{t(settings.lang, 'cache.zoomLess')}</span>
          <span>{zoomDelta === 0 ? t(settings.lang, 'cache.zoomStd') : (zoomDelta > 0 ? `+${zoomDelta}` : zoomDelta)}</span>
          <span>{t(settings.lang, 'cache.zoomMore')}</span>
        </div>

        <div style={{ flex: 1 }} />

        {progress && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkDim, letterSpacing: '0.08em' }}>
                {t(settings.lang, 'cache.progress', { done: progress.done, total: progress.total })}
              </div>
              <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.target, letterSpacing: '0.06em' }}>
                {bytes > 0 ? bytesFmt(bytes) : ''}
              </div>
            </div>
            <div style={{ height: 2, background: C.line, borderRadius: 1, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
                  background: ready ? C.ok : C.target,
                  transition: 'width 200ms linear',
                }}
              />
            </div>
          </div>
        )}

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
            {t(settings.lang, 'cache.skip')}
          </button>
          {!progress && (
            <button
              onClick={start}
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
                boxShadow: '0 0 24px rgba(255,107,26,0.35)',
              }}
            >
              {t(settings.lang, 'cache.start', { size: `${tilesEstimate.mb.toFixed(1)} MB` })}
            </button>
          )}
          {progress && !ready && (
            <button
              onClick={cancel}
              style={{
                flex: 2,
                height: 56,
                background: 'rgba(201,58,26,0.14)',
                color: C.warn,
                border: `1px solid rgba(201,58,26,0.4)`,
                borderRadius: 12,
                fontFamily: F_DISP,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {t(settings.lang, 'common.cancel')}
            </button>
          )}
          {ready && (
            <button
              onClick={onDone}
              style={{
                flex: 2,
                height: 56,
                background: C.ok,
                color: C.targetInk,
                border: 'none',
                borderRadius: 12,
                fontFamily: F_DISP,
                fontWeight: 700,
                fontSize: 16,
                boxShadow: '0 0 24px rgba(72,222,148,0.35)',
              }}
            >
              {t(settings.lang, 'cache.go')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
