import L from 'leaflet';
import { decodeChargingStations } from './charging-data';
import { requestDeadline } from './request-deadline';

export function installChargingMap(map: L.Map, vehicle: HTMLSelectElement) {
  const layer = L.layerGroup().addTo(map);
  const status = new L.Control({ position: 'topleft' });
  const message = document.createElement('div');
  message.className = 'charging-status'; message.setAttribute('role', 'status'); message.hidden = true;
  status.onAdd = () => message; status.addTo(map);
  let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  let cache: { bounds: L.LatLngBounds; expires: number } | undefined;
  const show = (text: string) => { message.textContent = text; message.hidden = !text; };
  const refresh = () => {
    clearTimeout(timer); controller?.abort();
    if (vehicle.value !== 'electric') { layer.clearLayers(); cache = undefined; show(''); return; }
    if (map.getZoom() < 12) { layer.clearLayers(); cache = undefined; show('Zoomez pour voir les bornes de recharge.'); return; }
    const bounds = map.getBounds();
    if (cache && cache.expires > Date.now() && cache.bounds.contains(bounds)) return;
    timer = setTimeout(async () => {
      const queryBounds = map.getBounds().pad(0.25), center = queryBounds.getCenter();
      const radius = Math.ceil(Math.max(center.distanceTo(queryBounds.getNorthWest()), center.distanceTo(queryBounds.getSouthEast())) / 1000);
      if (radius > 20) { layer.clearLayers(); show('Zoomez pour voir les bornes de recharge.'); return; }
      controller = new AbortController();
      const current = controller, deadline = requestDeadline(15_000, current.signal);
      show('Recherche des bornes…');
      try {
        const url = new URL('https://photon.komoot.io/reverse');
        url.search = new URLSearchParams({ lat: center.lat.toFixed(6), lon: center.lng.toFixed(6), radius: String(Math.max(1, radius)), limit: '100', lang: 'fr', osm_tag: 'amenity:charging_station' }).toString();
        const response = await fetch(url, { signal: deadline.signal });
        if (!response.ok) throw new Error('Service indisponible');
        const body = await response.json(), stations = decodeChargingStations(body);
        if (current.signal.aborted) return;
        layer.clearLayers();
        for (const station of stations) {
          if (!queryBounds.contains([station.lat, station.lon])) continue;
          const popup = document.createElement('div');
          for (const text of [station.name, station.address || 'Adresse non renseignée', station.power ? `Puissance : ${station.power}` : 'Puissance non renseignée', 'Disponibilité inconnue']) {
            const line = document.createElement('div'); line.textContent = text; popup.append(line);
          }
          L.marker([station.lat, station.lon], { icon: L.divIcon({ className: 'charging-marker', html: '<span aria-hidden="true">ϟ</span>', iconSize: [34, 34], iconAnchor: [17, 17] }), title: station.name, alt: station.name, bubblingMouseEvents: false }).bindPopup(popup).addTo(layer);
        }
        cache = { bounds: queryBounds, expires: Date.now() + 300_000 };
        show(body.features.length >= 100 ? 'Nombre de bornes limité : zoomez pour en voir davantage.' : layer.getLayers().length ? '' : 'Aucune borne trouvée dans cette zone.');
      } catch {
        if (!current.signal.aborted) { cache = undefined; layer.clearLayers(); show('Bornes indisponibles. Déplacez la carte pour réessayer.'); }
      } finally { deadline.dispose(); }
    }, 700);
  };
  map.on('moveend zoomend', refresh);
  window.addEventListener('eclaire-vehicle-change', refresh);
  map.on('unload', () => { clearTimeout(timer); controller?.abort(); window.removeEventListener('eclaire-vehicle-change', refresh); });
  refresh();
}
