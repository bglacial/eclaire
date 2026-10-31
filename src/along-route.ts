import type { NavigationRoute } from './navigation';
import type { Place } from './types';
import { requestDeadline } from './request-deadline';

export type PoiCategory = 'fuel' | 'parking' | 'restaurant';
export type RoutePlace = Place & { id: string; at: number; distance: number };
export const searchSpan = 50_000;
const searchCache = new Map<string, { expires: number; features: unknown[] }>();

export function pointAt(route: NavigationRoute, at: number): NavigationRoute['points'][number] {
  at = Math.max(0, Math.min(route.length, at));
  let low = 1, high = route.points.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (route.points[mid].at < at) low = mid + 1; else high = mid; }
  const a = route.points[low - 1], b = route.points[low], t = b.at > a.at ? Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at))) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, at, seconds: a.seconds + (b.seconds - a.seconds) * t };
}

export function projectPlace(route: NavigationRoute, place: Place, fromAt: number, toAt: number) {
  const sx = 111195 * Math.cos(place.lat * Math.PI / 180);
  let best = { distance: Infinity, at: fromAt };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    if (b.at < fromAt) continue; if (a.at > toAt) break;
    const x = (b.lon - a.lon) * sx, y = (b.lat - a.lat) * 111195;
    const px = (place.lon - a.lon) * sx, py = (place.lat - a.lat) * 111195;
    const span = b.at - a.at, min = span > 0 ? Math.max(0, (fromAt - a.at) / span) : 0, max = span > 0 ? Math.min(1, (toAt - a.at) / span) : 1;
    const t = Math.max(min, Math.min(max, x || y ? (px * x + py * y) / (x * x + y * y) : 0));
    const distance = Math.hypot(px - t * x, py - t * y);
    if (distance < best.distance) best = { distance, at: a.at + span * t };
  }
  return best;
}

export function photonRequests(route: NavigationRoute, fromAt: number, category: PoiCategory) {
  if (!['fuel', 'parking', 'restaurant'].includes(category)) throw new Error('Catégorie inconnue.');
  const end = Math.min(route.length, fromAt + searchSpan), span = end - fromAt;
  const samples = span <= 6000 ? [(fromAt + end) / 2] : [fromAt, (fromAt + end) / 2, end];
  return samples.map(at => {
    const point = pointAt(route, at), url = new URL('https://photon.komoot.io/reverse');
    url.search = new URLSearchParams({ lat: point.lat.toFixed(6), lon: point.lon.toFixed(6), radius: String(Math.ceil(span / 2000 + 1)), limit: '20', lang: 'fr', osm_tag: `amenity:${category}` }).toString();
    return url;
  });
}

export function decodePlaces(value: unknown, route: NavigationRoute, fromAt: number, category: PoiCategory): RoutePlace[] {
  const body = value as { features?: unknown[] };
  if (!body || !Array.isArray(body.features) || body.features.length > 1000) throw new Error('La recherche des lieux n’a pas abouti. Réessayez plus tard.');
  const places: RoutePlace[] = [];
  for (const element of body.features) {
    if (!element || typeof element !== 'object') continue;
    const row = element as { geometry?: { coordinates?: number[] }; properties?: { osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; name?: string; housenumber?: string; street?: string; postcode?: string; city?: string; extra?: { access?: string } } };
    const lat = row.geometry?.coordinates?.[1], lon = row.geometry?.coordinates?.[0], tags = row.properties;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat! < 41.3 || lat! > 51.2 || lon! < -5.3 || lon! > 9.7 || !tags || !Number.isSafeInteger(tags.osm_id) || !['N', 'W', 'R'].includes(tags.osm_type ?? '') || tags.osm_key !== 'amenity' || tags.osm_value !== category || tags.extra?.access === 'private' || tags.extra?.access === 'no') continue;
    const name = typeof tags.name === 'string' && tags.name.trim() ? tags.name.slice(0, 160) : category === 'fuel' ? 'Station-service' : category === 'parking' ? 'Parking' : 'Restaurant';
    const projection = projectPlace(route, { lat: lat!, lon: lon!, name }, fromAt, Math.min(route.length, fromAt + searchSpan));
    if (projection.distance > 1000) continue;
    const detail = [tags.housenumber, tags.street, tags.postcode, tags.city].map(value => typeof value === 'string' ? value.slice(0, 120) : '').filter(Boolean).join(' ');
    const id = `${tags.osm_type}/${tags.osm_id}`;
    if (places.some(place => place.id === id || (place.name === name && Math.hypot((place.lat - lat!) * 111195, (place.lon - lon!) * 111195 * Math.cos(lat! * Math.PI / 180)) < 30))) continue;
    places.push({ id, name, detail: detail || 'Adresse non renseignée dans OpenStreetMap', lat: lat!, lon: lon!, ...projection });
  }
  return places.sort((a, b) => a.distance - b.distance || a.at - b.at).slice(0, 6);
}

export async function searchAlongRoute(route: NavigationRoute, fromAt: number, category: PoiCategory, signal: AbortSignal) {
  if (!Number.isFinite(fromAt) || fromAt < 0 || fromAt >= route.length) return [];
  if (signal.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
  const deadline = requestDeadline(30_000, signal);
  try {
    const features: unknown[] = [];
    for (const url of photonRequests(route, fromAt, category)) {
      const cached = searchCache.get(url.href);
      if (cached && cached.expires > Date.now()) { features.push(...cached.features); continue; }
      const response = await fetch(url, { signal: deadline.signal });
      if (!response.ok) throw new Error(response.status === 429 ? 'Le service de lieux est sollicité. Réessayez dans un instant.' : 'Recherche des lieux indisponible. Vérifiez la connexion.');
      const body = await response.json();
      if (!Array.isArray(body?.features) || body.features.length > 1000) throw new Error('Réponse de lieux invalide.');
      if (searchCache.size >= 24) searchCache.delete(searchCache.keys().next().value!);
      searchCache.set(url.href, { expires: Date.now() + 300_000, features: body.features });
      features.push(...body.features);
    }
    return decodePlaces({ features }, route, fromAt, category);
  } catch (error) {
    if (deadline.timedOut) throw new Error('Recherche des lieux trop longue. Réessayez dans un instant.');
    throw error;
  } finally { deadline.dispose(); }
}

export function detourAnchors(route: NavigationRoute, at: number, fromAt: number) {
  const boundaries = route.waypointAts ?? (route.waypointAt ? [route.waypointAt] : []);
  const before = Math.max(fromAt, ...boundaries.filter(value => value < at), at - 2000);
  const after = Math.min(route.length, ...boundaries.filter(value => value >= at), at + 2000);
  return { start: pointAt(route, before), end: pointAt(route, after) };
}

export function insertionIndex(route: NavigationRoute, stops: Place[], at: number) {
  const ats = (route.waypointAts ?? (route.waypointAt ? [route.waypointAt] : [])).slice(-stops.length);
  return stops.length ? ats.filter(value => value < at).length : 0;
}
