export type Criterion = 'time' | 'distance';
export type Tags = Record<string, string>;
export interface OsmNode { id: number; lat: number; lon: number; tags?: Tags }
export interface OsmWay { id: number; nodes: number[]; tags: Tags }
export interface Restriction {
  id: number;
  tags: Tags;
  members: { type: string; ref: number; role: string }[];
}
export interface Place { name: string; lat: number; lon: number; detail?: string }
export interface Dataset {
  metadata: { name: string; bounds: number[]; osmTimestamp: string; importedAt: string; restrictionCount: number };
  nodes: OsmNode[];
  ways: OsmWay[];
  restrictions: Restriction[];
  places: Place[];
  basemap: GeoJSON.FeatureCollection;
}
export interface RoadEdge {
  id: number;
  from: number;
  to: number;
  way: number;
  name: string;
  length: number;
  seconds: number;
  speedLimit?: number;
  geometry?: [number, number][];
}
export interface RoadGraph {
  nodes: OsmNode[];
  edges: RoadEdge[];
  outgoing: number[][];
  incoming: number[][];
  restrictions: Restriction[];
  excludedWays: number;
}
export type RoadGeometry = Pick<RoadGraph, 'nodes' | 'edges'>;
export interface Arc { to: number; length: number; seconds: number }
export interface SearchGraph { forward: Arc[][]; reverse: Arc[][]; source: number; target: number }
export interface ExplorationEvent { edge: number; side: 0 | 1 }
export interface NavigationInstruction { at: number; sign: number; text: string; name: string }
export interface SearchResult {
  path: number[];
  cost: number;
  visited: number;
  meeting: number;
  length: number;
  seconds: number;
  computeMs?: number;
  instructions?: NavigationInstruction[];
}
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'batch'; run: number; events: ExplorationEvent[] }
  | { type: 'result'; run: number; result: SearchResult | null }
  | { type: 'error'; run: number; message: string };
