import { metres } from './graph';
import type { NavigationInstruction, RoadGeometry, SearchResult } from './types';

export interface GpsFix { lat: number; lon: number; accuracy: number; timestamp: number; speed?: number | null; heading?: number | null }
interface RoutePoint { lat: number; lon: number; at: number; seconds: number; speedLimit?: number }
export interface NavigationRoute { points: RoutePoint[]; instructions: NavigationInstruction[]; length: number; seconds: number; waypointAt?: number; waypointAts?: number[] }
export interface RouteMatch { at: number; seconds: number; distance: number }

export function isNavigationRoute(value: unknown): value is NavigationRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as NavigationRoute;
  if (route.waypointAts !== undefined && (!Array.isArray(route.waypointAts) || route.waypointAts.length > 8 || route.waypointAts.some((at, i, all) => !Number.isFinite(at) || at <= (all[i - 1] ?? 0) || at >= route.length))) return false;
  if (!Number.isFinite(route.length) || route.length < 1 || !Number.isFinite(route.seconds) || route.seconds < 0 || (route.waypointAt !== undefined && (!Number.isFinite(route.waypointAt) || route.waypointAt <= 0 || route.waypointAt >= route.length)) || !Array.isArray(route.points) || route.points.length < 2 || route.points.length > 1_000_000 || !Array.isArray(route.instructions) || !route.instructions.length || route.instructions.length > 50_000) return false;
  let at = -1, seconds = -1;
  for (const point of route.points) {
    if (!point || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180 || !Number.isFinite(point.at) || point.at < 0 || point.at < at || !Number.isFinite(point.seconds) || point.seconds < 0 || point.seconds < seconds || (point.speedLimit !== undefined && (!Number.isFinite(point.speedLimit) || point.speedLimit <= 0 || point.speedLimit > 250))) return false;
    at = point.at; seconds = point.seconds;
  }
  if (route.points[0].at !== 0 || route.points[0].seconds !== 0 || Math.abs(at - route.length) > 2 || Math.abs(seconds - route.seconds) > 2) return false;
  at = -1;
  for (const step of route.instructions) {
    if (!step || !Number.isFinite(step.at) || step.at < 0 || step.at < at || step.at > route.length + 1 || !Number.isSafeInteger(step.sign) || typeof step.text !== 'string' || step.text.length > 2000 || typeof step.name !== 'string' || step.name.length > 2000) return false;
    at = step.at;
  }
  return route.instructions[0].at === 0 && route.instructions.at(-1)!.sign === 4 && Math.abs(at - route.length) <= 1;
}

export function routePosition(route: NavigationRoute, at: number) {
  let low = 1, high = route.points.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (route.points[mid].at < at) low = mid + 1; else high = mid; }
  const index = low;
  const b = route.points[index] ?? route.points.at(-1)!, a = route.points[index - 1];
  const fraction = b.at > a.at ? Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at))) : 0;
  const lat = a.lat + (b.lat - a.lat) * fraction, lon = a.lon + (b.lon - a.lon) * fraction;
  const heading = (Math.atan2((b.lon - a.lon) * Math.cos(lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
  return { lat, lon, heading, speedLimit: b.speedLimit };
}

export class RecentSpeed {
  private samples: { timestamp: number; speed: number }[] = [];
  add(fix: GpsFix) {
    this.samples = this.samples.filter(sample => sample.timestamp >= fix.timestamp - 20_000);
    if (fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100) this.samples.push({ timestamp: fix.timestamp, speed: fix.speed });
  }
  mean() { return this.samples.length ? this.samples.reduce((sum, sample) => sum + sample.speed, 0) / this.samples.length : 0; }
}

export function predictedRouteAt(length: number, at: number, fix: GpsFix, averageSpeed: number, now = Date.now(), reduced = false) {
  const speed = reduced || fix.speed == null || !Number.isFinite(fix.speed) || fix.speed < 0.5 || fix.speed > 100 ? 0 : Math.max(0, averageSpeed);
  // shortcut: estimation limitée à 15 s et 300 m ; utiliser les capteurs inertiels pour les tunnels plus longs.
  return Math.min(length, at + Math.min(300, speed * Math.min(15, Math.max(0, (now - fix.timestamp) / 1000))));
}

export function navigationRoute(roads: RoadGeometry, result: SearchResult): NavigationRoute | null {
  if (!result.instructions?.length || !result.path.length || result.length < 1) return null;
  const points: RoutePoint[] = [];
  let at = 0, seconds = 0;
  for (const id of result.path) {
    const edge = roads.edges[id];
    if (!edge) throw new Error('Parcours de guidage incomplet.');
    const geometry = edge.geometry || [roads.nodes[edge.from], roads.nodes[edge.to]].map(p => [p.lat, p.lon] as [number, number]);
    const lengths = geometry.slice(1).map((p, i) => metres({ lat: geometry[i][0], lon: geometry[i][1] }, { lat: p[0], lon: p[1] }));
    const total = lengths.reduce((sum, n) => sum + n, 0);
    if (points.length && metres(points.at(-1)!, { lat: geometry[0][0], lon: geometry[0][1] }) > 2) throw new Error('Parcours de guidage discontinu.');
    if (!points.length) points.push({ lat: geometry[0][0], lon: geometry[0][1], at, seconds });
    let covered = 0;
    for (let i = 1; i < geometry.length; i++) {
      covered += lengths[i - 1];
      const ratio = total ? covered / total : i / (geometry.length - 1);
      points.push({ lat: geometry[i][0], lon: geometry[i][1], at: at + edge.length * ratio, seconds: seconds + edge.seconds * ratio, speedLimit: edge.speedLimit });
    }
    at += edge.length; seconds += edge.seconds;
  }
  if (Math.abs(at - result.length) > 2) throw new Error('Distance du guidage incohérente.');
  // Les temps des arêtes excluent certains coûts de virage ; conserver la durée totale du moteur.
  if (seconds) for (const p of points) p.seconds *= result.seconds / seconds;
  return { points, instructions: result.instructions, length: result.length, seconds: result.seconds, ...(result.waypointAt !== undefined ? { waypointAt: result.waypointAt } : {}), ...(result.waypointAts ? { waypointAts: result.waypointAts } : {}) };
}

export function usableFix(fix: GpsFix, now = Date.now()) {
  return Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90 && Number.isFinite(fix.lon) && Math.abs(fix.lon) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 50 && Number.isFinite(fix.timestamp)
    && now - fix.timestamp <= 15_000 && fix.timestamp <= now + 5000;
}

export function matchRoute(route: NavigationRoute, fix: GpsFix, previous?: RouteMatch, elapsed = 0): RouteMatch {
  let best: RouteMatch = { at: previous?.at ?? 0, seconds: previous?.seconds ?? 0, distance: Infinity };
  let bestScore = Infinity;
  const scaleX = 111_195 * Math.cos(fix.lat * Math.PI / 180), scaleY = 111_195;
  const speed = fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 ? fix.speed : 0;
  const forward = Math.max(180, (speed + 15) * elapsed / 1000 + fix.accuracy * 2);
  let first = 1;
  if (previous) {
    let low = 1, high = route.points.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (route.points[mid].at < previous.at - 60) low = mid + 1; else high = mid; }
    first = low;
  }
  for (let i = first; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    if (previous && a.at > previous.at + forward) break;
    const x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * scaleY;
    const px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * scaleY;
    const t = x || y ? Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y))) : 0;
    const at = a.at + (b.at - a.at) * t;
    if (previous && (at < previous.at - 60 || at > previous.at + forward)) continue;
    const distance = Math.hypot(px - x * t, py - y * t);
    if (distance > bestScore) continue;
    // shortcut: sans historique ni altitude fiable, les voies superposées restent ambiguës ; utiliser un vrai map matching pour identifier le niveau au départ.
    const heading = speed >= 3 && fix.heading != null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 && Math.hypot(x, y) >= 10;
    const penalty = heading ? 12.5 * (1 - Math.cos(Math.atan2(x, y) - fix.heading! * Math.PI / 180)) : 0;
    const motion = previous && elapsed > 0 && elapsed <= 15_000 && fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100
      ? Math.min(25, Math.abs(at - previous.at - speed * elapsed / 1000) * 0.25) : 0;
    const score = distance + penalty + motion + (distance > Math.max(75, fix.accuracy * 1.5) ? 100 : 0);
    if (score < bestScore) { bestScore = score; best = { at, distance, seconds: a.seconds + (b.seconds - a.seconds) * t }; }
  }
  return best;
}

export function acceptsRouteUpdate(route: NavigationRoute, origin: { lat: number; lon: number; accuracy?: number }, latest: GpsFix, now = Date.now()) {
  if (!usableFix(latest, now)) return false;
  const distance = matchRoute(route, latest).distance;
  return distance <= 75 || (distance <= 2000 && metres(origin, latest) <= Math.max(50, (origin.accuracy ?? 0) + latest.accuracy));
}

export class GuidanceProgress {
  match?: RouteMatch;
  private timestamp = 0;
  private lastSeen = 0;
  private arrivalSince?: number;
  constructor(readonly route: NavigationRoute) {}

  update(fix: GpsFix, now = Date.now()) {
    if (!usableFix(fix, now) || fix.timestamp <= this.lastSeen) return { status: 'uncertain' as const };
    this.lastSeen = fix.timestamp;
    const match = matchRoute(this.route, fix, this.match, this.timestamp ? fix.timestamp - this.timestamp : 0);
    const offRoute = match.distance > Math.max(75, fix.accuracy * 1.5);
    if (offRoute) {
      this.arrivalSince = undefined;
      if (!this.match && match.distance <= 2000) return { status: 'approach' as const, match };
      return { status: 'off-route' as const };
    }
    this.match = match; this.timestamp = fix.timestamp;
    const remaining = Math.max(0, this.route.length - match.at);
    const end = this.route.points.at(-1)!;
    const nearArrival = remaining < 35 && metres(fix, end) < 30 && fix.accuracy <= 25 && (fix.speed == null || fix.speed <= 3);
    this.arrivalSince = nearArrival ? this.arrivalSince ?? fix.timestamp : undefined;
    if (this.arrivalSince !== undefined && fix.timestamp - this.arrivalSince >= 3000) return { status: 'arrived' as const, remaining: 0, seconds: 0 };
    const found = this.route.instructions.findIndex(step => step.at > match.at - 8);
    const nextIndex = found < 0 ? this.route.instructions.length - 1 : found;
    const next = this.route.instructions[nextIndex] ?? this.route.instructions.at(-1)!;
    return { status: 'on-route' as const, next, nextIndex, toTurn: Math.max(0, next.at - match.at), remaining, seconds: Math.max(0, this.route.seconds - match.seconds) };
  }
}

export function guidanceDistance(value: number) {
  return value >= 1000 ? `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : `${Math.max(0, Math.round(value / 10) * 10)} m`;
}
