import type { ExplorationEvent, RoadGeometry, SearchResult } from './types';

export type RouteLeg = { geometry: RoadGeometry; events: ExplorationEvent[]; result: SearchResult };

export function combineLegs(first: RouteLeg, second: RouteLeg): RouteLeg {
  const geometry: RoadGeometry = { nodes: [...first.geometry.nodes], edges: [...first.geometry.edges] };
  const nodeOffset = geometry.nodes.length, edgeOffset = geometry.edges.length;
  geometry.nodes.push(...second.geometry.nodes.map((node, index) => ({ ...node, id: nodeOffset + index })));
  geometry.edges.push(...second.geometry.edges.map((edge, index) => ({ ...edge, id: edgeOffset + index, from: edge.from + nodeOffset, to: edge.to + nodeOffset })));
  const a = first.result, b = second.result;
  const instructions = a.instructions && b.instructions ? [
    ...a.instructions.slice(0, -1),
    { at: a.length, sign: 0, text: 'Vous arrivez à l’étape', name: '' },
    ...b.instructions.slice(1).map(step => ({ ...step, at: a.length + step.at })),
  ] : undefined;
  return { geometry, events: [...first.events, ...second.events.map(event => ({ ...event, edge: event.edge + edgeOffset }))], result: {
    path: [...a.path, ...b.path.map(id => id + edgeOffset)], cost: a.cost + b.cost, visited: a.visited + b.visited,
    meeting: b.meeting < 0 ? a.meeting : b.meeting + edgeOffset, length: a.length + b.length, seconds: a.seconds + b.seconds,
    computeMs: (a.computeMs ?? 0) + (b.computeMs ?? 0), instructions, waypointAt: a.length,
  } };
}
