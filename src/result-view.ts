import { arrivalClock } from './eta';
import type { Criterion, Place, SearchResult } from './types';
import type { RoadPreferences } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let arrivalTimer = 0;

export function renderResult(result: SearchResult, selections: { start: Place | null; end: Place | null }, tripStops: Place[], chosen: Criterion, preferences: RoadPreferences, mobileApp: boolean, queueLength: number) {
  const minutes = Math.ceil(result.seconds / 60);
  clearInterval(arrivalTimer);
  const updateArrival = () => {
    const clock = arrivalClock(Date.now(), result.seconds);
    const value = clock ? `Arrivée vers ${clock} si départ maintenant` : '';
    if ($('result-arrival').textContent !== value) $('result-arrival').textContent = value;
  };
  updateArrival();
  arrivalTimer = window.setInterval(updateArrival, 60_000);
  $('result-title').textContent = selections.end?.name ?? 'Votre trajet';
  $('navigation-next-stop').textContent = tripStops[0] ? `${tripStops[0].name} · prochaine étape` : 'Vers votre destination';
  $('duration').textContent = minutes < 1 ? '< 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
  $('distance').textContent = (mobileApp || result.length >= 1000) ? `${(result.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: result.length >= 1_000_000 ? 0 : result.length >= 100_000 ? 1 : 2 })} km` : `${Math.round(result.length)} m`;
  $('result-criterion').textContent = chosen === 'time' ? 'Le plus rapide' : 'Le plus court';
  $('result-preferences').textContent = [preferences.avoidMotorways ? 'Sans autoroute' : '', preferences.avoidTolls ? 'Sans péage' : ''].filter(Boolean).join(' · ');
  $('result-preferences').hidden = !$('result-preferences').textContent;
  $('result-explanation').textContent = chosen === 'time' ? 'Ce trajet minimise le temps estimé selon les vitesses des routes, sans trafic en direct.' : 'Ce trajet minimise la distance sur les routes accessibles. La durée est estimée sans trafic en direct.';
  $('replay').hidden = queueLength === 0;
  $('route-endpoints').replaceChildren(...[{ place: selections.start!, side: 'start' }, ...tripStops.map(place => ({ place, side: 'via' })), { place: selections.end!, side: 'end' }].map(({place, side}) => {
    const line = document.createElement('p'), badge = document.createElement('span');
    badge.className = `endpoint-badge ${side}`; badge.textContent = side === 'start' ? 'A' : side === 'via' ? '•' : 'B';
    line.append(badge, document.createTextNode(place.name)); return line;
  }));
}
