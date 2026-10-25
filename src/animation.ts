import L from 'leaflet';
import type { ExplorationEvent, RoadGeometry, SearchResult } from './types';
import { clamp01, confirmationPhase, easeOutQuint, measureLine, motion, pointAlong, trailOpacity, type MeasuredLine, type PixelPoint } from './animation-timing';

const colors = ['#66e6ec', '#ffbc70'];
interface Trail extends ExplorationEvent { at: number }

export class ExplorationRenderer {
  private canvas = document.createElement('canvas');
  private visitedCanvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private visitedCtx = this.visitedCanvas.getContext('2d')!;
  private projected: (L.Point | undefined)[] = [];
  private lines = new Map<number, MeasuredLine>();
  private trails: Trail[] = [];
  private seen = [new Set<number>(), new Set<number>()];
  private result: SearchResult | null = null;
  private finalLine: MeasuredLine | null = null;
  private meetingFraction = 0;
  private completedAt = 0;
  private interruptedAt = 0;
  private frame = 0;
  private dpr = 1;
  private moving = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  lite = (navigator as Navigator & { deviceMemory?: number }).deviceMemory !== undefined && (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4;

  constructor(private map: L.Map, private roads: RoadGeometry) {
    this.canvas.className = 'exploration-canvas leaflet-zoom-hide';
    this.canvas.setAttribute('aria-hidden', 'true');
    const pane = map.getPane('exploration') || map.createPane('exploration');
    pane.style.zIndex = '450'; pane.style.pointerEvents = 'none'; pane.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    map.on('movestart', () => { this.moving = true; });
    map.on('moveend zoomend resize', () => { this.moving = false; this.project(); });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { this.reduced = e.matches; this.wake(); });
    this.project();
  }
  get reducedMotion() { return this.reduced; }
  setLite(value: boolean) { this.lite = value; this.project(); }
  setGraph(roads: RoadGeometry) { this.roads = roads; this.clear(); this.project(); }

  private edgeLine(id: number) {
    let line = this.lines.get(id);
    if (line) return line;
    const edge = this.roads.edges[id];
    const points = edge.geometry ? edge.geometry.map(p => this.map.latLngToContainerPoint(p)) : [edge.from, edge.to].map(index => this.projected[index] ??= this.map.latLngToContainerPoint([this.roads.nodes[index].lat, this.roads.nodes[index].lon]));
    line = measureLine(points); this.lines.set(id, line); return line;
  }

  private trace(ctx: CanvasRenderingContext2D, line: MeasuredLine, from = 0, to = 1) {
    const start = pointAlong(line, from), end = pointAlong(line, to);
    if (!start || !end) return;
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < line.points.length; i++) {
      const distance = line.distances[i];
      if (distance > from * line.length && distance < to * line.length) ctx.lineTo(line.points[i].x, line.points[i].y);
    }
    ctx.lineTo(end.x, end.y);
  }

  private cacheVisited(side: number, ids: Iterable<number>) {
    const ctx = this.visitedCtx;
    ctx.strokeStyle = colors[side]; ctx.lineWidth = this.lite ? 1.2 : 1.6;
    ctx.globalAlpha = 0.25; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for (const id of ids) this.trace(ctx, this.edgeLine(id)); ctx.stroke(); ctx.globalAlpha = 1;
  }

  private project() {
    const size = this.map.getSize();
    L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]));
    this.dpr = this.lite ? 1 : Math.min(devicePixelRatio, 2);
    for (const canvas of [this.canvas, this.visitedCanvas]) { canvas.width = size.x * this.dpr; canvas.height = size.y * this.dpr; }
    this.canvas.style.width = `${size.x}px`; this.canvas.style.height = `${size.y}px`;
    for (const ctx of [this.ctx, this.visitedCtx]) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.projected = []; this.lines.clear(); this.finalLine = null;
    this.seen.forEach((ids, side) => this.cacheVisited(side, ids)); this.wake();
  }

  clear() {
    this.trails = []; this.seen.forEach(s => s.clear()); this.result = null; this.finalLine = null;
    this.completedAt = 0; this.interruptedAt = 0;
    this.visitedCtx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.wake();
  }
  interrupt() { this.interruptedAt = performance.now(); this.wake(); }
  visit(events: ExplorationEvent[], now: number) {
    const fresh = [[], []] as number[][];
    for (const event of events) {
      if (this.seen[event.side].has(event.edge)) continue;
      this.seen[event.side].add(event.edge); fresh[event.side].push(event.edge); this.trails.push({ ...event, at: now });
    }
    if (!this.moving) fresh.forEach((ids, side) => this.cacheVisited(side, ids)); this.wake();
  }
  finish(result: SearchResult) { this.result = result; this.completedAt = performance.now(); this.finalLine = null; this.wake(); }
  private wake() { if (!this.frame) this.frame = requestAnimationFrame(time => this.draw(time)); }

  private glow(point: PixelPoint | undefined, color: string, alpha: number, size = 2) {
    if (!point || alpha <= 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = this.lite ? 0 : 12;
    ctx.beginPath(); ctx.arc(point.x, point.y, size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }

  private buildFinalLine() {
    const points: PixelPoint[] = [];
    let length = 0, meeting = 0;
    for (const id of this.result!.path) {
      const line = this.edgeLine(id); points.push(...line.points); length += line.length;
      if (id === this.result!.meeting) meeting = length;
    }
    this.finalLine = measureLine(points); this.meetingFraction = length ? clamp01(meeting / length) : 0;
  }

  private draw(now: number) {
    this.frame = 0;
    if (this.moving) return;
    const ctx = this.ctx, animate = !this.reduced;
    const elapsed = this.result ? now - this.completedAt : 0;
    const phase = confirmationPhase(elapsed, this.reduced);
    const stopFade = this.interruptedAt ? 1 - clamp01((now - this.interruptedAt) / motion.fade) : 1;
    this.trails = this.trails.filter(t => now - t.at < motion.trail + 280);
    const width = this.canvas.width / this.dpr, height = this.canvas.height / this.dpr;
    ctx.clearRect(0, 0, width, height); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = this.result ? phase.branches * 0.92 + 0.035 : 1; ctx.drawImage(this.visitedCanvas, 0, 0, width, height);

    if (animate && stopFade > 0) {
      const active = this.trails.slice(this.lite ? -70 : -320); ctx.globalCompositeOperation = 'screen';
      for (const trail of active) {
        const line = this.edgeLine(trail.edge), travel = Math.min(280, motion.travel + line.length * 0.8), age = now - trail.at;
        const opacity = trailOpacity(age, travel) * stopFade * (this.result ? phase.branches : 1);
        if (opacity < 0.01) continue;
        const progress = clamp01(age / travel);
        const start = trail.side === 0 ? Math.max(0, progress - 0.65) : 1 - progress;
        const end = trail.side === 0 ? progress : Math.min(1, 1 - progress + 0.65);
        ctx.globalAlpha = opacity * 0.85; ctx.strokeStyle = colors[trail.side]; ctx.lineWidth = this.lite ? 2 : 2.5;
        ctx.shadowColor = colors[trail.side]; ctx.shadowBlur = this.lite ? 0 : 9;
        ctx.beginPath(); this.trace(ctx, line, start, end); ctx.stroke(); ctx.shadowBlur = 0;
        if (age < travel + 150) this.glow(pointAlong(line, trail.side === 0 ? progress : 1 - progress), line.length < 8 ? colors[trail.side] : '#eafff7', opacity, this.lite ? 0.7 : Math.min(1.8, Math.max(0.7, line.length * 0.18)));
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.result?.path.length) {
      if (!this.finalLine) this.buildFinalLine();
      const line = this.finalLine!, meet = this.meetingFraction;
      if (animate && phase.reveal < 1) {
        const left = phase.convergence * meet, right = 1 - phase.convergence * (1 - meet), fade = 1 - phase.reveal;
        for (const side of [0, 1]) {
          ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = colors[side]; ctx.lineWidth = 2.8;
          ctx.shadowColor = colors[side]; ctx.shadowBlur = this.lite ? 0 : 13;
          ctx.beginPath(); this.trace(ctx, line, side === 0 ? 0 : right, side === 0 ? left : 1); ctx.stroke(); ctx.shadowBlur = 0;
          this.glow(pointAlong(line, side === 0 ? left : right), colors[side], fade, 2.5);
        }
      }
      const reveal = phase.reveal;
      ctx.globalAlpha = 1; ctx.strokeStyle = '#112c30'; ctx.lineWidth = 8; ctx.beginPath(); this.trace(ctx, line, 0, reveal); ctx.stroke();
      ctx.strokeStyle = '#a2fff0'; ctx.lineWidth = this.lite ? 3 : 3.5; ctx.shadowColor = '#61e8df'; ctx.shadowBlur = this.lite ? 0 : 10;
      ctx.beginPath(); this.trace(ctx, line, 0, reveal); ctx.stroke(); ctx.shadowBlur = 0;
      if (animate && reveal > 0 && reveal < 1) this.glow(pointAlong(line, reveal), '#effff8', 1, 3);
      if (animate && phase.shock > 0 && phase.shock < 1) {
        const p = pointAlong(line, meet)!;
        ctx.globalAlpha = (1 - phase.shock) ** 2 * 0.7; ctx.strokeStyle = '#b7fff3'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5 + easeOutQuint(phase.shock) * (this.lite ? 24 : 52), 0, Math.PI * 2); ctx.stroke();
        this.glow(p, '#d9fff1', (1 - phase.shock) ** 2 * 0.6, 3);
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if ((animate && this.trails.length && stopFade > 0) || (this.result && !phase.done) || (this.interruptedAt && stopFade > 0)) this.wake();
    else if (this.interruptedAt) { this.interruptedAt = 0; this.trails = []; }
  }
}
