import { Capacitor, registerPlugin } from '@capacitor/core';
import { isPhoneDevice } from './location';

export const canGuide = (platform: string, phone: boolean) => (platform === 'android' || platform === 'ios') && phone;
export const isMobileApp = () => canGuide(Capacitor.getPlatform(), isPhoneDevice());
export interface UpdateStatus { lastCheckedAt: number; checking: boolean; status?: 'current' | 'available' | 'checking' | 'error' }
export const device = registerPlugin<{
  setKeepScreenOn(options: { enabled: boolean }): Promise<void>;
  getPipSettings(): Promise<{ supported: boolean; automatic: boolean }>;
  setPipAutomatic(options: { enabled: boolean }): Promise<void>;
  enterPip(): Promise<void>;
  getVersion(): Promise<{ version: string }>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
}>('EclaireDevice');

export function screenUpdates(set: (enabled: boolean) => Promise<void>) {
  let pending: Promise<void> = Promise.resolve();
  return (enabled: boolean) => pending = pending.catch(() => undefined).then(() => set(enabled));
}
