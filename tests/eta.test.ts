import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalClock } from '../src/eta';

test('heure d’arrivée locale arrondie à la minute supérieure', () => {
  const now = new Date(2026, 0, 2, 17, 45).getTime();
  const late = new Date(2026, 0, 2, 23, 59).getTime();
  assert.equal(arrivalClock(now, 59), '17 h 46');
  assert.equal(arrivalClock(late, 60), 'demain 0 h 00');
  assert.equal(arrivalClock(now, 0), '17 h 45');
  assert.equal(arrivalClock(now, 11 * 3600), 'demain 4 h 45');
  assert.equal(arrivalClock(now, NaN), '');
  assert.equal(arrivalClock(NaN, 0), '');
  assert.equal(arrivalClock(now, -1), '');
  assert.equal(arrivalClock(-1, 0), '');
});
