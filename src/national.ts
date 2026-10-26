import type { Criterion, ExplorationEvent, NavigationInstruction, Place, RoadGeometry, SearchResult } from './types';
import { requestDeadline } from './request-deadline';

export const routingApi = import.meta.env?.VITE_ROUTING_API_URL?.replace(/\/$/, '') || '/api';
export const franceBounds = [41.3, -5.3, 51.2, 9.7] as const;
export const isInFrance = (p: Pick<Place, 'lat' | 'lon'>) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= franceBounds[0] && p.lat <= franceBounds[2] && p.lon >= franceBounds[1] && p.lon <= franceBounds[3];

export async function checkNationalService() {
  const deadline = requestDeadline(3000);
  try {
    const response = await fetch(`${routingApi}/health`, { signal: deadline.signal });
    if (!response.ok) throw new Error('Service France indisponible.');
    const health = await response.json();
    if (health.status !== 'ready' || !Array.isArray(health.bounds) || typeof health.edges !== 'number') throw new Error('Service France non prêt.');
    return health as { status: string; engine?: string; edges: number; nodes: number; dataTimestamp: string; bounds: number[] };
  } finally { deadline.dispose(); }
}

export async function searchFrance(query: string, signal: AbortSignal): Promise<Place[]> {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.search = new URLSearchParams({ q: query, limit: '6' }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Recherche nationale indisponible.');
  const result = await response.json();
  if (!Array.isArray(result.features)) throw new Error('Réponse de recherche invalide.');
  return result.features.flatMap((feature: { geometry?: { coordinates?: number[] }; properties?: { label?: string; name?: string; city?: string } }) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || typeof feature.properties?.label !== 'string') return [];
    const place = { name: feature.properties.label, lon: coordinates[0], lat: coordinates[1], detail: feature.properties.city || 'IGN · France' };
    return isInFrance(place) ? [place] : [];
  });
}

export interface NationalMetadata { type: 'metadata'; visited: number; computeMs: number; traceStride: number; traceEvents: number; snapped: { lat: number; lon: number; distance: number }[] }
interface WireEdge { key: number; geometry: [number, number][]; length: number; seconds: number; name: string }
interface WireMessage { type: string; edges?: WireEdge[]; events?: { key: number; side: number }[]; result?: { found: boolean; path: number[]; meeting: number; length: number; seconds: number; cost: number; visited: number; computeMs: number; instructions?: NavigationInstruction[] } }

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const indexValue = (n: unknown): n is number => positive(n) && Number.isSafeInteger(n);

export function appendNationalEdges(roads: RoadGeometry, index: Map<number, number>, edges: WireEdge[]) {
  if (!Array.isArray(edges)) throw new Error('Trace routière invalide.');
  for (const edge of edges) {
    if (!indexValue(edge.key) || !positive(edge.length) || !positive(edge.seconds) || !Array.isArray(edge.geometry) || edge.geometry.length < 2 || edge.geometry.length > 50_000 || typeof edge.name !== 'string') throw new Error('Segment routier invalide.');
    if (index.has(edge.key)) continue;
    if (!edge.geometry.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)) throw new Error('Géométrie routière invalide.');
    const from = roads.nodes.length, a = edge.geometry[0], b = edge.geometry.at(-1)!;
    roads.nodes.push({ id: from, lat: a[0], lon: a[1] }, { id: from + 1, lat: b[0], lon: b[1] });
    const id = roads.edges.length;
    roads.edges.push({ id, from, to: from + 1, way: Math.floor(edge.key / 2), geometry: edge.geometry, length: edge.length, seconds: edge.seconds, name: edge.name });
    index.set(edge.key, id);
  }
}

export function decodeNationalMessage(message: WireMessage, roads: RoadGeometry, index: Map<number, number>): { events?: ExplorationEvent[]; result?: SearchResult | null } {
  if (!message || typeof message !== 'object') throw new Error('Message routier invalide.');
  if (message.edges) appendNationalEdges(roads, index, message.edges);
  if (message.type === 'batch') {
    if (!Array.isArray(message.events)) throw new Error('Lot routier invalide.');
    return { events: message.events.map(event => {
      const edge = index.get(event.key);
      if (edge === undefined || (event.side !== 0 && event.side !== 1)) throw new Error('Événement routier invalide.');
      return { edge, side: event.side };
    }) };
  }
  if (message.type === 'result') {
    const result = message.result;
    if (result?.found === false) return { result: null };
    if (result?.found !== true || !Array.isArray(result.path) || ![result.length, result.seconds, result.cost, result.visited, result.computeMs].every(positive) || !indexValue(result.visited)) throw new Error('Résultat routier invalide.');
    const path = result.path.map(key => { const id = index.get(key); if (id === undefined) throw new Error('Parcours incomplet.'); return id; });
    if (result.instructions !== undefined) {
      if (!Array.isArray(result.instructions) || result.instructions.length > 50_000 || !result.instructions.length) throw new Error('Manœuvres routières invalides.');
      let previous = 0;
      for (const step of result.instructions) {
        if (!step || !positive(step.at) || step.at < previous || step.at > result.length + 1 || !Number.isSafeInteger(step.sign) || typeof step.text !== 'string' || step.text.length > 2000 || typeof step.name !== 'string' || step.name.length > 2000) throw new Error('Manœuvre routière invalide.');
        previous = step.at;
      }
      if (result.instructions[0].at !== 0 || result.instructions.at(-1)!.sign !== 4 || Math.abs(previous - result.length) > 1) throw new Error('Manœuvres routières incomplètes.');
    }
    return { result: { ...result, path, meeting: index.get(result.meeting) ?? -1 } };
  }
  throw new Error('Message routier inconnu.');
}

export async function* nationalRoute(start: Place, end: Place, criterion: Criterion, requestId: string, signal: AbortSignal) {
  const deadline = requestDeadline(180_000, signal);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${routingApi}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: { lat: start.lat, lon: start.lon }, end: { lat: end.lat, lon: end.lon }, criterion, requestId }), signal: deadline.signal });
    if (!response.ok) {
      let message = response.status === 429 ? 'Le service est sollicité. Attendez 30 secondes puis réessayez.' : 'Le serveur routier est temporairement indisponible. Réessayez dans un instant.';
      try { const body = await response.json(); if (typeof body.error === 'string') message = body.error; } catch { /* A proxy can return HTML when the service is down. */ }
      throw new Error(message);
    }
    reader = response.body?.getReader();
    if (!reader) throw new Error('Flux routier indisponible.');
    const decoder = new TextDecoder(); let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 16 * 1024 * 1024) throw new Error('Lot routier trop volumineux.');
      let boundary;
      while ((boundary = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, boundary); pending = pending.slice(boundary + 1);
        if (line) yield JSON.parse(line) as WireMessage | NationalMetadata;
      }
      if (done) { if (pending.trim()) throw new Error('Flux routier tronqué.'); break; }
    }
  } catch (error) {
    if (deadline.timedOut) throw new Error('Le calcul a mis trop de temps à répondre. Réessayez ou rapprochez les points.');
    throw error;
  } finally { reader?.releaseLock(); deadline.dispose(); }
}

export async function cancelNationalRoute(requestId: string) {
  const deadline = requestDeadline(3000);
  try { return await fetch(`${routingApi}/route/${encodeURIComponent(requestId)}`, { method: 'DELETE', signal: deadline.signal }); }
  catch { return undefined; }
  finally { deadline.dispose(); }
}
