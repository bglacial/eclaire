import { searchFrance } from './national';
import { insertionIndex, searchAlongRoute, searchSpan, type PoiCategory, type RoutePlace } from './along-route';
import type { NavigationRoute } from './navigation';
import type { RoadPreferences } from './settings';
import type { Criterion, Place } from './types';
import { requestDeadline } from './request-deadline';

export interface TripSnapshot { tripId: number; revision: number; start: Place; end: Place; stops: Place[]; route: NavigationRoute; at: number; criterion: Criterion; preferences: RoadPreferences; guiding: boolean }
export type Detour = { seconds: number; metres: number };

export class TripWorkspace {
  private root = document.createElement('section');
  private snapshot?: TripSnapshot;
  private draft: Place[] = [];
  private pending?: AbortController;
  private search?: AbortController;
  private timer = 0;
  private generation = 0;
  private busy = false;
  private committing = false;
  private dirty = false;
  private fromAt = 0;
  private category: PoiCategory = 'fuel';
  private returnFocus?: HTMLElement;

  constructor(private read: () => Promise<TripSnapshot>, private apply: (stops: Place[], signal: AbortSignal, original: TripSnapshot, committing: () => void) => Promise<void>, private estimate: (snapshot: TripSnapshot, place: RoutePlace, signal: AbortSignal) => Promise<Detour>) {
    this.root.id = 'trip-workspace'; this.root.className = 'trip-workspace'; this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'trip-workspace-title');
    this.root.innerHTML = `<div class="trip-workspace-header"><h2 id="trip-workspace-title" tabindex="-1">Votre trajet en cours</h2><button id="trip-close" type="button">Retour à la carte</button></div>
      <p id="trip-intro">Les changements s’appliquent après confirmation.</p>
      <div class="trip-views" aria-label="Contenu du trajet"><button id="trip-view-stops" type="button" aria-pressed="true" aria-controls="trip-stops-panel">Étapes</button><button id="trip-view-places" type="button" aria-pressed="false" aria-controls="trip-places-panel">Lieux sur la route</button></div>
      <div id="trip-stops-panel"><h3>Étapes restantes</h3><ol id="trip-stops"></ol>
      <form id="trip-add-form"><label for="trip-add-search">Ajouter une adresse ou un lieu</label><input id="trip-add-search" type="search" autocomplete="off" placeholder="Une adresse, un établissement…" aria-controls="trip-suggestions"><ul id="trip-suggestions" aria-label="Lieux proposés"></ul></form>
      <p id="trip-status" role="status" aria-live="polite"></p>
      <div class="trip-workspace-actions"><button id="trip-apply" type="button" class="primary">Appliquer les étapes</button><button id="trip-refresh" type="button">Reprendre le trajet actuel</button></div></div>
      <div id="trip-places-panel" hidden><h3>Le détour avant la pause.</h3><p id="trip-area">Recherche dans les 50 prochains kilomètres, à moins de 1 km du tracé.</p>
      <div class="trip-categories"><button type="button" data-category="fuel">Stations-service</button><button type="button" data-category="parking">Parkings</button><button type="button" data-category="restaurant">Restaurants</button></div>
      <p id="trip-places-status" role="status" aria-live="polite"></p><ul id="trip-places"></ul><button id="trip-search-next" type="button" hidden>Chercher 50 km plus loin</button>
      <p class="trip-source">Lieux © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, via Photon. Jusqu’à six lieux proches du tracé sont évalués par zone, sans exhaustivité. Détours routiers estimés sur les portions d’accès et de retour au parcours, sans trafic. Vérifiez les horaires et les accès.</p></div><button id="trip-cancel-request" type="button" hidden>Annuler le calcul</button>`;
    document.querySelector('main')!.append(this.root);
    this.root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); } });
    window.addEventListener('eclaire-back', event => { if (!this.root.hidden) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); } }, { capture: true });
    this.el('trip-view-stops').addEventListener('click', () => this.section(false));
    this.el('trip-view-places').addEventListener('click', () => this.section(true));
    this.el('trip-close').addEventListener('click', () => this.close());
    this.el('trip-refresh').addEventListener('click', () => { void this.open(); });
    this.el('trip-cancel-request').addEventListener('click', () => { if (!this.committing) { this.pending?.abort(); this.el('trip-status').textContent = 'Calcul annulé, trajet actuel conservé.'; } });
    this.el('trip-add-form').addEventListener('submit', event => event.preventDefault());
    this.el('trip-add-search').addEventListener('input', () => this.suggest());
    this.el('trip-apply').addEventListener('click', () => { void this.save(); });
    this.root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.addEventListener('click', () => { void this.find(button.dataset.category as PoiCategory); }));
    this.el('trip-search-next').addEventListener('click', () => { void this.find(this.category, true); });
  }

  private section(places: boolean) {
    this.el('trip-stops-panel').hidden = places;
    this.el('trip-places-panel').hidden = !places;
    this.el('trip-view-stops').setAttribute('aria-pressed', String(!places));
    this.el('trip-view-places').setAttribute('aria-pressed', String(places));
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) { return this.root.querySelector<T>(`#${id}`)!; }
  private button(text: string, action: () => void, label = text) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button;
  }
  private controls() {
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = this.busy; });
    this.el<HTMLButtonElement>('trip-close').disabled = this.committing;
    this.el<HTMLButtonElement>('trip-cancel-request').disabled = this.committing;
    this.el('trip-cancel-request').hidden = !this.busy;
    this.el<HTMLInputElement>('trip-add-search').disabled = this.busy || !this.snapshot;
    this.el<HTMLButtonElement>('trip-apply').disabled = this.busy || !this.dirty || !this.snapshot;
    this.root.querySelectorAll<HTMLButtonElement>('[data-category], [data-route-place], #trip-search-next').forEach(button => { button.disabled = this.busy || this.dirty || !this.snapshot; });
  }
  private render() {
    const list = this.el('trip-stops'); list.replaceChildren();
    if (!this.draft.length) { const line = document.createElement('li'); line.textContent = 'Directement vers l’arrivée.'; list.append(line); }
    this.draft.forEach((place, index) => {
      const row = document.createElement('li'), name = document.createElement('span'); name.textContent = place.name;
      const move = (offset: number) => { const next = index + offset; if (next < 0 || next >= this.draft.length) return; [this.draft[index], this.draft[next]] = [this.draft[next], this.draft[index]]; this.changed(next); };
      row.append(name);
      if (index) row.append(this.button('Monter', () => move(-1), `Monter ${place.name}`));
      if (index < this.draft.length - 1) row.append(this.button('Descendre', () => move(1), `Descendre ${place.name}`));
      row.append(this.button('Retirer', () => { this.draft.splice(index, 1); this.changed(Math.min(index, this.draft.length - 1)); }, `Retirer ${place.name}`)); list.append(row);
    });
    this.controls();
  }
  private changed(focusIndex?: number) {
    this.dirty = true; this.el('trip-status').textContent = `${this.draft.length} étape${this.draft.length > 1 ? 's' : ''} à confirmer. Appliquez vos changements avant de chercher sur le nouveau parcours.`; this.render();
    if (focusIndex !== undefined) (this.el('trip-stops').children[focusIndex]?.querySelector('button') ?? this.el('trip-add-search')).focus();
  }
  private add(place: Place, index = this.draft.length) {
    if (this.busy) return;
    if (this.draft.length >= 8) { this.el('trip-status').textContent = 'Huit étapes maximum. Retirez un arrêt pour en ajouter un.'; return; }
    if (this.draft.some(stop => stop.lat === place.lat && stop.lon === place.lon)) { this.el('trip-status').textContent = 'Ce lieu figure déjà dans les étapes.'; return; }
    this.search?.abort(); clearTimeout(this.timer);
    this.draft.splice(index, 0, { ...place }); this.el<HTMLInputElement>('trip-add-search').value = ''; this.el('trip-suggestions').replaceChildren(); this.section(false); this.changed(index);
  }

  async open() {
    const opener = this.root.hidden ? document.activeElement as HTMLElement : this.returnFocus;
    this.close(true); this.returnFocus = opener;
    const generation = ++this.generation; this.section(false); this.root.hidden = false; this.busy = true; this.dirty = false;
    this.el('trip-status').textContent = 'Lecture du trajet actuel…'; this.controls(); this.el('trip-workspace-title').focus();
    try {
      const snapshot = await this.read(); if (generation !== this.generation) return;
      this.snapshot = snapshot; this.draft = snapshot.stops.map(place => ({ ...place })); this.fromAt = snapshot.at;
      this.el('trip-intro').textContent = snapshot.guiding ? 'Le guidage continue pendant la préparation. Les changements s’appliquent après confirmation.' : 'Le trajet affiché reste conservé jusqu’à l’application des changements.';
      this.el('trip-places').replaceChildren(); this.el('trip-suggestions').replaceChildren(); this.el('trip-search-next').hidden = true; this.el('trip-places-status').textContent = '';
      this.el('trip-status').textContent = `Arrivée : ${snapshot.end.name}. Huit étapes maximum.`;
    } catch (error) { this.snapshot = undefined; this.el('trip-status').textContent = error instanceof Error ? error.message : 'Trajet indisponible.'; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); if (!this.snapshot) this.el<HTMLButtonElement>('trip-apply').disabled = true; } }
  }
  close(force = false) {
    if (this.committing && !force) return;
    this.generation++; this.pending?.abort(); this.search?.abort(); clearTimeout(this.timer); this.pending = undefined;
    this.committing = false; this.busy = false; this.root.hidden = true;
    if (this.returnFocus?.isConnected && this.returnFocus.offsetParent) this.returnFocus.focus({ preventScroll: true });
  }

  private suggest() {
    this.search?.abort(); clearTimeout(this.timer); this.el('trip-suggestions').replaceChildren();
    const query = this.el<HTMLInputElement>('trip-add-search').value.trim(); if (query.length < 3) return;
    const controller = this.search = new AbortController();
    this.timer = window.setTimeout(() => {
      this.el('trip-status').textContent = 'Recherche du lieu…';
      const deadline = requestDeadline(10_000, controller.signal);
      const render = (places: Place[]) => {
        if (controller.signal.aborted) return;
        const seen = new Set<string>();
        this.el('trip-suggestions').replaceChildren(...places.filter(place => { const key = `${place.name.toLowerCase()}:${place.lat.toFixed(4)}:${place.lon.toFixed(4)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12).map(place => {
          const row = document.createElement('li'); row.append(this.button(`${place.name}${place.detail ? `, ${place.detail}` : ''}`, () => this.add(place))); return row;
        }));
        this.el('trip-status').textContent = places.length ? 'Choisissez un lieu pour l’ajouter aux étapes.' : 'Aucun lieu trouvé. Précisez la commune ou l’adresse.';
      };
      void searchFrance(query, deadline.signal, render).then(render).catch(() => { if (!controller.signal.aborted) this.el('trip-status').textContent = deadline.timedOut ? 'Recherche trop longue. Les résultats déjà reçus restent sélectionnables.' : 'Recherche indisponible. Vérifiez la connexion.'; }).finally(() => deadline.dispose());
    }, 300);
  }

  private async save() {
    if (this.busy || !this.snapshot || !this.dirty) return;
    if (this.el<HTMLInputElement>('trip-add-search').value.trim()) { this.el('trip-status').textContent = 'Choisissez le lieu dans les suggestions ou effacez la recherche avant de confirmer.'; this.el('trip-add-search').focus(); return; }
    const controller = this.pending = new AbortController(); this.busy = true; this.controls(); this.search?.abort(); clearTimeout(this.timer); this.el('trip-status').textContent = 'Calcul du nouveau trajet. Le guidage actuel continue…';
    try {
      await this.apply(this.draft.map(place => ({ ...place })), controller.signal, this.snapshot, () => { this.committing = true; this.controls(); this.el('trip-status').textContent = 'Application du nouveau trajet…'; });
      this.close(true);
    } catch (error) { if (!controller.signal.aborted) this.el('trip-status').textContent = error instanceof Error ? error.message : 'Modification impossible. Trajet actuel conservé.'; }
    finally { if (this.pending === controller) { this.pending = undefined; this.busy = false; this.committing = false; this.render(); } }
  }

  private async find(category: PoiCategory, next = false) {
    if (this.busy || this.dirty || !this.snapshot) return;
    const controller = this.pending = new AbortController(); this.busy = true; this.controls(); this.category = category; this.root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category))); this.el('trip-places').replaceChildren();
    try {
      const snapshot = await this.read(); if (controller.signal.aborted) return;
      if (snapshot.tripId !== this.snapshot.tripId) throw new Error('Un autre trajet est actif. Reprenez le trajet actuel avant de chercher.');
      this.snapshot = snapshot; this.draft = snapshot.stops.map(place => ({ ...place })); this.render(); this.fromAt = next ? Math.max(snapshot.at, this.fromAt + searchSpan) : snapshot.at;
      const end = Math.min(snapshot.route.length, this.fromAt + searchSpan);
      this.el('trip-area').textContent = `Zone de ${Math.round(this.fromAt / 1000)} à ${Math.ceil(end / 1000)} km depuis le départ du tracé, à moins de 1 km du parcours.`;
      this.el('trip-places-status').textContent = 'Recherche OpenStreetMap…';
      const places = await searchAlongRoute(snapshot.route, this.fromAt, category, controller.signal);
      const evaluated: { place: RoutePlace; detour: Detour }[] = []; let failed = 0;
      for (const [index, place] of places.entries()) {
        if (controller.signal.aborted) return;
        this.el('trip-places-status').textContent = `Calcul du détour ${index + 1} sur ${places.length}…`;
        try { const detour = await this.estimate(snapshot, place, controller.signal); evaluated.push({ place, detour }); }
        catch { if (controller.signal.aborted) return; failed++; }
      }
      if (controller.signal.aborted) return;
      evaluated.sort((a, b) => a.detour.seconds - b.detour.seconds || a.detour.metres - b.detour.metres);
      for (const { place, detour } of evaluated) {
        const row = document.createElement('li'), name = document.createElement('strong'), detail = document.createElement('p'); name.textContent = place.name;
        detail.textContent = `${place.detail}. Détour estimé : +${Math.ceil(detour.seconds / 60)} min, +${(detour.metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km.`;
        const add = this.button('Ajouter cette étape', () => { this.add(place, insertionIndex(snapshot.route, snapshot.stops, place.at)); this.el('trip-stops').scrollIntoView({ block: 'nearest' }); }, `Ajouter ${place.name} aux étapes`); add.dataset.routePlace = '';
        row.append(name, detail, add); this.el('trip-places').append(row);
      }
      this.el('trip-places-status').textContent = `${evaluated.length ? 'Lieux classés par détour routier estimé.' : 'Aucun lieu accessible confirmé dans cette zone.'}${failed ? ` ${failed} accès non confirmé${failed > 1 ? 's' : ''}.` : ''}`;
      this.el('trip-search-next').hidden = end >= snapshot.route.length;
    } catch (error) { if (!controller.signal.aborted) this.el('trip-places-status').textContent = error instanceof Error ? error.message : 'Recherche indisponible. Réessayez.'; }
    finally { if (this.pending === controller) { this.pending = undefined; this.busy = false; this.controls(); } }
  }
}
