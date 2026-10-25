import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bidirectionalDijkstra } from '../src/dijkstra';
import { buildRoadGraph, buildSearchGraph, nearestNode } from '../src/graph';
import type { Dataset, Restriction, SearchGraph, ExplorationEvent, Criterion } from '../src/types';

const fixture = (): Pick<Dataset, 'nodes' | 'ways' | 'restrictions'> => ({
  nodes: [
    { id: 1, lat: 48.85, lon: 2.34 },
    { id: 2, lat: 48.85, lon: 2.341 },
    { id: 3, lat: 48.851, lon: 2.341 },
    { id: 4, lat: 48.85, lon: 2.342 },
    { id: 5, lat: 48.858, lon: 2.35 },
    { id: 6, lat: 48.859, lon: 2.351 },
  ],
  ways: [
    { id: 10, nodes: [1, 2, 4], tags: { highway: 'residential', maxspeed: '10', oneway: 'yes', name: 'Court et lent' } },
    { id: 20, nodes: [1, 3, 4], tags: { highway: 'primary', maxspeed: '50', oneway: 'yes', name: 'Long et rapide' } },
    { id: 30, nodes: [5, 6], tags: { highway: 'residential' } },
  ], restrictions: [],
});

test('distance et temps choisissent des chemins différents', () => {
  const roads = buildRoadGraph(fixture());
  const graph = buildSearchGraph(roads, 0, roads.nodes.findIndex(n => n.id === 4));
  const shortest = bidirectionalDijkstra(graph, 'distance')!;
  const fastest = bidirectionalDijkstra(graph, 'time')!;
  assert.ok(shortest && fastest);
  assert.deepEqual(shortest.path.map(id => roads.edges[id].way), [10, 10]);
  assert.deepEqual(fastest.path.map(id => roads.edges[id].way), [20, 20]);
  assert.ok(shortest.length < fastest.length);
  assert.ok(fastest.seconds < shortest.seconds);
});

test('sens uniques, graphe inverse et trajet impossible', () => {
  const roads = buildRoadGraph(fixture());
  assert.ok(bidirectionalDijkstra(buildSearchGraph(roads, 0, 3), 'distance'));
  assert.equal(bidirectionalDijkstra(buildSearchGraph(roads, 3, 0), 'distance'), null);
  assert.equal(bidirectionalDijkstra(buildSearchGraph(roads, 0, 4), 'time'), null);
  const reverse = fixture(); reverse.ways[0].tags.oneway = '-1';
  assert.ok(bidirectionalDijkstra(buildSearchGraph(buildRoadGraph(reverse), 3, 0), 'distance'));
});

test('même point : zéro mètre, zéro seconde', () => {
  const roads = buildRoadGraph(fixture());
  const result = bidirectionalDijkstra(buildSearchGraph(roads, 0, 0), 'time')!;
  assert.deepEqual(result.path, []);
  assert.equal(result.length, 0);
  assert.equal(result.seconds, 0);
});

const turnRestriction = (value: string, from: number, to: number, via = 2): Restriction => ({
  id: 99, tags: { type: 'restriction', restriction: value },
  members: [{ role: 'from', ref: from, type: 'way' }, { role: 'to', ref: to, type: 'way' }, { role: 'via', ref: via, type: 'node' }],
});

test('les interdictions de tourner et les obligations sont respectées dans les deux recherches', () => {
  for (const value of ['no_right_turn', 'no_u_turn', 'only_left_turn']) {
    const data = fixture();
    data.ways = [
      { id: 10, nodes: [1, 2], tags: { highway: 'residential', oneway: 'yes' } },
      { id: 11, nodes: [2, 4], tags: { highway: 'residential', oneway: 'yes' } },
      { id: 20, nodes: [1, 3, 4], tags: { highway: 'residential', oneway: 'yes' } },
    ];
    data.restrictions = [turnRestriction(value, 10, value.startsWith('no') ? 11 : 200)];
    const roads = buildRoadGraph(data);
    const result = bidirectionalDijkstra(buildSearchGraph(roads, 0, 3), 'distance')!;
    assert.deepEqual(result.path.map(id => roads.edges[id].way), [20, 20]);
  }
});

test('no_u_turn ne bloque pas la continuation sur une même voie', () => {
  const data = fixture();
  data.ways = [data.ways[0]];
  data.ways[0].tags.oneway = 'no';
  data.restrictions = [turnRestriction('no_u_turn', 10, 10)];
  const roads = buildRoadGraph(data);
  const graph = buildSearchGraph(roads, 0, roads.nodes.findIndex(n => n.id === 4));
  assert.ok(bidirectionalDijkstra(graph, 'distance'));
  const incoming = roads.edges.find(e => roads.nodes[e.from].id === 1 && roads.nodes[e.to].id === 2)!;
  assert.equal(graph.forward[incoming.id].some(a => roads.edges[a.to]?.to === incoming.from), false);
});

test('accès, barrières, conditions et restrictions spécifiques au vélo', () => {
  const data = fixture();
  data.ways[0].tags.motor_vehicle = 'no';
  data.restrictions = [{ ...turnRestriction('no_right_turn', 20, 20, 3), tags: { 'restriction:bicycle': 'no_right_turn' } }];
  const roads = buildRoadGraph(data);
  assert.ok(roads.edges.every(e => e.way !== 10));
  assert.ok(bidirectionalDijkstra(buildSearchGraph(roads, 0, 3), 'distance'));
  data.ways[1].tags['access:conditional'] = 'no @ (Mo-Fr)';
  assert.ok(buildRoadGraph(data).edges.every(e => e.way === 30));
  const blocked = fixture(); blocked.nodes[1].tags = { barrier: 'bollard' };
  assert.ok(buildRoadGraph(blocked).edges.every(e => e.way !== 10));
});

test('raccordement borné à 180 m, nœuds isolés ignorés', () => {
  const roads = buildRoadGraph(fixture());
  assert.equal(nearestNode(roads, { lat: 0, lon: 0 }), null);
  assert.equal(nearestNode(roads, roads.nodes[0])?.index, 0);
  const isolated = fixture(); isolated.ways = isolated.ways.slice(0, 2);
  assert.equal(nearestNode(buildRoadGraph(isolated), isolated.nodes[4]), null);
});

function abstractGraph(count: number, edges: [number, number, number, number][], start: number, end: number): SearchGraph {
  const forward = Array.from({ length: count }, () => [] as SearchGraph['forward'][number]);
  const reverse = Array.from({ length: count }, () => [] as SearchGraph['reverse'][number]);
  edges.forEach(([a, b, length, seconds]) => { forward[a].push({ to: b, length, seconds }); reverse[b].push({ to: a, length, seconds }); });
  return { forward, reverse, source: start, target: end };
}

test('la première rencontre ne prouve pas l’optimalité', () => {
  // Both endpoints discover state 0 first (cost 101); the optimum through state 1 costs 60.
  const graph = abstractGraph(4, [[2, 0, 1, 1], [0, 3, 100, 100], [2, 1, 30, 30], [1, 3, 30, 30]], 2, 3);
  const result = bidirectionalDijkstra(graph, 'distance')!;
  assert.equal(result.cost, 60);
  assert.deepEqual(result.path, [1]);
});

// Independent Bellman-Ford oracle exercises ties, zero costs, directed/disconnected graphs and stale heap entries.
function reference(graph: SearchGraph, criterion: Criterion) {
  const costs = graph.forward.map(() => Infinity); costs[graph.source] = 0;
  for (let pass = 0; pass < costs.length - 1; pass++) {
    graph.forward.forEach((arcs, n) => arcs.forEach(a => {
      costs[a.to] = Math.min(costs[a.to], costs[n] + (criterion === 'distance' ? a.length : a.seconds));
    }));
  }
  return costs[graph.target];
}
test('400 graphes dirigés concordent avec Bellman-Ford pour les deux critères', () => {
  let seed = 20261025;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 400; i++) {
    const n = 4 + Math.floor(random() * 16);
    const edges: [number, number, number, number][] = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a !== b && random() < 0.15) edges.push([a, b, Math.floor(random() * 50), Math.floor(random() * 50)]);
    }
    const graph = abstractGraph(n, edges, n - 2, n - 1);
    for (const criterion of ['time', 'distance'] as const) {
      const result = bidirectionalDijkstra(graph, criterion);
      assert.equal(result?.cost ?? Infinity, reference(graph, criterion), `graph=${i}, criterion=${criterion}`);
      if (result) assert.equal(criterion === 'distance' ? result.length : result.seconds, result.cost);
    }
  }
});

test('extrait OSM : trajet de démonstration, événements en lots et continuité du parcours', () => {
  const data: Dataset = JSON.parse(readFileSync(new URL('../public/data/paris.json', import.meta.url), 'utf8'));
  const roads = buildRoadGraph(data);
  const start = nearestNode(roads, { lat: 48.8608, lon: 2.3376 })!.index;
  const end = nearestNode(roads, { lat: 48.8462, lon: 2.3464 })!.index;
  for (const criterion of ['time', 'distance'] as const) {
    const events: ExplorationEvent[] = [];
    const result = bidirectionalDijkstra(buildSearchGraph(roads, start, end), criterion, batch => { assert.ok(batch.length <= 128); events.push(...batch); })!;
    assert.ok(result, 'Le parcours par défaut doit exister');
    assert.ok(result.length > 1000);
    assert.ok(events.some(e => e.side === 0) && events.some(e => e.side === 1));
    assert.ok(events.every(e => roads.edges[e.edge]));
    assert.equal(roads.edges[result.path[0]].from, start);
    assert.equal(roads.edges[result.path.at(-1)!].to, end);
    for (let i = 1; i < result.path.length; i++) assert.equal(roads.edges[result.path[i - 1]].to, roads.edges[result.path[i]].from);
    console.log(`${criterion}: ${Math.round(result.length)} m, ${Math.round(result.seconds)} s, ${result.visited} états`);
  }
});
