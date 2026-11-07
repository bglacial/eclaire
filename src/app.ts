import L from 'leaflet';
import { arrivalClock } from './eta';
import { icon } from './icons';
import { installDialogNavigation } from './dialog-navigation';
import { PlacePicker } from './place-picker';
import { SavedPlacesUI } from './saved-places-ui';
import 'leaflet/dist/leaflet.css';
import './style.css';
import './journeys.css';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { createMap, pointMarker } from './map';
import { mapPadding } from './map-viewport';
import { ExplorationRenderer } from './animation';
import { playbackRate } from './animation-timing';
import { GpsGuidance } from './guidance';
import { navigationRoute, acceptsRouteUpdate, isNavigationRoute, type NavigationRoute } from './navigation';
import { locationError, preciseLocationPermission, selectionPosition } from './location';
import { device } from './device';
import { readSettings, readRoadPreferences, type Theme, type RoadPreferences } from './settings';
import type { NativeRoutingConfig } from './native-guidance';
import { TripWorkspace, type TripSnapshot } from './trip-workspace';
import { detourAnchors } from './along-route';
import { deployedVersion, lastUpdateCheck, updateCheckDate } from './updates';
import { combineLegs, removeReachedStops, type RouteLeg } from './waypoint';
import { cancelNationalRoute, checkNationalService, decodeNationalMessage, franceBounds, isInFrance, nationalRoute, routingApi, searchFrance } from './national';
import type { Criterion, ExplorationEvent, Place, RoadGeometry, SearchResult } from './types';


const mobileApp = Capacitor.isNativePlatform();
document.getElementById('app')!.classList.toggle('is-mobile-app', mobileApp);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip-link" href="#destination-open">Préparer un trajet</a>
  <header class="topbar">
    <a class="brand" href="./" aria-label="Éclaire, accueil" translate="no">éclaire<img class="brand-symbol" src="/logo.svg" width="36" height="36" alt="" /></a>
    <span class="tagline">Deux points. Un chemin qui s’éclaire.</span>
    <div class="header-right"><span class="edition">France <span>métropolitaine & Corse</span></span><button class="help-button" id="settings-open" aria-label="Paramètres" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings-page" hidden>${icon('settings')}<span>Paramètres</span></button><button class="help-button" id="help" aria-label="Informations" aria-haspopup="dialog" aria-expanded="false" aria-controls="about">${icon('info')}<span>Infos</span></button></div>
  </header>
  <main>
    <div id="map" aria-label="Carte interactive de France. Utilisez les boutons Choisir sur la carte, puis touchez une route." role="region"></div>
    <section class="planner" aria-labelledby="planner-title">
      <button id="route-panel-toggle" class="setting-button" aria-expanded="true" aria-controls="planner-content" hidden>Réduire le panneau trajet</button>
      <div id="planner-content">
      <div class="planner-intro"><h1 id="planner-title">Où va-t-on ?</h1></div>
      <div class="exploring-heading"><h2>La route prend vie.</h2><p>Recherche du meilleur itinéraire…</p></div>
      <details id="route-editor" open><summary role="button" aria-expanded="true">${icon('edit')}<span>Modifier la destination</span></summary><div class="route-form">
        <input id="start" type="hidden" ${mobileApp ? 'disabled' : ''} /><input id="via" type="hidden" /><input id="end" type="hidden" />
        <div class="location-fields">
          <button id="start-open" class="place-row" ${mobileApp ? 'hidden' : ''}>${icon('locate')}<span><small>Départ</small><strong id="start-label">Ma position</strong></span>${icon('arrow')}</button>
          <button id="destination-open" class="destination-search">${icon('search')}<span><strong id="destination-label">Destination</strong><small>Adresse ou nom d’un lieu</small></span>${icon('arrow')}</button>
        </div>
        <div id="home-shortcuts" class="home-shortcuts"><button id="shortcut-home">${icon('home')}<strong>Domicile</strong><small>Définir</small></button><button id="shortcut-work">${icon('work')}<strong>Travail</strong><small>Définir</small></button><button id="open-saved-places">${icon('bookmark')}<strong>Mes lieux</strong></button></div>
        <div id="home-recent-section" hidden><h2>Récents</h2><div id="home-recent"></div></div>
        <div id="prepare-trip" hidden><p id="prepared-stops" class="page-hint">Directement vers l’arrivée.</p><button id="prepare-stops" class="outline-button">${icon('plus')}<span>Ajouter une étape</span></button>
          <details class="planner-options"><summary>Options du trajet</summary><div class="options-content"><fieldset class="criteria"><legend>Critère du trajet</legend><label><input type="radio" name="criterion" value="time" checked><span>${icon('time')} Le plus rapide</span></label><label><input type="radio" name="criterion" value="distance"><span>${icon('route')} Le plus court</span></label></fieldset><fieldset class="trip-avoidances"><legend>Pour ce trajet</legend><label><input id="trip-avoid-motorways" type="checkbox" /> Éviter les autoroutes</label><label><input id="trip-avoid-tolls" type="checkbox" /> Éviter les péages</label></fieldset><div class="location-actions" ${mobileApp ? 'hidden' : ''}><button id="geolocate" class="location-button">${icon('locate')} Ma position</button><button id="swap" class="swap-button" disabled>${icon('swap')} Permuter</button></div></div></details>
        </div>
        <div class="launch-row"><button id="launch" class="primary" disabled>${icon('bolt')}<span>Calculer le trajet</span>${icon('arrow')}</button><button id="reset" class="icon-button reset-button" aria-label="Effacer le trajet et utiliser ma position" title="Nouveau trajet">${icon('reset')}</button></div>
      </div></details>
      <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
      <button id="gps-retry" class="setting-button" hidden>Réessayer le GPS</button>
      <div id="route-result" class="route-result" hidden><div class="result-heading"><span>${icon('check')} Mon trajet</span><span id="result-criterion"></span></div><h2 id="result-title"></h2><div class="metrics"><div aria-label="Durée estimée"><strong id="duration"></strong></div><div aria-label="Distance"><strong id="distance"></strong></div></div><p class="estimate-caption">Durée estimée, sans trafic<br><span id="result-arrival"></span></p><p id="result-preferences" class="page-hint" hidden></p><div class="result-itinerary"><div id="route-endpoints" class="route-endpoints"></div></div><p id="result-explanation" hidden></p><button id="compare-routes" class="text-button">Comparer les trajets</button><p id="comparison-status" role="status"></p><button id="choose-alternative" class="outline-button" hidden></button><details class="exploration-options"><summary>Voir l’exploration et les options</summary><button id="replay" class="text-button">Revoir l’exploration</button><button id="result-options" class="text-button">Options du trajet</button><button id="new-trip" class="text-button">Nouveau trajet</button></details><button id="navigation-start" class="primary" hidden>${icon('locate')}<span>Démarrer le guidage</span></button><p id="navigation-availability" hidden></p></div>
      <div class="planner-footer"><span id="departure-status">${icon('locate')} Départ : recherche de ma position…</span><span id="coverage" hidden>Connexion au service France…</span></div>
      </div>
    </section>
    <div class="map-tools"><button id="france" class="icon-button france-button" aria-label="Voir toute la France" title="Voir toute la France">FR</button><button id="fit" class="icon-button" aria-label="Recentrer sur les deux points" title="Recentrer">${icon('expand')}</button><div class="zoom-controls"><button id="zoom-in" class="icon-button" aria-label="Zoom avant">${icon('plus')}</button><button id="zoom-out" class="icon-button" aria-label="Zoom arrière">${icon('minus')}</button></div></div>
    <div id="pick-hint" class="pick-hint" role="status" hidden><span></span><button id="cancel-pick" class="icon-button" aria-label="Annuler la sélection">${icon('close')}</button></div>
    <section id="playback" class="playback" aria-label="État de l’exploration" hidden><span class="activity-dot" aria-hidden="true"></span><div><strong id="playback-title" role="status">Calcul du trajet…</strong><span id="playback-count">Préparation du calcul…</span></div><span id="playback-percent"></span><div class="playback-track" aria-hidden="true"><span id="playback-progress"></span></div></section>
    <section id="navigation" class="navigation" aria-label="Guidage GPS" hidden>
      <div id="navigation-next" tabindex="0" aria-label="Prochaine instruction"><strong id="navigation-turn-distance">GPS</strong><h2 id="navigation-instruction" role="status" aria-live="polite" aria-atomic="true">Recherche de votre position…</h2></div>
      <div class="navigation-bottom">
        <p id="navigation-next-stop" class="navigation-next-stop"></p><p id="navigation-status" role="status"></p>
        <p id="navigation-offline" role="status" hidden>Connexion absente : trajet conservé, recalcul et nouvelles cartes indisponibles.</p>
        <button id="navigation-resume" class="primary" hidden>Reprendre le GPS</button>
        <div class="navigation-metrics"><div><strong id="navigation-time">—</strong><span>durée estimée</span><span id="navigation-arrival"></span></div><div><strong id="navigation-remaining">—</strong><span>restants</span></div><div><strong id="navigation-speed">—</strong><span>km/h · GPS</span><span id="navigation-limit">Limite : —</span></div></div>
        <div class="navigation-actions"><button id="navigation-follow">${icon('locate')}<span>Recentrer</span></button><button id="navigation-voice" class="icon-button" aria-label="Activer la voix" title="Activer la voix" aria-pressed="false">${icon('voice')}<span>Voix</span></button><button id="navigation-stop" class="icon-button" aria-label="Quitter le guidage" title="Quitter le guidage">${icon('close')}<span>Terminer</span></button></div>
        <div class="navigation-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a></div>
      </div>
    </section>
    <dialog id="navigation-exit" class="confirm-dialog" aria-labelledby="navigation-exit-title"><h2 id="navigation-exit-title">Terminer le guidage ?</h2><p>Vous pourrez le reprendre depuis le résumé du trajet.</p><button id="navigation-exit-cancel" class="primary">Continuer le guidage</button><button id="navigation-exit-confirm" class="text-button danger-text">Terminer le guidage</button></dialog>
    <div class="map-legend"><span><i class="cyan"></i>Départ A</span><span><i class="amber"></i>Arrivée B</span><span><i class="final"></i>Trajet</span></div>
    <dialog id="about" class="about" aria-labelledby="about-title">
      <header class="about-header"><button id="close-about" class="setting-button" aria-label="Retour à la carte">${icon('back')}<span>Carte</span></button><h2 id="about-title">Informations</h2></header>
      <div class="about-content">
        <p>${mobileApp ? 'Votre départ est votre position GPS. Choisissez une arrivée, puis touchez « Calculer le trajet ».' : 'Choisissez un départ et une arrivée, puis touchez « Calculer le trajet ».'}</p>
        <dl><div><dt>Le plus rapide</dt><dd>Réduit la durée estimée, sans trafic en direct.</dd></div><div><dt>Le plus court</dt><dd>Réduit la distance à parcourir.</dd></div></dl>
        <h3>Pourquoi cette animation ?</h3><p>Elle montre les routes comparées avant d’afficher votre trajet.</p>
        <button id="lite" class="setting-button" aria-pressed="false">${icon('layers')} Alléger l’animation</button>
        <p>L’heure d’arrivée est estimée sans trafic ; avant le départ, elle suppose un départ immédiat. Pendant le guidage, elle évolue avec le trajet restant.</p><h3>Le guidage</h3><p>Dans l’application sur téléphone, le GPS vous guide, même écran verrouillé. Il s’arrête à l’arrivée ou avec la croix.</p><p>Respectez la signalisation. Les trajets et les limitations affichées peuvent contenir des erreurs.</p>
        <details><summary>Carte et connexion</summary><p>Éclaire couvre la France métropolitaine et la Corse. Une connexion est nécessaire pour calculer un trajet et charger les cartes.</p><p>Les cartes et les routes viennent d’OpenStreetMap. Si votre adresse n’est pas accessible en voiture, le trajet peut s’arrêter à proximité.</p></details>
        <details><summary>Vos données</summary><p>Le GPS reste sur votre téléphone pendant le suivi. Le calcul d’un trajet envoie les points nécessaires au service de calcul.</p><p>Les services de recherche reçoivent le texte saisi et les zones recherchées. Le fournisseur de cartes reçoit les zones affichées.</p><p>L’application ne garde pas d’historique GPS. Vos destinations enregistrées restent sur cet appareil.</p></details>
      </div>
    </dialog>
    <div id="loading" class="loading" role="status"><img class="loading-logo" src="/logo.svg" width="64" height="64" alt="" /><strong>Chargement de la carte</strong><p>Chargement des données OpenStreetMap…</p><button id="retry" class="primary" hidden>Réessayer</button></div>
  </main>
  <dialog id="settings-page" class="settings-page" aria-labelledby="settings-title" hidden>
    <header class="settings-header"><button id="settings-close" class="setting-button settings-back" aria-label="Retour à la carte">${icon('back')}<span>Carte</span></button><h2 id="settings-title">Paramètres</h2></header>
    <div class="settings-content">
      <p class="settings-intro">Vos préférences sont enregistrées sur cet appareil.</p><button id="settings-saved-places" class="setting-button">${icon('bookmark')} Mes lieux</button>
      <section class="settings-group" aria-labelledby="settings-display-title"><h3 id="settings-display-title">Affichage</h3>
        <label for="settings-theme">Thème</label><p id="settings-theme-hint">Automatique suit l’apparence de votre appareil.</p><select id="settings-theme" aria-describedby="settings-theme-hint"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select>
      </section>
      <section class="settings-group" aria-labelledby="settings-route-title"><h3 id="settings-route-title">Préférences par défaut</h3>
        <label for="settings-criterion">Critère par défaut</label><p id="settings-criterion-hint">S’applique aux nouveaux trajets. Les options du trajet actuel restent indépendantes.</p><select id="settings-criterion" aria-describedby="settings-criterion-hint"><option value="time">Le plus rapide</option><option value="distance">Le plus court</option></select>
        <fieldset class="road-preferences settings-avoidance" aria-describedby="settings-avoidance-hint"><legend>Routes à éviter</legend><label><input id="settings-avoid-motorways" type="checkbox"> Les autoroutes</label><label><input id="settings-avoid-tolls" type="checkbox"> Les péages</label><p id="settings-avoidance-hint">Modifier ces choix nécessite un nouveau calcul du trajet. Les évitements utilisent les données OpenStreetMap, parfois incomplètes, et nécessitent le service France. La démo Paris ne les prend pas en charge.</p></fieldset>
      </section>
      <fieldset id="settings-pip" class="road-preferences settings-group" hidden><legend>Fenêtre flottante</legend><label><input id="settings-pip-automatic" type="checkbox"> Ouvrir automatiquement pendant le guidage</label><p>La fenêtre reste aussi accessible depuis le guidage.</p></fieldset>
      <section class="settings-updates settings-group" aria-labelledby="settings-updates-title"><h3 id="settings-updates-title">Mises à jour</h3>
        <button id="updates-check" class="setting-button">Rechercher les mises à jour</button>
        <p id="updates-history">Dernière recherche : <time id="updates-last-check">Jamais</time></p>
        <p id="updates-status" role="status" aria-live="polite"></p>
        <button id="updates-reload" class="setting-button" hidden>Actualiser l’application</button>
      </section>
      <p><a href="https://eclaire.nriault.fr/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></p>
      <p class="settings-version">Version <strong id="settings-version">${__APP_VERSION__}</strong></p><p id="settings-error" role="status" hidden></p>
    </div>
  </dialog>`;

// Keyboard interactions remain immediate, including actions that reveal a result.
document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard-input'));
document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-input'));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inputs = { start: $<HTMLInputElement>('start'), via: $<HTMLInputElement>('via'), end: $<HTMLInputElement>('end') };
const launch = $<HTMLButtonElement>('launch');
const roadPreferences = () => ({ avoidMotorways: $<HTMLInputElement>('trip-avoid-motorways').checked, avoidTolls: $<HTMLInputElement>('trip-avoid-tolls').checked });
{
  let avoided = { avoidMotorways: false, avoidTolls: false };
  try { avoided = readRoadPreferences(localStorage); } catch { /* Storage can be unavailable. */ }
  for (const [id, key] of [['avoid-motorways', 'avoidMotorways'], ['avoid-tolls', 'avoidTolls']] as const) {
    const input = $<HTMLInputElement>(`settings-${id}`);
    input.checked = avoided[key];
    const current = $<HTMLInputElement>(`trip-${id}`); current.checked = avoided[key];
    current.addEventListener('change', () => { stop(true, !!result); notice('Options du trajet modifiées. Recalculez pour les appliquer.'); });
    input.addEventListener('change', () => {
      try { localStorage.setItem(`eclaire.${key}`, String(input.checked)); }
      catch { notice('Impossible de mémoriser cette préférence pour les prochains trajets.'); }
      if (!selections.end) { current.checked = input.checked; updateLaunch(); }
    });
  }
}
{
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
    if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
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
    if (!selections.end && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const android = Capacitor.getPlatform() === 'android';
  if (android) {
    const automatic = $<HTMLInputElement>('settings-pip-automatic');
    void device.getPipSettings().then(settings => { automatic.checked = settings.automatic; $('settings-pip').hidden = !settings.supported; }).catch(() => undefined);
    automatic.addEventListener('change', async () => {
      automatic.disabled = true;
      try { await device.setPipAutomatic({ enabled: automatic.checked }); $('settings-error').hidden = true; }
      catch { automatic.checked = !automatic.checked; $('settings-error').textContent = 'Impossible d’enregistrer ce réglage sur cet appareil.'; $('settings-error').hidden = false; }
      finally { automatic.disabled = false; }
    });
  }
  const updateDate = (value: unknown) => {
    const timestamp = lastUpdateCheck(value), date = $<HTMLTimeElement>('updates-last-check');
    date.textContent = updateCheckDate(timestamp);
    date.dateTime = timestamp ? new Date(timestamp).toISOString() : '';
  };
  try { updateDate(localStorage.getItem('eclaire.updateAttempt')); } catch { updateDate(0); }
  const settingsPage = $<HTMLDialogElement>('settings-page');
  $('settings-open').addEventListener('click', () => {
    settingsPage.hidden = false; settingsPage.showModal(); settingsPage.scrollTop = 0;
    $('settings-open').setAttribute('aria-expanded', 'true'); $('settings-close').focus();
    if (android) void device.getUpdateStatus().then(state => {
      updateDate(state.lastCheckedAt);
      if (state.status === 'store') {
        $('updates-check').textContent = 'Ouvrir Google Play';
        $('updates-history').hidden = true;
        $('updates-status').textContent = 'Les mises à jour sont distribuées par Google Play.';
      }
    }).catch(() => { $('updates-status').textContent = 'La date de la dernière recherche est indisponible.'; });
  });
  const closeSettings = () => {
    settingsPage.close(); settingsPage.hidden = true;
    $('settings-open').setAttribute('aria-expanded', 'false'); $('settings-open').focus();
  };
  $('settings-close').addEventListener('click', closeSettings);
  window.addEventListener('eclaire-back', event => {
    if ($<HTMLDialogElement>('about').open) { event.preventDefault(); showAbout(false); return; }
    if (!$('settings-page').hidden) { event.preventDefault(); closeSettings(); }
  });
  settingsPage.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  $('updates-reload').addEventListener('click', () => location.reload());
  $('updates-check').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('updates-check');
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    $('updates-status').textContent = 'Recherche en cours…'; $('updates-reload').hidden = true;
    try {
      if (android) {
        const state = await device.checkForUpdates(); updateDate(state.lastCheckedAt);
        const messages = {
          store: 'Les mises à jour sont distribuées par Google Play.',
          available: 'Une mise à jour est disponible. Confirmez son installation dans la fenêtre Android.',
          current: 'Cette version est à jour.',
          checking: 'Une recherche est déjà en cours. Réessayez dans un instant.',
          error: 'Recherche impossible. Vérifiez votre connexion puis réessayez.',
        };
        $('updates-status').textContent = messages[state.status ?? 'error'];
      } else {
        const timestamp = Date.now(); updateDate(timestamp);
        try { localStorage.setItem('eclaire.updateAttempt', String(timestamp)); } catch { /* The date remains visible for this session. */ }
        const version = await deployedVersion();
        $('updates-status').textContent = version === __APP_VERSION__ ? 'Cette version est à jour.' : Capacitor.isNativePlatform() ? `Le site utilise la version ${version}. Les mises à jour iOS nécessitent une nouvelle installation de l’application.` : `La version ${version} est disponible.`;
        $('updates-reload').hidden = version === __APP_VERSION__ || Capacitor.isNativePlatform();
      }
    } catch { $('updates-status').textContent = 'Recherche impossible. Vérifiez votre connexion puis réessayez.'; }
    finally { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
  });
}
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
  return !!plan && (JSON.stringify(selections.start) !== JSON.stringify(plan.start) || JSON.stringify(selections.end) !== JSON.stringify(plan.end) || criterion() !== plan.criterion || JSON.stringify(roadPreferences()) !== JSON.stringify(plan.preferences) || JSON.stringify(tripStops) !== JSON.stringify(plan.stops));
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

let arrivalTimer = 0;
function complete(updateGuidance = true) {
  if (updateGuidance) tripRevision++;
  playing = false;
  updateLaunch();
  if (!result) {
    $('playback').hidden = true;
    notice(roadPreferences().avoidMotorways || roadPreferences().avoidTolls ? 'Aucun itinéraire trouvé avec les évitements choisis. Modifiez les points ou désactivez une option.' : 'Aucun itinéraire automobile dans le réseau chargé. Les accès, sens uniques ou coupures peuvent empêcher le trajet. Essayez d’autres points.', 'error');
    return;
  }
  if (!guidance?.active) renderer.finish(result);
  if (updateGuidance) {
    try { guidance?.setRoute(navigationRoute(routeGeometry, result)); }
    catch { guidance?.setRoute(null); }
  }
  if (selections.start && selections.end) confirmedPlan = { start: { ...selections.start }, end: { ...selections.end }, stops: tripStops.map(place => ({ ...place })), criterion: criterion(), preferences: roadPreferences() };
  const minutes = Math.ceil(result.seconds / 60);
  clearInterval(arrivalTimer);
  const seconds = result.seconds;
  const updateArrival = () => {
    const clock = arrivalClock(Date.now(), seconds);
    const value = clock ? `Arrivée vers ${clock} si départ maintenant` : '';
    if ($('result-arrival').textContent !== value) $('result-arrival').textContent = value;
  };
  updateArrival();
  arrivalTimer = window.setInterval(updateArrival, 60_000);
  $('result-title').textContent = selections.end?.name ?? 'Votre trajet';
  $('navigation-next-stop').textContent = tripStops[0] ? `${tripStops[0].name} · prochaine étape` : 'Vers votre destination';
  $('duration').textContent = minutes < 1 ? '< 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
  $('distance').textContent = (mobileApp || result.length >= 1000) ? `${(result.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: result.length >= 1_000_000 ? 0 : result.length >= 100_000 ? 1 : 2 })} km` : `${Math.round(result.length)} m`;
  $('result-criterion').textContent = criterion() === 'time' ? 'Le plus rapide' : 'Le plus court';
  $('result-preferences').textContent = [roadPreferences().avoidMotorways ? 'Sans autoroute' : '', roadPreferences().avoidTolls ? 'Sans péage' : ''].filter(Boolean).join(' · ');
  $('result-preferences').hidden = !$('result-preferences').textContent;
  $('result-explanation').textContent = criterion() === 'time' ? 'Ce trajet minimise le temps estimé selon les vitesses des routes, sans trafic en direct.' : 'Ce trajet minimise la distance sur les routes accessibles. La durée est estimée sans trafic en direct.';
  $('replay').hidden = queue.length === 0;
  $('route-endpoints').replaceChildren(...[{ place: selections.start!, side: 'start' }, ...tripStops.map(place => ({ place, side: 'via' })), { place: selections.end!, side: 'end' }].map(({place, side}) => {
    const line = document.createElement('p'), badge = document.createElement('span');
    badge.className = `endpoint-badge ${side}`; badge.textContent = side === 'start' ? 'A' : side === 'via' ? '•' : 'B';
    line.append(badge, document.createTextNode(place.name)); return line;
  }));
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

async function fetchLeg(start: Place, end: Place, preference: Criterion, signal: AbortSignal, setId: (id: string) => void, preferences = roadPreferences()) {
  const geometry: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>(), events: ExplorationEvent[] = [];
  let found: SearchResult | null | undefined, stride = 1, snapped: { lat: number; lon: number; distance: number }[] | undefined;
  const id = crypto.randomUUID(); setId(id);
  for await (const message of nationalRoute(start, end, preference, id, signal, preferences)) {
    if ('snapped' in message) {
      if (!Array.isArray(message.snapped) || message.snapped.length !== 2 || !message.snapped.every(isInFrance) || !Number.isInteger(message.traceStride) || message.traceStride < 1) throw new Error('Métadonnées routières invalides.');
      snapped = message.snapped; stride = message.traceStride; continue;
    }
    const decoded = decodeNationalMessage(message, geometry, index);
    if (decoded.events) events.push(...decoded.events);
    if ('result' in decoded) found = decoded.result;
  }
  if (!found || !snapped) throw new Error('Aucun itinéraire trouvé pour une portion du trajet.');
  return { geometry, events, result: found, stride, snapped };
}

async function fetchJourney(start: Place, stops: Place[], end: Place, preference: Criterion, signal: AbortSignal, setId: (id: string) => void, preferences = roadPreferences()) {
  if (stops.length > 8) throw new Error('Huit étapes maximum.');
  let combined: RouteLeg | undefined, from = start, stride = 1;
  for (const to of [...stops, end]) {
    if (signal.aborted) throw new DOMException('Calcul annulé.', 'AbortError');
    const leg = await fetchLeg(from, to, preference, signal, setId, preferences);
    if (leg.result.length < 1) throw new Error('Deux étapes se raccordent au même point routier. Retirez ou déplacez l’un des arrêts.');
    combined = combined ? combineLegs(combined, leg) : leg; from = to; stride = Math.max(stride, leg.stride);
  }
  const route = combined && navigationRoute(combined.geometry, combined.result);
  if (!combined || !route || !isNavigationRoute(route)) throw new Error('Le trajet ne permet pas le guidage.');
  return { ...combined, stride };
}

function routingFor(route: NavigationRoute, stops: Place[], end: Place, chosen: Criterion, preferences: RoadPreferences): NativeRoutingConfig {
  const api = new URL(routingApi, location.href);
  if (!['http:', 'https:'].includes(api.protocol)) throw new Error('Service routier invalide.');
  const ats = route.waypointAts ?? (route.waypointAt !== undefined ? [route.waypointAt] : []);
  if (ats.length < stops.length) throw new Error('Les étapes du trajet sont incomplètes. Recalculez le trajet.');
  const remaining = stops.length ? ats.slice(-stops.length) : [];
  const vias = stops.map((place, i) => ({ lat: place.lat, lon: place.lon, at: remaining[i] }));
  return { api: api.href.replace(/\/$/, ''), end: { lat: end.lat, lon: end.lon }, criterion: chosen, ...preferences, ...(vias.length ? { via: vias[0], vias } : {}) };
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
    const combined = await fetchJourney(start, vias, end, preference, controller.signal, id => { routeId = id; });
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
    stop(); notice(error instanceof TypeError ? 'Connexion au service France impossible. Vérifiez Internet puis réessayez.' : error instanceof DOMException && error.name === 'TimeoutError' ? 'Le service France a mis trop de temps à répondre. Réessayez.' : error instanceof Error ? error.message : 'Connexion au service France impossible.', 'error');
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
      const combined = await fetchJourney(selections.start, tripStops, selections.end, other, controller.signal, value => { comparisonId = value; });
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
