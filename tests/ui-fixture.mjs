// Recette locale : Vite lancé, Playwright installé ou disponible via NODE_PATH.
// Le GPS et le service national sont simulés ; les tests routing.test.ts couvrent le moteur.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.ECLAIRE_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const health = { status: 'ready', edges: 1, nodes: 2, bounds: [41.3, -5.3, 51.2, 9.7], roadPreferences: true };
async function setup({ native = false, gps = 'normal', width = 390, height = 844, tiles = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, geolocation: { latitude: 45.7578, longitude: 4.832, accuracy: 8 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  const requests = [], errors = [], parisRequests = [];
  page.on('request', request => { if (request.url().includes('/data/paris.json')) parisRequests.push(request.url()); });
  let lastResponse;
  page.on('pageerror', e => errors.push(e.message));
  if (!tiles) await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('https://data.geopf.fr/**', route => route.fulfill({ json: { features: [] } }));
  await page.route('https://photon.komoot.io/**', route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: { features: q === 'Panthéon' ? [{ geometry: { coordinates: [2.3464, 48.8462] }, properties: { name: 'Panthéon', city: 'Paris' } }] : [] } });
  });
  await page.route('https://recherche-entreprises.api.gouv.fr/**', route => route.fulfill({ json: { results: [{ nom_complet: 'LECLUSE', matching_etablissements: [{ liste_enseignes: ['LECLUSE AUTOMOBILES VOLKSWAGEN LE MANS'], adresse: '20 BOULEVARD RENE CASSIN 72000 LE MANS', latitude: '47.979982079', longitude: '0.198400238', etat_administratif: 'A' }] }] } }));
  await page.route('**/api/health', route => route.fulfill({ json: health }));
  await page.route('**/api/route/*', route => route.fulfill({ json: { cancelled: true } }));
  await page.route('**/api/route', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const geometry = body.criterion === 'distance' ? [[body.start.lat, body.start.lon], [(body.start.lat + body.end.lat) / 2 + 0.001, (body.start.lon + body.end.lon) / 2], [body.end.lat, body.end.lon]] : [[body.start.lat, body.start.lon], [body.end.lat, body.end.lon]];
    const length = Math.max(10, Math.hypot((body.start.lat - body.end.lat) * 111195, (body.start.lon - body.end.lon) * 74000));
    const messages = [
      { type: 'metadata', snapped: [body.start, body.end], traceStride: 1 },
      { type: 'batch', edges: [{ key: 0, geometry, length, seconds: length / 10, name: 'Recette' }], events: Array.from({ length: 500 }, (_, i) => ({ key: 0, side: i % 2 })) },
      { type: 'result', result: { found: true, path: [0], meeting: 0, length, seconds: length / 10, cost: length / 10, visited: 500, computeMs: 1, instructions: [{ at: 0, sign: 0, text: 'Continuez', name: 'Recette' }, { at: length, sign: 4, text: 'Arrivée', name: '' }] } },
    ];
    lastResponse = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
    return route.fulfill({ contentType: 'application/x-ndjson', body: lastResponse });
  });
  if (gps !== 'normal') await context.addInitScript(mode => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, error) {
        window.deliverPosition = () => success({ timestamp: Date.now(), coords: { latitude: 45.7578, longitude: 4.832, accuracy: 8 } });
        if (mode === 'denied') queueMicrotask(() => error({ code: 1 }));
      },
    } });
  }, gps);
  await page.goto(`${base}/${native ? `tests/gps-ui.html?gps=${gps}` : ''}`);
  await page.locator('#start').waitFor({ state: 'attached' });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  if (gps === 'normal') await page.waitForFunction(() => document.getElementById('start').value === 'Ma position GPS');
  assert.deepEqual(parisRequests, [], 'Le démarrage ne doit pas charger le réseau Paris');
  return { page, context, requests, errors, response: () => lastResponse };
}
async function choose(page, side, query) {
  while (await page.locator('#place-picker').isVisible()) await page.locator('#place-back').click();
  if (side === 'via') {
    await page.locator('#prepare-stops').click();
    await page.locator('#trip-add').click();
  } else {
    if (!await page.locator('#destination-open').isVisible()) await page.locator('#route-editor > summary').click();
    await page.locator(side === 'start' ? '#start-open' : '#destination-open').click();
  }
  await page.locator('#place-query').fill(query);
  await page.locator('#place-results button').first().click();
  await page.locator('#place-confirm').click();
  await page.locator('#place-picker').waitFor({ state: 'hidden' });
}
async function addStop(page, query) {
  await page.locator('#trip-add').click();
  await page.locator('#place-query').fill(query);
  await page.locator('#place-results button').first().click();
  await page.locator('#place-confirm').click();
  await page.locator('#place-picker').waitFor({ state: 'hidden' });
}
async function calculate(page) {
  if (await page.locator('#trip-workspace').isVisible()) {
    await page.locator('#trip-apply').click(); await page.locator('#trip-workspace').waitFor({ state: 'hidden' });
  } else await page.locator('#launch').click();
  await page.locator('#route-result').waitFor({ state: 'visible' });
}


export { browser, setup, choose, addStop, calculate };
