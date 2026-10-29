import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmationPhase, measureLine, motion, playbackRate, pointAlong, trailOpacity } from '../src/animation-timing';

test('la trace se lit en deux secondes au plus, et les recalculs GPS en 200 ms', () => {
  for (const events of [0, 100, 10_000, 1_000_000]) {
    assert.ok(events / playbackRate(events, false) <= 2);
    assert.ok(events / playbackRate(events, true) <= 0.2);
  }
  assert.ok(confirmationPhase(650, false).done);
});

test('la convergence précède l’onde et la révélation du parcours', () => {
  assert.equal(confirmationPhase(0, false).reveal, 0);
  assert.equal(confirmationPhase(motion.converge / 2, false).shock, 0);
  assert.equal(confirmationPhase(motion.converge, false).convergence, 1);
  assert.equal(confirmationPhase(motion.converge, false).reveal, 0);
  const end = confirmationPhase(10_000, false);
  assert.equal(end.reveal, 1); assert.equal(end.branches, 0); assert.ok(end.done);
  assert.equal(confirmationPhase(0, true).reveal, 1);
  assert.ok(confirmationPhase(motion.fade, true).done);
});

test('le front suit les coudes de la route, sans couper les virages', () => {
  const line = measureLine([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.equal(line.length, 20);
  assert.deepEqual(pointAlong(line, 0.25), { x: 5, y: 0 });
  assert.deepEqual(pointAlong(line, 0.75), { x: 10, y: 5 });
  assert.deepEqual(pointAlong(line, -1), { x: 0, y: 0 });
  assert.deepEqual(pointAlong(line, 2), { x: 10, y: 10 });
  assert.equal(pointAlong(measureLine([]), 0.5), undefined);
  assert.deepEqual(pointAlong(measureLine([{ x: 3, y: 4 }, { x: 3, y: 4 }]), 0.5), { x: 3, y: 4 });
});

test('les traînées s’éteignent progressivement sans animation perpétuelle', () => {
  assert.equal(trailOpacity(-1, motion.travel), 0);
  assert.equal(trailOpacity(0, motion.travel), 1);
  assert.ok(trailOpacity(motion.travel + 100, motion.travel) > trailOpacity(motion.travel + 500, motion.travel));
  assert.equal(trailOpacity(motion.travel + motion.trail, motion.travel), 0);
});
