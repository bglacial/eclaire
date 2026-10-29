import { requestDeadline } from './request-deadline';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export async function deployedVersion() {
  const deadline = requestDeadline(10_000);
  try {
    let data: unknown;
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({ url: 'https://eclaire.nriault.fr/version.json', connectTimeout: 10_000, readTimeout: 10_000, headers: { 'Cache-Control': 'no-cache' } });
      if (response.status !== 200) throw new Error('Version indisponible.');
      data = response.data;
    } else {
      const response = await fetch('/version.json', { cache: 'no-store', signal: deadline.signal });
      if (!response.ok) throw new Error('Version indisponible.');
      data = await response.json();
    }
    const version = (data as { version?: unknown } | null)?.version;
    if (typeof version !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-(?:alpha|beta|rc)\.\d{1,6})?$/.test(version)) throw new Error('Version invalide.');
    return version;
  } finally { deadline.dispose(); }
}

export function lastUpdateCheck(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8.64e15 ? timestamp : 0;
}

export function updateCheckDate(timestamp: number) {
  return timestamp ? new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Jamais';
}
