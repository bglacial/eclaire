import L from 'leaflet';
import type { Dataset, RoadGraph } from './types';

const textIcon = (text: string, className: string) => {
  const el = document.createElement('span');
  el.textContent = text;
  return L.divIcon({ className, html: el, iconSize: [0, 0] });
};

export function createMap(data: Dataset, roads: RoadGraph) {
  const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.25, preferCanvas: true });
  map.setView([48.8568, 2.3458], matchMedia('(max-width: 720px)').matches ? 14.75 : 15.5);
  map.createPane('national-base'); map.getPane('national-base')!.style.zIndex = '190';
  L.tileLayer(import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    pane: 'national-base', className: 'national-tiles', maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
  }).addTo(map);
  map.createPane('geography');
  map.getPane('geography')!.style.zIndex = '210';
  const geography = L.geoJSON(data.basemap, {
    pane: 'geography', interactive: false,
    style: feature => {
      const kind = feature?.properties.kind;
      return kind === 'water' ? { fillColor: '#152c34', fillOpacity: 1, color: '#1e3a42', weight: 1 }
        : kind === 'park' ? { fillColor: '#1c2b28', fillOpacity: 0.9, color: '#29372f', weight: 0.5 }
        : { fillColor: '#222a2c', fillOpacity: 0.8, color: '#313a3d', weight: 0.45 };
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
        if (coords.length > 1) L.polyline(coords.slice(), { interactive: false, color: primary ? '#4b5659' : '#343e41', weight: primary ? 2.4 : 1.1, opacity: primary ? 0.74 : 0.58 }).addTo(layer);
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
  const detailVisibility = () => { if (map.getZoom() >= 12) details.addTo(map); else details.remove(); };
  map.on('zoomend', detailVisibility);

  const areaLabels: [number, number, string, string][] = [
    [48.8647, 2.3396, 'PALAIS-ROYAL', 'district-label'],
    [48.8616, 2.3509, 'LES HALLES', 'district-label'],
    [48.8585, 2.3622, 'LE MARAIS', 'district-label'],
    [48.8538, 2.3340, 'SAINT-GERMAIN-DES-PRÉS', 'district-label'],
    [48.8495, 2.3488, 'QUARTIER LATIN', 'district-label'],
    [48.8552, 2.3487, 'ÎLE DE LA CITÉ', 'island-label'],
    [48.8555, 2.3315, 'La Seine', 'river-label'],
    [48.8542, 2.3582, 'La Seine', 'river-label'],
    [48.862, 2.3361, 'Musée du Louvre', 'landmark-label'],
    [48.8526, 2.3522, 'Notre-Dame', 'landmark-label'],
    [48.8463, 2.3378, 'Jardin du Luxembourg', 'park-label'],
    [48.8643, 2.3274, 'Jardin des Tuileries', 'park-label'],
  ];
  const areaLayer = L.layerGroup(areaLabels.map(([lat, lng, label, cls]) => L.marker([lat, lng], { interactive: false, keyboard: false, icon: textIcon(label, cls), zIndexOffset: -1000 })));
  const areaVisibility = () => { if (map.getZoom() >= 13) areaLayer.addTo(map); else areaLayer.remove(); };
  map.on('zoomend', areaVisibility); areaVisibility();
  const namedWays = new Set<string>();
  const streetLabels: L.Marker[] = [];
  for (const way of data.ways) {
    const name = way.tags.name;
    if (!name || namedWays.has(name) || !['primary', 'secondary', 'tertiary'].includes(way.tags.highway) || way.nodes.length < 4) continue;
    const mid = nodes.get(way.nodes[Math.floor(way.nodes.length / 2)]);
    if (!mid) continue;
    namedWays.add(name);
    streetLabels.push(L.marker([mid.lat, mid.lon], { interactive: false, keyboard: false, icon: textIcon(name, 'street-label'), zIndexOffset: -1100 }));
  }
  const streetLayer = L.layerGroup(streetLabels.slice(0, 65));
  const updateLabels = () => map.getZoom() >= 15.5 ? streetLayer.addTo(map) : streetLayer.remove();
  map.on('zoomend', updateLabels); updateLabels();
  L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 90 }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>').addTo(map);
  const networkNodes = roads.nodes.filter((_, i) => roads.outgoing[i].length || roads.incoming[i].length);
  return { map, networkNodes };
}

export function pointMarker(map: L.Map, lat: number, lon: number, side: 'start' | 'end', label: string) {
  const el = document.createElement('div');
  el.className = `point-marker ${side}`;
  const pin = document.createElement('span'); pin.className = 'pin-core'; pin.textContent = side === 'start' ? 'A' : 'B';
  const text = document.createElement('span'); text.className = 'pin-label'; text.textContent = label;
  el.append(pin, text);
  return L.marker([lat, lon], { icon: L.divIcon({ className: 'point-icon', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
}
