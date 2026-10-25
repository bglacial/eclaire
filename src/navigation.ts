import { metres } from './graph';
import type { NavigationInstruction, RoadGeometry, SearchResult } from './types';

export interface GpsFix { lat: number; lon: number; accuracy: number; timestamp: number; speed?: number | null }
interface RoutePoint { lat: number; lon: number; at: number; seconds: number }
export interface NavigationRoute { points: RoutePoint[]; instructions: NavigationInstruction[]; length: number; seconds: number }
export interface RouteMatch { at: number; seconds: number; distance: number }

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
      points.push({ lat: geometry[i][0], lon: geometry[i][1], at: at + edge.length * ratio, seconds: seconds + edge.seconds * ratio });
    }
    at += edge.length; seconds += edge.seconds;
  }
  if (Math.abs(at - result.length) > 2) throw new Error('Distance du guidage incohérente.');
  // Les temps des arêtes excluent certains coûts de virage ; conserver la durée totale du moteur.
  if (seconds) for (const p of points) p.seconds *= result.seconds / seconds;
  return { points, instructions: result.instructions, length: result.length, seconds: result.seconds };
}

export function usableFix(fix: GpsFix, now = Date.now()) {
  return Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90 && Number.isFinite(fix.lon) && Math.abs(fix.lon) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 50 && Number.isFinite(fix.timestamp)
    && now - fix.timestamp <= 15_000 && fix.timestamp <= now + 5000;
}

export function matchRoute(route: NavigationRoute, fix: GpsFix, previous?: RouteMatch, elapsed = 0): RouteMatch {
  let best: RouteMatch = { at: previous?.at ?? 0, seconds: previous?.seconds ?? 0, distance: Infinity };
  const scaleX = 111_195 * Math.cos(fix.lat * Math.PI / 180), scaleY = 111_195;
  const forward = Math.max(180, (Math.max(0, fix.speed ?? 0) + 15) * elapsed / 1000 + fix.accuracy * 2);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    const x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * scaleY;
    const px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * scaleY;
    const t = x || y ? Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y))) : 0;
    const at = a.at + (b.at - a.at) * t;
    // shortcut: rapprochement géométrique à continuité bornée ; remplacer par un map matching si voies parallèles/étagées ambiguës.
    if (previous && (at < previous.at - 60 || at > previous.at + forward)) continue;
    const distance = Math.hypot(px - x * t, py - y * t);
    if (distance < best.distance) best = { at, distance, seconds: a.seconds + (b.seconds - a.seconds) * t };
  }
  return best;
}

export class GuidanceProgress {
  match?: RouteMatch;
  private timestamp = 0;
  private arrivalSince?: number;
  constructor(readonly route: NavigationRoute) {}

  update(fix: GpsFix, now = Date.now()) {
    if (!usableFix(fix, now) || fix.timestamp <= this.timestamp) return { status: 'uncertain' as const };
    const match = matchRoute(this.route, fix, this.match, this.timestamp ? fix.timestamp - this.timestamp : 0);
    const offRoute = match.distance > Math.max(35, fix.accuracy * 1.5);
    if (offRoute) { this.arrivalSince = undefined; return { status: 'off-route' as const }; }
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
