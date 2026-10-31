import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePlaces, detourAnchors, insertionIndex, photonRequests, pointAt, projectPlace, searchAlongRoute } from '../src/along-route';
import type { NavigationRoute } from '../src/navigation';

const route: NavigationRoute = { points: Array.from({ length: 61 }, (_, i) => ({ lat: 48 + i * 1000 / 111195, lon: 2, at: i * 1000, seconds: i * 100 })), instructions: [], length: 60000, seconds: 6000, waypointAts: [2000, 3000], waypointAt: 2000 };
const place = (north: number, east = 0) => ({ lat: 48 + north / 111195, lon: 2 + east / (111195 * Math.cos(48 * Math.PI / 180)), name: 'Lieu' });

test('la projection et les raccords de détour respectent la position et les étapes restantes', () => {
  assert.ok(Math.abs(projectPlace(route, place(2500, 100), 2000, 5000).at - 2500) < 0.01);
  assert.equal(pointAt(route, 2500).seconds, 250);
  const anchors = detourAnchors(route, 2900, 2700);
  assert.equal(anchors.start.at, 2700); assert.equal(anchors.end.at, 3000);
  assert.equal(insertionIndex(route, [place(2000), place(3000)], 2500), 1);
  assert.equal(insertionIndex(route, [place(3000)], 2500), 0);
  assert.equal(insertionIndex(route, [], 2500), 0);
});

test('la requête couvre une zone de 50 km et les coordonnées sont les seules données injectées', () => {
  const queries = photonRequests(route, 0, 'fuel');
  assert.equal(queries.length, 3);
  assert.equal(queries[0].searchParams.get('osm_tag'), 'amenity:fuel');
  assert.equal(queries[2].searchParams.get('lat'), pointAt(route, 50000).lat.toFixed(6));
  assert.equal(queries[0].searchParams.get('radius'), '26');
  assert.throws(() => photonRequests(route, 0, 'fuel";node;' as 'fuel'));
});

test('les lieux sont validés, dédoublonnés, limités et filtrés sur le vrai tracé', () => {
  const node = (id: number, north: number, east: number, extra = {}) => { const p = place(north, east); return { geometry: { coordinates: [p.lon, p.lat] }, properties: { osm_type: 'N', osm_id: id, osm_key: 'amenity', osm_value: 'fuel', name: `Station ${id}`, ...extra } }; };
  const decoded = decodePlaces({ features: [node(1, 2500, 100), node(1, 2500, 100), node(2, 4000, 20), node(3, 2500, 2000), node(4, 2500, 0, { extra: { access: 'private' } }), node(5, 3000, 10, { osm_type: 'W' }), { geometry: { coordinates: [2, NaN] }, properties: { osm_type: 'N', osm_id: 6, osm_key: 'amenity', osm_value: 'fuel' } }] }, route, 2000, 'fuel');
  assert.deepEqual(decoded.map(item => item.id), ['W/5', 'N/2', 'N/1']);
  assert.ok(decoded.every(item => item.at >= 2000 && item.distance <= 1000));
  assert.throws(() => decodePlaces({ features: Array(1001) }, route, 0, 'fuel'));
  assert.throws(() => decodePlaces({ error: 'broken' }, route, 0, 'fuel'));
});

test('le service reçoit une recherche explicite, et une annulation ou une limitation reste une erreur', async () => {
  const original = globalThis.fetch; const urls: string[] = [];
  try {
    globalThis.fetch = async input => { urls.push(String(input)); return Response.json({ features: [] }); };
    assert.deepEqual(await searchAlongRoute(route, 0, 'parking', new AbortController().signal), []);
    assert.equal(urls.length, 3); assert.equal(new URL(urls[0]).searchParams.get('osm_tag'), 'amenity:parking');
    await searchAlongRoute(route, 0, 'parking', new AbortController().signal);
    assert.equal(urls.length, 3, 'Une même recherche réutilise le cache local temporaire.');
    globalThis.fetch = async () => new Response('', { status: 429 });
    await assert.rejects(searchAlongRoute(route, 0, 'fuel', new AbortController().signal), /sollicité/);
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async (_input, init) => { if (init?.signal?.aborted) throw new DOMException('Annulé', 'AbortError'); return Response.json({ features: [] }); };
    await assert.rejects(searchAlongRoute(route, 0, 'parking', controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
