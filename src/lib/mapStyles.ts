// Бесплатные растровые слои MapLibre. CartoDB Dark / Esri / OpenTopoMap / CyclOSM.
import type { StyleSpecification } from 'maplibre-gl';

export type Layer = 'std' | 'sat' | 'topo' | 'tour';

const RASTER = (id: string, tiles: string[], attribution: string): StyleSpecification => ({
  version: 8,
  sources: {
    [id]: {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0c0b' } },
    { id, type: 'raster', source: id },
  ],
});

// Спутник Esri + overlay лейблов мест/дорог поверх (тоже бесплатно от Esri).
const SAT_WITH_LABELS = (): StyleSpecification => ({
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri',
      maxzoom: 19,
    },
    'sat-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0c0b' } },
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'sat-labels', type: 'raster', source: 'sat-labels' },
  ],
});

export function styleFor(layer: Layer): StyleSpecification {
  switch (layer) {
    case 'sat':
      return SAT_WITH_LABELS();
    case 'topo':
      return RASTER(
        'topo',
        [
          'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
        ],
        '© OpenTopoMap (CC-BY-SA)',
      );
    case 'tour':
      return RASTER(
        'tour',
        [
          'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
          'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
          'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        ],
        '© CyclOSM',
      );
    case 'std':
    default:
      return RASTER(
        'std',
        [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        ],
        '© OpenStreetMap, © CARTO',
      );
  }
}

const TILE_SCHEMES: Record<Layer, string> = {
  std: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
  tour: 'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
};

export function tileUrl(layer: Layer, z: number, x: number, y: number): string {
  return TILE_SCHEMES[layer].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
