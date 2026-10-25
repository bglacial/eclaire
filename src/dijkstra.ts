import type { Criterion, ExplorationEvent, SearchGraph, SearchResult } from './types';

class MinHeap {
  private values: { node: number; cost: number }[] = [];
  push(node: number, cost: number) {
    const item = { node, cost };
    let i = this.values.length;
    this.values.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.values[parent].cost <= cost) break;
      this.values[i] = this.values[parent]; i = parent;
    }
    this.values[i] = item;
  }
  pop() {
    if (!this.values.length) return undefined;
    const min = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].cost < this.values[child].cost) child++;
        if (last.cost <= this.values[child].cost) break;
        this.values[i] = this.values[child]; i = child;
      }
      this.values[i] = last;
    }
    return min;
  }
  peek() { return this.values[0]; }
}

export function bidirectionalDijkstra(
  graph: SearchGraph,
  criterion: Criterion,
  onBatch: (events: ExplorationEvent[]) => void = () => {},
): SearchResult | null {
  const { source, target, forward, reverse } = graph;
  const count = forward.length;
  const distance = [new Float64Array(count).fill(Infinity), new Float64Array(count).fill(Infinity)];
  const parent = [new Int32Array(count).fill(-1), new Int32Array(count).fill(-1)];
  const settled = [new Uint8Array(count), new Uint8Array(count)];
  const queues = [new MinHeap(), new MinHeap()];
  distance[0][source] = 0;
  distance[1][target] = 0;
  queues[0].push(source, 0);
  queues[1].push(target, 0);
  let best = Infinity;
  let meeting = -1;
  let visited = 0;
  let events: ExplorationEvent[] = [];
  const flush = () => { if (events.length) onBatch(events); events = []; };
  const clean = (side: number) => {
    while (queues[side].peek() && (settled[side][queues[side].peek()!.node] || queues[side].peek()!.cost !== distance[side][queues[side].peek()!.node])) queues[side].pop();
  };
  const consider = (node: number) => {
    const candidate = distance[0][node] + distance[1][node];
    if (candidate < best) { best = candidate; meeting = node; }
  };
  while (true) {
    clean(0); clean(1);
    const left = queues[0].peek()?.cost ?? Infinity;
    const right = queues[1].peek()?.cost ?? Infinity;
    // A first meeting is only an upper bound; the two queue minima prove optimality.
    if (left + right >= best || !Number.isFinite(left) || !Number.isFinite(right)) break;
    const side: 0 | 1 = left <= right ? 0 : 1;
    const { node, cost } = queues[side].pop()!;
    settled[side][node] = 1;
    if (node < source) {
      visited++;
      events.push({ edge: node, side });
      if (events.length === 128) flush();
    }
    consider(node);
    for (const arc of (side === 0 ? forward : reverse)[node]) {
      const nextCost = cost + (criterion === 'time' ? arc.seconds : arc.length);
      if (!settled[side][arc.to] && nextCost < distance[side][arc.to]) {
        distance[side][arc.to] = nextCost;
        parent[side][arc.to] = node;
        queues[side].push(arc.to, nextCost);
        consider(arc.to);
      }
    }
  }
  flush();
  if (meeting === -1) return null;
  const states: number[] = [];
  for (let n = meeting; n !== -1; n = parent[0][n]) states.push(n);
  states.reverse();
  for (let n = parent[1][meeting]; n !== -1; n = parent[1][n]) states.push(n);
  let length = 0;
  let seconds = 0;
  for (let i = 1; i < states.length; i++) {
    const arc = forward[states[i - 1]].find(a => a.to === states[i])!;
    length += arc.length;
    seconds += arc.seconds;
  }
  return { path: states.filter(s => s < source), cost: best, visited, meeting, length, seconds };
}
