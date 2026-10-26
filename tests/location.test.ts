import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPhone, locationError, preciseLocationPermission, selectionPosition } from '../src/location';

test('le guidage est réservé aux téléphones Android et iPhone, sans dépendre de la largeur', () => {
  assert.ok(isPhone('Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120.0 Mobile Safari/537.36'));
  assert.ok(isPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1'));
  for (const ua of ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', 'Mozilla/5.0 (iPad; CPU OS 17_0) Mobile', 'Mozilla/5.0 (Linux; Android 14; Tablet) Safari/537.36', 'Mozilla/5.0 (X11; Linux x86_64)']) {
    assert.equal(isPhone(ua), false); assert.equal(isPhone(ua, true), false);
  }
  assert.equal(isPhone('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile', false), false);
});

test('une permission approximative ou refusée ne se présente pas comme un GPS précis', async () => {
  let requested = 0;
  const api = {
    async checkPermissions() { return { location: 'prompt', coarseLocation: 'granted' }; },
    async requestPermissions() { requested++; return { location: 'denied', coarseLocation: 'granted' }; },
  };
  await assert.rejects(preciseLocationPermission(api), error => { assert.match(locationError(error), /Position précise/); return true; });
  assert.equal(requested, 1);
  api.checkPermissions = async () => ({ location: 'granted', coarseLocation: 'granted' });
  await preciseLocationPermission(api); assert.equal(requested, 1);
  assert.match(locationError({ code: 'OS-PLUG-GLOC-0007' }), /Activez la localisation/);
  assert.match(locationError({ code: 'OS-PLUG-GLOC-0010' }), /temps/);
  assert.match(locationError({ code: 1 }), /refusée/);
});

test('le départ GPS conserve les vraies coordonnées et rejette les points anciens ou imprécis', () => {
  const position = { timestamp: 100_000, coords: { latitude: 45.7578, longitude: 4.832, accuracy: 8 } };
  assert.deepEqual(selectionPosition(position, 100_000), { lat: 45.7578, lon: 4.832, accuracy: 8 });
  assert.throws(() => selectionPosition({ ...position, coords: { ...position.coords, accuracy: 2000 } }, 100_000), error => { assert.match(locationError(error), /approximative/); return true; });
  assert.throws(() => selectionPosition({ ...position, timestamp: 50_000 }, 100_000), error => { assert.match(locationError(error), /ancienne/); return true; });
  assert.throws(() => selectionPosition({ ...position, coords: { ...position.coords, latitude: NaN } }, 100_000));
});
