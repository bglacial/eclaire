import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendNationalEdges, decodeNationalMessage, isInFrance, nationalRoute, routingEndpoint, searchFrance } from '../src/national';
import type { RoadGeometry } from '../src/types';

const road = { key: 10, geometry: [[48.85, 2.34], [48.85, 2.341], [48.851, 2.341]] as [number, number][], length: 180, seconds: 30, name: 'Rue test' };

test('le service natif vise le serveur public, tandis que le site garde son API relative', () => {
  assert.equal(routingEndpoint(undefined, false), '/api');
  assert.equal(routingEndpoint(undefined, true), 'https://eclaire.nriault.fr/api');
  assert.equal(routingEndpoint('/api/', true), 'https://eclaire.nriault.fr/api');
  assert.equal(routingEndpoint('https://example.org/api/', true), 'https://example.org/api');
  assert.equal(routingEndpoint('/custom-api', false), '/custom-api');
});

test('le protocole conserve les coudes et distingue les orientations', () => {
  const roads: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>();
  appendNationalEdges(roads, index, [road, { ...road, key: 11, geometry: [...road.geometry].reverse() }]);
  appendNationalEdges(roads, index, [road]);
  assert.equal(roads.edges.length, 2);
  assert.deepEqual(roads.edges[0].geometry, road.geometry);
  assert.deepEqual(decodeNationalMessage({ type: 'batch', events: [{ key: 10, side: 0 }, { key: 11, side: 1 }] }, roads, index).events, [{ edge: 0, side: 0 }, { edge: 1, side: 1 }]);
  const result = decodeNationalMessage({ type: 'result', result: { found: true, path: [10], meeting: 10, length: 180, seconds: 30, cost: 30, visited: 4, computeMs: 2 } }, roads, index).result!;
  assert.deepEqual(result.path, [0]); assert.equal(result.meeting, 0);
});

test('les données invalides et les chemins incomplets sont refusés', () => {
  const roads: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>();
  assert.throws(() => appendNationalEdges(roads, index, [{ ...road, geometry: [[NaN, 2], [49, 3]] }]));
  assert.throws(() => appendNationalEdges(roads, index, [{ ...road, seconds: -1 }]));
  assert.throws(() => appendNationalEdges(roads, index, [{ ...road, speedLimit: -1 }]));
  assert.throws(() => decodeNationalMessage({ type: 'batch', events: [{ key: 99, side: 0 }] }, roads, index));
  assert.throws(() => decodeNationalMessage({ type: 'result', result: { found: true, path: [99], meeting: 99, length: 1, seconds: 1, cost: 1, visited: 1, computeMs: 1 } }, roads, index));
  assert.equal(decodeNationalMessage({ type: 'result', result: { found: false } } as Parameters<typeof decodeNationalMessage>[0], roads, index).result, null);
});

test('la limitation routière optionnelle traverse le protocole sans être inventée', () => {
  const roads: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>();
  appendNationalEdges(roads, index, [{ ...road, speedLimit: 50 }, { ...road, key: 11 }]);
  assert.equal(roads.edges[0].speedLimit, 50); assert.equal(roads.edges[1].speedLimit, undefined);
});

test('la couverture accepte Brest, Lyon et la Corse, sans accepter de coordonnées invalides', () => {
  assert.ok(isInFrance({ lat: 48.39, lon: -4.49 }));
  assert.ok(isInFrance({ lat: 45.76, lon: 4.83 }));
  assert.ok(isInFrance({ lat: 41.92, lon: 8.74 }));
  assert.equal(isInFrance({ lat: 51.51, lon: -0.12 }), false);
  assert.equal(isInFrance({ lat: NaN, lon: 2 }), false);
});

test('les manœuvres non ordonnées ou sans arrivée sont refusées à la frontière réseau', () => {
  const roads: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>();
  appendNationalEdges(roads, index, [road]);
  const result = { found: true, path: [10], meeting: 10, length: 180, seconds: 30, cost: 30, visited: 4, computeMs: 2 };
  const start = { at: 0, sign: 0, text: 'Continuez', name: 'Rue test' }, finish = { at: 180, sign: 4, text: 'Arrivée', name: '' };
  assert.equal(decodeNationalMessage({ type: 'result', result: { ...result, instructions: [start, finish] } }, roads, index).result!.instructions!.length, 2);
  for (const instructions of [[start], [finish, start], [start, { ...finish, at: NaN }], [start, { ...finish, at: 182 }]]) {
    assert.throws(() => decodeNationalMessage({ type: 'result', result: { ...result, instructions } }, roads, index));
  }
});

test('les lots NDJSON restent intacts aux frontières des paquets et en UTF-8', async context => {
  const messages = [{ type: 'metadata', label: 'Éclaire' }, { type: 'batch', events: [] }];
  const bytes = new TextEncoder().encode(messages.map(m => JSON.stringify(m)).join('\n') + '\n');
  context.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.slice(offset, offset + 3));
    controller.close();
  } })));
  const received = [];
  for await (const message of nationalRoute({ name: 'Paris', lat: 48.85, lon: 2.35 }, { name: 'Lyon', lat: 45.76, lon: 4.83 }, 'time', 'test', new AbortController().signal)) received.push(message);
  assert.deepEqual(received, messages);
});

test('une erreur du service ou une réponse tronquée ne produit jamais de faux résultat', async context => {
  const start = { name: 'Paris', lat: 48.85, lon: 2.35 }, end = { name: 'Lyon', lat: 45.76, lon: 4.83 };
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Limite de calcul atteinte.' }), { status: 422 }));
  await assert.rejects(nationalRoute(start, end, 'time', 'test', new AbortController().signal).next(), /Limite de calcul/);
  fetchMock.mock.mockImplementation(async () => new Response('{"type":"result"'));
  await assert.rejects(nationalRoute(start, end, 'time', 'test', new AbortController().signal).next(), /tronqué/);
});

test('le calcul reste accessible sans AbortSignal.any ni AbortSignal.timeout dans la WebView', async context => {
  context.mock.method(AbortSignal, 'any', () => { throw new TypeError('AbortSignal.any indisponible'); });
  context.mock.method(AbortSignal, 'timeout', () => { throw new TypeError('AbortSignal.timeout indisponible'); });
  context.mock.method(globalThis, 'fetch', async () => new Response('{"type":"result","result":{"found":false}}\n'));
  const messages = [];
  for await (const message of nationalRoute({ name: 'Paris', lat: 48.85, lon: 2.35 }, { name: 'Lyon', lat: 45.76, lon: 4.83 }, 'time', 'test', new AbortController().signal)) messages.push(message);
  assert.equal(messages[0].type, 'result');
});

test('une limitation HTML 429 ne se présente pas comme un service France arrêté', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response('<html>Too many requests</html>', { status: 429, headers: { 'Retry-After': '30' } }));
  await assert.rejects(nationalRoute({ name: 'Paris', lat: 48.85, lon: 2.35 }, { name: 'Lyon', lat: 45.76, lon: 4.83 }, 'time', 'test', new AbortController().signal).next(), /30|sollicité/);
});

test('un ancien serveur ne peut pas ignorer silencieusement les évitements', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ status: 'ready', bounds: [41, -5, 52, 10], edges: 100 })));
  await assert.rejects(nationalRoute({ name: 'A', lat: 48, lon: 2 }, { name: 'B', lat: 49, lon: 2 }, 'time', 'test', new AbortController().signal, { avoidMotorways: true, avoidTolls: false }).next(), /mise à jour/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('les évitements sont transmis au calcul et au recalcul, pour les deux critères', async context => {
  const bodies: unknown[] = [];
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).endsWith('/health')) return new Response(JSON.stringify({ status: 'ready', bounds: [41, -5, 52, 10], edges: 100, roadPreferences: true }));
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{"type":"result","result":{"found":false}}\n');
  });
  for (const criterion of ['time', 'distance'] as const) {
    for await (const message of nationalRoute({ name: 'A', lat: 48, lon: 2 }, { name: 'B', lat: 49, lon: 2 }, criterion, 'test', new AbortController().signal, { avoidMotorways: true, avoidTolls: true })) assert.equal(message.type, 'result');
    assert.deepEqual(bodies.at(-1), { start: { lat: 48, lon: 2 }, end: { lat: 49, lon: 2 }, criterion, requestId: 'test', avoidMotorways: true, avoidTolls: true });
  }
});


test('la recherche trouve une enseigne ouverte et conserve les lieux lorsque une source échoue', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('recherche-entreprises')) return Response.json({ results: [{ nom_complet: 'LECLUSE', matching_etablissements: [
      { liste_enseignes: ['LECLUSE AUTOMOBILES VOLKSWAGEN LE MANS'], adresse: '20 BOULEVARD RENE CASSIN 72000 LE MANS', latitude: '47.979982079', longitude: '0.198400238', etat_administratif: 'A' },
      { liste_enseignes: ['VOLKSWAGEN LE MANS'], adresse: 'LE MANS', latitude: '48', longitude: '0', etat_administratif: 'F' },
      { liste_enseignes: ['VOLKSWAGEN LE MANS'], adresse: 'LE MANS', latitude: '', longitude: '0', etat_administratif: 'A' },
    ] }] });
    if (String(url).includes('photon')) return new Response('', { status: 503 });
    return Response.json({ features: [{ properties: { label: 'Le Mans', city: 'Le Mans' }, geometry: { coordinates: [0.19, 48] } }] });
  });
  const places = await searchFrance('Volkswagen le mans', new AbortController().signal);
  assert.equal(places.length, 2);
  assert.match(places[0].name, /VOLKSWAGEN LE MANS/);
  assert.equal(places[0].lat, 47.979982079);
  assert.equal(places[1].name, 'Le Mans');
  fetchMock.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(searchFrance('test', new AbortController().signal), /indisponible/);
});


test('les résultats rapides s’affichent sans attendre les autres sources et une recherche annulée ne les publie plus', async context => {
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  let first!: () => void;
  const received = new Promise<void>(resolve => { first = resolve; });
  context.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('recherche-entreprises')) { await slow; return Response.json({ results: [] }); }
    if (String(url).includes('photon')) return Response.json({ features: [{ properties: { name: 'Gare', city: 'Le Mans' }, geometry: { coordinates: [0.19, 48] } }] });
    return Response.json({ features: [] });
  });
  const updates: string[][] = [], controller = new AbortController();
  const pending = searchFrance('Gare', controller.signal, places => { updates.push(places.map(place => place.name)); if (places.length) first(); });
  await received;
  assert.deepEqual(updates.at(-1), ['Gare']);
  const count = updates.length;
  controller.abort(); release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(updates.length, count);
});
