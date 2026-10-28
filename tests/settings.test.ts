import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, readRoadPreferences } from '../src/settings';
import { canGuide, screenUpdates } from '../src/device';

test('le guidage exige une application native et un téléphone', () => {
  assert.equal(canGuide('web', true), false);
  assert.equal(canGuide('android', true), true);
  assert.equal(canGuide('ios', true), true);
  assert.equal(canGuide('android', false), false);
});

test('les demandes de veille restent ordonnées malgré les réponses tardives ou une erreur', async () => {
  const calls: boolean[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const update = screenUpdates(async enabled => { calls.push(enabled); if (calls.length === 1) await gate; if (calls.length === 2) throw new Error('interrupted'); });
  const first = update(true), second = update(false), third = update(true);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, [true]);
  release(); await first; await assert.rejects(second); await third;
  assert.deepEqual(calls, [true, false, true]);
});

test('les paramètres valides sont restaurés et les valeurs inconnues sont ignorées', () => {
  const data = new Map([['eclaire.theme', 'dark'], ['eclaire.criterion', 'distance']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null };
  assert.deepEqual(readSettings(storage), { theme: 'dark', criterion: 'distance' });
  data.set('eclaire.theme', 'invalid'); data.set('eclaire.criterion', 'invalid');
  assert.deepEqual(readSettings(storage), { theme: 'auto', criterion: 'time' });
  assert.deepEqual(readSettings({ getItem() { throw new Error('storage'); } }), { theme: 'auto', criterion: 'time' });
});

test('les évitements sont indépendants et désactivés par défaut, même si le stockage est indisponible', () => {
  const data = new Map([['eclaire.avoidMotorways', 'true'], ['eclaire.avoidTolls', 'false']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null };
  assert.deepEqual(readRoadPreferences(storage), { avoidMotorways: true, avoidTolls: false });
  data.set('eclaire.avoidTolls', 'true'); data.set('eclaire.avoidMotorways', 'yes');
  assert.deepEqual(readRoadPreferences(storage), { avoidMotorways: false, avoidTolls: true });
  assert.deepEqual(readRoadPreferences({ getItem() { throw new Error('storage'); } }), { avoidMotorways: false, avoidTolls: false });
});
