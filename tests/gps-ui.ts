// Harnais Vite de recette uniquement : exclu du build livré. Le calcul routier reste réel.
const watches = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
let identifier = 0;
let gps = { latitude: 48.8573375, longitude: 2.3467217, accuracy: 5 };
let denied = false;
const position = () => ({ timestamp: Date.now(), coords: { ...gps, altitude: null, altitudeAccuracy: null, speed: 0, heading: null } }) as GeolocationPosition;
const permissionError = { code: 1, message: 'Refus simulé', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
function emit() { for (const callback of watches.values()) denied ? callback.error?.(permissionError) : callback.success(position()); }
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback) { queueMicrotask(() => denied ? error?.(permissionError) : success(position())); },
  watchPosition(success: PositionCallback, error?: PositionErrorCallback) {
    const id = ++identifier; watches.set(id, { success, error }); updateCount();
    queueMicrotask(emit); return id;
  },
  clearWatch(id: number) { watches.delete(id); updateCount(); },
} });
const panel = document.createElement('aside'); panel.id = 'gps-fixture';
panel.style.cssText = 'position:fixed;top:0;right:0;z-index:9999;max-width:100%;background:#fff2b8;color:#172320;padding:5px;display:flex;flex-wrap:wrap;gap:4px;font:11px sans-serif;';
const label = document.createElement('strong'); label.textContent = 'RECETTE · GPS SIMULÉ · '; panel.append(label);
const count = document.createElement('span'); count.id = 'gps-watch-count'; panel.append(count);
function updateCount() { count.textContent = `${watches.size} suivi(s) GPS`; }
function button(label: string, action: () => void) {
  const control = document.createElement('button'); control.textContent = label;
  control.style.cssText = 'font:11px sans-serif;color:#172320;background:#fff;border:1px solid #899084;border-radius:3px;padding:5px;';
  control.onclick = action; panel.append(control);
}
button('Avant virage', () => { gps = { latitude: 48.8573375, longitude: 2.3467217, accuracy: 5 }; denied = false; emit(); });
button('Au virage', () => { gps = { latitude: 48.8567689, longitude: 2.3487701, accuracy: 5 }; emit(); });
button('Après virage', () => { gps = { latitude: 48.8557133, longitude: 2.3483752, accuracy: 5 }; emit(); });
button('GPS imprécis', () => { gps.accuracy = 150; emit(); });
button('Hors trajet', () => { gps = { latitude: 48.862, longitude: 2.349, accuracy: 5 }; emit(); });
button('Arrivée GPS', () => { gps = { latitude: 48.84607934422299, longitude: 2.347058525015233, accuracy: 5 }; emit(); });
button('Refuser GPS', () => { denied = true; emit(); });
button('Autoriser GPS', () => { denied = false; });
button('Signal perdu', () => { for (const callback of watches.values()) callback.error?.({ ...permissionError, code: 2, message: 'Signal perdu simulé' }); });
button('Masquer l’application', () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'));
});
document.body.append(panel); updateCount();
void import('../src/app');
