import { mkdir, writeFile } from 'node:fs/promises';

// One bounded extraction; the app never queries public Overpass instances at runtime.
const bounds = [48.845, 2.324, 48.87, 2.367]; // south, west, north, east
const bbox = bounds.join(',');
const query = `[out:json][timeout:90];(
  way[highway](${bbox});
  relation[type=restriction](${bbox});
  way[building](${bbox});
  way[natural=water](${bbox});
  way[waterway=riverbank](${bbox});
  way[leisure=park](${bbox});
  way[landuse=grass](${bbox});
  node["addr:street"]["addr:housenumber"](${bbox});
  nwr[tourism=attraction][name](${bbox});
);out body;>;out body qt;`;
let osm;
let source;
for (const endpoint of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      headers: { 'User-Agent': 'EclairePrototype/0.1 (bounded OSM educational routing extract)' },
      signal: AbortSignal.timeout(110_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    osm = await response.json();
    if (osm.remark || !osm.elements?.length) throw new Error(osm.remark || 'Empty extraction');
    source = endpoint;
    break;
  } catch (error) { console.error(endpoint, error.message); }
}
if (!osm) throw new Error('OSM import failed. Existing data has been preserved.');

const byId = new Map();
for (const n of osm.elements.filter(e => e.type === 'node')) {
  if (!byId.has(n.id) || n.tags) byId.set(n.id, n);
}
const inBounds = n => n.lat >= bounds[0] && n.lat <= bounds[2] && n.lon >= bounds[1] && n.lon <= bounds[3];
const ways = osm.elements.filter(e => e.type === 'way' && e.tags?.highway);
const usedNodes = new Set(ways.flatMap(w => w.nodes));
const nodes = [...usedNodes].map(id => byId.get(id)).filter(Boolean).filter(inBounds)
  .map(n => ({ id: n.id, lat: n.lat, lon: n.lon, ...(n.tags ? { tags: n.tags } : {}) }));
const nodeIds = new Set(nodes.map(n => n.id));
const roads = ways.map(w => ({ id: w.id, nodes: w.nodes, tags: w.tags }));
const restrictions = osm.elements.filter(e => e.type === 'relation' && e.tags?.type === 'restriction');
const features = [];
for (const w of osm.elements.filter(e => e.type === 'way' && !e.tags?.highway)) {
  const t = w.tags || {};
  const kind = t.building ? 'building' : (t.natural === 'water' || t.waterway === 'riverbank') ? 'water' : (t.leisure === 'park' || t.landuse === 'grass') ? 'park' : null;
  if (!kind || w.nodes[0] !== w.nodes.at(-1)) continue;
  const coords = w.nodes.map(id => byId.get(id)).filter(Boolean).map(n => [n.lon, n.lat]);
  if (coords.length >= 4) features.push({ type: 'Feature', properties: { kind, name: t.name || '' }, geometry: { type: 'Polygon', coordinates: [coords] } });
}
const places = osm.elements.filter(e => e.type === 'node' && e.tags && inBounds(e))
  .filter(e => (e.tags['addr:street'] && e.tags['addr:housenumber']) || e.tags.tourism === 'attraction')
  .map(e => ({ name: e.tags.name || `${e.tags['addr:housenumber']} ${e.tags['addr:street']}`, lat: e.lat, lon: e.lon }));
const metadata = {
  name: 'Paris · Centre', bounds, source,
  osmTimestamp: osm.osm3s?.timestamp_osm_base,
  importedAt: new Date().toISOString(),
  attribution: '© les contributeurs OpenStreetMap',
  license: 'ODbL-1.0',
  restrictionCount: restrictions.length,
};
await mkdir('public/data', { recursive: true });
await writeFile('public/data/paris.json', JSON.stringify({ metadata, nodes, ways: roads, restrictions, places, basemap: { type: 'FeatureCollection', features } }));
await writeFile('public/data/provenance.json', JSON.stringify({ ...metadata, query, nodes: nodeIds.size, ways: roads.length, polygons: features.length }, null, 2));
console.log(JSON.stringify({ ...metadata, nodes: nodes.length, roads: roads.length, polygons: features.length, places: places.length }, null, 2));
