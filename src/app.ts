import { preparationView } from './preparation-view';
import { installSettings } from './app-settings';
import { fetchJourney } from './calculation';
import { routingFor } from './guidance-routing';
import { renderResult } from './result-view';
import L from 'leaflet';
import { icon } from './icons';
import { installDialogNavigation } from './dialog-navigation';
import { PlacePicker } from './place-picker';
import { SavedPlacesUI } from './saved-places-ui';
import 'leaflet/dist/leaflet.css';
import './style.css';
import './journeys.css';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { createMap, pointMarker } from './map';
import { installChargingMap } from './charging-map';
import { mapPadding } from './map-viewport';
import { ExplorationRenderer } from './animation';
import { playbackRate } from './animation-timing';
import { GpsGuidance } from './guidance';
import { navigationRoute, acceptsRouteUpdate } from './navigation';
import { locationError, preciseLocationPermission, selectionPosition } from './location';
import { device } from './device';
import type { RoadPreferences } from './settings';
import { TripWorkspace, type TripSnapshot } from './trip-workspace';
import { detourAnchors } from './along-route';
import { removeReachedStops } from './waypoint';
import { cancelNationalRoute, checkNationalService, decodeNationalMessage, franceBounds, isInFrance, nationalRoute, searchFrance } from './national';
import type { Criterion, ExplorationEvent, Place, RoadGeometry, SearchResult } from './types';


const mobileApp = Capacitor.isNativePlatform();
document.getElementById('app')!.classList.toggle('is-mobile-app', mobileApp);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = preparationView(mobileApp);

// Keyboard interactions remain immediate, including actions that reveal a result.
document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard-input'));
document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-input'));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inputs = { start: $<HTMLInputElement>('start'), via: $<HTMLInputElement>('via'), end: $<HTMLInputElement>('end') };
const launch = $<HTMLButtonElement>('launch');
const roadPreferences = () => ({ avoidMotorways: $<HTMLInputElement>('trip-avoid-motorways').checked, avoidTolls: $<HTMLInputElement>('trip-avoid-tolls').checked });
installSettings(() => !!result, () => !!selections.end, stop, notice, updateLaunch, showAbout);
type Endpoint = 'start' | 'via' | 'end';
let map: L.Map;
let renderer: ExplorationRenderer;
let guidance: GpsGuidance | undefined;
let routeGeometry: RoadGeometry;
let resumeGuidance = false;
let selections: Record<Endpoint, Place | null> = { start: null, via: null, end: null };
let waypointPending = false;
let tripStops: Place[] = [];
type ConfirmedPlan = { start: Place; end: Place; stops: Place[]; criterion: Criterion; preferences: RoadPreferences };
let confirmedPlan: ConfirmedPlan | undefined;
function hasPreparedChanges() {
  const plan = confirmedPlan;
  return !!plan && (JSON.stringify(selections.start) !== JSON.stringify(plan.start)
    || JSON.stringify(selections.end) !== JSON.stringify(plan.end)
    || criterion() !== plan.criterion
    || JSON.stringify(roadPreferences()) !== JSON.stringify(plan.preferences)
    || JSON.stringify(tripStops) !== JSON.stringify(plan.stops));
}
let tripRevision = 0;
let workspace: TripWorkspace | undefined;
let markers: Partial<Record<Endpoint, L.Marker>> = {};
let picking: Endpoint | null = null;
let run = 0;
let playing = false;
let queue: ExplorationEvent[] = [];
let cursor = 0;
let result: SearchResult | null | undefined;
let playbackFrame = 0;
let lastTick = 0;
let carry = 0;
let searchIndex: Place[] = [];
let routeAbort: AbortController | undefined;
let routeId: string | undefined;
type Alternative = { result: SearchResult; geometry: RoadGeometry; events: ExplorationEvent[]; criterion: Criterion; stride: number };
let alternative: Alternative | undefined;
let comparisonAbort: AbortController | undefined;
let comparisonId: string | undefined;
let traceStride = 1;
let locationRequest = 0;
let locating = false;
let locationCircle: L.Circle | undefined;
const defaults: Record<'start' | 'end', Place> = {
  start: { name: 'Musée du Louvre', lat: 48.8608, lon: 2.3376 },
  end: { name: 'Panthéon', lat: 48.8462, lon: 2.3464 },
};

function notice(message: string, kind: 'error' | 'info' = 'info') {
  $('notice').textContent = message;
  $('notice').className = `notice ${kind}`;
  $('notice').hidden = !message;
}

function updateLaunch() {
  $('app').classList.toggle('is-exploring', playing);
  $<HTMLButtonElement>('swap').disabled = !selections.start || !selections.end;
  $('destination-label').textContent = selections.end?.name ?? 'Destination';
  $('planner-title').textContent = selections.end ? 'Mon trajet' : 'Où va-t-on ?';
  $('prepare-trip').hidden = !selections.end;
  $('home-shortcuts').hidden = !!selections.end;
  $('home-recent-section').hidden = !!selections.end || !savedPlaces.recent.length;
  launch.parentElement!.hidden = !selections.end && !playing;
  $('prepared-stops').textContent = tripStops.length ? tripStops.map((place, index) => `${index + 1}. ${place.name}`).join(' → ') : 'Directement vers l’arrivée.';
  $('departure-status').textContent = selections.start ? 'Départ : ' + (mobileApp ? 'ma position' : selections.start.name) : locating ? 'Recherche de ma position…' : 'Position GPS indisponible';
  launch.disabled = !map || !selections.start || !selections.end || (!!inputs.via.value.trim() && !selections.via);
  launch.innerHTML = playing ? `${icon('stop')}<span>Interrompre l’exploration</span>` : `${icon('bolt')}<span>Calculer le trajet</span>${icon('arrow')}`;
}

function stop(clear = true, preserveRoute = false) {
  tripRevision++; workspace?.close(true);
  comparisonAbort?.abort(); comparisonAbort = undefined;
  if (comparisonId) { void cancelNationalRoute(comparisonId); comparisonId = undefined; }
  alternative = undefined; $('comparison-status').textContent = ''; $('choose-alternative').hidden = true; $<HTMLButtonElement>('compare-routes').disabled = false;
  setPanelCollapsed(false);
  $('route-panel-toggle').hidden = true;
  $<HTMLDetailsElement>('route-editor').open = true;
  if (!preserveRoute) { guidance?.setRoute(null); confirmedPlan = undefined; }
  resumeGuidance = false;
  routeAbort?.abort(); routeAbort = undefined;
  if (routeId) { void cancelNationalRoute(routeId); routeId = undefined; }
  run++;
  cancelAnimationFrame(playbackFrame);
  playing = false;
  if (!preserveRoute) { queue = []; cursor = 0; result = undefined; }
  $('playback').hidden = true;
  $('route-result').hidden = !result;
  if (clear) { renderer?.clear(); if (preserveRoute && result) { renderer.setGraph(routeGeometry); renderer.finish(result); } }
  updateLaunch();
}

function selectPoint(side: Endpoint, place: Place, announce = true) {
  if (!isInFrance(place)) {
    notice('Choisissez un point en France métropolitaine ou en Corse.', 'error'); return false;
  }
  if (side === 'start') cancelLocationRequest();
  if (side === 'start' && !selections.start && !playing && !result) tripRevision++;
  else stop(true, !!result && !guidance?.active);
  selections[side] = { ...place };
  if (side === 'via') { waypointPending = true; tripStops = [{ ...place }, ...tripStops.slice(1)]; }
  if (side === 'end') savedPlaces.remember(place);
  inputs[side].value = place.name;
  if (side === 'start') { locationCircle?.remove(); locationCircle = undefined; $('app').classList.remove('has-gps-start'); }
  placeMarker(side, place.lat, place.lon, place.name);
  if (side === 'start') { $('start-label').textContent = place.name; placePicker.setPosition(place); workspace?.updateStart(place); }
  updateLaunch();
  if (result) $('route-editor').setAttribute('open', '');
  if (announce) notice('Point choisi. Le raccordement à une route sera vérifié au lancement.');
  return true;
}

const placePicker = new PlacePicker();
const savedPlaces = new SavedPlacesUI(placePicker, place => pickEndpoint('end', place), message => notice(message));
function pickEndpoint(side: 'start' | 'end', initial?: Place) {
  if ($<HTMLDialogElement>('settings-page').open) $('settings-close').click();
  placePicker.show({ title: side === 'start' ? 'Choisir le départ' : 'Choisir une destination', initial,
    places: savedPlaces.choices(), recent: savedPlaces.recent, suggestions: searchIndex,
    confirmLabel: side === 'start' ? 'Utiliser ce départ' : 'Choisir cette destination',
    confirm: place => {
      if (guidance?.active && !confirm('Terminer le guidage pour préparer un nouveau trajet ?')) return false;
      return selectPoint(side, place);
    } });
}
$('settings-saved-places').addEventListener('click', () => savedPlaces.open());
$('destination-open').addEventListener('click', () => pickEndpoint('end'));
$('start-open').addEventListener('click', () => pickEndpoint('start'));
$('prepare-stops').addEventListener('click', () => { void workspace?.open(); });
$('new-trip').addEventListener('click', () => $('reset').click());
$('result-options').addEventListener('click', () => { $('route-editor').setAttribute('open', ''); document.querySelector<HTMLDetailsElement>('.planner-options')!.open = true; });

function placeMarker(side: Endpoint, lat: number, lon: number, name: string) {
  markers[side]?.remove();
  markers[side] = pointMarker(map, lat, lon, side, name, mobileApp && side === 'start' ? undefined : point => {
    selectPoint(side, { name: side === 'start' ? 'Départ ajusté sur la carte' : side === 'via' ? 'Étape ajustée sur la carte' : 'Arrivée ajustée sur la carte', lat: point.lat, lon: point.lng }, false);
    notice('Point ajusté. Lancez une nouvelle exploration pour calculer le trajet.');
  });
}

function focusPoint(point: { lat: number; lon: number }, zoom = map.getZoom()) {
  map.invalidateSize({ pan: false, animate: false });
  const bounds = $('map').getBoundingClientRect();
  const padding = mapPadding();
  const x = (padding.topLeft[0] + bounds.width - padding.bottomRight[0]) / 2;
  const y = (padding.topLeft[1] + Math.max(padding.topLeft[1] + 40, bounds.height - padding.bottomRight[1])) / 2;
  const center = map.project([point.lat, point.lon], zoom).add([bounds.width / 2 - x, bounds.height / 2 - y]);
  map.setView(map.unproject(center, zoom), zoom, { animate: false });
}

function cancelLocationRequest() {
  locationRequest++; locating = false;
  $('geolocate').setAttribute('aria-busy', 'false');
  $('geolocate').innerHTML = `${icon('locate')} Ma position`;
  $('geolocate').setAttribute('aria-label', 'Utiliser ma position comme départ');
}

function fitPoints() {
  if (guidance?.active) return;
  const a = selections.start, b = selections.end;
  if (!a || !b) return;
  map.invalidateSize({ pan: false, animate: false });
  const padding = mapPadding();
  const bounds = result?.path.length ? L.latLngBounds(result.path.flatMap(id => {
    const edge = routeGeometry.edges[id];
    return edge.geometry?.map(p => L.latLng(p[0], p[1])) ?? [routeGeometry.nodes[edge.from], routeGeometry.nodes[edge.to]].map(p => L.latLng(p.lat, p.lon));
  })) : L.latLngBounds([markers.start!.getLatLng(), markers.end!.getLatLng(), ...(markers.via ? [markers.via.getLatLng()] : [])]);
  map.fitBounds(bounds, {
    paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, maxZoom: 16, animate: !playing && !renderer.reducedMotion && !document.documentElement.classList.contains('keyboard-input'),
  });
}

function complete(updateGuidance = true) {
  if (updateGuidance) tripRevision++;
  playing = false;
  updateLaunch();
  if (!result) {
    $('playback').hidden = true;
    notice(roadPreferences().avoidMotorways || roadPreferences().avoidTolls
      ? 'Aucun itinéraire trouvé avec les évitements choisis. Modifiez les points ou désactivez une option.'
      : 'Aucun itinéraire automobile dans le réseau chargé. Les accès, sens uniques ou coupures peuvent empêcher le trajet. Essayez d’autres points.', 'error');
    return;
  }
  if (!guidance?.active) renderer.finish(result);
  if (updateGuidance) {
    try { guidance?.setRoute(navigationRoute(routeGeometry, result)); }
    catch { guidance?.setRoute(null); }
  }
  if (selections.start && selections.end) confirmedPlan = { start: { ...selections.start }, end: { ...selections.end }, stops: tripStops.map(place => ({ ...place })), criterion: criterion(), preferences: roadPreferences() };
  renderResult(result, selections, tripStops, criterion(), roadPreferences(), mobileApp, queue.length);
  const editor = $<HTMLDetailsElement>('route-editor');
  const restoreFocus = editor.contains(document.activeElement);
  editor.open = false;
  document.querySelector('.planner')!.scrollTop = 0;
  $('route-result').hidden = false;
  $('route-panel-toggle').hidden = mobileApp;
  if (restoreFocus) editor.querySelector('summary')!.focus({ preventScroll: true });
  $('playback-title').textContent = 'La rencontre a eu lieu.';
  $('playback-count').textContent = `${result.visited.toLocaleString('fr-FR')} états explorés · optimalité confirmée`;
  $('playback-percent').innerHTML = icon('check');
  $('playback-progress').style.transform = 'scaleX(1)';
  $('playback').classList.add('complete');
  notice(!mobileApp && traceStride > 1 ? `${result.visited.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 2 })} états explorés · ${result.waypointAt ? 'traces échantillonnées' : `trace 1/${traceStride} par front`}.` : '');
  $('playback').hidden = true;
  if (resumeGuidance) { resumeGuidance = false; void guidance?.start(false); }
  else if (!guidance?.active) requestAnimationFrame(fitPoints);
}

const criterion = () => document.querySelector<HTMLInputElement>('input[name="criterion"]:checked')!.value as Criterion;

function tick(now: number) {
  if (!playing) return;
  const elapsed = Math.min(80, now - lastTick);
  lastTick = now;
  const speed = playbackRate(queue.length, resumeGuidance || renderer.reducedMotion);
  carry = queue.length > cursor ? carry + elapsed * speed / 1000 : 0;
  const count = Math.min(queue.length - cursor, Math.floor(carry));
  if (count > 0) { renderer.visit(queue.slice(cursor, cursor + count), now); cursor += count; carry -= count; }
  const progress = result !== undefined ? (queue.length ? cursor / queue.length : 1) : 0;
  $('playback-count').textContent = queue.length ? `${cursor.toLocaleString('fr-FR')} segments affichés${traceStride > 1 ? result?.waypointAt ? ' · traces échantillonnées' : ` · trace 1/${traceStride}` : ' · deux fronts actifs'}` : 'Calcul sur le graphe national…';
  $('playback-percent').textContent = result !== undefined ? `${Math.round(progress * 100)} %` : '…';
  $('playback-progress').style.transform = `scaleX(${progress})`;
  if (result !== undefined && cursor === queue.length) { complete(); return; }
  playbackFrame = requestAnimationFrame(tick);
}

function explore(recalculation = false) {
  if (result && !playing && !recalculation) { void workspace?.calculate(); return; }
  if (playing) {
    renderer.interrupt();
    stop(false, !!result);
    if (result) complete(false);
    notice(result ? 'Relecture interrompue. Votre trajet reste disponible.' : 'Exploration interrompue. Relancez-la quand vous voulez.');
    return;
  }
  if (!selections.start || !selections.end || !map) return;
  if (inputs.via.value.trim() && !selections.via) { notice('Choisissez l’étape dans les suggestions ou sur la carte.', 'error'); return; }
  if (!recalculation) tripStops = selections.via ? [selections.via, ...tripStops.slice(1)] : [];
  waypointPending = tripStops.length > 0;
  stop();
  notice(''); setPicking(null);
  playing = true; carry = 0;
  traceStride = 1;
  $('playback').hidden = false;
  $('playback').classList.remove('complete');
  $('playback-title').textContent = 'Calcul du trajet…';
  $('playback-count').textContent = 'Recherche du meilleur itinéraire…';
  $('playback-percent').textContent = '';
  $('playback-progress').style.transform = 'scaleX(0)';
  updateLaunch(); fitPoints();
  if (waypointPending) void exploreVia(run, selections.start, tripStops, selections.end, criterion());
  else void exploreNational(run, selections.start, selections.end, criterion());
  lastTick = performance.now(); playbackFrame = requestAnimationFrame(tick);
}


async function tripSnapshot(): Promise<TripSnapshot> {
  if (!selections.end) throw new Error('Choisissez d’abord une destination.');
  const position = guidance?.active ? await guidance.position() : undefined;
  const route = result && !hasPreparedChanges() ? guidance?.plannedRoute ?? navigationRoute(routeGeometry, result) : null;
  return { tripId: run, revision: tripRevision, start: position ? { ...position.fix, name: 'Ma position GPS' } : selections.start ? { ...selections.start } : null,
    end: { ...selections.end }, stops: tripStops.map(place => ({ ...place })), route, at: position?.at ?? 0, criterion: criterion(), preferences: roadPreferences(), guiding: !!guidance?.active };
}

async function workspaceJourney(snapshot: TripSnapshot, start: Place, stops: Place[], end: Place, signal: AbortSignal) {
  let id: string | undefined;
  const cancel = () => { if (id) void cancelNationalRoute(id); };
  signal.addEventListener('abort', cancel, { once: true });
  try { return await fetchJourney(start, stops, end, snapshot.criterion, signal, value => { id = value; }, snapshot.preferences); }
  finally { signal.removeEventListener('abort', cancel); }
}

async function applyTrip(stops: Place[], signal: AbortSignal, original: TripSnapshot, committing: () => void) {
    const snapshot = await tripSnapshot();
    if (snapshot.tripId !== original.tripId || snapshot.guiding !== original.guiding) throw new Error('Un autre trajet est actif. Reprenez le trajet actuel avant de confirmer vos étapes.');
    stops = removeReachedStops(original.stops, snapshot.stops, stops);
    const check = () => {
      if (signal.aborted) throw new DOMException('Modification annulée.', 'AbortError');
      if (tripRevision !== snapshot.revision || snapshot.guiding !== !!guidance?.active) throw new Error('Le trajet a évolué pendant le calcul. Réessayez : vos changements sont conservés.');
    };
    check();
    if (!snapshot.start) throw new Error('Le GPS de départ est encore attendu. Vos étapes sont conservées ; réessayez dès que la position est disponible.');
    const combined = await workspaceJourney(snapshot, snapshot.start, stops, snapshot.end, signal);
    const route = navigationRoute(combined.geometry, combined.result)!;
    check();
    if (snapshot.guiding) {
      const current = await guidance!.position(); check();
      if (!acceptsRouteUpdate(route, snapshot.start, current.fix)) throw new Error('Votre position a changé pendant le calcul. Réessayez depuis la position actuelle ; le trajet reste conservé.');
      committing();
      await guidance!.replaceRoute(route, routingFor(route, stops, snapshot.end, snapshot.criterion, snapshot.preferences));
      if (tripRevision !== snapshot.revision) return;
    } else committing();
    tripStops = stops; waypointPending = stops.length > 0;
    selections.start = { ...snapshot.start }; inputs.start.value = snapshot.start.name;
    selections.via = stops[0] ? { ...stops[0] } : null; inputs.via.value = stops[0]?.name ?? '';
    if (stops[0]) placeMarker('via', stops[0].lat, stops[0].lon, stops[0].name); else { markers.via?.remove(); markers.via = undefined; }
    placeMarker('start', route.points[0].lat, route.points[0].lon, snapshot.start.name);
    comparisonAbort?.abort(); alternative = undefined; $('comparison-status').textContent = ''; $('choose-alternative').hidden = true;
    routeGeometry = combined.geometry; queue = combined.events; result = combined.result; traceStride = combined.stride;
    renderer.setGraph(routeGeometry); tripRevision++; run++; complete(!snapshot.guiding);
    notice('Trajet mis à jour avec les étapes confirmées.');

}

function setupTripWorkspace() {
  workspace?.close(true); document.getElementById('trip-workspace')?.remove();
  workspace = new TripWorkspace(tripSnapshot, applyTrip, async (snapshot, place, signal) => {
    if (!snapshot.route) throw new Error('Calculez d’abord un trajet pour estimer le détour.');
    const anchors = detourAnchors(snapshot.route, place.at, snapshot.at);
    const leg = await workspaceJourney(snapshot, { ...anchors.start, name: 'Parcours' }, [place], { ...anchors.end, name: 'Retour au parcours' }, signal);
    return { seconds: Math.max(0, leg.result.seconds - (anchors.end.seconds - anchors.start.seconds)), metres: Math.max(0, leg.result.length - (anchors.end.at - anchors.start.at)) };
  }, placePicker, () => savedPlaces.choices(), () => savedPlaces.recent, () => searchIndex, async () => { if (!locating) await locate(); });
  for (const [id, parent, label] of [['route-edit-stops', 'route-result', 'Ajouter une étape'], ['navigation-edit-stops', 'navigation-actions', 'Trajet']] as const) {
    if (document.getElementById(id)) continue;
    const button = document.createElement('button'); button.id = id; button.className = 'setting-button'; button.textContent = label;
    button.addEventListener('click', () => { void workspace?.open(); });
    const target = document.getElementById(parent) ?? document.querySelector(`.${parent}`)!;
    if (id === 'route-edit-stops') { button.innerHTML = `${icon('plus')}<span>Ajouter une étape</span>`; target.insertBefore(button, $('compare-routes')); }
    else { button.innerHTML = `${icon('route')}<span>Trajet</span>`; target.append(button); }
  }
}

async function exploreVia(activeRun: number, start: Place, vias: Place[], end: Place, preference: Criterion) {
  if (typeof crypto.randomUUID !== 'function') { stop(); notice('Ouvrez l’application en HTTPS ou sur localhost pour le calcul national.', 'error'); return; }
  const controller = routeAbort = new AbortController();
  try {
    $('playback-count').textContent = 'Calcul vers l’étape…';
    const combined = await fetchJourney(start, vias, end, preference, controller.signal, id => { routeId = id; }, roadPreferences());
    if (activeRun !== run) return;
    routeGeometry = combined.geometry; renderer.setGraph(routeGeometry); queue.push(...combined.events); result = combined.result; traceStride = combined.stride; $('coverage').textContent = 'France métropolitaine · Corse';
    const route = navigationRoute(routeGeometry, result)!;
    placeMarker('start', route.points[0].lat, route.points[0].lon, start.name); placeMarker('end', route.points.at(-1)!.lat, route.points.at(-1)!.lon, end.name);
  } catch (error) {
    if (activeRun !== run || controller.signal.aborted) return;
    stop(); notice(error instanceof Error ? error.message : 'Calcul avec étape indisponible.', 'error');
  } finally { if (activeRun === run) { routeId = undefined; routeAbort = undefined; } }
}

async function exploreNational(activeRun: number, start: Place, end: Place, preference: Criterion) {
  if (typeof crypto.randomUUID !== 'function') { stop(); notice('Ouvrez l’application en HTTPS ou sur localhost pour le calcul national.', 'error'); return; }
  const controller = new AbortController(); routeAbort = controller;
  const requestId = crypto.randomUUID(); routeId = requestId;
  const geometry = { nodes: [], edges: [] } as RoadGeometry;
  routeGeometry = geometry;
  const index = new Map<number, number>(); renderer.setGraph(geometry);
  let receivedResult = false;
  try {
    for await (const message of nationalRoute(start, end, preference, requestId, controller.signal, roadPreferences())) {
      if (activeRun !== run) return;
      if ('snapped' in message) {
        if (!Array.isArray(message.snapped) || message.snapped.length !== 2 || !message.snapped.every(isInFrance) || !Number.isInteger(message.traceStride) || message.traceStride < 1) throw new Error('Métadonnées routières invalides.');
        traceStride = message.traceStride;
        $('coverage').textContent = 'France métropolitaine · Corse';
        $('playback-title').textContent = renderer.reducedMotion ? 'Exploration nationale en mode réduit' : 'Deux fronts à travers la France…';
        (['start', 'end'] as const).forEach((side, i) => { const point = message.snapped[i]; placeMarker(side, point.lat, point.lon, selections[side]!.name); });
        fitPoints(); continue;
      }
      const decoded = decodeNationalMessage(message, geometry, index);
      if (decoded.events) queue.push(...decoded.events);
      if ('result' in decoded) { result = decoded.result; receivedResult = true; }
    }
    if (!receivedResult && activeRun === run) throw new Error('Flux routier interrompu avant le résultat.');
  } catch (error) {
    if (activeRun !== run || controller.signal.aborted) return;
    stop(); notice(error instanceof TypeError ? 'Connexion au service France impossible. Vérifiez Internet puis réessayez.'
      : error instanceof DOMException && error.name === 'TimeoutError' ? 'Le service France a mis trop de temps à répondre. Réessayez.'
      : error instanceof Error ? error.message : 'Connexion au service France impossible.', 'error');
  } finally { if (routeId === requestId) { routeId = undefined; routeAbort = undefined; } }
}

function setPicking(side: Endpoint | null) {
  if (side === 'start') cancelLocationRequest();
  picking = side;
  $('pick-hint').hidden = !side;
  $('map').classList.toggle('picking', !!side);
  $('app').classList.toggle('is-picking', !!side);
  document.querySelectorAll<HTMLButtonElement>('.pick').forEach(b => b.classList.toggle('selected', b.dataset.pick === side));
  if (side) $('pick-hint').querySelector('span')!.textContent = `Touchez une route pour placer ${side === 'start' ? 'le départ A' : side === 'via' ? 'l’étape' : 'l’arrivée B'}`;
}


const nationalCities: Place[] = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522, detail: 'Île-de-France' },
  { name: 'Lyon', lat: 45.7578, lon: 4.832, detail: 'Auvergne-Rhône-Alpes' },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698, detail: 'Provence-Alpes-Côte d’Azur' },
  { name: 'Bordeaux', lat: 44.8378, lon: -0.5792, detail: 'Nouvelle-Aquitaine' },
  { name: 'Brest', lat: 48.3904, lon: -4.4861, detail: 'Bretagne' },
  { name: 'Ajaccio', lat: 41.9192, lon: 8.7386, detail: 'Corse' },
];

async function initialize() {
  try {
    $('retry').hidden = true;
    ({ map } = createMap());
    installChargingMap(map, $<HTMLSelectElement>('settings-vehicle'));
    renderer = new ExplorationRenderer(map, { nodes: [], edges: [] });
    guidance = new GpsGuidance(map, () => { renderer.clear(); showAbout(false); }, () => requestAnimationFrame(fitPoints), fix => {
      if (selectPoint('start', { name: 'Ma position GPS', lat: fix.lat, lon: fix.lon })) {
        explore(true); resumeGuidance = true; notice('Recalcul du trajet depuis votre position…');
      }
    }, () => {
      const route = guidance?.plannedRoute;
      return route && confirmedPlan ? routingFor(route, tripStops, confirmedPlan.end, confirmedPlan.criterion, confirmedPlan.preferences) : undefined;
    }, route => {
      tripRevision++;
      if (result) { result.waypointAt = route.waypointAt; result.waypointAts = route.waypointAts; }
      const origin = route.points[0];
      selections.start = { name: 'Départ recalculé', lat: origin.lat, lon: origin.lon };
      if (confirmedPlan) confirmedPlan.start = { ...selections.start };
      inputs.start.value = selections.start.name;
      placeMarker('start', origin.lat, origin.lon, selections.start.name);
      const start = $('route-endpoints').firstElementChild;
      if (start) { const badge = document.createElement('span'); badge.className = 'endpoint-badge start'; badge.textContent = 'A'; start.replaceChildren(badge, document.createTextNode(selections.start.name)); }
      $('distance').textContent = (mobileApp || route.length >= 1000) ? `${(route.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: route.length < 1000 ? 2 : 1 })} km` : `${Math.round(route.length)} m`;
      const minutes = Math.ceil(route.seconds / 60);
      $('duration').textContent = minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
    }, count => {
      tripStops.splice(0, count); if (confirmedPlan) confirmedPlan.stops = tripStops.map(place => ({ ...place })); $('navigation-next-stop').textContent = tripStops[0] ? `${tripStops[0].name} · prochaine étape` : 'Vers votre destination'; waypointPending = tripStops.length > 0; tripRevision++;
      selections.via = tripStops[0] ? { ...tripStops[0] } : null; inputs.via.value = selections.via?.name ?? '';
      if (!selections.via) { markers.via?.remove(); markers.via = undefined; }
    });
    setupTripWorkspace();
    $<HTMLButtonElement>('lite').setAttribute('aria-pressed', String(renderer.lite));
    searchIndex = [...Object.values(defaults), ...nationalCities];
    updateLaunch();
    void checkNationalService().then(() => {
      $('coverage').textContent = 'France métropolitaine · Corse';
    }).catch(() => { $('coverage').textContent = 'Service France indisponible'; });
    map.on('click', e => {
      if (!picking) return;
      const side = picking;
      const name = `Point ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      if (selectPoint(side, { name, lat: e.latlng.lat, lon: e.latlng.lng })) { setPicking(null); requestAnimationFrame(() => focusPoint({ lat: e.latlng.lat, lon: e.latlng.lng })); }
    });
    map.on('resize', () => {
      if (guidance?.active || picking) return;
      if (locationCircle && !playing && $('route-result').hidden) { const point = locationCircle.getLatLng(); focusPoint({ lat: point.lat, lon: point.lng }); }
      else fitPoints();
    });
    $('loading').hidden = true;
    void locate(true);
  } catch {
    $('loading').querySelector('strong')!.textContent = 'La carte n’a pas pu démarrer.';
    $('loading').querySelector('p')!.textContent = 'Les données n’ont pas pu être chargées. Vérifiez votre connexion puis réessayez.';
    $('retry').hidden = false;
    launch.innerHTML = `${icon('bolt')}<span>Routes indisponibles</span>`;
  }
}

launch.addEventListener('click', () => explore());
$('replay').addEventListener('click', () => {
  if (playing || !result || !queue.length) return;
  renderer.clear(); cursor = 0; carry = 0; playing = true;
  $('route-result').hidden = true; $<HTMLDetailsElement>('route-editor').open = true; $('playback').hidden = false; $('playback').classList.remove('complete');
  $('playback-title').textContent = 'Relecture de l’exploration…';
  $('playback-progress').style.transform = 'scaleX(0)'; updateLaunch(); fitPoints();
  lastTick = performance.now(); playbackFrame = requestAnimationFrame(tick);
});
$('compare-routes').addEventListener('click', () => { void compareRoutes(); });
$('choose-alternative').addEventListener('click', () => {
  if (!alternative || !result) return;
  const current: Alternative = { result, geometry: routeGeometry, events: queue, criterion: criterion(), stride: traceStride };
  result = alternative.result; routeGeometry = alternative.geometry; queue = alternative.events; traceStride = alternative.stride;
  document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${alternative.criterion}"]`)!.checked = true;
  alternative = current; cursor = queue.length; renderer.clear(); renderer.setGraph(routeGeometry); complete(); showAlternative();
});
function showAlternative() {
  if (!alternative) return;
  const minutes = Math.max(1, Math.ceil(alternative.result.seconds / 60));
  const km = (alternative.result.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  $('comparison-status').textContent = `Autre trajet : ${km} km · ${minutes} min estimées sans trafic.`;
  $('choose-alternative').textContent = alternative.criterion === 'time' ? 'Choisir le plus rapide' : 'Choisir le plus court';
  $('choose-alternative').hidden = false;
}
async function compareRoutes() {
  if (!result || !selections.start || !selections.end || comparisonAbort) return;
  const activeRun = run, chosen = criterion(), other: Criterion = chosen === 'time' ? 'distance' : 'time';
  const geometry: RoadGeometry = { nodes: [], edges: [] }, events: ExplorationEvent[] = [], index = new Map<number, number>();
  const controller = comparisonAbort = new AbortController(), id = comparisonId = crypto.randomUUID();
  let found: SearchResult | null | undefined, stride = 1;
  $<HTMLButtonElement>('compare-routes').disabled = true; $('comparison-status').textContent = 'Calcul de l’autre trajet…';
  try {
    if (waypointPending) {
      const combined = await fetchJourney(selections.start, tripStops, selections.end, other, controller.signal, value => { comparisonId = value; }, roadPreferences());
      if (!navigationRoute(combined.geometry, combined.result)) throw new Error('Le trajet avec étape ne permet pas le guidage.');
      geometry.nodes.push(...combined.geometry.nodes); geometry.edges.push(...combined.geometry.edges); events.push(...combined.events); found = combined.result; stride = combined.stride;
    } else {
      for await (const message of nationalRoute(selections.start, selections.end, other, id, controller.signal, roadPreferences())) {
        if (activeRun !== run) return;
        if ('snapped' in message) { stride = message.traceStride; continue; }
        const decoded = decodeNationalMessage(message, geometry, index);
        if (decoded.events) events.push(...decoded.events);
        if ('result' in decoded) found = decoded.result;
      }
    }
    if (activeRun !== run) return;
    if (!found || !result) throw new Error('Aucun autre trajet trouvé.');
    const path = (roads: RoadGeometry, route: SearchResult) => JSON.stringify(route.path.map(id => roads.edges[id].geometry));
    if (path(geometry, found) === path(routeGeometry, result)) $('comparison-status').textContent = 'Les deux critères empruntent le même trajet.';
    else { alternative = { result: found, geometry, events, criterion: other, stride }; showAlternative(); }
  } catch (error) {
    if (activeRun === run && !controller.signal.aborted) $('comparison-status').textContent = error instanceof Error ? error.message : 'Comparaison indisponible. Réessayez.';
  } finally {
    if (comparisonAbort === controller) { comparisonAbort = undefined; comparisonId = undefined; $<HTMLButtonElement>('compare-routes').disabled = false; }
  }
}
$('retry').addEventListener('click', () => { map?.remove(); void initialize(); });
$('reset').addEventListener('click', () => {
  if (!map) return;
  cancelLocationRequest(); stop(); setPicking(null);
  document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${$<HTMLSelectElement>('settings-criterion').value}"]`)!.checked = true;
  $<HTMLInputElement>('trip-avoid-motorways').checked = $<HTMLInputElement>('settings-avoid-motorways').checked;
  $<HTMLInputElement>('trip-avoid-tolls').checked = $<HTMLInputElement>('settings-avoid-tolls').checked;
  for (const side of ['start', 'via', 'end'] as const) { selections[side] = null; inputs[side].value = ''; markers[side]?.remove(); } waypointPending = false; tripStops = [];
  locationCircle?.remove(); locationCircle = undefined; $('app').classList.remove('has-gps-start');
  updateLaunch(); void locate();
});
$('swap').addEventListener('click', () => {
  if (!map) return;
  const a = selections.start, b = selections.end;
  if (!a || !b) return;
  selectPoint('start', b, false); selectPoint('end', a, false); notice('Départ et arrivée permutés.');
});
document.querySelectorAll<HTMLButtonElement>('.pick').forEach(button => button.addEventListener('click', () => { if (map) setPicking(picking === button.dataset.pick ? null : button.dataset.pick as Endpoint); }));
$('cancel-pick').addEventListener('click', () => setPicking(null));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { setPicking(null); showAbout(false); } });
document.querySelectorAll<HTMLInputElement>('input[name="criterion"]').forEach(radio => radio.addEventListener('change', () => { stop(true, !!result); notice('Options modifiées. Recalculez le trajet pour les appliquer.'); }));
$('fit').addEventListener('click', () => { if (map) fitPoints(); });
$('france').addEventListener('click', () => {
  if (!map) return;
  map.invalidateSize({ pan: false });
  const padding = mapPadding();
  map.fitBounds([[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]], { paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, animate: !renderer.reducedMotion && !document.documentElement.classList.contains('keyboard-input') });
});
$('zoom-in').addEventListener('click', () => map?.zoomIn(1, { animate: false }));
$('zoom-out').addEventListener('click', () => map?.zoomOut(1, { animate: false }));
$('lite').addEventListener('click', () => { if (!renderer) return; renderer.setLite(!renderer.lite); $<HTMLButtonElement>('lite').setAttribute('aria-pressed', String(renderer.lite)); notice(renderer.lite ? 'Animation allégée.' : 'Animation complète.'); });
function showAbout(show: boolean) {
  const dialog = $<HTMLDialogElement>('about');
  if (show) { if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; } }
  else if (dialog.open) dialog.close();
  $('help').setAttribute('aria-expanded', String(show));
}
$('help').addEventListener('click', () => showAbout(!$<HTMLDialogElement>('about').open));
$('about').addEventListener('close', () => { $('help').setAttribute('aria-expanded', 'false'); $('help').focus({ preventScroll: true }); });
document.querySelector('#route-editor > summary')!.addEventListener('click', event => {
  if ($<HTMLDetailsElement>('route-editor').open && hasPreparedChanges() && confirmedPlan) {
    event.preventDefault();
    if (!confirm('Abandonner les changements et revenir au trajet confirmé ?')) return;
    selections.start = { ...confirmedPlan.start }; selections.end = { ...confirmedPlan.end };
    inputs.start.value = confirmedPlan.start.name; inputs.end.value = confirmedPlan.end.name;
    tripStops = confirmedPlan.stops.map(place => ({ ...place })); waypointPending = tripStops.length > 0;
    selections.via = tripStops[0] ?? null; inputs.via.value = tripStops[0]?.name ?? '';
    placeMarker('start', confirmedPlan.start.lat, confirmedPlan.start.lon, confirmedPlan.start.name);
    placeMarker('end', confirmedPlan.end.lat, confirmedPlan.end.lon, confirmedPlan.end.name);
    if (tripStops[0]) placeMarker('via', tripStops[0].lat, tripStops[0].lon, tripStops[0].name); else { markers.via?.remove(); markers.via = undefined; }
    document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${confirmedPlan.criterion}"]`)!.checked = true;
    $<HTMLInputElement>('trip-avoid-motorways').checked = confirmedPlan.preferences.avoidMotorways;
    $<HTMLInputElement>('trip-avoid-tolls').checked = confirmedPlan.preferences.avoidTolls;
    updateLaunch(); $<HTMLDetailsElement>('route-editor').open = false;
  }
  requestAnimationFrame(fitPoints);
});
if (mobileApp) $('route-editor').addEventListener('toggle', () => {
  const summary = $('route-editor').querySelector('summary')!;
  const label = $<HTMLDetailsElement>('route-editor').open ? 'Revenir au résumé du trajet' : 'Modifier le trajet';
  summary.setAttribute('aria-label', label); summary.title = label;
  summary.setAttribute('aria-expanded', String($<HTMLDetailsElement>('route-editor').open));
});
document.querySelectorAll('.planner details').forEach(details => details.addEventListener('toggle', () => requestAnimationFrame(fitPoints)));
$('close-about').addEventListener('click', () => showAbout(false));
function setPanelCollapsed(collapsed: boolean) {
  document.querySelector('.planner')!.classList.toggle('is-collapsed', collapsed);
  $('planner-content').hidden = collapsed;
  $('route-panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('route-panel-toggle').textContent = collapsed ? 'Afficher le trajet' : 'Réduire le panneau trajet';
  requestAnimationFrame(fitPoints);
}
$('route-panel-toggle').addEventListener('click', () => setPanelCollapsed(!$('planner-content').hidden));

async function locate(initial = false) {
  if (!map) return;
  if (initial && mobileApp) {
    const generation = locationRequest;
    try {
      const permission = await Geolocation.checkPermissions();
      if (generation !== locationRequest) return;
      if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
        notice('Pour calculer depuis votre position, autorisez le GPS précis. Vous pouvez déjà choisir votre destination.');
        $('gps-retry').textContent = 'Autoriser le GPS'; $('gps-retry').hidden = false; return;
      }
    } catch { /* The explicit location request below provides the recovery message. */ }
  }
  if (locating) { cancelLocationRequest(); notice('Recherche de position annulée.'); return; }
  if (selections.start || result || playing) stop(true, !!result && !guidance?.active);
  setPicking(null);
  const request = ++locationRequest; locating = true;
  $('gps-retry').hidden = true;
  $('geolocate').setAttribute('aria-busy', 'true');
  $('geolocate').innerHTML = `${icon('close')} Annuler le GPS`;
  $('geolocate').setAttribute('aria-label', 'Annuler la recherche de position');
  notice('Recherche d’un point GPS précis… Cela peut prendre jusqu’à 30 secondes.');
  try {
    if (Capacitor.isNativePlatform()) await preciseLocationPermission(Geolocation);
    if (request !== locationRequest) return;
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 });
    if (request !== locationRequest) return;
    const point = selectionPosition(position);
    if (selectPoint('start', { name: 'Ma position GPS', lat: point.lat, lon: point.lon }, false)) {
      locationCircle = L.circle([point.lat, point.lon], { radius: point.accuracy, color: 'oklch(0.57 0.11 210)', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      $('app').classList.add('has-gps-start');
      notice('');
      requestAnimationFrame(() => focusPoint(point, 16));
    }
  } catch (error) {
    if (request === locationRequest) {
      const message = locationError(error, !mobileApp); notice(message, 'error'); workspace?.locationStatus(message);
      $('gps-retry').textContent = 'Réessayer le GPS'; $('gps-retry').hidden = !mobileApp;
    }
  } finally { if (request === locationRequest) { cancelLocationRequest(); updateLaunch(); } }
}
$('geolocate').addEventListener('click', () => { void locate(); });
$('gps-retry').addEventListener('click', () => { void locate(); });

installDialogNavigation();
void initialize();
