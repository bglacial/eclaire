import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationRoute } from '../src/navigation';
import { combineLegs, type RouteLeg } from '../src/waypoint';

test('une étape conserve les deux parcours, leurs événements et les distances des manœuvres', () => {
  const leg = (from: number, to: number): RouteLeg => ({ geometry: { nodes: [{ id: 0, lat: from, lon: 2 }, { id: 1, lat: to, lon: 2 }], edges: [{ id: 0, from: 0, to: 1, way: 1, name: 'Rue', length: 100, seconds: 10, geometry: [[from, 2], [to, 2]] }] }, events: [{ edge: 0, side: 0 }], result: { path: [0], cost: 10, visited: 5, meeting: 0, length: 100, seconds: 10, instructions: [{ at: 0, sign: 0, text: 'Départ', name: 'Rue' }, { at: 100, sign: 4, text: 'Arrivée', name: '' }] } });
  const combined = combineLegs(leg(48, 48.001), leg(48.001, 48.002));
  assert.deepEqual(combined.result.path, [0, 1]);
  assert.equal(combined.events[1].edge, 1);
  const route = navigationRoute(combined.geometry, combined.result)!;
  assert.equal(route.length, 200);
  assert.deepEqual(route.instructions.map(step => [step.at, step.sign]), [[0, 0], [100, 0], [200, 4]]);
  assert.throws(() => navigationRoute(combineLegs(leg(48, 48.001), leg(49, 49.001)).geometry, combined.result));
});
