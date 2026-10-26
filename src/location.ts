export function isPhone(userAgent: string, mobileHint?: boolean) {
  if (/iPad|Tablet|iPod|Windows|Macintosh|X11|CrOS/i.test(userAgent)) return false;
  if (typeof mobileHint === 'boolean') return mobileHint;
  return /iPhone|Android.*Mobile/i.test(userAgent);
}

export function isPhoneDevice() {
  const browser = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return isPhone(browser.userAgent, browser.userAgentData?.mobile);
}

interface LocationPermissions { location: string; coarseLocation: string }
export async function preciseLocationPermission(geolocation: {
  checkPermissions(): Promise<LocationPermissions>;
  requestPermissions(options: { permissions: ['location'] }): Promise<LocationPermissions>;
}) {
  let permissions = await geolocation.checkPermissions();
  if (permissions.location !== 'granted') permissions = await geolocation.requestPermissions({ permissions: ['location'] });
  if (permissions.location !== 'granted') throw { code: permissions.coarseLocation === 'granted' ? 'PRECISE_LOCATION_REQUIRED' : 1 };
}

export function locationError(error: unknown) {
  const code = (error as { code?: string | number } | null)?.code;
  if (code === 'PRECISE_LOCATION_REQUIRED') return 'Activez « Position précise » dans les autorisations Android d’Éclaire, puis réessayez.';
  if (code === 'INACCURATE_POSITION') return 'La position est trop approximative. Activez « Position précise », puis réessayez ou placez le départ sur la carte.';
  if (code === 'STALE_POSITION') return 'Le téléphone a renvoyé une ancienne position. Réessayez pour obtenir un point GPS récent.';
  if (code === 1 || code === 'OS-PLUG-GLOC-0003') return 'Localisation refusée. Autorisez la position pour Éclaire dans les réglages, ou choisissez un point sur la carte.';
  if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009' || code === 'OS-PLUG-GLOC-0017') return 'Activez la localisation du téléphone, puis réessayez.';
  if (code === 3 || code === 'OS-PLUG-GLOC-0010') return 'Le signal GPS met trop de temps à arriver. Réessayez près d’une fenêtre ou à l’extérieur, ou choisissez un point sur la carte.';
  return 'Position indisponible. Vérifiez les réglages de localisation ou choisissez un point sur la carte.';
}

export function selectionPosition(position: { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number } }, now = Date.now()) {
  const { latitude: lat, longitude: lon, accuracy } = position.coords;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 150) throw { code: 'INACCURATE_POSITION' };
  if (!Number.isFinite(position.timestamp) || now - position.timestamp > 30_000 || position.timestamp > now + 5000) throw { code: 'STALE_POSITION' };
  return { lat, lon, accuracy };
}
