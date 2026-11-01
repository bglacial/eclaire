// Vite lancé, Playwright disponible via NODE_PATH. Service routier et Android simulés.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.ECLAIRE_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://tile.openstreetmap.org/**', route => route.abort());
await page.route('**/api/health', route => route.fulfill({ json: { status: 'ready', edges: 1, nodes: 2, bounds: [41.3, -5.3, 51.2, 9.7], roadPreferences: true } }));
await page.route('**/api/route', route => {
  const body = route.request().postDataJSON(); requests.push(body);
  const geometry = [[body.start.lat, body.start.lon], [body.end.lat, body.end.lon]];
  const messages = [
    { type: 'metadata', snapped: [body.start, body.end], traceStride: 1 },
    { type: 'batch', edges: [{ key: 0, geometry, length: 2000, seconds: 200, name: 'Recette' }], events: Array.from({ length: 500 }, (_, i) => ({ key: 0, side: i % 2 })) },
    { type: 'result', result: { found: true, path: [0], meeting: 0, length: 2000, seconds: 200, cost: 200, visited: 500, computeMs: 1, instructions: [{ at: 0, sign: 0, text: 'Continuez', name: 'Recette' }, { at: 2000, sign: 4, text: 'Arrivée', name: '' }] } },
  ];
  return route.fulfill({ contentType: 'application/x-ndjson', body: messages.map(message => JSON.stringify(message)).join('\n') + '\n' });
});

async function choose(side, query) {
  await page.locator(`#${side}`).fill(query);
  await page.locator(`#${side}-results [role=option]`).first().click();
}
async function routeFits() {
  return page.evaluate(({ start, end }) => {
    const map = window.testMap, box = selector => document.querySelector(selector).getBoundingClientRect();
    const top = Math.max(box('.topbar').bottom, box('#playback').bottom) + 16, bottom = box('.planner').top - 20;
    return [start, end].every(point => {
      const p = map.latLngToContainerPoint([point.lat, point.lon]);
      return p.y >= top - 2 && p.y <= bottom + 2 && p.x >= 30 && p.x <= innerWidth - 70;
    });
  }, requests.at(-1));
}
async function traceFollowsMap() {
  return page.evaluate(({ start, end }) => {
    const map = window.testMap, canvas = document.querySelector('.exploration-canvas');
    const pane = canvas.parentElement.getBoundingClientRect(), rect = map.getContainer().getBoundingClientRect();
    const inverse = new DOMMatrix(getComputedStyle(canvas).transform).inverse();
    const dpr = canvas.width / parseFloat(canvas.style.width), ctx = canvas.getContext('2d');
    const a = map.project([start.lat, start.lon]), b = map.project([end.lat, end.lon]);
    return [0.25, 0.5, 0.75].every(fraction => {
      const expected = map.latLngToContainerPoint(map.unproject(a.add(b.subtract(a).multiplyBy(fraction))));
      const local = inverse.transformPoint({ x: expected.x + rect.left - pane.left, y: expected.y + rect.top - pane.top });
      const x = Math.round(local.x * dpr), y = Math.round(local.y * dpr), radius = Math.ceil(5 * dpr);
      if (x < radius || y < radius || x + radius >= canvas.width || y + radius >= canvas.height) return false;
      const pixels = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 160 && pixels[i + 1] < 145 && pixels[i + 2] < 100 && pixels[i + 3] > 100) return true;
      return false;
    });
  }, requests.at(-1));
}
try {
  await page.goto(`${base}/tests/gps-ui.html`);
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.locator('#gps-fixture').evaluate(element => { element.style.display = 'none'; });
  {
    await page.locator('#settings-open').click();
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('#settings-pip').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#settings-page').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `Paramètres Android sans débordement à ${width}px`);
      const label = await page.locator('#settings-pip label').boundingBox();
      assert.ok(label.width > 100, 'Le libellé de la case doit conserver une largeur lisible');
    }
    await page.locator('#settings-pip-automatic').uncheck();
    assert.equal(await page.locator('#settings-pip-automatic').isChecked(), false);
    await page.locator('#settings-close').click();
    console.log('OK paramètres Android : bloc fenêtre flottante lisible de 320 à 390px');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await choose('start', 'Musée du Louvre'); await choose('end', 'Panthéon');
  await page.locator('#launch').click();
  await page.locator('#route-result').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !window.testMap._panAnim?._inProgress);
  await page.waitForTimeout(700);
  assert.equal(await traceFollowsMap(), true, 'Tracé initial aligné sur les coordonnées routières');
  {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      await page.evaluate(() => window.testMap.panBy([700, 300], { animate: false }));
      const before = requests.length;
      await page.locator('#replay').click();
      assert.equal(await routeFits(), true, 'La relecture recadre immédiatement entre les panneaux');
      await page.locator('#route-result').waitFor({ state: 'visible' });
      assert.equal(requests.length, before, 'La relecture réutilise le calcul');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    console.log('OK relecture : recentrage au clic, sans requête, avec et sans mouvement réduit');
  }
  await page.locator('#route-editor > summary').click();
  await page.waitForFunction(() => !window.testMap._panAnim?._inProgress);
  await page.evaluate(() => window.testMap.panBy([700, 300], { animate: false }));
  const beforeRecalculate = requests.length;
  await page.locator('#launch').click();
  assert.equal(await routeFits(), true, 'Le recalcul recadre immédiatement entre les panneaux');
  await page.locator('#route-result').waitFor({ state: 'visible' });
  assert.equal(requests.length, beforeRecalculate + 1);
  console.log('OK recalcul : cadrage immédiat après déplacement manuel');
  await page.waitForFunction(() => !window.testMap._panAnim?._inProgress);
  await page.waitForTimeout(700);
  const session = await context.newCDPSession(page);
  const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const zoom = await page.evaluate(() => window.testMap.getZoom());
  await touch('touchStart', [[120, 200], [220, 200]]);
  for (let step = 1; step <= 6; step++) {
    await touch('touchMove', [[120 + step * 2, 200 + step * 3], [220 + step * 8, 200 + step * 3]]);
    await page.waitForTimeout(40);
  }
  assert.ok(await page.evaluate(zoom => window.testMap.getZoom() > zoom, zoom), 'Le geste à deux doigts doit réellement zoomer');
  assert.equal(await traceFollowsMap(), true, 'Le tracé suit la carte pendant le pincement, avant de lever les doigts');
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  assert.equal(await traceFollowsMap(), true, 'Le tracé reste aligné après le geste');
  await page.evaluate(() => window.testMap.panBy([20, 15], { animate: false }));
  await page.waitForTimeout(100);
  assert.equal(await traceFollowsMap(), true, 'Le tracé suit aussi le déplacement sans zoom');
  await page.evaluate(() => window.testMap.setBearing(35));
  assert.equal(await traceFollowsMap(), true, 'Le tracé suit aussi la rotation');
  console.log('OK tracé : aligné pendant/après un pincement à deux doigts et une rotation');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
