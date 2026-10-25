import type { Dataset, OsmNode, RoadEdge, RoadGraph, SearchGraph, Restriction, Tags } from './types';

export function metres(a: Pick<OsmNode, 'lat' | 'lon'>, b: Pick<OsmNode, 'lat' | 'lon'>): number {
  const rad = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, x)));
}

const motorRoads = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service']);
const allowedAccess = new Set(['yes', 'permissive', 'designated', 'official']);
const access = (t: Tags, suffix = '') => t[`motorcar${suffix}`] ?? t[`motor_vehicle${suffix}`] ?? t[`vehicle${suffix}`] ?? t[`access${suffix}`];
const accessible = (t: Tags, suffix = '') => !access(t, suffix) || allowedAccess.has(access(t, suffix));
const restrictionValue = (r: Restriction) => r.tags['restriction:motorcar'] ?? r.tags['restriction:motor_vehicle'] ?? r.tags['restriction:vehicle'] ?? r.tags.restriction;
const applies = (r: Restriction) => !r.tags.except?.split(';').some(v => ['motorcar', 'motor_vehicle', 'vehicle'].includes(v.trim())) && !!restrictionValue(r);

function speed(t: Tags, direction: 'forward' | 'backward'): number {
  const raw = t[`maxspeed:${direction}`] ?? t.maxspeed ?? '';
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h)?$/);
  const fallback = t.highway === 'living_street' ? 20 : t.highway === 'service' ? 15 : 30;
  return match && Number(match[1]) > 0 ? Number(match[1]) * (match[2] === 'mph' ? 1.609344 : 1) : fallback;
}

export function buildRoadGraph(data: Pick<Dataset, 'nodes' | 'ways' | 'restrictions'>): RoadGraph {
  const motorNodes = new Set(data.ways.filter(w => motorRoads.has(w.tags.highway)).flatMap(w => w.nodes));
  const nodes = data.nodes.filter(n => motorNodes.has(n.id));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const edges: RoadEdge[] = [];
  const outgoing: number[][] = nodes.map(() => []);
  const incoming: number[][] = nodes.map(() => []);
  const relevant = data.restrictions.filter(applies);
  // shortcut: temporal and via-way restrictions are closed conservatively; use a temporal turn-state automaton before expanding coverage.
  const unsupported = relevant.filter(r => r.members.some(m => m.role === 'via' && m.type !== 'node') || Object.keys(r.tags).some(k => k.includes('conditional')));
  const closedWays = new Set(unsupported.flatMap(r => r.members.filter(m => m.type === 'way').map(m => m.ref)));
  let excludedWays = 0;
  const add = (from: number, to: number, way: Dataset['ways'][number], kph: number) => {
    const length = metres(nodes[from], nodes[to]);
    if (length <= 0) return;
    const id = edges.length;
    edges.push({ id, from, to, way: way.id, name: way.tags.name || 'Voie sans nom', length, seconds: length / (kph / 3.6) });
    outgoing[from].push(id);
    incoming[to].push(id);
  };
  for (const way of data.ways) {
    const t = way.tags;
    if (!motorRoads.has(t.highway)) continue;
    if (!accessible(t) || closedWays.has(way.id) || Object.keys(t).some(k => /^(access|vehicle|motor_vehicle|motorcar|oneway|opening_hours).*conditional|^opening_hours$/.test(k))) {
      excludedWays++;
      continue;
    }
    const one = t['oneway:motorcar'] ?? t['oneway:motor_vehicle'] ?? t.oneway ?? ((t.junction === 'roundabout' || t.highway === 'motorway') ? 'yes' : 'no');
    for (let i = 1; i < way.nodes.length; i++) {
      const a = index.get(way.nodes[i - 1]);
      const b = index.get(way.nodes[i]);
      if (a === undefined || b === undefined) continue;
      if ([a, b].some(n => {
        const nt = nodes[n].tags || {};
        return !accessible(nt) || (nt.barrier && !['no', 'entrance', 'cattle_grid', 'toll_booth', 'border_control'].includes(nt.barrier) && !access(nt));
      })) continue;
      if (one !== '-1' && accessible(t, ':forward')) add(a, b, way, speed(t, 'forward'));
      if (!['yes', '1', 'true'].includes(one) && accessible(t, ':backward')) add(b, a, way, speed(t, 'backward'));
    }
  }
  return { nodes, edges, outgoing, incoming, restrictions: relevant.filter(r => !unsupported.includes(r)), excludedWays };
}

function turnAllowed(previous: RoadEdge, next: RoadEdge, restrictions: Restriction[]): boolean {
  for (const r of restrictions) {
    if (!r.members.some(m => m.role === 'from' && m.ref === previous.way)) continue;
    const value = restrictionValue(r)!;
    const matches = r.members.some(m => m.role === 'to' && m.ref === next.way)
      && (!value.endsWith('u_turn') || next.way !== previous.way || next.to === previous.from);
    if (value.startsWith('no_') && matches) return false;
    if (value.startsWith('only_') && !matches) return false;
  }
  return true;
}

// Each search state is an incoming directed segment, so turn restrictions survive reverse exploration.
export function buildSearchGraph(roads: RoadGraph, start: number, end: number): SearchGraph {
  if (!roads.nodes[start] || !roads.nodes[end]) throw new Error('Point hors du réseau.');
  const source = roads.edges.length;
  const target = source + 1;
  const forward = Array.from({ length: target + 1 }, () => [] as SearchGraph['forward'][number]);
  const reverse = Array.from({ length: target + 1 }, () => [] as SearchGraph['reverse'][number]);
  const add = (a: number, b: number, length: number, seconds: number) => {
    forward[a].push({ to: b, length, seconds });
    reverse[b].push({ to: a, length, seconds });
  };
  const restrictionsByNode = new Map<number, Restriction[]>();
  for (const r of roads.restrictions) {
    const via = r.members.find(m => m.role === 'via' && m.type === 'node');
    if (via) restrictionsByNode.set(via.ref, [...(restrictionsByNode.get(via.ref) || []), r]);
  }
  for (const edge of roads.edges) {
    const restrictions = restrictionsByNode.get(roads.nodes[edge.to].id) || [];
    for (const id of roads.outgoing[edge.to]) {
      const next = roads.edges[id];
      if (turnAllowed(edge, next, restrictions)) add(edge.id, id, next.length, next.seconds);
    }
    if (edge.to === end) add(edge.id, target, 0, 0);
  }
  for (const id of roads.outgoing[start]) add(source, id, roads.edges[id].length, roads.edges[id].seconds);
  if (start === end) add(source, target, 0, 0);
  return { forward, reverse, source, target };
}

export function nearestNode(roads: RoadGraph, point: { lat: number; lon: number }, maxMetres = 180): { index: number; distance: number } | null {
  let best = maxMetres;
  let found = -1;
  roads.nodes.forEach((n, i) => {
    if (!roads.outgoing[i].length && !roads.incoming[i].length) return;
    const distance = metres(point, n);
    if (distance < best) { best = distance; found = i; }
  });
  return found === -1 ? null : { index: found, distance: best };
}
