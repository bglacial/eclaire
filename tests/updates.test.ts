import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployedVersion, lastUpdateCheck, updateCheckDate } from '../src/updates';

test('la recherche web lit la version déployée sans utiliser le cache', async context => {
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/version.json'); assert.equal(options?.cache, 'no-store');
    return new Response(JSON.stringify({ version: '1.1.0-alpha.6' }));
  });
  assert.equal(await deployedVersion(), '1.1.0-alpha.6');
});

test('une erreur réseau ou un manifeste invalide ne signifie pas que l’application est à jour', async context => {
  const mock = context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(deployedVersion(), /indisponible/);
  for (const data of [null, {}, { version: 6 }, { version: 'inconnue' }, { version: '<script>' }]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify(data)));
    await assert.rejects(deployedVersion(), /invalide/);
  }
  mock.mock.mockImplementation(async () => { throw new TypeError('offline'); });
  await assert.rejects(deployedVersion(), /offline/);
});

test('la date accepte les anciennes préférences et reste lisible sans recherche', () => {
  assert.equal(updateCheckDate(0), 'Jamais');
  for (const value of [null, '', 'abc', -1, Infinity, 9e15]) assert.equal(lastUpdateCheck(value), 0);
  assert.equal(lastUpdateCheck('1793310349635'), 1793310349635);
  assert.notEqual(updateCheckDate(1793310349635), 'Jamais');
});
