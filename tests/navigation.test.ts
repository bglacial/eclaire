import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuidanceProgress, RecentSpeed, acceptsRouteUpdate, isNavigationRoute, matchRoute, navigationRoute, predictedRouteAt, routePosition, usableFix, type GpsFix } from '../src/navigation';
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

test('un nouveau trajet natif est validé avant de remplacer le guidage', () => {
  const route = navigationRoute(roads, result)!;
  assert.equal(isNavigationRoute(route), true);
  assert.equal(isNavigationRoute({ ...route, length: NaN }), false);
  assert.equal(isNavigationRoute({ ...route, points: [{ ...route.points[0], lat: NaN }, ...route.points.slice(1)] }), false);
  assert.equal(isNavigationRoute({ ...route, instructions: route.instructions.slice(0, -1) }), false);
  assert.equal(isNavigationRoute({ ...route, points: route.points.map((point, index) => index === 1 ? { ...point, seconds: -1 } : point) }), false);
});

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

test('la recherche bornée conserve un long segment qui traverse les limites de continuité', () => {
  const route = navigationRoute(roads, result)!;
  route.points = [{ lat: 48, lon: 2, at: 0, seconds: 0 }, { lat: 48.01, lon: 2, at: 1000, seconds: 100 }, { lat: 48.02, lon: 2, at: 2000, seconds: 200 }];
  const position = { lat: 48.005, lon: 2, accuracy: 5, timestamp: 100_000, speed: 0 };
  const match = matchRoute(route, position, { at: 490, seconds: 49, distance: 0 }, 1000);
  assert.ok(Math.abs(match.at - 500) < 0.01);
});

test('le suivi d’un long trajet ne parcourt pas toute sa géométrie à chaque mesure', () => {
  const route = navigationRoute(roads, result)!;
  const points = Array.from({ length: 100_000 }, (_, at) => ({ lat: 48 + at / 111_195, lon: 2, at, seconds: at / 10 }));
  let reads = 0;
  route.points = new Proxy(points, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, receiver); } });
  const position = { lat: 48 + 50_000 / 111_195, lon: 2, accuracy: 5, timestamp: 100_000, speed: 10 };
  const match = matchRoute(route, position, { at: 49_990, seconds: 4999, distance: 0 }, 1000);
  assert.ok(Math.abs(match.at - 50_000) < 0.01);
  assert.ok(reads < 1000, `Trop de points consultés : ${reads}`);
});

test('le cap en mouvement distingue deux portions parallèles de sens opposés', () => {
  const route = navigationRoute(roads, result)!;
  route.points = [{ lat: 48.001, lon: 2, at: 0, seconds: 0 }, { lat: 48, lon: 2, at: 111, seconds: 10 },
    { lat: 48, lon: 2.0002, at: 126, seconds: 12 }, { lat: 48.001, lon: 2.0002, at: 237, seconds: 22 }];
  const position = { lat: 48.0005, lon: 2, accuracy: 5, timestamp: 100_000, speed: 10, heading: 0 };
  assert.ok(matchRoute(route, position).at > 126);
  assert.ok(matchRoute(route, { ...position, speed: 0 }).at < 111);
  assert.ok(matchRoute(route, { ...position, heading: 360 }).at < 111);
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

test('la vitesse et l’historique évitent les sauts entre portions parallèles ou superposées', () => {
  for (const offset of [0, 5]) {
    const route = navigationRoute(roads, result)!;
    const point = (north: number, east: number, at: number) => ({ lat: 48 + north / 111195, lon: 2 + east / (111195 * Math.cos(48 * Math.PI / 180)), at, seconds: at / 10 });
    route.points = [point(0, 0, 0), point(30, 0, 30), point(30, 10, 40), point(0, 10, 70), point(0, offset, 80 - offset), point(60, offset, 140 - offset)];
    const progress = new GuidanceProgress(route);
    const gps = (north: number, east: number, time: number, heading: number) => ({ ...point(north, east, 0), accuracy: 5, timestamp: time, speed: 10, heading });
    progress.update(gps(10, 10, 100_000, 180), 100_000);
    assert.ok(Math.abs(progress.match!.at - 60) < 0.01);
    progress.update(gps(15, offset, 103_500, 0), 103_500);
    assert.ok(Math.abs(progress.match!.at - (95 - offset)) < 0.01, `Retour intempestif sur la première portion : ${progress.match!.at}`);
    const firstPass = new GuidanceProgress(route);
    firstPass.update(gps(10, 0, 100_000, 0), 100_000);
    firstPass.update(gps(20, offset, 101_000, 0), 101_000);
    assert.ok(Math.abs(firstPass.match!.at - 20) < 0.01, `Saut prématuré sur la seconde portion : ${firstPass.match!.at}`);
    if (offset === 5) {
      const previous = { at: 10, seconds: 1, distance: 0 };
      for (const speed of [null, NaN, -1, 101]) assert.ok(matchRoute(route, { ...gps(20, offset, 101_000, 0), speed }, previous, 1000).at > 80);
      assert.ok(matchRoute(route, gps(20, offset, 120_000, 0), previous, 20_000).at > 80);
    }
  }
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
  assert.equal(predictedRouteAt(500, 50, moving, 20, 110_000), 250);
  assert.equal(predictedRouteAt(1000, 50, moving, 20, 130_000), 350);
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

test('un changement de trajet accepte un raccordement éloigné stable et refuse une position obsolète', () => {
  const route = navigationRoute(roads, result)!;
  const outside = { ...fix(20), lon: lon - east * 5 };
  assert.equal(acceptsRouteUpdate(route, outside, outside, 100_000), true);
  assert.equal(acceptsRouteUpdate(route, outside, { ...outside, lat: outside.lat + north }, 100_000), false);
  assert.equal(acceptsRouteUpdate(route, outside, fix(120), 100_000), true);
  assert.equal(acceptsRouteUpdate(route, outside, outside, 120_000), false);
});
