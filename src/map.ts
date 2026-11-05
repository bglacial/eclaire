import L from 'leaflet';
import '@tomickigrzegorz/leaflet-rotate';
import { franceBounds } from './national';

// shortcut: Leaflet Canvas omet l’argument map ; retirer ce correctif quand leaflet-rotate le prend en charge.
const rendererOnAdd = L.Renderer.prototype.onAdd;
L.Renderer.prototype.onAdd = function (map: L.Map) { return rendererOnAdd.call(this, map ?? (this as unknown as { _map: L.Map })._map); };
// shortcut: réduire le canevas surdimensionné de leaflet-rotate 0.3 ; retirer après correction en amont.
const rendererPrototype = L.Renderer.prototype as unknown as { _update: () => void };
const rendererUpdate = rendererPrototype._update;
rendererPrototype._update = function () {
  rendererUpdate.call(this);
  const renderer = this as unknown as { _map: L.Map; _bounds: L.Bounds; _boundsMinLatLng: L.LatLng };
  const map = renderer._map;
  if (!map?.getBearing()) return;
  const size = map.getSize(), center = map.containerPointToLayerPoint(size.divideBy(2));
  const radius = Math.ceil(Math.hypot(size.x, size.y) * 0.55);
  renderer._bounds = L.bounds(center.subtract([radius, radius]).round(), center.add([radius, radius]).round());
  renderer._boundsMinLatLng = map.layerPointToLatLng(renderer._bounds.min!);
};

export function createMap() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const map = L.map('map', { rotate: true, dragRotate: false, zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.25, preferCanvas: true, zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: !reduced.matches, inertia: !reduced.matches });
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
  map.fitBounds([[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]], { animate: false });
  const rotatingPane = map.getPane('tilePane')!.parentElement!;
  map.createPane('national-base', rotatingPane); map.getPane('national-base')!.style.zIndex = '190';
  L.tileLayer(import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    pane: 'national-base', className: 'national-tiles', maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 90 }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>').addTo(map);
  return { map };
}

export function pointMarker(map: L.Map, lat: number, lon: number, side: 'start' | 'end' | 'via', label: string, onMove?: (point: L.LatLng) => void) {
  const el = document.createElement('div');
  el.className = `point-marker ${side}`;
  const pin = document.createElement('span'); pin.className = 'pin-core'; pin.textContent = side === 'start' ? 'A' : side === 'via' ? '•' : 'B';
  const text = document.createElement('span'); text.className = 'pin-label'; text.textContent = label;
  el.append(pin, text);
  const marker = L.marker([lat, lon], { icon: L.divIcon({ className: 'point-icon', html: el, iconSize: [44, 44], iconAnchor: [22, 22] }), draggable: !!onMove, autoPan: true, interactive: !!onMove, keyboard: !!onMove, title: `${side === 'start' ? 'Départ' : side === 'via' ? 'Étape' : 'Arrivée'} : ${label}.${onMove ? ' Déplacez le repère pour l’ajuster.' : ''}`, zIndexOffset: 1000 }).addTo(map);
  if (onMove) marker.on('dragend', () => onMove(marker.getLatLng()));
  return marker;
}
