import L from 'leaflet';
import { insertionIndex, searchAlongRoute, searchSpan, type PoiCategory, type RoutePlace } from './along-route';
import { icon } from './icons';
import { PlacePicker, type PlaceChoice } from './place-picker';
import type { NavigationRoute } from './navigation';
import type { RoadPreferences } from './settings';
import type { Criterion, Place } from './types';

export interface TripSnapshot { tripId: number; revision: number; start: Place | null; end: Place; stops: Place[]; route: NavigationRoute | null; at: number; criterion: Criterion; preferences: RoadPreferences; guiding: boolean }
export type Detour = { seconds: number; metres: number };
type Candidate = { place: RoutePlace; detour: Detour };

export class TripWorkspace {
  private root = document.createElement('dialog');
  private snapshot?: TripSnapshot;
  private draft: Place[] = [];
  private pending?: AbortController;
  private generation = 0;
  private busy = false;
  private committing = false;
  private dirty = false;
  private fromAt = 0;
  private category: PoiCategory = 'fuel';
  private returnFocus?: HTMLElement;
  private view: 'stops' | 'places' | 'detail' = 'stops';
  private routeMap?: L.Map;
  private candidates: Candidate[] = [];
  private selected?: Candidate;
  private removed?: { place: Place; index: number };
  private discard = document.createElement('dialog');

  constructor(private read: () => Promise<TripSnapshot>, private apply: (stops: Place[], signal: AbortSignal, original: TripSnapshot, committing: () => void) => Promise<void>, private estimate: (snapshot: TripSnapshot, place: RoutePlace, signal: AbortSignal) => Promise<Detour>, private picker: PlacePicker, private places: () => PlaceChoice[], private recent: () => Place[], private suggestions: () => Place[], private retryLocation: () => Promise<void>) {
    this.root.id = 'trip-workspace'; this.root.className = 'trip-workspace place-page'; this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'trip-workspace-title');
    this.root.innerHTML = `<header class="page-header"><button id="trip-close" class="text-button">${icon('back')}<span>Carte</span></button><span class="page-brand" translate="no">éclaire</span></header>
      <div class="page-content"><h1 id="trip-workspace-title" tabindex="-1">Mon trajet</h1><p id="trip-draft-badge" class="draft-badge" hidden>Modification à confirmer</p><p id="trip-intro" class="page-hint"></p>
      <div id="trip-map" class="place-preview-map" role="region" aria-label="Carte du trajet et des lieux proposés"></div>
      <div id="trip-stops-panel"><button id="trip-gps-retry" class="text-button" hidden>Réessayer le GPS</button><div id="trip-start" class="trip-anchor"></div><ol id="trip-stops"></ol><div id="trip-end" class="trip-anchor trip-end"></div>
      <button id="trip-add" class="outline-button">${icon('plus')}<span>Ajouter une étape</span></button><button id="trip-undo" class="text-button" hidden>Annuler le retrait</button>
      <p id="trip-total" class="page-hint"></p><p id="trip-detour" class="page-hint"></p></div>
      <div id="trip-places-panel" hidden><div class="segmented"><button id="trip-view-stops">Mes lieux</button><button id="trip-view-places" aria-pressed="true">Sur mon trajet</button></div>
      <div class="trip-categories"><button data-category="fuel">${icon('car')}<span>Stations-service</span></button><button data-category="charging" aria-pressed="false">${icon('bolt')}<span>Bornes de recharge</span></button><button data-category="parking">${icon('pin')}<span>Parkings</span></button><button data-category="restaurant">${icon('pin')}<span>Restaurants</span></button></div>
      <p id="trip-area" class="page-hint"></p><p id="trip-places-status" role="status" aria-live="polite"></p><ul id="trip-places" class="place-list"></ul><button id="trip-search-next" class="text-button" hidden>Chercher plus loin</button><button id="trip-places-retry" class="text-button" hidden>Réessayer la recherche</button><button id="trip-route-required" class="outline-button" hidden>Mettre à jour le trajet</button>
      <details class="trip-source"><summary>À propos des lieux proposés</summary><p>Lieux © OpenStreetMap, via Photon. Quelques lieux proches du tracé sont évalués, jusqu’à six par zone, sans exhaustivité. Les détours d’accès et de retour sont estimés sans trafic. Vérifiez les horaires et les accès.</p></details></div>
      <div id="trip-place-detail" hidden><h2 id="trip-place-name"></h2><p id="trip-place-address"></p><h3>Détour estimé</h3><p id="trip-place-detour"></p><p class="page-hint">Estimation d’accès et de retour au parcours.</p><p id="trip-place-insertion"></p><p class="page-hint">Le trajet sera mis à jour après confirmation.</p><button id="trip-place-add" class="primary">Ajouter aux étapes</button></div>
      <p id="trip-status" role="status" aria-live="polite"></p><button id="trip-refresh" class="text-button">Reprendre le trajet actuel</button><button id="trip-cancel-request" class="text-button" hidden>Annuler le calcul</button></div>
      <footer id="trip-apply-bar" class="page-actions"><button id="trip-apply" class="primary">Mettre à jour le trajet</button><button id="trip-abandon" class="text-button" hidden>Abandonner les changements</button></footer>`;
    document.body.append(this.root);
    this.discard.className = 'confirm-dialog'; this.discard.setAttribute('aria-labelledby', 'trip-discard-title');
    this.discard.innerHTML = '<h2 id="trip-discard-title">Abandonner les changements ?</h2><p>Le trajet confirmé sera conservé.</p><button id="trip-keep-editing" class="primary">Continuer la préparation</button><button id="trip-discard" class="text-button danger-text">Abandonner les changements</button>';
    document.body.append(this.discard);
    this.discard.querySelector('#trip-keep-editing')!.addEventListener('click', () => this.discard.close());
    this.discard.querySelector('#trip-discard')!.addEventListener('click', () => { this.discard.close(); this.close(true); });
    this.root.addEventListener('cancel', event => { event.preventDefault(); this.back(); });
    window.addEventListener('eclaire-back', event => {
      if (this.root.open && !this.picker.open) { event.preventDefault(); event.stopImmediatePropagation(); if (this.discard.open) this.discard.close(); else this.back(); }
    }, { capture: true });
    this.el('trip-close').addEventListener('click', () => this.back());
    this.el('trip-gps-retry').addEventListener('click', async () => { this.el<HTMLButtonElement>('trip-gps-retry').disabled = true; this.el('trip-status').textContent = 'Recherche d’une position précise…'; try { await this.retryLocation(); } finally { this.el<HTMLButtonElement>('trip-gps-retry').disabled = false; } });
    this.el('trip-add').addEventListener('click', () => this.pick());
    this.el('trip-view-stops').addEventListener('click', () => this.pick());
    this.el('trip-view-places').addEventListener('click', () => this.showPlaces());
    this.el('trip-refresh').addEventListener('click', () => { if (!this.dirty) void this.open(); else this.el('trip-status').textContent = 'Confirmez ou abandonnez vos changements avant de reprendre le trajet actuel.'; });
    this.el('trip-abandon').addEventListener('click', () => this.close());
    this.el('trip-cancel-request').addEventListener('click', () => { if (!this.committing) { this.pending?.abort(); this.el('trip-status').textContent = 'Calcul annulé, trajet actuel conservé.'; } });
    this.el('trip-apply').addEventListener('click', () => { void this.save(); });
    this.el('trip-route-required').addEventListener('click', () => { void this.save(); });
    this.el('trip-place-add').addEventListener('click', () => {
      if (!this.selected || !this.snapshot?.route) return;
      const index = insertionIndex(this.snapshot.route, this.draft, this.selected.place.at);
      const detour = this.selected.detour;
      if (this.add(this.selected.place, index)) this.el('trip-detour').textContent = `Détour estimé : ${this.detourText(detour)}. Le total sera confirmé après calcul.`;
    });
    this.el('trip-undo').addEventListener('click', () => {
      if (!this.removed || this.draft.length >= 8) return;
      const { place, index } = this.removed; this.removed = undefined; this.add(place, Math.min(index, this.draft.length)); this.el('trip-undo').hidden = true;
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.addEventListener('click', () => { void this.find(button.dataset.category as PoiCategory); }));
    this.el('trip-search-next').addEventListener('click', () => { void this.find(this.category, true); });
    this.el('trip-places-retry').addEventListener('click', () => { void this.find(this.category); });
  }

  private el<T extends HTMLElement = HTMLElement>(id: string) { return this.root.querySelector<T>(`#${id}`)!; }
  private button(label: string, action: () => void, glyph?: string) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', label); button.title = label;
    if (glyph) button.innerHTML = icon(glyph); else button.textContent = label;
    button.addEventListener('click', action); return button;
  }
  private section(view: 'stops' | 'places' | 'detail') {
    this.view = view; this.root.dataset.view = view; this.el('trip-stops-panel').hidden = view !== 'stops'; this.el('trip-places-panel').hidden = view !== 'places'; this.el('trip-place-detail').hidden = view !== 'detail';
    this.el('trip-apply-bar').hidden = view !== 'stops'; this.el('trip-refresh').hidden = view !== 'stops';
    this.el('trip-workspace-title').textContent = view === 'stops' ? 'Mon trajet' : view === 'places' ? 'Ajouter une étape' : this.selected?.place.name ?? 'Vérifier ce lieu';
    this.el('trip-close').querySelector('span')!.textContent = view === 'stops' ? 'Carte' : view === 'detail' ? 'Résultats' : 'Mon trajet';
    this.routeMap?.invalidateSize({ pan: false });
  }
  private controls() {
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = this.busy; });
    this.el<HTMLButtonElement>('trip-close').disabled = this.committing;
    this.el<HTMLButtonElement>('trip-cancel-request').disabled = this.committing;
    this.el('trip-cancel-request').hidden = !this.busy;
    this.el<HTMLButtonElement>('trip-apply').disabled = this.busy || !this.snapshot || (!this.dirty && !!this.snapshot.route);
    this.el('trip-apply').textContent = this.snapshot?.route ? 'Mettre à jour le trajet' : 'Calculer le trajet';
    this.el('trip-abandon').hidden = !this.dirty;
    this.el('trip-draft-badge').hidden = !this.dirty;
    this.el('trip-gps-retry').hidden = !!this.snapshot?.start;
    this.el<HTMLButtonElement>('trip-add').disabled = this.busy || !this.snapshot || this.draft.length >= 8;
    this.root.querySelectorAll<HTMLButtonElement>('[data-category], #trip-search-next, #trip-places-retry').forEach(button => { button.disabled = this.busy || this.dirty || !this.snapshot?.route; });
  }
  private render() {
    const list = this.el('trip-stops'); list.replaceChildren();
    this.el('trip-start').textContent = this.snapshot?.start?.name ?? 'Ma position · GPS en attente';
    this.el('trip-end').textContent = this.snapshot?.end.name ?? '';
    this.draft.forEach((place, index) => {
      const row = document.createElement('li'); row.dataset.index = String(index);
      const handle = this.button(`Déplacer ${place.name}`, () => {}, 'layers'); handle.className = 'stop-handle';
      const number = document.createElement('span'); number.className = 'stop-number'; number.textContent = String(index + 1);
      const name = document.createElement('span'); name.className = 'stop-name'; name.textContent = place.name;
      const actions = document.createElement('div'); actions.className = 'stop-controls';
      if (index) actions.append(this.button(`Monter ${place.name}`, () => this.move(index, index - 1), 'up'));
      if (index < this.draft.length - 1) actions.append(this.button(`Descendre ${place.name}`, () => this.move(index, index + 1), 'down'));
      actions.append(this.button(`Retirer ${place.name}`, () => { this.removed = { place, index }; this.draft.splice(index, 1); this.el('trip-undo').hidden = false; this.changed(Math.min(index, this.draft.length - 1)); }, 'close'));
      let origin = 0, dragging = false;
      handle.addEventListener('pointerdown', event => { origin = event.clientY; handle.setPointerCapture(event.pointerId); });
      handle.addEventListener('pointermove', event => { if (handle.hasPointerCapture(event.pointerId) && Math.abs(event.clientY - origin) > 8) { dragging = true; row.classList.add('dragging'); } });
      handle.addEventListener('pointerup', event => {
        row.classList.remove('dragging'); if (!dragging) return; dragging = false;
        const rows = Array.from(list.children); const next = rows.findIndex(item => event.clientY < item.getBoundingClientRect().bottom);
        this.move(index, next < 0 ? this.draft.length - 1 : next);
      });
      handle.addEventListener('pointercancel', () => { dragging = false; row.classList.remove('dragging'); });
      row.append(number, name, handle, actions); list.append(row);
    });
    const route = this.snapshot?.route;
    this.el('trip-total').textContent = route ? `Trajet actuel : ${Math.ceil(route.seconds / 60)} min · ${(route.length / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : 'Le trajet sera calculé après confirmation des points.';
    this.controls();
  }
  private move(index: number, next: number) {
    if (index === next || next < 0 || next >= this.draft.length || this.busy) return;
    const [place] = this.draft.splice(index, 1); this.draft.splice(next, 0, place); this.changed(next);
  }
  private changed(focusIndex?: number) {
    const original = this.snapshot?.stops ?? [];
    this.dirty = this.draft.length !== original.length || this.draft.some((place, index) => place.lat !== original[index]?.lat || place.lon !== original[index]?.lon);
    this.candidates = []; this.selected = undefined; this.el('trip-detour').textContent = '';
    this.el('trip-status').textContent = `${this.draft.length} étape${this.draft.length > 1 ? 's' : ''} à confirmer. Le total sera confirmé après calcul.`; this.render(); this.drawMap();
    if (focusIndex !== undefined) (this.el('trip-stops').children[focusIndex]?.querySelector('button') ?? this.el('trip-add')).focus({ preventScroll: true });
  }
  private add(place: Place, index = this.draft.length) {
    if (this.busy) return false;
    if (this.draft.length >= 8) { this.el('trip-status').textContent = 'Huit étapes maximum. Retirez un arrêt pour en ajouter un.'; return false; }
    const duplicate = this.draft.findIndex(stop => stop.lat === place.lat && stop.lon === place.lon);
    if (duplicate >= 0) { this.el('trip-status').textContent = 'Ce lieu figure déjà dans les étapes.'; this.el('trip-stops').children[duplicate]?.scrollIntoView({ block: 'nearest' }); return false; }
    this.draft.splice(index, 0, { ...place }); this.section('stops'); this.changed(index); return true;
  }
  private pick() {
    this.picker.show({ title: 'Ajouter une étape', confirmLabel: 'Ajouter aux étapes', places: this.places(), recent: this.recent(), suggestions: this.suggestions(), context: `Ajout avant ${this.snapshot?.end.name ?? 'l’arrivée'}`, alongRoute: () => this.showPlaces(), confirm: place => { if (!this.add(place)) throw new Error('Ce lieu est déjà dans les étapes, ou la limite de huit étapes est atteinte.'); } });
  }
  private showPlaces() {
    this.section('places'); this.drawMap();
    const required = this.dirty || !this.snapshot?.route;
    this.el('trip-route-required').hidden = !required;
    this.el('trip-route-required').textContent = this.snapshot?.route ? 'Mettre à jour le trajet' : 'Calculer un premier trajet';
    this.el('trip-places-status').textContent = required ? 'Mettez à jour le trajet pour rechercher des lieux sur ce parcours.' : 'Choisissez une catégorie pour voir quelques lieux sur le parcours.';
    this.el('trip-area').textContent = 'Sur les 50 prochains km, à moins de 1 km du tracé.';
    this.controls();
  }
  private detourText(detour: Detour) { return `+${Math.ceil(detour.seconds / 60)} min · +${(detour.metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`; }
  private preview(candidate: Candidate) {
    this.selected = candidate; this.section('detail');
    this.el('trip-place-name').textContent = candidate.place.name; this.el('trip-place-address').textContent = candidate.place.detail ?? 'Adresse non renseignée';
    this.el('trip-place-detour').textContent = this.detourText(candidate.detour);
    const index = this.snapshot?.route ? insertionIndex(this.snapshot.route, this.draft, candidate.place.at) : this.draft.length;
    this.el('trip-place-insertion').textContent = `Étape ajoutée avant ${this.draft[index]?.name ?? this.snapshot?.end.name}.`;
    this.drawMap(); this.el('trip-workspace-title').focus();
  }
  private drawMap() {
    this.routeMap?.remove();
    this.routeMap = L.map(this.el('trip-map'), { zoomControl: false });
    this.routeMap.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'national-tiles', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(this.routeMap);
    const snapshot = this.snapshot; if (!snapshot) { this.routeMap.setView([46.6, 2.4], 5); return; }
    const points = snapshot.route?.points.map(point => [point.lat, point.lon] as L.LatLngTuple) ?? [];
    if (points.length) L.polyline(points, { color: getComputedStyle(document.documentElement).getPropertyValue('--route').trim(), weight: 5, interactive: false }).addTo(this.routeMap);
    const marker = (place: Place, label: string, action?: () => void) => {
      const m = L.marker([place.lat, place.lon], { icon: L.divIcon({ className: 'trip-map-marker', html: `<span>${label}</span>`, iconSize: [32, 32] }), title: place.name, alt: place.name, keyboard: true });
      m.on('add', () => m.getElement()?.setAttribute('aria-label', place.name)); m.addTo(this.routeMap!);
      if (action) m.on('click', action);
    };
    if (snapshot.start) marker(snapshot.start, 'A'); marker(snapshot.end, 'B');
    if (this.view === 'places') this.candidates.forEach((candidate, index) => marker(candidate.place, String(index + 1), () => this.preview(candidate)));
    else if (this.view === 'detail' && this.selected) marker(this.selected.place, String(this.candidates.indexOf(this.selected) + 1));
    else this.draft.forEach((place, index) => marker(place, String(index + 1)));
    const anchors = [...points, ...(snapshot.start ? [[snapshot.start.lat, snapshot.start.lon] as L.LatLngTuple] : []), [snapshot.end.lat, snapshot.end.lon] as L.LatLngTuple, ...this.draft.map(place => [place.lat, place.lon] as L.LatLngTuple)];
    if (this.selected) anchors.push([this.selected.place.lat, this.selected.place.lon]);
    this.routeMap.fitBounds(L.latLngBounds(anchors).pad(0.15), { maxZoom: 15, animate: false });
  }

  async open() {
    const opener = document.activeElement as HTMLElement; this.close(true); this.returnFocus = opener;
    const generation = ++this.generation; this.root.hidden = false; this.root.showModal(); this.section('stops'); this.busy = true; this.dirty = false; this.removed = undefined; this.el('trip-undo').hidden = true; this.el('trip-detour').textContent = '';
    this.el('trip-status').textContent = 'Lecture du trajet actuel…'; this.controls(); this.el('trip-workspace-title').focus();
    try {
      const snapshot = await this.read(); if (generation !== this.generation) return;
      this.snapshot = snapshot; this.draft = snapshot.stops.map(place => ({ ...place })); this.fromAt = snapshot.at; this.candidates = []; this.selected = undefined;
      this.el('trip-intro').textContent = snapshot.guiding ? 'Le guidage continue pendant la préparation.' : 'Vos changements seront appliqués après confirmation.';
      this.el('trip-places').replaceChildren(); this.el('trip-search-next').hidden = true; this.el('trip-places-retry').hidden = true;
      this.el('trip-status').textContent = 'Huit étapes maximum.'; this.drawMap();
    } catch (error) { this.snapshot = undefined; this.el('trip-status').textContent = error instanceof Error ? error.message : 'Trajet indisponible.'; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  updateStart(place: Place) { if (this.snapshot && !this.snapshot.route) { this.snapshot.start = { ...place }; if (this.root.open) { this.el('trip-status').textContent = 'Position GPS disponible. Vous pouvez confirmer le trajet.'; this.render(); } } }
  locationStatus(message: string) { if (this.root.open && !this.snapshot?.start) this.el('trip-status').textContent = message; }
  private back() {
    if (this.committing) return;
    if (this.view === 'detail') { this.section('places'); this.drawMap(); }
    else if (this.view === 'places') { this.section('stops'); this.drawMap(); }
    else this.close();
  }
  close(force = false) {
    if (this.committing && !force) return;
    if (this.dirty && !force) { if (!this.discard.open) this.discard.showModal(); return; }
    this.generation++; this.pending?.abort(); this.pending = undefined; this.routeMap?.remove(); this.routeMap = undefined;
    this.committing = false; this.busy = false; this.dirty = false; this.root.hidden = true;
    if (this.root.open) this.root.close(); if (this.discard.open) this.discard.close();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }
  async calculate() { await this.open(); if (this.snapshot) await this.save(true); }
  private async save(force = false) {
    if (this.busy || !this.snapshot || (!force && !this.dirty && this.snapshot.route)) return;
    const controller = this.pending = new AbortController(); this.busy = true; this.controls(); this.el('trip-status').textContent = 'Calcul du nouveau trajet. Le trajet actuel reste conservé…';
    try {
      await this.apply(this.draft.map(place => ({ ...place })), controller.signal, this.snapshot, () => { this.committing = true; this.controls(); this.el('trip-status').textContent = 'Application du nouveau trajet…'; });
      this.close(true);
    } catch (error) { if (!controller.signal.aborted) this.el('trip-status').textContent = error instanceof Error ? error.message : 'Modification impossible. Trajet actuel conservé.'; }
    finally { if (this.pending === controller) { this.pending = undefined; this.busy = false; this.committing = false; this.render(); } }
  }
  private async find(category: PoiCategory, next = false) {
    if (this.busy || this.dirty || !this.snapshot?.route) return;
    const controller = this.pending = new AbortController(); this.busy = true; this.controls(); this.category = category; this.candidates = []; this.el('trip-places').replaceChildren(); this.el('trip-places-retry').hidden = true;
    this.root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    try {
      const snapshot = await this.read(); if (controller.signal.aborted) return;
      if (snapshot.tripId !== this.snapshot.tripId || !snapshot.route) throw new Error('Le trajet a changé. Reprenez le trajet actuel avant de chercher.');
      this.snapshot = snapshot; this.draft = snapshot.stops.map(place => ({ ...place })); this.render(); this.fromAt = next ? Math.max(snapshot.at, this.fromAt + searchSpan) : snapshot.at;
      const end = Math.min(snapshot.route.length, this.fromAt + searchSpan);
      this.el('trip-area').textContent = `De ${Math.round(this.fromAt / 1000)} à ${Math.ceil(end / 1000)} km depuis le départ, à moins de 1 km du tracé.`;
      this.el('trip-places-status').textContent = 'Recherche des lieux OpenStreetMap…';
      const places = await searchAlongRoute(snapshot.route, this.fromAt, category, controller.signal); let failed = 0;
      for (const [index, place] of places.entries()) {
        if (controller.signal.aborted) return;
        this.el('trip-places-status').textContent = `Estimation du détour ${index + 1} sur ${places.length}…`;
        try { const detour = await this.estimate(snapshot, place, controller.signal); this.candidates.push({ place, detour }); }
        catch { if (controller.signal.aborted) return; failed++; }
      }
      if (controller.signal.aborted) return;
      this.candidates.sort((a, b) => a.detour.seconds - b.detour.seconds || a.detour.metres - b.detour.metres);
      this.candidates.forEach((candidate, index) => {
        const row = document.createElement('li'); const button = this.button(`Voir ${candidate.place.name}`, () => this.preview(candidate)); button.className = 'place-row';
        button.innerHTML = `<span class="stop-number">${index + 1}</span><span><strong></strong><small></small></span>${icon('arrow')}`;
        button.querySelector('strong')!.textContent = candidate.place.name; button.querySelector('small')!.textContent = [`Détour estimé : ${this.detourText(candidate.detour)}`, candidate.place.chargingDetails].filter(Boolean).join(' · '); if (candidate.place.chargingDetails) button.setAttribute('aria-label', `Voir ${candidate.place.name}. ${button.querySelector('small')!.textContent}`); row.append(button); this.el('trip-places').append(row);
      });
      this.el('trip-places-status').textContent = `${this.candidates.length ? 'Lieux classés par détour routier estimé.' : 'Aucun lieu accessible confirmé dans cette portion. Essayez une autre catégorie ou cherchez plus loin.'}${failed ? ` ${failed} accès non confirmé${failed > 1 ? 's' : ''}.` : ''}`;
      this.el('trip-search-next').hidden = end >= snapshot.route.length;
      if (end >= snapshot.route.length && !this.candidates.length) this.el('trip-places-status').textContent += ' La fin du parcours est atteinte.';
      this.drawMap();
    } catch (error) { if (!controller.signal.aborted) { this.el('trip-places-status').textContent = error instanceof Error ? error.message : 'Recherche indisponible. Réessayez.'; this.el('trip-places-retry').hidden = false; } }
    finally { if (this.pending === controller) { this.pending = undefined; this.busy = false; this.controls(); } }
  }
}
