export type ChargingStation = { lat: number; lon: number; name: string; address: string; power: string };

export function decodeChargingStations(value: unknown): ChargingStation[] {
  const body = value as { features?: unknown[] };
  if (!body || !Array.isArray(body.features) || body.features.length > 1000) throw new Error('Réponse invalide');
  return body.features.flatMap(feature => {
    if (!feature || typeof feature !== 'object') return [];
    const row = feature as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> };
    const [lon, lat] = row.geometry?.coordinates ?? [];
    const p = row.properties;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 || typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180 || !p || p.osm_key !== 'amenity' || p.osm_value !== 'charging_station') return [];
    const extra = p.extra && typeof p.extra === 'object' ? p.extra as Record<string, unknown> : {};
    if (extra.access === 'private' || extra.access === 'no') return [];
    const str = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 120) : '';
    const powers = Object.entries(extra).filter(([key]) => key === 'power' || key === 'output' || /^socket:[^:]+:output$/.test(key)).map(([, value]) => str(value)).filter(Boolean);
    return [{ lat, lon, name: str(p.name) || str(extra.operator) || 'Borne de recharge', address: [p.housenumber, p.street, p.postcode, p.city].map(str).filter(Boolean).join(' '), power: [...new Set(powers)].join(', ') }];
  });
}
