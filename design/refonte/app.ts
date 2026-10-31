import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { buildRoadGraph, buildSearchGraph, nearestNode } from '../../src/graph';
import { bidirectionalDijkstra } from '../../src/dijkstra';
import { ExplorationRenderer } from '../../src/animation';
import type { Dataset, ExplorationEvent, Place, SearchResult } from '../../src/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (text: string) => { $('status').textContent = text; };
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let night = params.has('night');
const applyTheme = () => {
  document.documentElement.toggleAttribute('data-night', night);
  $('theme').setAttribute('aria-pressed', String(night));
  $('theme').setAttribute('aria-label', night ? 'Passer en mode jour' : 'Passer en mode nuit');
};
applyTheme();
document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard'));
document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard'));
const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 14, maxZoom: 19 }).setView([48.8573, 2.345], 15);
const paint = () => getComputedStyle(document.documentElement);
let basemap: L.GeoJSON, roadsLayer: L.LayerGroup;
let mode = 'prepare', following = true, progress = 0, criterion: 'time' | 'distance' = 'time';
const colors = () => ({ building: paint().getPropertyValue('--building').trim(), park: paint().getPropertyValue('--park').trim(), water: paint().getPropertyValue('--water').trim() });
function restyle() {
  basemap?.setStyle(f => ({ color: colors()[f?.properties.kind as keyof ReturnType<typeof colors>] || colors().building, weight: 0, fillOpacity: 1 }));
  roadsLayer?.eachLayer(layer => (layer as L.Polyline).setStyle({ color: paint().getPropertyValue('--road').trim() }));
  routeLine?.setStyle({ color: paint().getPropertyValue('--orange').trim() });
}
$('theme').onclick = () => { night = !night; applyTheme(); restyle(); };
$('zoom-in').onclick = () => map.zoomIn();
$('zoom-out').onclick = () => map.zoomOut();
map.on('dragstart zoomstart', (event) => {
  if (mode === 'guide' && !programmatic) { following = false; $('follow').hidden = false; }
});
let programmatic = false;
function focusMap(point: L.LatLngExpression, zoom = 16) {
  programmatic = true; map.setView(point, zoom, { animate: false }); programmatic = false;
}
function marker(place: Place, text: string, kind = '') {
  const node = document.createElement('div'); node.className = `map-pin ${kind}`; node.textContent = text;
  return L.marker([place.lat, place.lon], { icon: L.divIcon({ html: node, className: '', iconSize: [32, 32], iconAnchor: [16, 16] }), keyboard: false });
}
const start: Place = { name: 'Musée du Louvre', lat: 48.8606, lon: 2.3376 };
const presets: Place[] = [{ name: 'Panthéon', lat: 48.8462, lon: 2.3464 }, { name: 'Point zéro', lat: 48.8534015, lon: 2.3487885 }, { name: 'Le Café Marly', lat: 48.8616428, lon: 2.3359304 }];
let destination = presets[0], stops: Place[] = [], drafts: Place[] = [];
let result: SearchResult, batches: ExplorationEvent[], drawing: ExplorationRenderer;
let routeLine: L.Polyline, marks = L.layerGroup().addTo(map), vehicle: L.Marker;
let ready: Promise<void>;
let renderAnimation: Animation | undefined, timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  renderAnimation?.cancel();
  if (!reduced.matches && !document.documentElement.classList.contains('keyboard')) renderAnimation = $('content').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' });
}
function button(label: string, action: () => void, primary = false) {
  const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.onclick = action; return b;
}
function field(places: Place[], id: string, label: string) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const title = document.createElement('label'); title.htmlFor = id; title.textContent = label;
  const input = document.createElement('input'); input.id = id; input.setAttribute('list', `${id}-list`); input.autocomplete = 'off'; input.placeholder = 'Un lieu à Paris';
  const list = document.createElement('datalist'); list.id = `${id}-list`;
  for (const p of places) { const option = document.createElement('option'); option.value = p.name; list.append(option); }
  wrap.append(title, input, list); return { wrap, input };
}
let data: Dataset, roads: ReturnType<typeof buildRoadGraph>;
const uniquePlaces = (places: Place[]) => [...new Map(places.map(p => [p.name, p])).values()];
const choices = () => uniquePlaces([...presets, ...data.places]);
const snap = (place: Place) => { const n = nearestNode(roads, place, 1000); if (!n) throw new Error(`Aucune route proche de ${place.name} dans cet extrait.`); return n.index; };
function solve(waypoints: Place[]) {
  const route: SearchResult = { path: [], length: 0, seconds: 0, cost: 0, visited: 0, meeting: -1 };
  const events: ExplorationEvent[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const leg = bidirectionalDijkstra(buildSearchGraph(roads, snap(waypoints[i - 1]), snap(waypoints[i])), criterion, batch => events.push(...batch));
    if (!leg) throw new Error('Aucun trajet dans cet extrait. Choisissez un autre lieu.');
    route.path.push(...leg.path); route.length += leg.length; route.seconds += leg.seconds; route.cost += leg.cost; route.visited += leg.visited; route.meeting = leg.meeting;
  }
  return { route, events };
}
const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
const distance = (metres: number) => metres >= 1000 ? `${(metres / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(metres / 10) * 10} m`;
function routePoints() { return result.path.flatMap((id, i) => { const edge = roads.edges[id]; const a = roads.nodes[edge.from], b = roads.nodes[edge.to]; return i ? [[b.lat, b.lon] as [number, number]] : [[a.lat, a.lon] as [number, number], [b.lat, b.lon] as [number, number]]; }); }
function displayRoute(replay = false) {
  clearTimeout(timer); drawing.clear(); routeLine?.remove(); marks.clearLayers(); vehicle?.remove();
  const points = routePoints();
  routeLine = L.polyline(points, { color: paint().getPropertyValue('--orange').trim(), weight: 6, opacity: 1, lineCap: 'round' });
  marker(start, 'A').addTo(marks); marker(destination, 'B', 'destination').addTo(marks);
  stops.forEach((p, i) => marker(p, String(i + 1)).addTo(marks));
  programmatic = true;
  map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [40, 145], paddingBottomRight: [45, innerWidth < 800 ? 330 : 230], animate: false, maxZoom: 16 });
  programmatic = false;
  if (replay && !reduced.matches) {
    let index = 0; const size = Math.max(1, Math.ceil(batches.length / 32));
    const frame = () => { drawing.visit(batches.slice(index, index + size), performance.now()); index += size; if (index < batches.length) timer = setTimeout(frame, 28); else { routeLine.addTo(map); status(`${result.visited.toLocaleString('fr-FR')} routes explorées. Résultat établi pour l’extrait local.`); } };
    frame();
  } else routeLine.addTo(map);
}
function calculate(nextStops = stops, replay = true) {
  const solved = solve([start, ...nextStops, destination]);
  result = solved.route; batches = solved.events; stops = [...nextStops]; progress = 0; displayRoute(replay);
}
function metrics() { return `<div class="metrics"><strong>${minutes(result.seconds)}</strong><span>${distance(result.length)}</span><span>sans trafic</span></div>`; }
function show(next: string, animate = true) {
  mode = next; $('home').hidden = next === 'prepare' || next === 'result'; $('follow').hidden = next !== 'guide' || following;
  $('state-label').textContent = ({ prepare: 'Un départ, une envie.', result: 'Votre route est prête.', stops: 'Le trajet reste le vôtre.', places: 'Une pause sur votre route.', guide: 'Simulation de guidage.' } as Record<string, string>)[next];
  $('content').replaceChildren(); const content = $('content');
  $('workspace')?.setAttribute('aria-label', next === 'guide' ? 'Guidage simulé' : 'Préparation du trajet');
  if (next === 'prepare') {
    content.innerHTML = '<form class="prepare"><div class="intro"><h1>Où va-t-on ?</h1><p class="origin">Départ : Musée du Louvre</p></div></form>';
    const form = content.querySelector('form')!; const f = field(choices(), 'destination', 'Destination'); f.input.value = destination.name;
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Critère'); select.innerHTML = '<option value="time">Le plus rapide</option><option value="distance">Le plus court</option>'; select.value = criterion; select.onchange = () => { criterion = select.value as 'time' | 'distance'; };
    const submit = button('Éclairer la route ↗', () => {} , true); submit.type = 'submit';
    form.append(f.wrap, select, submit);
    form.onsubmit = e => { e.preventDefault(); const p = choices().find(p => p.name.toLocaleLowerCase('fr') === f.input.value.toLocaleLowerCase('fr').trim()); if (!p) { status('Choisissez un lieu proposé dans l’extrait Paris.'); return; } const previous = destination; destination = p; try { calculate(); show('result'); } catch (e) { destination = previous; status((e as Error).message); } };
    status('Exemple Paris. Le calcul utilise le réseau local, sans GPS ni trafic.');
  } else if (next === 'result') {
    content.innerHTML = `<div class="result-layout"><div><h1></h1>${metrics()}</div><div class="actions"></div></div>`; content.querySelector('h1')!.textContent = destination.name;
    content.querySelector('.actions')!.append(button('Étapes', () => { drafts = [...stops]; show('stops'); }), button('Lieux sur la route', () => show('places')), button('Simuler le guidage ↗', guide, true));
    status('Rejouer le calcul montre les deux recherches réelles, puis le trajet retenu.');
    content.querySelector('.actions')!.append(button('Rejouer', () => displayRoute(true)));
  } else if (next === 'stops') {
    content.innerHTML = '<h1>Vos étapes, dans l’ordre.</h1><div class="stops"></div><div class="add-row"></div><div class="actions"></div>';
    const list = content.querySelector('.stops')!;
    if (!drafts.length) list.textContent = 'Aucune étape pour le moment.';
    drafts.forEach((p, i) => { const row = document.createElement('div'); row.className = 'stop'; const name = document.createElement('span'); name.className = 'stop-name'; name.textContent = `${i + 1}. ${p.name}`; row.append(name);
      for (const [offset, symbol, verb] of [[-1, '↑', 'Monter'], [1, '↓', 'Descendre']] as const) { const b = button(symbol, () => { [drafts[i], drafts[i + offset]] = [drafts[i + offset], drafts[i]]; show('stops', false); }); b.setAttribute('aria-label', `${verb} ${p.name}`); b.disabled = i + offset < 0 || i + offset >= drafts.length; row.append(b); }
      const remove = button('×', () => { drafts.splice(i, 1); show('stops', false); }); remove.setAttribute('aria-label', `Supprimer ${p.name}`); remove.className = 'delete'; row.append(remove); list.append(row);
    });
    const f = field(choices(), 'new-stop', 'Ajouter une étape'); f.wrap.style.flex = '1';
    content.querySelector('.add-row')!.append(f.wrap, button('Ajouter', () => { const p = choices().find(p => p.name.toLocaleLowerCase('fr') === f.input.value.toLocaleLowerCase('fr').trim()); if (!p) { status('Choisissez un lieu proposé.'); return; } if (drafts.length >= 8) { status('Huit étapes au maximum.'); return; } drafts.push(p); show('stops', false); }));
    content.querySelector('.actions')!.append(button('Annuler', () => show('result')), button('Appliquer au trajet ↗', () => { try { calculate(drafts, false); show('result'); status('Trajet recalculé avec les étapes choisies.'); } catch (e) { status((e as Error).message); } }, true));
    status('Le trajet actuel reste affiché tant que les changements ne sont pas appliqués.');
  } else if (next === 'places') {
    content.innerHTML = '<h1>Le détour avant la pause.</h1><p class="origin">Restaurants de démonstration · extrait Paris</p><div class="place-list"></div>';
    const candidates = uniquePlaces(data.places.filter(p => ['Le Café Marly', 'Brasserie Lipp', 'Bistro des Poèmes', 'Les Deux Magots', 'Le Lutétia Île Saint-Louis'].includes(p.name)));
    const places = candidates.flatMap(p => { try { const next = solve([start, ...stops, p, destination]).route; return [{ p, extra: Math.max(0, next.seconds - result.seconds), length: Math.max(0, next.length - result.length) }]; } catch { return []; } }).sort((a, b) => a.extra - b.extra).slice(0, 3);
    for (const { p, extra, length } of places) { const item = document.createElement('article'); item.className = 'place'; const name = document.createElement('h2'); name.textContent = p.name; const delta = document.createElement('div'); delta.className = 'detour'; delta.textContent = `+ ${minutes(extra)}`; const info = document.createElement('p'); info.textContent = `+ ${distance(length)} · estimé`; const add = button('Ajouter', () => { if (stops.length >= 8) { status('Huit étapes au maximum.'); return; } try { calculate([...stops, p], false); show('result'); status(`${p.name} ajouté avant l’arrivée.`); } catch (e) { status((e as Error).message); } }); add.setAttribute('aria-label', `Ajouter ${p.name}`); item.append(name, delta, info, add); content.querySelector('.place-list')!.append(item); }
    status('Détours calculés sur l’extrait, avant la destination. Disponibilité et horaires non vérifiés.');
  } else if (next === 'guide') {
    const edge = roads.edges[result.path[Math.min(progress, result.path.length - 1)]];
    content.innerHTML = `<div class="guide-layout"><div class="turn"><span class="turn-symbol" aria-hidden="true">↑</span><div><div class="turn-distance">${distance(edge.length)}</div><div class="turn-road"></div></div></div><div class="guide-next"><div>${metrics()}</div><button id="advance">Avancer la simulation →</button></div></div><div class="actions"></div>`;
    content.querySelector('.turn-road')!.textContent = `Continuer sur ${edge.name || 'cette voie'}`;
    content.querySelector('.actions')!.append(button('Étapes et lieux', () => { drafts = [...stops]; show('stops'); }), button('Terminer', () => { vehicle?.remove(); displayRoute(false); show('result'); }));
    $('advance').onclick = () => { progress = (progress + Math.max(1, Math.floor(result.path.length / 12))) % result.path.length; moveVehicle(); show('guide', false); };
    status('Position simulée. Aucun GPS utilisé. Le bouton de suivi apparaît si vous déplacez la carte.');
  }
  if (animate) changed();
  window.dispatchEvent(new Event('prototype-state'));
}
function moveVehicle() {
  const edge = roads.edges[result.path[progress]], point = roads.nodes[edge.from]; vehicle?.remove(); vehicle = marker({ ...point, name: '' }, '↑', 'vehicle').addTo(map);
  if (following) focusMap([point.lat, point.lon], 16);
}
function guide() { following = true; progress = 0; moveVehicle(); show('guide'); }
$('follow').onclick = () => { following = true; moveVehicle(); $('follow').hidden = true; };
$('home').onclick = () => { vehicle?.remove(); displayRoute(false); show('result'); };

ready = (async () => {
  const response = await fetch('/data/paris.json'); if (!response.ok) throw new Error('Extrait Paris indisponible.'); data = await response.json(); roads = buildRoadGraph(data);
  basemap = L.geoJSON(data.basemap, { interactive: false }).addTo(map);
  const unique = roads.edges.filter(e => e.from < e.to);
  roadsLayer = L.layerGroup(unique.map(e => L.polyline([[roads.nodes[e.from].lat, roads.nodes[e.from].lon], [roads.nodes[e.to].lat, roads.nodes[e.to].lon]], { weight: 1.2, interactive: false }))).addTo(map);
  restyle(); drawing = new ExplorationRenderer(map, roads); drawing.setLite(true);
  for (const [name, lat, lon] of [['LE LOUVRE',48.862,2.337],['LA SEINE',48.855,2.344],['ÎLE DE LA CITÉ',48.854,2.348],['SAINT-GERMAIN',48.852,2.335]] as const) { const label = document.createElement('span'); label.className = 'map-label'; label.textContent = name; L.marker([lat, lon], { icon: L.divIcon({ html: label, className: '', iconSize: [130,20] }), interactive: false }).addTo(map); }
  calculate([], false); const initial = params.get('mode') || 'prepare';
  if (initial === 'stops') { drafts = uniquePlaces(data.places.filter(p => ['Le Café Marly', 'Parking Hôtel de Ville'].includes(p.name))); show('stops', false); }
  else if (initial === 'guide') { following = true; moveVehicle(); show('guide', false); } else show(initial, false);
  (window as any).prototypeReady = true;
  (window as any).eclaireDemo = { show, get result() { return result; }, get stops() { return stops; } };
})();
ready.catch(error => { status(error.message); $('content').innerHTML = '<h1>Le réseau n’a pas chargé.</h1><p>Relancez la proposition depuis le serveur local du projet.</p>'; });
