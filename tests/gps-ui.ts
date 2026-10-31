// Harnais Vite de recette uniquement : exclu du build livré. Le calcul routier reste réel.
import { GuidanceProgress, type NavigationRoute } from '../src/navigation';
import type { NativeGuidanceState } from '../src/native-guidance';
import { metres } from '../src/graph';

const nativeListeners = new Map<string, (state: NativeGuidanceState) => void>();
let nativeProgress: GuidanceProgress | undefined;
let nativeState: NativeGuidanceState = { active: false, status: 'stopped' };
let updateCheckedAt = 0;
let pipAutomatic = true;
let simulateNativeRerouting = false;
Object.assign(window, {
  testNativeStarts: [] as unknown[],
  testNativeStops: 0,
  testPublishGuidance: (state: NativeGuidanceState) => { if (state.fix) gps = { latitude: state.fix.lat, longitude: state.fix.lon, accuracy: state.fix.accuracy }; nativeState = state; for (const callback of nativeListeners.values()) callback(state); },
  CapacitorCustomPlatform: { name: 'android' },
  Capacitor: {
    PluginHeaders: [
      { name: 'EclaireDevice', methods: ['setKeepScreenOn', 'getVersion', 'getUpdateStatus', 'checkForUpdates', 'getPipSettings', 'setPipAutomatic', 'enterPip'].map(name => ({ name, rtype: 'promise' })) },
      { name: 'EclaireNavigation', methods: ['start', 'stop', 'getState', 'setVoice', 'removeListener'].map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }]) },
    ],
    nativePromise: async (_plugin: string, method: string, options: { route?: NavigationRoute; callbackId?: string; enabled?: boolean; routing?: unknown }) => {
      if (method === 'getVersion') return { version: 'simulation' };
      if (method === 'getPipSettings') return { supported: true, automatic: pipAutomatic };
      if (method === 'setPipAutomatic') { pipAutomatic = Boolean(options.enabled); return {}; }
      if (method === 'getUpdateStatus') return { lastCheckedAt: updateCheckedAt, checking: false };
      if (method === 'checkForUpdates') { updateCheckedAt = Date.now(); return { status: 'current', lastCheckedAt: updateCheckedAt, checking: false }; }
      if (method === 'getState') return nativeState;
      if (method === 'start') { const test = window as unknown as { testNativeStarts: unknown[] }; test.testNativeStarts.push(options); Object.assign(window, { testNativeRouting: options.routing }); nativeProgress = new GuidanceProgress(options.route!); nativeState = { active: true, status: 'starting' }; queueMicrotask(emit); }
      if (method === 'stop') { const test = window as unknown as { testNativeStops: number }; test.testNativeStops++; nativeProgress = undefined; nativeState = { active: false, status: 'stopped' }; }
      if (method === 'removeListener') nativeListeners.delete(options.callbackId!);
      updateCount(); return {};
    },
    nativeCallback: (_plugin: string, method: string, options: { callbackId?: string }, callback: (state: NativeGuidanceState) => void) => {
      if (method === 'removeListener') { nativeListeners.delete(options.callbackId!); return; }
      const id = String(++identifier); nativeListeners.set(id, callback); return id;
    },
  },
});
Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 14; Test Phone) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' });
Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { mobile: true } });
Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
const watches = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
let identifier = 0;
let gps = { latitude: 48.8573375, longitude: 2.3467217, accuracy: 5 };
let speed = 0, heading: number | null = null;
let denied = false;
let serviceMode = 'réel';
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input).endsWith('/api/route') && init?.method === 'POST') {
    if (serviceMode === 'occupé') return new Response(JSON.stringify({ error: 'Le service est sollicité. Attendez 30 secondes puis réessayez.' }), { status: 429 });
    if (serviceMode === 'hors ligne') throw new TypeError('Réseau indisponible simulé');
    if (serviceMode === 'sans trajet') return new Response('{"type":"result","result":{"found":false}}\n');
  }
  return realFetch(input, init);
};
let delayPosition = false;
const pendingPositions: (() => void)[] = [];
const position = () => ({ timestamp: Date.now(), coords: { ...gps, altitude: null, altitudeAccuracy: null, speed, heading } }) as GeolocationPosition;
const permissionError = { code: 1, message: 'Refus simulé', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
function emit() {
  for (const callback of watches.values()) denied ? callback.error?.(permissionError) : callback.success(position());
  if (!nativeProgress || !nativeState.active) return;
  const p = position(), fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp, speed: p.coords.speed, heading: p.coords.heading };
  const state = nativeProgress.update(fix);
  nativeState = { active: !denied && state.status !== 'arrived', status: denied ? 'denied' : simulateNativeRerouting && state.status === 'off-route' ? 'rerouting' : state.status, fix, match: state.status === 'on-route' || state.status === 'arrived' ? nativeProgress.match : undefined, nativeRerouting: simulateNativeRerouting, routeVersion: 1, message: simulateNativeRerouting && state.status === 'off-route' ? 'Recalcul du trajet en cours…' : undefined };
  for (const callback of nativeListeners.values()) callback(nativeState);
  updateCount();
}
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback) {
    const reply = () => denied ? error?.(permissionError) : success(position());
    if (delayPosition) pendingPositions.push(reply); else queueMicrotask(reply);
  },
  watchPosition(success: PositionCallback, error?: PositionErrorCallback) {
    const id = ++identifier; watches.set(id, { success, error }); updateCount();
    queueMicrotask(emit); return id;
  },
  clearWatch(id: number) { watches.delete(id); updateCount(); },
} });
const panel = document.createElement('aside'); panel.id = 'gps-fixture';
panel.style.cssText = 'position:fixed;top:0;right:0;z-index:9999;max-width:100%;background:#fff2b8;color:#172320;padding:5px;display:flex;flex-wrap:wrap;gap:4px;font:11px sans-serif;';
const label = document.createElement('strong'); label.textContent = 'RECETTE · TÉLÉPHONE, GPS ET ERREURS SIMULÉS · '; panel.append(label);
const count = document.createElement('span'); count.id = 'gps-watch-count'; panel.append(count);
const controls = document.createElement('details');
const controlsTitle = document.createElement('summary'); controlsTitle.textContent = 'Commandes de recette'; controls.append(controlsTitle); panel.append(controls);
function updateCount() { count.textContent = `${watches.size + Number(nativeState.active)} suivi(s) GPS · service ${serviceMode}`; }
function button(label: string, action: () => void) {
  const control = document.createElement('button'); control.textContent = label;
  control.style.cssText = 'font:11px sans-serif;color:#172320;background:#fff;border:1px solid #899084;border-radius:3px;padding:5px;';
  control.onclick = action; controls.append(control);
}
button('Avant virage', () => { gps = { latitude: 48.8573375, longitude: 2.3467217, accuracy: 5 }; denied = false; emit(); });
button('GPS 50 km/h vers est', () => { speed = 50 / 3.6; heading = 90; emit(); });
button('GPS arrêté', () => { speed = 0; heading = null; emit(); });
button('Au virage', () => { gps = { latitude: 48.8567689, longitude: 2.3487701, accuracy: 5 }; emit(); });
button('Après virage', () => { gps = { latitude: 48.8557133, longitude: 2.3483752, accuracy: 5 }; emit(); });
button('GPS imprécis', () => { gps.accuracy = 150; emit(); });
button('GPS proche du trajet', () => { gps = { latitude: 48.8592, longitude: 2.3467217, accuracy: 5 }; denied = false; emit(); });
button('GPS Lyon', () => { gps = { latitude: 45.7578, longitude: 4.832, accuracy: 8 }; denied = false; });
button('GPS approximatif', () => { gps.accuracy = 2000; });
button('Différer la position', () => { delayPosition = true; });
button('Livrer la position', () => { delayPosition = false; pendingPositions.splice(0).forEach(reply => reply()); });
button('Hors trajet', () => { gps = { latitude: 48.862, longitude: 2.349, accuracy: 5 }; emit(); });
button('Activer recalcul natif simulé', () => { simulateNativeRerouting = true; });
button('Échec recalcul natif simulé', () => {
  nativeState = { ...nativeState, status: 'reroute-failed', message: 'Recalcul indisponible. Nouvelle tentative automatique.' };
  for (const callback of nativeListeners.values()) callback(nativeState);
});
button('Nouveau trajet natif simulé', () => {
  if (!nativeProgress) return;
  const end = nativeProgress.route.points.at(-1)!;
  const start = { lat: gps.latitude, lon: gps.longitude };
  const length = metres(start, end), seconds = length / 10;
  const route: NavigationRoute = { points: [{ ...start, at: 0, seconds: 0 }, { lat: end.lat, lon: end.lon, at: length, seconds }], length, seconds,
    instructions: [{ at: 0, sign: 0, text: 'Continuez', name: 'Recette' }, { at: length, sign: 4, text: 'Arrivée', name: '' }] };
  nativeProgress = new GuidanceProgress(route);
  const fix = { ...start, accuracy: gps.accuracy, timestamp: Date.now(), speed, heading };
  nativeProgress.update(fix);
  nativeState = { active: true, status: 'on-route', fix, match: nativeProgress.match, nativeRerouting: true, routeVersion: 2, route };
  for (const callback of nativeListeners.values()) callback(nativeState);
});
button('Arrivée GPS', () => { gps = { latitude: 48.84607934422299, longitude: 2.347058525015233, accuracy: 5 }; emit(); });
button('Refuser GPS', () => { denied = true; emit(); });
button('Autoriser GPS', () => { denied = false; });
button('Signal perdu', () => { for (const callback of watches.values()) callback.error?.({ ...permissionError, code: 2, message: 'Signal perdu simulé' }); });
for (const mode of ['réel', 'occupé', 'hors ligne', 'sans trajet']) button(`Service ${mode}`, () => { serviceMode = mode; updateCount(); });
button('Carte taille nulle', () => { document.getElementById('map')!.style.height = '0px'; window.dispatchEvent(new Event('resize')); });
button('Rétablir la carte', () => { document.getElementById('map')!.style.height = '100%'; window.dispatchEvent(new Event('resize')); });
button('Masquer l’application', () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'));
});
button('Arrêter depuis la notification', () => {
  nativeProgress = undefined; nativeState = { active: false, status: 'stopped' };
  for (const callback of nativeListeners.values()) callback(nativeState);
  updateCount();
});
document.body.append(panel); updateCount();
void import('../src/app');
