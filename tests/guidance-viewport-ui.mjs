import assert from 'node:assert/strict';
import { browser, setup, choose, calculate } from './ui-fixture.mjs';

try {
  const { page, context, errors } = await setup({ native: true });
  await page.locator('#gps-fixture').evaluate(element => { element.style.display = 'none'; });
  await choose(page, 'end', 'Panthéon');
  await calculate(page);
  await page.locator('#navigation-start').click();
  await page.locator('.vehicle-marker').waitFor();
  const visible = () => page.waitForFunction(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const marker = rect('.vehicle-marker'), instruction = rect('#navigation-next'), bottom = rect('.navigation-bottom');
    const landscape = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    return marker.left >= 0 && marker.right <= innerWidth && marker.top >= 0 && marker.bottom <= innerHeight &&
      (landscape ? marker.left > instruction.right && marker.right < bottom.left : marker.top > instruction.bottom && marker.bottom < bottom.top);
  }, null, { timeout: 3000 });
  await visible();
  for (const [width, height] of [[390, 844], [320, 568], [430, 932], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const command of ['GPS arrêté', 'GPS 50 km/h vers est']) {
        await page.getByRole('button', { name: command, exact: true, includeHidden: true }).dispatchEvent('click');
        await page.locator('#navigation-follow').click();
        await visible();
      }
    }
    await page.screenshot({ path: `/tmp/eclaire-guidance-${width}x${height}.png` });
    console.log(`OK point GPS visible au démarrage et au recentrage : ${width}×${height}, clair/sombre, nord/est`);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally { await browser.close(); }
