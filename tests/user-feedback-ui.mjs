// Recette locale : Vite lancé, Playwright installé ou disponible via NODE_PATH.
// Le GPS et le service national sont simulés ; les tests routing.test.ts couvrent le moteur.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const { version } = createRequire(import.meta.url)('../package.json');
const base = process.env.ECLAIRE_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const passed = [];
const check = name => { passed.push(name); console.log(`OK ${name}`); };
const health = { status: 'ready', edges: 1, nodes: 2, bounds: [41.3, -5.3, 51.2, 9.7], roadPreferences: true };
async function setup({ native = false, gps = 'normal', width = 390, height = 844 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, geolocation: { latitude: 45.7578, longitude: 4.832, accuracy: 8 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  const requests = [], errors = [];
  let lastResponse;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('https://data.geopf.fr/**', route => route.fulfill({ json: { features: [] } }));
  await page.route('**/api/health', route => route.fulfill({ json: health }));
  await page.route('**/api/route', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const geometry = [[body.start.lat, body.start.lon], [body.end.lat, body.end.lon]];
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
  await page.goto(`${base}/${native ? 'tests/gps-ui.html' : ''}`);
  await page.locator('#start').waitFor({ state: 'attached' });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  if (gps === 'normal') await page.waitForFunction(() => document.getElementById('start').value === 'Ma position GPS');
  return { page, context, requests, errors, response: () => lastResponse };
}
async function choose(page, side, query) {
  await page.locator(`#${side}`).fill(query);
  await page.locator(`#${side}-results [role=option]`).first().click();
}
async function calculate(page) {
  await page.locator('#launch').click();
  await page.locator('#route-panel-toggle').waitFor({ state: 'visible' });
}
try {
  const web = await setup();
  assert.equal(await web.page.locator('#end').inputValue(), '');
  await web.page.locator('#settings-open').click();
  assert.equal(await web.page.locator('#settings-version').textContent(), version);
  assert.equal(await web.page.locator('#updates-last-check').textContent(), 'Jamais');
  await web.page.locator('#settings-avoid-motorways').check();
  assert.equal(await web.page.locator('#avoid-motorways').isChecked(), true);
  await web.page.locator('#updates-check').click();
  await web.page.waitForFunction(() => document.getElementById('updates-status').textContent === 'Cette version est à jour.');
  assert.notEqual(await web.page.locator('#updates-last-check').textContent(), 'Jamais');
  await web.page.screenshot({ path: '/tmp/eclaire-alpha6-settings.png' });
  await web.page.route('**/version.json', route => route.fulfill({ json: { version: '99.0.0-alpha.1' } }));
  await web.page.locator('#updates-check').click();
  await web.page.locator('#updates-reload').waitFor({ state: 'visible' });
  await web.page.route('**/version.json', route => route.fulfill({ status: 503, body: 'offline' }));
  await web.page.locator('#updates-check').click();
  await web.page.waitForFunction(() => document.getElementById('updates-status').textContent.includes('Recherche impossible'));
  assert.equal(await web.page.locator('#updates-reload').isVisible(), false);
  assert.equal(await web.page.locator('#updates-check').isEnabled(), true);
  await web.page.locator('#settings-close').click();
  check('Paramètres Web : version, évitements synchronisés, date, version disponible et erreur réseau explicite');
  await web.page.locator('#road-preferences').waitFor({ state: 'visible' });
  await web.page.locator('#avoid-motorways').check(); await web.page.locator('#avoid-tolls').check();
  await choose(web.page, 'end', 'Panthéon');
  const began = Date.now(); await calculate(web.page);
  assert.ok(Date.now() - began < 4500, 'La lecture de la trace ne doit plus durer dix secondes');
  assert.equal(web.requests[0].start.lat, 45.7578);
  assert.equal(web.requests[0].avoidMotorways, true); assert.equal(web.requests[0].avoidTolls, true);
  check('Web : GPS à l’ouverture, arrivée vide, évitements transmis, animation accélérée');
  const expanded = await web.page.locator('.planner').boundingBox();
  await web.page.locator('#route-panel-toggle').click();
  assert.equal(await web.page.locator('#route-panel-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await web.page.locator('#planner-content').isVisible(), false);
  const collapsed = await web.page.locator('.planner').boundingBox();
  assert.ok(collapsed.height < 100 && collapsed.height < expanded.height / 2);
  await web.page.locator('#zoom-in').click();
  await web.page.mouse.move(160, 260); await web.page.mouse.down(); await web.page.mouse.move(240, 320, { steps: 5 }); await web.page.mouse.up();
  await web.page.waitForTimeout(800);
  await web.page.screenshot({ path: '/tmp/eclaire-feedback-collapsed.png' });
  await web.page.locator('#route-panel-toggle').click();
  assert.equal(await web.page.locator('#route-result').isVisible(), true);
  await web.page.reload(); await web.page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await web.page.locator('#avoid-tolls').isChecked(), true);
  await web.page.locator('#settings-open').click();
  assert.equal(await web.page.locator('#settings-avoid-tolls').isChecked(), true);
  assert.notEqual(await web.page.locator('#updates-last-check').textContent(), 'Jamais');
  await web.page.locator('#settings-close').click();
  check('Panneau réductible, carte manipulable, restauration et préférences mémorisées');
  assert.deepEqual(web.errors, []); await web.context.close();

  const denied = await setup({ gps: 'denied' });
  await denied.page.waitForFunction(() => document.getElementById('notice').textContent.includes('refusée'));
  assert.equal(await denied.page.locator('#start').inputValue(), ''); assert.equal(await denied.page.locator('#end').inputValue(), '');
  await choose(denied.page, 'start', 'Musée du Louvre'); await choose(denied.page, 'end', 'Panthéon');
  await calculate(denied.page); assert.deepEqual(denied.errors, []); await denied.context.close();
  check('GPS refusé : pas de points par défaut, choix manuel toujours possible');

  const delayed = await setup({ gps: 'delayed' });
  await delayed.page.waitForFunction(() => typeof window.deliverPosition === 'function');
  await choose(delayed.page, 'start', 'Musée du Louvre');
  await delayed.page.evaluate(() => window.deliverPosition());
  assert.equal(await delayed.page.locator('#start').inputValue(), 'Musée du Louvre');
  assert.deepEqual(delayed.errors, []); await delayed.context.close();
  check('GPS tardif : ne remplace pas un départ choisi entre-temps');

  const native = await setup({ native: true });
  const { page } = native;
  await page.locator('#gps-fixture').evaluate(el => { el.style.display = 'none'; });
  await page.locator('#settings-open').click();
  await page.locator('#updates-check').click();
  await page.waitForFunction(() => document.getElementById('updates-status').textContent === 'Cette version est à jour.');
  assert.notEqual(await page.locator('#updates-last-check').textContent(), 'Jamais');
  const handled = await page.evaluate(() => !window.dispatchEvent(new Event('eclaire-back', { cancelable: true })));
  assert.equal(handled, true); assert.equal(await page.locator('#settings-page').isVisible(), false);
  assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('eclaire-back', { cancelable: true }))), true);
  await choose(page, 'start', 'Musée du Louvre'); await choose(page, 'end', 'Panthéon'); await calculate(page);
  await page.getByRole('button', { name: 'GPS Lyon', exact: true, includeHidden: true }).dispatchEvent('click');
  await page.locator('#navigation-start').click();
  await page.waitForFunction(() => document.getElementById('gps-watch-count').textContent.startsWith('1 suivi'));
  assert.equal(native.requests.length, 2); assert.equal(native.requests[1].start.lat, 45.7578);
  await page.locator('#navigation-stop').click();
  await page.waitForFunction(() => document.getElementById('gps-watch-count').textContent.startsWith('0 suivi'));
  check('Mobile simulé : retour paramètres consommé, départ éloigné recalculé avant un unique suivi GPS');

  await page.getByRole('button', { name: 'Différer la position', exact: true, includeHidden: true }).dispatchEvent('click');
  await page.locator('#navigation-start').click(); await page.locator('#navigation-stop').click();
  await page.getByRole('button', { name: 'Livrer la position', exact: true, includeHidden: true }).dispatchEvent('click');
  assert.equal(await page.locator('#navigation').isVisible(), false);
  assert.match(await page.locator('#gps-watch-count').textContent(), /^0 suivi/);
  assert.equal(native.requests.length, 2); assert.deepEqual(native.errors, []);
  check('Annulation pendant le GPS de départ : aucun démarrage ni recalcul tardif');
  await page.getByRole('button', { name: 'Avant virage', exact: true, includeHidden: true }).dispatchEvent('click');
  let recalculations = 0;
  await page.route('**/api/route', route => {
    recalculations++;
    return route.fulfill({ contentType: 'application/x-ndjson', body: native.response() });
  });
  await page.locator('#navigation-start').click();
  await page.waitForFunction(() => document.getElementById('navigation-status').textContent.includes('reste éloignée'));
  assert.equal(recalculations, 1); assert.match(await page.locator('#gps-watch-count').textContent(), /^0 suivi/);
  assert.deepEqual(native.errors, []);
  check('Raccordement toujours éloigné après recalcul : guidage en pause, aucune boucle de calcul');
  await native.context.close();
  const desktop = await setup({ width: 1440, height: 900 });
  await choose(desktop.page, 'end', 'Panthéon'); await calculate(desktop.page);
  await desktop.page.locator('#route-panel-toggle').click();
  assert.ok((await desktop.page.locator('.planner').boundingBox()).height < 100);
  assert.equal(await desktop.page.locator('#zoom-in').isVisible(), true);
  assert.deepEqual(desktop.errors, []); await desktop.context.close();
  check('Ordinateur : panneau réductible et commandes de carte accessibles');
  console.log(`${passed.length} scénarios de recette validés.`);
} finally { await browser.close(); }
