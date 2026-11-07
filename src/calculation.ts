import { navigationRoute, isNavigationRoute } from './navigation';
import { decodeNationalMessage, isInFrance, nationalRoute } from './national';
import { combineLegs, type RouteLeg } from './waypoint';
import type { RoadPreferences } from './settings';
import type { Criterion, ExplorationEvent, Place, RoadGeometry, SearchResult } from './types';

async function fetchLeg(start: Place, end: Place, preference: Criterion, signal: AbortSignal, setId: (id: string) => void, preferences: RoadPreferences) {
  const geometry: RoadGeometry = { nodes: [], edges: [] }, index = new Map<number, number>(), events: ExplorationEvent[] = [];
  let found: SearchResult | null | undefined, stride = 1, snapped: { lat: number; lon: number; distance: number }[] | undefined;
  const id = crypto.randomUUID(); setId(id);
  for await (const message of nationalRoute(start, end, preference, id, signal, preferences)) {
    if ('snapped' in message) {
      if (!Array.isArray(message.snapped) || message.snapped.length !== 2 || !message.snapped.every(isInFrance) || !Number.isInteger(message.traceStride) || message.traceStride < 1) throw new Error('Métadonnées routières invalides.');
      snapped = message.snapped; stride = message.traceStride; continue;
    }
    const decoded = decodeNationalMessage(message, geometry, index);
    if (decoded.events) events.push(...decoded.events);
    if ('result' in decoded) found = decoded.result;
  }
  if (!found || !snapped) throw new Error('Aucun itinéraire trouvé pour une portion du trajet.');
  return { geometry, events, result: found, stride, snapped };
}

export async function fetchJourney(start: Place, stops: Place[], end: Place, preference: Criterion, signal: AbortSignal, setId: (id: string) => void, preferences: RoadPreferences) {
  if (stops.length > 8) throw new Error('Huit étapes maximum.');
  let combined: RouteLeg | undefined, from = start, stride = 1;
  for (const to of [...stops, end]) {
    if (signal.aborted) throw new DOMException('Calcul annulé.', 'AbortError');
    const leg = await fetchLeg(from, to, preference, signal, setId, preferences);
    if (leg.result.length < 1) throw new Error('Deux étapes se raccordent au même point routier. Retirez ou déplacez l’un des arrêts.');
    combined = combined ? combineLegs(combined, leg) : leg; from = to; stride = Math.max(stride, leg.stride);
  }
  const route = combined && navigationRoute(combined.geometry, combined.result);
  if (!combined || !route || !isNavigationRoute(route)) throw new Error('Le trajet ne permet pas le guidage.');
  return { ...combined, stride };
}

