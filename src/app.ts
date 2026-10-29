import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { buildRoadGraph, nearestNode } from './graph';
import { createMap, pointMarker } from './map';
import { ExplorationRenderer } from './animation';
import { playbackRate } from './animation-timing';
import { GpsGuidance } from './guidance';
import { navigationRoute } from './navigation';
import { locationError, preciseLocationPermission, selectionPosition } from './location';
import { requestDeadline } from './request-deadline';
import { device, isMobileApp } from './device';
import { readSettings, readRoadPreferences, type Theme } from './settings';
import { cancelNationalRoute, checkNationalService, decodeNationalMessage, franceBounds, isInFrance, nationalRoute, searchFrance } from './national';
import type { Criterion, Dataset, ExplorationEvent, Place, RoadGeometry, RoadGraph, SearchResult, WorkerResponse } from './types';

const paths: Record<string, string> = {
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  swap: '<path d="M8 3v16m-4-4 4 4 4-4m4 6V5m-4 4 4-4 4 4"/>',
  locate: '<circle cx="12" cy="12" r="6"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="1"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  car: '<path d="m5 6 2-3h10l2 3 2 7v6h-3v-3H6v3H3v-6l2-7Zm0 0h14M3 12h18M7 13v1m10-1v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip-link" href="#start">Préparer un trajet</a>
  <header class="topbar">
    <a class="brand" href="./" aria-label="Éclaire, accueil" translate="no"><span class="brand-symbol">${icon('bolt')}</span>éclaire<span class="brand-dot">.</span></a>
    <span class="tagline">Deux points. Un chemin qui s’éclaire.</span>
    <div class="header-right"><span class="edition">France <span>métropolitaine & Corse</span></span><button class="help-button" id="settings-open" aria-label="Paramètres" hidden>${icon('settings')}<span>Paramètres</span></button><button class="help-button" id="help" aria-label="Aide et fonctionnement" aria-haspopup="dialog" aria-expanded="false" aria-controls="about">${icon('info')}<span>Aide</span></button></div>
  </header>
  <main>
    <div id="map" aria-label="Carte interactive de France. Utilisez les boutons Choisir sur la carte, puis touchez une route." role="region"></div>
    <section class="planner" aria-labelledby="planner-title">
      <button id="route-panel-toggle" class="setting-button" aria-expanded="true" aria-controls="planner-content" hidden>Réduire le panneau trajet</button>
      <div id="planner-content">
      <div class="planner-intro"><span class="eyebrow">${icon('car')} À vous la route</span><h1 id="planner-title">Votre prochain<br><span>trajet.</span></h1><p>Choisissez deux points.<br>Regardez le chemin prendre vie.</p></div>
      <div class="exploring-heading"><span class="eyebrow">${icon('bolt')} Exploration</span><h2>Les routes font le lien.</h2><p>Deux fronts, un itinéraire à trouver.</p></div>
      <details id="route-editor" open><summary>Modifier le trajet ${icon('route')}</summary><div class="route-form">
      <div class="location-fields">
        <div class="field-wrap start-field"><span class="field-point" aria-hidden="true">A</span><div class="field-body"><label for="start">Départ</label><input id="start" name="start" type="search" spellcheck="false" placeholder="Une adresse, un lieu…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="start-results" /></div><button class="icon-button pick" data-pick="start" title="Choisir le départ sur la carte" aria-label="Choisir le départ sur la carte">${icon('pin')}</button><div id="start-results" class="suggestions" role="listbox" aria-label="Suggestions de départ" hidden></div></div>
        <div class="field-wrap end-field"><span class="field-point" aria-hidden="true">B</span><div class="field-body"><label for="end">Arrivée</label><input id="end" name="end" type="search" spellcheck="false" placeholder="Une adresse, un lieu…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="end-results" /></div><button class="icon-button pick" data-pick="end" title="Choisir l’arrivée sur la carte" aria-label="Choisir l’arrivée sur la carte">${icon('pin')}</button><div id="end-results" class="suggestions" role="listbox" aria-label="Suggestions d’arrivée" hidden></div></div>
      </div>
      <div class="location-actions"><button id="geolocate" class="location-button" aria-label="Utiliser ma position comme départ">${icon('locate')} Ma position</button><button id="swap" class="swap-button" aria-label="Permuter le départ et l’arrivée">${icon('swap')} Permuter</button></div>
      <fieldset class="criteria"><legend>Critère du trajet</legend><label><input type="radio" name="criterion" value="time" checked><span>${icon('time')} Le plus rapide</span></label><label><input type="radio" name="criterion" value="distance"><span>${icon('route')} Le plus court</span></label></fieldset>
      <fieldset id="road-preferences" class="road-preferences" aria-describedby="road-preferences-help"><legend>Éviter sur ce trajet</legend><label><input id="avoid-motorways" type="checkbox"> Les autoroutes</label><label><input id="avoid-tolls" type="checkbox"> Les péages</label><p id="road-preferences-help">Selon les données OpenStreetMap, parfois incomplètes. Service France requis, sans secours Paris avec ces options.</p></fieldset>
      <div class="launch-row"><button id="launch" class="primary" disabled>${icon('bolt')}<span>Chargement des routes…</span>${icon('arrow')}</button><button id="reset" class="icon-button reset-button" aria-label="Effacer le trajet et utiliser ma position" title="Recommencer">${icon('reset')}</button></div>
      </div></details>
      <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
      <div id="route-result" class="route-result" role="status" aria-live="polite" hidden><div class="result-heading"><span>${icon('check')} Trajet trouvé</span><span id="result-criterion"></span></div><div id="route-endpoints" class="route-endpoints"></div><div class="metrics"><div><strong id="duration"></strong><span>durée estimée</span></div><div><strong id="distance"></strong><span>distance</span></div></div><p>Estimation sans trafic en direct.</p><button id="navigation-start" class="primary" hidden>${icon('locate')} Démarrer le guidage GPS</button><p id="navigation-availability"></p></div>
      <div class="planner-footer">${icon('car')} En voiture <span>·</span><span id="coverage">Connexion au service France…</span></div>
      </div>
    </section>
    <div class="map-tools"><button id="france" class="icon-button france-button" aria-label="Voir toute la France" title="Voir toute la France">FR</button><button id="fit" class="icon-button" aria-label="Recentrer sur les deux points" title="Recentrer">${icon('expand')}</button><div class="zoom-controls"><button id="zoom-in" class="icon-button" aria-label="Zoom avant">${icon('plus')}</button><button id="zoom-out" class="icon-button" aria-label="Zoom arrière">${icon('minus')}</button></div></div>
    <div id="pick-hint" class="pick-hint" role="status" hidden><span></span><button id="cancel-pick" class="icon-button" aria-label="Annuler la sélection">${icon('close')}</button></div>
    <section id="playback" class="playback" aria-label="État de l’exploration" hidden><span class="activity-dot" aria-hidden="true"></span><div><strong id="playback-title" role="status">Calcul du trajet…</strong><span id="playback-count">Préparation du calcul…</span></div><span id="playback-percent"></span><div class="playback-track" aria-hidden="true"><span id="playback-progress"></span></div></section>
    <section id="navigation" class="navigation" aria-label="Guidage GPS" hidden>
      <div id="navigation-next" tabindex="0" aria-label="Prochaine instruction"><strong id="navigation-turn-distance">GPS</strong><h2 id="navigation-instruction" role="status" aria-live="polite" aria-atomic="true">Recherche de votre position…</h2></div>
      <div class="navigation-bottom">
        <p id="navigation-status" role="status"></p>
        <button id="navigation-recalculate" class="primary" hidden>Recalculer depuis ma position</button><button id="navigation-resume" class="primary" hidden>Reprendre le GPS</button>
        <div class="navigation-metrics"><div><strong id="navigation-time">—</strong><span>durée estimée</span></div><div><strong id="navigation-remaining">—</strong><span>restants</span></div><div><strong id="navigation-speed">—</strong><span>km/h · GPS</span><span id="navigation-limit">Limite : —</span></div></div>
        <div class="navigation-actions"><button id="navigation-follow" aria-pressed="true">Position suivie</button><button id="navigation-voice" aria-pressed="false">Activer la voix</button><button id="navigation-stop" aria-label="Quitter le guidage">Quitter</button></div>
        <small>Guidage expérimental, sans trafic en direct. La voix et le GPS continuent écran verrouillé. Respectez la signalisation.</small>
        <div class="navigation-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a></div>
      </div>
    </section>
    <div class="map-legend"><span><i class="cyan"></i>Départ A</span><span><i class="amber"></i>Arrivée B</span><span><i class="final"></i>Trajet</span></div>
    <dialog id="about" class="about" aria-labelledby="about-title"><button id="close-about" class="icon-button" aria-label="Fermer l’aide">${icon('close')}</button><h2 id="about-title">Comment ça marche</h2><p>Un front cyan part de A, un front ambre part de B. Chaque branche suit une route réellement explorée.</p><p>La première rencontre ne suffit pas. Le trajet apparaît quand le calcul confirme qu’aucun meilleur chemin n’existe dans le réseau chargé.</p><dl><div><dt>Le plus court</dt><dd>Minimise la longueur des routes.</dd></div><div><dt>Le plus rapide</dt><dd>Minimise le temps estimé selon les vitesses OSM, sans trafic en direct.</dd></div></dl><button id="lite" class="setting-button" aria-pressed="false">${icon('layers')} Mode léger</button><p>Réduit les halos et le nombre de fronts pour les appareils modestes. La réduction des animations suit aussi votre préférence système.</p><details><summary>Données et limites</summary><p>Le service France utilise une recherche bidirectionnelle exacte. Les grandes traces sont échantillonnées pour préserver le téléphone ; le calcul et le trajet final restent complets. Sans service, seule la démo Paris utilise le calcul embarqué.</p><p id="data-info"></p><p>Les points sont raccordés à une route accessible à 2 km maximum. Les accès privés et de desserte sont exclus. Certaines restrictions OSM ne sont pas prises en charge. Vérifiez l’accès final et respectez la signalisation.</p><p>Le guidage GPS expérimental est réservé à l’application mobile sur téléphone. Le GPS continue écran verrouillé jusqu’à l’arrivée ou à Quitter. Aucun trafic en direct n’est intégré.</p><a href="/data/provenance.json" target="_blank" rel="noopener">Provenance de la démo Paris</a></details><details><summary>Position et confidentialité</summary><p>Le GPS reste sur l’appareil pendant le suivi. Le calcul d’un trajet depuis votre position transmet ce point au service routier configuré, ainsi que les recalculs. L’IGN reçoit le texte recherché. Le fournisseur des tuiles reçoit les zones consultées. Aucun historique GPS n’est enregistré par l’application.</p></details></dialog>
    <div id="loading" class="loading" role="status"><span class="loading-bolt">${icon('bolt')}</span><strong>Chargement de la carte</strong><p>Chargement des données OpenStreetMap…</p><button id="retry" class="primary" hidden>Réessayer</button></div>
  </main>
  <section id="settings-page" class="settings-page" aria-labelledby="settings-title" hidden>
    <header class="settings-header"><button id="settings-close" class="icon-button" aria-label="Retour à la carte">${icon('close')}</button><h2 id="settings-title">Paramètres</h2></header>
    <div class="settings-content">
      <label for="settings-theme">Apparence</label><p>Choisissez le thème ou suivez celui du téléphone.</p><select id="settings-theme"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select>
      <label for="settings-criterion">Trajet préféré</label><p>Ce choix s’applique aux prochains trajets.</p><select id="settings-criterion"><option value="time">Le plus rapide</option><option value="distance">Le plus court</option></select>
      <p class="settings-version">Version de l’application <strong id="settings-version">—</strong></p><p id="settings-error" role="status" hidden></p>
    </div>
  </section>`;

// Keyboard interactions remain immediate, including actions that reveal a result.
document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard-input'));
document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-input'));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inputs = { start: $<HTMLInputElement>('start'), end: $<HTMLInputElement>('end') };
const launch = $<HTMLButtonElement>('launch');
const mobileApp = isMobileApp();
const roadPreferences = () => ({ avoidMotorways: $<HTMLInputElement>('avoid-motorways').checked, avoidTolls: $<HTMLInputElement>('avoid-tolls').checked });
{
  let avoided = { avoidMotorways: false, avoidTolls: false };
  try { avoided = readRoadPreferences(localStorage); } catch { /* Storage can be unavailable. */ }
  for (const [id, key] of [['avoid-motorways', 'avoidMotorways'], ['avoid-tolls', 'avoidTolls']] as const) {
    const input = $<HTMLInputElement>(id); input.checked = avoided[key];
    input.addEventListener('change', () => {
      try { localStorage.setItem(`eclaire.${key}`, String(input.checked)); }
      catch { notice('Ce choix s’applique au trajet, mais ne pourra pas être mémorisé.'); }
      stop();
    });
  }
}
if (mobileApp) {
  $('settings-open').hidden = false;
  let saved = { theme: 'auto' as Theme, criterion: 'time' as Criterion };
  try { saved = readSettings(localStorage); } catch { /* Storage can be unavailable. */ }
  const theme = $<HTMLSelectElement>('settings-theme'), preferred = $<HTMLSelectElement>('settings-criterion');
  theme.value = saved.theme; preferred.value = saved.criterion;
  document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${saved.criterion}"]`)!.checked = true;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => {
    const dark = theme.value === 'dark' || (theme.value === 'auto' && systemTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  };
  const save = (key: string, value: string) => {
    try { localStorage.setItem(key, value); $('settings-error').hidden = true; }
    catch { $('settings-error').textContent = 'Impossible d’enregistrer les paramètres sur cet appareil.'; $('settings-error').hidden = false; }
  };
  applyTheme(); systemTheme.addEventListener('change', applyTheme);
  theme.addEventListener('change', () => { save('eclaire.theme', theme.value); applyTheme(); });
  preferred.addEventListener('change', () => {
    save('eclaire.criterion', preferred.value);
    const radio = document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${preferred.value}"]`)!;
    if (!radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  $('settings-open').addEventListener('click', () => { $('settings-page').hidden = false; $('settings-close').focus(); });
  const closeSettings = () => { $('settings-page').hidden = true; $('settings-open').focus(); };
  $('settings-close').addEventListener('click', closeSettings);
  window.addEventListener('eclaire-back', event => {
    if (!$('settings-page').hidden) { event.preventDefault(); closeSettings(); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('settings-page').hidden) closeSettings(); });
  void device.getVersion().then(info => { $('settings-version').textContent = info.version; }).catch(() => { $('settings-version').textContent = 'Indisponible'; });
}
type Endpoint = 'start' | 'end';
type Selection = Place & { node: number; snapDistance: number };
let data: Dataset;
let roads: RoadGraph;
let map: L.Map;
let renderer: ExplorationRenderer;
let guidance: GpsGuidance | undefined;
let routeGeometry: RoadGeometry;
let resumeGuidance = false;
let worker: Worker | undefined;
let workerReady = false;
let selections: Record<Endpoint, Selection | null> = { start: null, end: null };
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
let nationalReady = false;
let routeAbort: AbortController | undefined;
let routeId: string | undefined;
let traceStride = 1;
let nationalPlayback = false;
let locationRequest = 0;
let locating = false;
let locationCircle: L.Circle | undefined;
const defaults: Record<Endpoint, Place> = {
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
  launch.disabled = !workerReady || !selections.start || !selections.end;
  launch.innerHTML = playing ? `${icon('stop')}<span>Interrompre l’exploration</span>` : `${icon('bolt')}<span>Explorer le trajet</span>${icon('arrow')}`;
}

function stop(clear = true) {
  cancelLocationRequest();
  setPanelCollapsed(false);
  $('route-panel-toggle').hidden = true;
  $<HTMLDetailsElement>('route-editor').open = true;
  guidance?.setRoute(null); resumeGuidance = false;
  routeAbort?.abort(); routeAbort = undefined;
  if (routeId) { void cancelNationalRoute(routeId); routeId = undefined; }
  run++;
  cancelAnimationFrame(playbackFrame);
  playing = false;
  queue = []; cursor = 0; result = undefined;
  $('playback').hidden = true;
  $('route-result').hidden = true;
  if (clear) renderer?.clear();
  updateLaunch();
}

function selectPoint(side: Endpoint, place: Place, announce = true) {
  if (!isInFrance(place)) {
    notice('Choisissez un point en France métropolitaine ou en Corse.', 'error'); return false;
  }
  const snap = nearestNode(roads, place);
  stop();
  const node = nationalReady ? place : snap ? roads.nodes[snap.index] : place;
  selections[side] = { ...place, node: snap?.index ?? -1, snapDistance: snap?.distance ?? 0 };
  inputs[side].value = place.name;
  if (side === 'start') { locationCircle?.remove(); locationCircle = undefined; $('app').classList.remove('has-gps-start'); }
  placeMarker(side, node.lat, node.lon, place.name);
  closeSuggestions(side);
  updateLaunch();
  if (announce) notice(snap && !nationalReady ? `Point ${side === 'start' ? 'de départ' : 'd’arrivée'} raccordé à ${roads.edges[(roads.outgoing[snap.index][0] ?? roads.incoming[snap.index][0])].name}, à ${Math.round(snap.distance)} m.` : 'Point choisi. Le raccordement à une route sera vérifié au lancement.');
  return true;
}

function placeMarker(side: Endpoint, lat: number, lon: number, name: string) {
  markers[side]?.remove();
  markers[side] = pointMarker(map, lat, lon, side, name, point => {
    selectPoint(side, { name: side === 'start' ? 'Départ ajusté sur la carte' : 'Arrivée ajustée sur la carte', lat: point.lat, lon: point.lng }, false);
    notice('Point ajusté. Lancez une nouvelle exploration pour calculer le trajet.');
  });
}

function focusPoint(point: { lat: number; lon: number }, zoom = map.getZoom()) {
  map.invalidateSize({ pan: false, animate: false });
  const bounds = $('map').getBoundingClientRect();
  const panel = document.querySelector('.planner')!.getBoundingClientRect();
  const mobile = matchMedia('(max-width: 720px)').matches;
  const x = mobile ? bounds.width / 2 : (panel.right - bounds.left + bounds.width) / 2;
  const chromeBottom = mobile ? Math.max(0, ...Array.from(document.querySelectorAll('.map-tools, .map-legend'), el => { const rect = el.getBoundingClientRect(); return rect.height ? rect.bottom - bounds.top : 0; })) : 0;
  const y = mobile ? (chromeBottom + Math.max(chromeBottom + 40, panel.top - bounds.top)) / 2 : bounds.height / 2;
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
  const mobile = matchMedia('(max-width: 720px)').matches;
  const compact = mobile && matchMedia('(max-height: 700px)').matches;
  const showingResult = !$<HTMLDetailsElement>('route-editor').open && !$('route-result').hidden;
  const plannerHeight = document.querySelector('.planner')!.getBoundingClientRect().height;
  const bounds = result?.path.length ? L.latLngBounds(result.path.flatMap(id => {
    const edge = routeGeometry.edges[id];
    return edge.geometry?.map(p => L.latLng(p[0], p[1])) ?? [routeGeometry.nodes[edge.from], routeGeometry.nodes[edge.to]].map(p => L.latLng(p.lat, p.lon));
  })) : L.latLngBounds(markers.start!.getLatLng(), markers.end!.getLatLng());
  map.fitBounds(bounds, {
    paddingTopLeft: mobile ? [48, compact ? showingResult ? 70 : playing ? 110 : 126 : playing ? 220 : 170] : [470, 100], paddingBottomRight: mobile ? [85, plannerHeight + 52] : [110, playing ? 220 : 130], maxZoom: 16, animate: !renderer.reducedMotion && !document.documentElement.classList.contains('keyboard-input'),
  });
}

function makeWorker() {
  worker?.terminate();
  workerReady = false;
  worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: message }: MessageEvent<WorkerResponse>) => {
    if (message.type === 'ready') { workerReady = true; updateLaunch(); return; }
    if (message.run !== run) return;
    if (message.type === 'batch') queue.push(...message.events);
    if (message.type === 'result') result = message.result;
    if (message.type === 'error') { stop(); notice(message.message, 'error'); }
  };
  worker.onerror = () => {
    stop(); workerReady = false; updateLaunch();
    notice('Le moteur de calcul ne répond plus. Rechargez la page pour réessayer.', 'error');
  };
  worker.postMessage({ type: 'init', roads });
}

function complete() {
  playing = false;
  updateLaunch();
  if (!result) {
    $('playback').hidden = true;
    notice(roadPreferences().avoidMotorways || roadPreferences().avoidTolls ? 'Aucun itinéraire trouvé avec les évitements choisis. Modifiez les points ou désactivez une option.' : 'Aucun itinéraire automobile dans le réseau chargé. Les accès, sens uniques ou coupures peuvent empêcher le trajet. Essayez d’autres points.', 'error');
    return;
  }
  renderer.finish(result);
  try { guidance?.setRoute(navigationRoute(routeGeometry, result)); }
  catch { guidance?.setRoute(null); }
  const minutes = Math.ceil(result.seconds / 60);
  $('duration').textContent = minutes < 1 ? '< 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
  $('distance').textContent = result.length >= 1000 ? `${(result.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: result.length >= 1_000_000 ? 0 : result.length >= 100_000 ? 1 : 2 })} km` : `${Math.round(result.length)} m`;
  $('result-criterion').textContent = criterion() === 'time' ? 'Le plus rapide' : 'Le plus court';
  $('route-endpoints').replaceChildren(...(['start', 'end'] as const).map((side, i) => {
    const line = document.createElement('p'), badge = document.createElement('span');
    badge.className = `endpoint-badge ${side}`; badge.textContent = i ? 'B' : 'A';
    line.append(badge, document.createTextNode(selections[side]!.name)); return line;
  }));
  const editor = $<HTMLDetailsElement>('route-editor');
  const restoreFocus = editor.contains(document.activeElement);
  editor.open = false;
  document.querySelector('.planner')!.scrollTop = 0;
  $('route-result').hidden = false;
  $('route-panel-toggle').hidden = false;
  if (restoreFocus) editor.querySelector('summary')!.focus({ preventScroll: true });
  $('playback-title').textContent = 'La rencontre a eu lieu.';
  $('playback-count').textContent = `${result.visited.toLocaleString('fr-FR')} états explorés · optimalité confirmée`;
  $('playback-percent').innerHTML = icon('check');
  $('playback-progress').style.transform = 'scaleX(1)';
  $('playback').classList.add('complete');
  notice(nationalPlayback && traceStride > 1 ? `${result.visited.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 2 })} états explorés · trace 1/${traceStride} par front.` : '');
  $('playback').hidden = true;
  if (resumeGuidance) { resumeGuidance = false; void guidance?.start(false); }
  else requestAnimationFrame(fitPoints);
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
  $('playback-count').textContent = queue.length || !nationalPlayback ? `${cursor.toLocaleString('fr-FR')} ${nationalPlayback ? 'segments affichés' : 'états explorés'}${traceStride > 1 ? ` · trace 1/${traceStride}` : ' · deux fronts actifs'}` : 'Calcul sur le graphe national…';
  $('playback-percent').textContent = result !== undefined ? `${Math.round(progress * 100)} %` : '…';
  $('playback-progress').style.transform = `scaleX(${progress})`;
  if (result !== undefined && cursor === queue.length) { complete(); return; }
  playbackFrame = requestAnimationFrame(tick);
}

function explore() {
  if (playing) {
    renderer.interrupt();
    stop(false);
    // Termination cancels computation as well as trace playback; a fresh worker prevents stale results.
    makeWorker();
    notice('Exploration interrompue. Relancez-la quand vous voulez.');
    return;
  }
  if (!selections.start || !selections.end || !workerReady) return;
  stop();
  notice(''); setPicking(null); closeSuggestions('start'); closeSuggestions('end');
  playing = true; carry = 0;
  nationalPlayback = nationalReady || selections.start.node === -1 || selections.end.node === -1 || roadPreferences().avoidMotorways || roadPreferences().avoidTolls;
  traceStride = 1;
  $('playback').hidden = false;
  $('playback').classList.remove('complete');
  $('playback-title').textContent = nationalPlayback ? 'Calcul du trajet…' : renderer.reducedMotion ? 'Exploration en mode réduit' : 'Les routes cherchent leur chemin…';
  $('playback-count').textContent = nationalPlayback ? 'Recherche du meilleur itinéraire…' : 'Deux fronts actifs';
  $('playback-percent').textContent = '';
  $('playback-progress').style.transform = 'scaleX(0)';
  updateLaunch(); fitPoints();
  if (nationalPlayback) void exploreNational(run, selections.start, selections.end, criterion());
  else { routeGeometry = roads; renderer.setGraph(roads); worker!.postMessage({ type: 'route', run, start: selections.start.node, end: selections.end.node, criterion: criterion() }); }
  lastTick = performance.now(); playbackFrame = requestAnimationFrame(tick);
}

async function exploreNational(activeRun: number, start: Place, end: Place, preference: Criterion) {
  if (typeof crypto.randomUUID !== 'function') { stop(); notice('Ouvrez l’application en HTTPS ou sur localhost pour le calcul national.', 'error'); return; }
  const controller = new AbortController(); routeAbort = controller;
  const requestId = crypto.randomUUID(); routeId = requestId;
  const geometry = { nodes: [], edges: [] } as Pick<RoadGraph, 'nodes' | 'edges'>;
  routeGeometry = geometry;
  const index = new Map<number, number>(); renderer.setGraph(geometry);
  let receivedResult = false;
  try {
    for await (const message of nationalRoute(start, end, preference, requestId, controller.signal, roadPreferences())) {
      if (activeRun !== run) return;
      if ('snapped' in message) {
        if (!Array.isArray(message.snapped) || message.snapped.length !== 2 || !message.snapped.every(isInFrance) || !Number.isInteger(message.traceStride) || message.traceStride < 1) throw new Error('Métadonnées routières invalides.');
        traceStride = message.traceStride;
        nationalReady = true;
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
    stop(); notice(error instanceof TypeError ? 'Connexion au service France impossible. Vérifiez Internet puis réessayez.' : error instanceof DOMException && error.name === 'TimeoutError' ? 'Le service France a mis trop de temps à répondre. Réessayez.' : error instanceof Error ? error.message : 'Connexion au service France impossible.', 'error');
  } finally { if (routeId === requestId) { routeId = undefined; routeAbort = undefined; } }
}

function setPicking(side: Endpoint | null) {
  if (side) cancelLocationRequest();
  picking = side;
  $('pick-hint').hidden = !side;
  $('map').classList.toggle('picking', !!side);
  $('app').classList.toggle('is-picking', !!side);
  document.querySelectorAll<HTMLButtonElement>('.pick').forEach(b => b.classList.toggle('selected', b.dataset.pick === side));
  if (side) $('pick-hint').querySelector('span')!.textContent = `Touchez une route pour placer ${side === 'start' ? 'le départ A' : 'l’arrivée B'}`;
}

function closeSuggestions(side: Endpoint) {
  $(`${side}-results`).hidden = true;
  inputs[side].setAttribute('aria-expanded', 'false');
  inputs[side].removeAttribute('aria-activedescendant');
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function setupSearch(side: Endpoint) {
  const input = inputs[side];
  const list = $(`${side}-results`);
  let active = -1;
  let matches: Place[] = [];
  let timer = 0;
  let sequence = 0;
  let controller: AbortController | undefined;
  const render = (places: Place[]) => {
    matches = places;
    active = -1;
    list.replaceChildren();
    matches.forEach((place, i) => {
      const option = document.createElement('div');
      option.role = 'option'; option.id = `${side}-option-${i}`; option.className = 'suggestion'; option.setAttribute('aria-selected', 'false');
      const name = document.createElement('span'); name.textContent = place.name;
      const detail = document.createElement('small'); detail.textContent = place.detail || 'France';
      option.append(name, detail);
      option.addEventListener('pointerdown', e => { e.preventDefault(); selectPoint(side, place); input.blur(); });
      list.append(option);
    });
    if (!matches.length) { const empty = document.createElement('p'); empty.textContent = 'Aucun lieu trouvé dans cette zone.'; list.append(empty); }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const show = () => {
    const text = input.value.trim(), query = normalize(text), current = ++sequence;
    clearTimeout(timer); controller?.abort();
    const local = query.length < 2 ? [...Object.values(defaults), ...nationalCities.slice(0, 3)] : searchIndex.filter(p => normalize(p.name).includes(query)).slice(0, 7);
    render(local);
    if (query.length < 3) return;
    timer = window.setTimeout(async () => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 6000);
      try {
        const remote = await searchFrance(text, controller.signal);
        if (current !== sequence || document.activeElement !== input) return;
        const names = new Set<string>();
        render([...remote, ...local].filter(p => { const name = normalize(p.name); if (names.has(name)) return false; names.add(name); return true; }).slice(0, 7));
      } catch {
        if (current === sequence && document.activeElement === input && !local.length) list.textContent = 'Recherche IGN indisponible. Choisissez un point sur la carte.';
      } finally { clearTimeout(timeout); }
    }, 300);
  };
  input.addEventListener('input', () => {
    stop(); selections[side] = null; markers[side]?.remove(); updateLaunch(); show();
  });
  input.addEventListener('focus', () => { if (roads) show(); });
  input.addEventListener('blur', () => { sequence++; clearTimeout(timer); controller?.abort(); closeSuggestions(side); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSuggestions(side); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) show();
      active = Math.max(0, Math.min(matches.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      Array.from(list.children).forEach((child, i) => child.setAttribute('aria-selected', String(i === active)));
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      if (matches[active]) input.setAttribute('aria-activedescendant', `${side}-option-${active}`);
    }
    if (e.key === 'Enter' && !list.hidden && matches.length) { e.preventDefault(); selectPoint(side, matches[Math.max(0, active)]); input.blur(); }
  });
}

const nationalCities: Place[] = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522, detail: 'Île-de-France' },
  { name: 'Lyon', lat: 45.7578, lon: 4.832, detail: 'Auvergne-Rhône-Alpes' },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698, detail: 'Provence-Alpes-Côte d’Azur' },
  { name: 'Bordeaux', lat: 44.8378, lon: -0.5792, detail: 'Nouvelle-Aquitaine' },
  { name: 'Brest', lat: 48.3904, lon: -4.4861, detail: 'Bretagne' },
  { name: 'Ajaccio', lat: 41.9192, lon: 8.7386, detail: 'Corse' },
];

function buildSearchIndex() {
  const names = new Set<string>();
  const places: Place[] = [...Object.values(defaults), ...nationalCities];
  const edgeByWay = new Map(roads.edges.map(e => [e.way, e]));
  for (const way of data.ways) {
    if (!way.tags.name || names.has(way.tags.name)) continue;
    const road = edgeByWay.get(way.id);
    if (!road) continue;
    const node = roads.nodes[road.from];
    names.add(way.tags.name);
    places.push({ name: way.tags.name, lat: node.lat, lon: node.lon, detail: 'Rue · Paris centre' });
  }
  places.push(...data.places);
  searchIndex = places.filter(p => { const key = normalize(p.name); if (names.has(`place:${key}`)) return false; names.add(`place:${key}`); return true; });
}

async function initialize() {
  try {
    $('retry').hidden = true;
    const deadline = requestDeadline(25_000);
    try {
      const response = await fetch('./data/paris.json', { signal: deadline.signal });
      if (!response.ok) throw new Error('Network');
      data = await response.json();
    } finally { deadline.dispose(); }
    if (!Array.isArray(data.nodes) || !Array.isArray(data.ways) || !data.metadata?.bounds || !data.basemap?.features) throw new Error('Invalid data');
    roads = buildRoadGraph(data);
    ({ map } = createMap(data, roads));
    renderer = new ExplorationRenderer(map, roads);
    guidance = new GpsGuidance(map, () => { renderer.clear(); showAbout(false); }, () => requestAnimationFrame(fitPoints), fix => {
      if (selectPoint('start', { name: 'Ma position GPS', lat: fix.lat, lon: fix.lon })) {
        explore(); resumeGuidance = true; notice('Recalcul depuis votre position avant de démarrer le guidage.');
      }
    });
    $<HTMLButtonElement>('lite').setAttribute('aria-pressed', String(renderer.lite));
    buildSearchIndex();
    setupSearch('start'); setupSearch('end');
    makeWorker();
    const date = new Date(data.metadata.osmTimestamp).toLocaleDateString('fr-FR');
    $('data-info').textContent = `Extrait OpenStreetMap du ${date} : ${roads.edges.length.toLocaleString('fr-FR')} segments orientés, ${roads.restrictions.length} restrictions automobiles. ${roads.excludedWays} voies exclues par prudence ou par leurs conditions d’accès.`;
    void checkNationalService().then(health => {
      nationalReady = true;
      $('coverage').textContent = 'France métropolitaine · Corse';
      $('data-info').textContent = `${health.engine || "Moteur national"}. Réseau national : ${health.nodes.toLocaleString('fr-FR')} nœuds et ${health.edges.toLocaleString('fr-FR')} arêtes. Données OSM ${health.dataTimestamp || 'datées dans le service'}. Démo Paris embarquée en secours.`;
    }).catch(() => { $('coverage').textContent = 'Service France à démarrer · démo Paris disponible'; });
    map.on('click', e => {
      if (!picking) return;
      const side = picking;
      const snap = nearestNode(roads, { lat: e.latlng.lat, lon: e.latlng.lng });
      const name = snap ? roads.edges[(roads.outgoing[snap.index][0] ?? roads.incoming[snap.index][0])].name : `Point ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      if (selectPoint(side, { name, lat: e.latlng.lat, lon: e.latlng.lng })) { setPicking(null); requestAnimationFrame(() => focusPoint({ lat: e.latlng.lat, lon: e.latlng.lng })); }
    });
    map.on('resize', () => {
      if (guidance?.active || picking) return;
      if (locationCircle && !playing && $('route-result').hidden) { const point = locationCircle.getLatLng(); focusPoint({ lat: point.lat, lon: point.lng }); }
      else fitPoints();
    });
    $('loading').hidden = true;
    map.fitBounds([[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]], { animate: false });
    void locate();
  } catch {
    $('loading').querySelector('strong')!.textContent = 'Paris attend la connexion.';
    $('loading').querySelector('p')!.textContent = 'Les données n’ont pas pu être chargées. Vérifiez votre connexion puis réessayez.';
    $('retry').hidden = false;
    launch.innerHTML = `${icon('bolt')}<span>Routes indisponibles</span>`;
  }
}

launch.addEventListener('click', explore);
$('retry').addEventListener('click', () => { map?.remove(); void initialize(); });
$('reset').addEventListener('click', () => {
  if (!roads) return;
  stop(); setPicking(null);
  for (const side of ['start', 'end'] as const) { selections[side] = null; inputs[side].value = ''; markers[side]?.remove(); }
  locationCircle?.remove(); locationCircle = undefined; $('app').classList.remove('has-gps-start');
  updateLaunch(); void locate();
});
$('swap').addEventListener('click', () => {
  if (!roads) return;
  const a = selections.start, b = selections.end;
  if (!a || !b) return;
  selectPoint('start', b, false); selectPoint('end', a, false); notice('Départ et arrivée permutés.');
});
document.querySelectorAll<HTMLButtonElement>('.pick').forEach(button => button.addEventListener('click', () => { if (roads) setPicking(picking === button.dataset.pick ? null : button.dataset.pick as Endpoint); }));
$('cancel-pick').addEventListener('click', () => setPicking(null));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { setPicking(null); showAbout(false); } });
document.querySelectorAll<HTMLInputElement>('input[name="criterion"]').forEach(radio => radio.addEventListener('change', () => { stop(); notice('Critère modifié. Lancez une nouvelle exploration.'); }));
$('fit').addEventListener('click', () => { if (roads) fitPoints(); });
$('france').addEventListener('click', () => {
  if (!map) return;
  map.invalidateSize({ pan: false });
  map.fitBounds([[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]], { paddingTopLeft: matchMedia('(max-width: 720px)').matches ? [20, 55] : [410, 50], paddingBottomRight: matchMedia('(max-width: 720px)').matches ? [40, document.querySelector('.planner')!.getBoundingClientRect().height + 35] : [70, 100], animate: !renderer.reducedMotion && !document.documentElement.classList.contains('keyboard-input') });
});
$('zoom-in').addEventListener('click', () => map?.zoomIn(1, { animate: false }));
$('zoom-out').addEventListener('click', () => map?.zoomOut(1, { animate: false }));
$('lite').addEventListener('click', () => { if (!renderer) return; renderer.setLite(!renderer.lite); $<HTMLButtonElement>('lite').setAttribute('aria-pressed', String(renderer.lite)); notice(renderer.lite ? 'Mode léger activé : halo réduit et moins de fronts lumineux.' : 'Mode complet activé.'); });
function showAbout(show: boolean) {
  const dialog = $<HTMLDialogElement>('about');
  if (show) { if (!dialog.open) dialog.showModal(); }
  else if (dialog.open) dialog.close();
  $('help').setAttribute('aria-expanded', String(show));
}
$('help').addEventListener('click', () => showAbout(!$<HTMLDialogElement>('about').open));
$('about').addEventListener('close', () => { $('help').setAttribute('aria-expanded', 'false'); });
document.querySelector('#route-editor > summary')!.addEventListener('click', () => requestAnimationFrame(fitPoints));
$('close-about').addEventListener('click', () => showAbout(false));
function setPanelCollapsed(collapsed: boolean) {
  document.querySelector('.planner')!.classList.toggle('is-collapsed', collapsed);
  $('planner-content').hidden = collapsed;
  $('route-panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('route-panel-toggle').textContent = collapsed ? 'Afficher le trajet' : 'Réduire le panneau trajet';
}
$('route-panel-toggle').addEventListener('click', () => setPanelCollapsed(!$('planner-content').hidden));

async function locate() {
  if (!roads) return;
  if (locating) { cancelLocationRequest(); notice('Recherche de position annulée.'); return; }
  stop(); setPicking(null);
  const request = ++locationRequest; locating = true;
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
      notice(`Départ GPS placé à ± ${Math.round(point.accuracy)} m. Cherchez une arrivée ou choisissez-la sur la carte. Les repères A et B se déplacent au doigt.`);
      requestAnimationFrame(() => focusPoint(point, 16));
    }
  } catch (error) {
    if (request === locationRequest) notice(locationError(error), 'error');
  } finally { if (request === locationRequest) cancelLocationRequest(); }
}
$('geolocate').addEventListener('click', () => { void locate(); });

void initialize();
