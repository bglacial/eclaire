import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { GpsFix, NavigationRoute, RouteMatch } from './navigation';

export interface NativeGuidanceState { active: boolean; status: string; fix?: GpsFix; match?: RouteMatch }
export const nativeGuidance = registerPlugin<{
  start(options: { route: NavigationRoute; voice: boolean }): Promise<void>;
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
