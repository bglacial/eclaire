import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuidanceProgress, RecentSpeed, matchRoute, navigationRoute, predictedRouteAt, routePosition, usableFix, type GpsFix } from '../src/navigation';
import type { RoadGeometry, SearchResult } from '../src/types';

const lat = 48.85, lon = 2.35, north = 100 / 111195, east = 100 / (111195 * Math.cos(lat * Math.PI / 180));
const roads: RoadGeometry = { nodes: [], edges: [
  { id: 0, from: 0, to: 1, way: 0, name: 'Rue Nord', length: 100, seconds: 10, geometry: [[lat, lon], [lat + north / 2, lon], [lat + north, lon]] },
  { id: 1, from: 1, to: 2, way: 1, name: 'Rue Est', length: 100, seconds: 30, geometry: [[lat + north, lon], [lat + north, lon + east]] },
] };
const result: SearchResult = { path: [0, 1], length: 200, seconds: 44, cost: 44, visited: 4, meeting: 1, instructions: [
  { at: 0, sign: 0, text: 'Continuez', name: 'Rue Nord' }, { at: 100, sign: 2, text: 'Tournez à droite', name: 'Rue Est' }, { at: 200, sign: 4, text: 'Vous êtes arrivé', name: '' },
] };
const fix = (at: number, timestamp = 100_000): GpsFix => at <= 100
  ? { lat: lat + north * at / 100, lon, accuracy: 5, timestamp, speed: 0 }
  : { lat: lat + north, lon: lon + east * (at - 100) / 100, accuracy: 5, timestamp, speed: 0 };

test('le guidage conserve les coudes, les distances et les temps du moteur', () => {
  const route = navigationRoute(roads, result)!;
  assert.equal(route.points.length, 4); assert.equal(route.points.at(-1)!.at, 200); assert.equal(route.points.at(-1)!.seconds, 44);
  const progress = new GuidanceProgress(route);
  const state = progress.update(fix(70), 100_000);
  assert.equal(state.status, 'on-route');
  if (state.status !== 'on-route') return;
  assert.equal(state.next.text, 'Tournez à droite'); assert.ok(Math.abs(state.toTurn - 30) < 0.1);
  assert.ok(Math.abs(state.remaining - 130) < 0.1); assert.ok(Math.abs(state.seconds - 36.3) < 0.1);
  const imminent = progress.update(fix(95, 101_000), 101_000);
  assert.equal(imminent.status, 'on-route'); if (imminent.status === 'on-route') assert.equal(imminent.next.sign, 2);
  const after = progress.update(fix(120, 102_000), 102_000);
  assert.equal(after.status, 'on-route'); if (after.status === 'on-route') assert.equal(after.next.sign, 4);
});

test('une position imprécise, ancienne ou dupliquée ne fait pas avancer le guidage', () => {
  const progress = new GuidanceProgress(navigationRoute(roads, result)!);
  progress.update(fix(30), 100_000);
  for (const gps of [{ ...fix(100), accuracy: 100 }, { ...fix(100), timestamp: 70_000 }, { ...fix(100), lat: NaN }, fix(100)]) {
    assert.equal(progress.update(gps, 100_000).status, 'uncertain');
    assert.ok(Math.abs(progress.match!.at - 30) < 0.1);
  }
  assert.equal(usableFix({ ...fix(30), timestamp: 110_000 }, 100_000), false);
});

test('une sortie de route suspend les instructions et le retour sur la route les rétablit', () => {
  const progress = new GuidanceProgress(navigationRoute(roads, result)!);
  progress.update(fix(30), 100_000);
  assert.equal(progress.update({ ...fix(40, 102_000), lon: lon - 0.002 }, 102_000).status, 'off-route');
  assert.ok(Math.abs(progress.match!.at - 30) < 0.1);
  assert.equal(progress.update(fix(50, 104_000), 104_000).status, 'on-route');
});

test('le rapprochement ne saute pas à une portion lointaine qui recroise la route', () => {
  const route = navigationRoute(roads, result)!;
  route.points.push({ ...route.points[0], at: 2000, seconds: 200 }, { ...route.points[1], at: 2100, seconds: 210 });
  const match = matchRoute(route, fix(30, 102_000), { at: 20, seconds: 2, distance: 0 }, 2000);
  assert.ok(Math.abs(match.at - 30) < 0.1);
});

test('l’arrivée demande deux positions proches et précises espacées de trois secondes', () => {
  const progress = new GuidanceProgress(navigationRoute(roads, result)!);
  assert.equal(progress.update(fix(195), 100_000).status, 'on-route');
  assert.equal(progress.update(fix(200, 102_000), 102_000).status, 'on-route');
  assert.equal(progress.update(fix(200, 104_000), 104_000).status, 'arrived');
  const moving = new GuidanceProgress(navigationRoute(roads, result)!);
  moving.update({ ...fix(195), speed: 15 }, 100_000);
  assert.equal(moving.update({ ...fix(200, 104_000), speed: 15 }, 104_000).status, 'on-route');
});

test('un trajet sans manœuvres ne prétend pas fournir un guidage et un trajet discontinu est refusé', () => {
  assert.equal(navigationRoute(roads, { ...result, instructions: undefined }), null);
  assert.equal(navigationRoute(roads, { ...result, path: [], length: 0 }), null);
  assert.throws(() => navigationRoute({ ...roads, edges: [roads.edges[0], { ...roads.edges[1], geometry: [[49, 3], [49.01, 3.01]] }] }, result), /discontinu/);
});

test('la position se projette sur le tracé même à côté de la route et suit les virages', () => {
  const route = navigationRoute({ ...roads, edges: [{ ...roads.edges[0], speedLimit: 30 }, { ...roads.edges[1], speedLimit: 50 }] }, result)!;
  const progress = new GuidanceProgress(route);
  const state = progress.update({ ...fix(40), lon: lon + east * 0.3 }, 100_000);
  assert.equal(state.status, 'on-route');
  const projected = routePosition(route, progress.match!.at);
  assert.ok(Math.abs(projected.lon - lon) < 1e-8); assert.equal(projected.speedLimit, 30);
  assert.ok(Math.abs(routePosition(route, 150).heading - 90) < 0.01);
  assert.equal(routePosition(route, 150).speedLimit, 50);
  assert.equal(routePosition(route, 250).speedLimit, 50);
  assert.equal(progress.update({ ...fix(40, 102_000), lon: lon - east }, 102_000).status, 'off-route');
});

test('la moyenne GPS ignore les vitesses invalides et les mesures de plus de vingt secondes', () => {
  const recent = new RecentSpeed();
  recent.add({ ...fix(0, 100_000), speed: 10 }); recent.add({ ...fix(0, 110_000), speed: 20 });
  assert.equal(recent.mean(), 15);
  recent.add({ ...fix(0, 121_000), speed: null }); assert.equal(recent.mean(), 20);
  recent.add({ ...fix(0, 131_000), speed: NaN }); assert.equal(recent.mean(), 0);
});

test('la prédiction reste bornée, s’arrête et respecte la réduction des mouvements', () => {
  const moving = { ...fix(0), speed: 20 };
  assert.equal(predictedRouteAt(200, 50, moving, 20, 101_000), 70);
  assert.equal(predictedRouteAt(200, 50, moving, 20, 110_000), 80);
  assert.equal(predictedRouteAt(60, 50, moving, 20, 110_000), 60);
  assert.equal(predictedRouteAt(200, 50, { ...moving, speed: 0 }, 20, 110_000), 50);
  assert.equal(predictedRouteAt(200, 50, moving, 20, 110_000, true), 50);
});

test('un départ à distance propose le point routier puis reprend le guidage à son approche', () => {
  const progress = new GuidanceProgress(navigationRoute(roads, result)!);
  const state = progress.update({ ...fix(20), lon: lon - east * 5 }, 100_000);
  assert.equal(state.status, 'approach');
  if (state.status !== 'approach') return;
  assert.ok(Math.abs(state.match.distance - 500) < 1);
  assert.ok(Math.abs(state.match.at - 20) < 1);
  assert.equal(progress.update({ ...fix(20, 99_000), lon: lon - east * 4 }, 100_000).status, 'uncertain');
  assert.equal(progress.update(fix(30, 102_000), 102_000).status, 'on-route');
  assert.equal(progress.update({ ...fix(30, 104_000), lon: lon - east * 5 }, 104_000).status, 'off-route');
});

test('une vitesse GPS invalide ne supprime pas la limite de continuité du rapprochement', () => {
  const route = navigationRoute(roads, result)!;
  route.points.push({ ...route.points[0], at: 2000, seconds: 200 }, { ...route.points[1], at: 2100, seconds: 210 });
  const gps = { ...fix(30, 102_000), speed: NaN };
  const match = matchRoute(route, gps, { at: 20, seconds: 2, distance: 0 }, 2000);
  assert.ok(Math.abs(match.at - 30) < 0.1);
});
