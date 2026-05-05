import type { StyleSpecification } from 'maplibre-gl';

export type Layer = 'std' | 'sat' | 'topo' | 'tour';

const STD_TILES = ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'];
const SAT_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
const TOPO_TILES = ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'];
const TOUR_TILES = ['https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png'];

const ATTRIB_OSM = '© OpenStreetMap';
const ATTRIB_ESRI = 'Imagery © Esri';
const ATTRIB_TOPO = '© OpenTopoMap (CC-BY-SA)';
const ATTRIB_TRAILS = '© Waymarked Trails';

function makeStyle(tiles: string[], attrib: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution: attrib,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0A0C0B' } },
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.1, 'raster-brightness-min': 0.1, 'raster-brightness-max': 0.9 } },
    ],
  };
}

export function styleFor(layer: Layer): StyleSpecification {
  switch (layer) {
    case 'sat':
      return makeStyle(SAT_TILES, ATTRIB_ESRI);
    case 'topo':
      return makeStyle(TOPO_TILES, ATTRIB_TOPO);
    case 'tour': {
      const s = makeStyle(STD_TILES, `${ATTRIB_OSM} · ${ATTRIB_TRAILS}`);
      s.sources.trails = {
        type: 'raster',
        tiles: TOUR_TILES,
        tileSize: 256,
        maxzoom: 19,
      };
      s.layers.push({ id: 'trails', type: 'raster', source: 'trails', paint: { 'raster-opacity': 0.85 } });
      return s;
    }
    default:
      return makeStyle(STD_TILES, ATTRIB_OSM);
  }
}
