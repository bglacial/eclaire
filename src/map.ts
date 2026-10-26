import L from 'leaflet';
import type { Dataset, RoadGraph } from './types';

export function createMap(data: Dataset, roads: RoadGraph) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.25, preferCanvas: true, zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: !reduced.matches, inertia: !reduced.matches });
  const updateMotion = () => { map.options.fadeAnimation = !reduced.matches; map.options.inertia = !reduced.matches; };
  reduced.addEventListener('change', updateMotion);
  map.on('unload', () => reduced.removeEventListener('change', updateMotion));
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  map.getContainer().addEventListener('keydown', event => {
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.target !== map.getContainer()) return;
    const delta = (map.options.keyboardPanDelta ?? 80) * (event.shiftKey ? 3 : 1);
    map.panBy([direction[0] * delta, direction[1] * delta], { animate: false });
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  map.setView([48.8568, 2.3458], matchMedia('(max-width: 720px)').matches ? 14.75 : 15.5);
  map.createPane('national-base'); map.getPane('national-base')!.style.zIndex = '190';
  const basemap = L.tileLayer(import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    pane: 'national-base', className: 'national-tiles', maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(map);
  map.createPane('geography');
  map.getPane('geography')!.style.zIndex = '210';
  const geography = L.geoJSON(data.basemap, {
    pane: 'geography', interactive: false,
    style: feature => {
      const kind = feature?.properties.kind;
      return kind === 'water' ? { fillColor: '#c5dfe9', fillOpacity: 1, color: '#afcdd8', weight: 1 }
        : kind === 'park' ? { fillColor: '#dde7d9', fillOpacity: 0.9, color: '#cbd7c6', weight: 0.5 }
        : { fillColor: '#e7e7e4', fillOpacity: 0.8, color: '#d3d5d6', weight: 0.45 };
    },
  }).addTo(map);

  const nodes = new Map(data.nodes.map(n => [n.id, n]));
  const drawRoads = (major: boolean) => {
    const layer = L.featureGroup();
    for (const way of data.ways) {
      const primary = ['primary', 'secondary', 'tertiary'].includes(way.tags.highway);
      if (primary !== major || ['steps', 'elevator', 'corridor', 'cycleway'].includes(way.tags.highway)) continue;
      const coords: L.LatLngTuple[] = [];
      const flush = () => {
        if (coords.length > 1) L.polyline(coords.slice(), { interactive: false, color: primary ? '#b5b9c4' : '#cdd0d7', weight: primary ? 2.4 : 1.1, opacity: primary ? 0.74 : 0.58 }).addTo(layer);
        coords.length = 0;
      };
      for (const id of way.nodes) {
        const node = nodes.get(id);
        if (node) coords.push([node.lat, node.lon]); else flush();
      }
      flush();
    }
    return layer.addTo(map);
  };
  const details = L.layerGroup([geography, drawRoads(false), drawRoads(true)]).addTo(map);
  let basemapReady = false;
  basemap.once('tileload', () => { basemapReady = true; details.remove(); });
  const detailVisibility = () => { if (!basemapReady && map.getZoom() >= 12) details.addTo(map); else details.remove(); };
  map.on('zoomend', detailVisibility);

  L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 90 }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>').addTo(map);
  const networkNodes = roads.nodes.filter((_, i) => roads.outgoing[i].length || roads.incoming[i].length);
  return { map, networkNodes };
}

export function pointMarker(map: L.Map, lat: number, lon: number, side: 'start' | 'end', label: string, onMove?: (point: L.LatLng) => void) {
  const el = document.createElement('div');
  el.className = `point-marker ${side}`;
  const pin = document.createElement('span'); pin.className = 'pin-core'; pin.textContent = side === 'start' ? 'A' : 'B';
  const text = document.createElement('span'); text.className = 'pin-label'; text.textContent = label;
  el.append(pin, text);
  const marker = L.marker([lat, lon], { icon: L.divIcon({ className: 'point-icon', html: el, iconSize: [44, 44], iconAnchor: [22, 22] }), draggable: !!onMove, autoPan: true, interactive: !!onMove, keyboard: !!onMove, title: `${side === 'start' ? 'Départ' : 'Arrivée'} : ${label}. Déplacez le repère pour l’ajuster.`, zIndexOffset: 1000 }).addTo(map);
  if (onMove) marker.on('dragend', () => onMove(marker.getLatLng()));
  return marker;
}
