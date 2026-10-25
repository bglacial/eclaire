import { buildSearchGraph } from './graph';
import { bidirectionalDijkstra } from './dijkstra';
import type { Criterion, RoadGraph, WorkerResponse } from './types';

let roads: RoadGraph;
const send = (message: WorkerResponse) => self.postMessage(message);
self.onmessage = ({ data }: MessageEvent<{ type: string; roads?: RoadGraph; run: number; start: number; end: number; criterion: Criterion }>) => {
  if (data.type === 'init') { roads = data.roads!; send({ type: 'ready' }); return; }
  const { run, start, end, criterion } = data;
  try {
    const began = performance.now();
    const graph = buildSearchGraph(roads, start, end);
    const result = bidirectionalDijkstra(graph, criterion, events => send({ type: 'batch', run, events }));
    if (result) result.computeMs = performance.now() - began;
    send({ type: 'result', run, result });
  } catch { send({ type: 'error', run, message: 'Le calcul a échoué. Relancez l’exploration.' }); }
};
