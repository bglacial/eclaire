import { routingApi } from './national';
import type { NavigationRoute } from './navigation';
import type { NativeRoutingConfig } from './native-guidance';
import type { RoadPreferences } from './settings';
import type { Criterion, Place } from './types';

export function routingFor(route: NavigationRoute, stops: Place[], end: Place, chosen: Criterion, preferences: RoadPreferences): NativeRoutingConfig {
  const api = new URL(routingApi, location.href);
  if (!['http:', 'https:'].includes(api.protocol)) throw new Error('Service routier invalide.');
  const ats = route.waypointAts ?? (route.waypointAt !== undefined ? [route.waypointAt] : []);
  if (ats.length < stops.length) throw new Error('Les étapes du trajet sont incomplètes. Recalculez le trajet.');
  const remaining = stops.length ? ats.slice(-stops.length) : [];
  const vias = stops.map((place, i) => ({ lat: place.lat, lon: place.lon, at: remaining[i] }));
  return { api: api.href.replace(/\/$/, ''), end: { lat: end.lat, lon: end.lon }, criterion: chosen, ...preferences, ...(vias.length ? { via: vias[0], vias } : {}) };
}

