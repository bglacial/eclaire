export const motion = { travel: 180, trail: 900, converge: 500, shock: 500, reveal: 900, fade: 200 } as const;
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const easeOutQuint = (value: number) => 1 - (1 - clamp01(value)) ** 5;

export function trailOpacity(age: number, travel: number): number {
  return age < 0 ? 0 : clamp01(1 - Math.max(0, age - travel) / motion.trail) ** 2;
}

export function confirmationPhase(elapsed: number, reduced: boolean) {
  return {
    convergence: reduced ? 1 : clamp01(elapsed / motion.converge),
    shock: reduced ? 1 : clamp01((elapsed - motion.converge) / motion.shock),
    reveal: reduced ? 1 : clamp01((elapsed - motion.converge - motion.shock / 2) / motion.reveal),
    branches: 1 - easeOutQuint(elapsed / (reduced ? motion.fade : motion.converge + motion.fade)),
    done: elapsed >= (reduced ? motion.fade : motion.converge + motion.shock / 2 + motion.reveal),
  };
}

export interface PixelPoint { x: number; y: number }
export function measureLine(points: PixelPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, distances, length: distances.at(-1) || 0 };
}
export type MeasuredLine = ReturnType<typeof measureLine>;

export function pointAlong(line: MeasuredLine, fraction: number): PixelPoint | undefined {
  if (!line.points.length) return undefined;
  const distance = line.length * clamp01(fraction);
  for (let i = 1; i < line.points.length; i++) {
    if (line.distances[i] < distance) continue;
    const amount = (distance - line.distances[i - 1]) / (line.distances[i] - line.distances[i - 1] || 1);
    return { x: line.points[i - 1].x + (line.points[i].x - line.points[i - 1].x) * amount, y: line.points[i - 1].y + (line.points[i].y - line.points[i - 1].y) * amount };
  }
  return line.points.at(-1);
}
