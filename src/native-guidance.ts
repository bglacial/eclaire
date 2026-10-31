import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { GpsFix, NavigationRoute, RouteMatch } from './navigation';
import type { Criterion } from './types';
import type { RoadPreferences } from './settings';

export interface NativeRoutingConfig extends RoadPreferences { api: string; end: { lat: number; lon: number }; criterion: Criterion; via?: { lat: number; lon: number; at: number }; vias?: { lat: number; lon: number; at: number }[] }
export interface NativeGuidanceState { active: boolean; status: string; voice?: boolean; message?: string; nativeRerouting?: boolean; waypointReached?: boolean; waypointsReached?: number; routeVersion?: number; route?: NavigationRoute; fix?: GpsFix; match?: RouteMatch }
export const nativeGuidance = registerPlugin<{
  start(options: { route: NavigationRoute; voice: boolean; routing?: NativeRoutingConfig }): Promise<void>;
  stop(): Promise<void>;
  setVoice(options: { enabled: boolean }): Promise<void>;
  getState(): Promise<NativeGuidanceState>;
  addListener(event: 'location', callback: (state: NativeGuidanceState) => void): Promise<PluginListenerHandle>;
}>('EclaireNavigation');

// Un arrêt attend la fin d’un démarrage ou d’une demande de permission en cours.
export function guidanceCommands() {
  let pending = Promise.resolve();
  return (action: () => Promise<void>) => pending = pending.catch(() => undefined).then(action);
}
