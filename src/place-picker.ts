import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { icon } from './icons';
import { franceBounds, isInFrance, searchFrance } from './national';
import { preciseLocationPermission, selectionPosition, locationError } from './location';
import { requestDeadline } from './request-deadline';
import type { Place } from './types';

export type PlaceChoice = { label?: string; place: Place };
type PickerOptions = {
  title: string;
  confirmLabel?: string;
  places: PlaceChoice[];
  recent?: Place[];
  suggestions?: Place[];
  initial?: Place;
  alongRoute?: () => void;
  context?: string;
  confirm: (place: Place) => boolean | void | Promise<boolean | void>;
};

export class PlacePicker {
  private root = document.createElement('dialog');
  private options?: PickerOptions;
  private selected?: Place;
  private view: 'search' | 'preview' | 'map' = 'search';
  private map?: L.Map;
  private marker?: L.Marker;
  private search?: AbortController;
  private timer = 0;
  private generation = 0;
  private busy = false;
  private returnFocus?: HTMLElement;
  private position?: { lat: number; lon: number };

  constructor() {
    this.root.id = 'place-picker'; this.root.className = 'place-page'; this.root.setAttribute('aria-labelledby', 'place-title');
    this.root.innerHTML = `<header class="page-header"><button id="place-back" class="text-button">${icon('back')}<span>Retour</span></button><span class="page-brand" translate="no">éclaire</span></header>
      <div class="page-content"><h1 id="place-title" tabindex="-1"></h1>
      <div id="place-search-panel"><form id="place-search-form"><label for="place-query">Adresse ou nom d’un lieu</label><div class="search-control">${icon('search')}<input id="place-query" type="search" autocomplete="off" spellcheck="false" placeholder="Adresse ou nom d’un lieu" aria-controls="place-results" /></div></form>
      <ul id="place-results" class="place-list" aria-label="Lieux proposés"></ul>
      <div id="place-search-actions"><button id="place-locate" class="place-row">${icon('locate')}<span>Utiliser ma position</span>${icon('arrow')}</button><button id="place-map-choice" class="place-row">${icon('pin')}<span>Choisir sur la carte</span>${icon('arrow')}</button></div>
      <div id="place-sources" class="segmented"><button id="place-saved" aria-pressed="true">Mes lieux</button><button id="place-along">Sur mon trajet</button></div>
      <div id="place-saved-list"></div></div>
      <div id="place-preview-panel" hidden><div id="place-preview-map" class="place-preview-map" role="region" aria-label="Emplacement du lieu"></div>
      <button id="place-adjust" class="text-button">${icon('locate')}<span>Ajuster sur la carte</span></button>
      <h2 id="place-name"></h2><p id="place-detail"></p><button id="place-edit" class="place-row">${icon('edit')}<span>Modifier l’adresse</span>${icon('arrow')}</button></div>
      <p id="place-status" role="status" aria-live="polite"></p><p id="place-context" class="page-hint"></p></div>
      <footer id="place-confirm-bar" class="page-actions" hidden><button id="place-confirm" class="primary"></button></footer>`;
    document.body.append(this.root);
    this.el('place-back').addEventListener('click', () => this.back());
    this.root.addEventListener('cancel', event => { event.preventDefault(); this.back(); });
    window.addEventListener('eclaire-back', event => {
      if (this.root.open) { event.preventDefault(); event.stopImmediatePropagation(); this.back(); }
    }, { capture: true });
    this.el('place-search-form').addEventListener('submit', event => event.preventDefault());
    this.el('place-query').addEventListener('input', () => this.suggest());
    this.el('place-locate').addEventListener('click', () => { void this.locate(); });
    this.el('place-map-choice').addEventListener('click', () => this.showMap());
    this.el('place-adjust').addEventListener('click', () => this.showMap(this.selected));
    this.el('place-edit').addEventListener('click', () => this.showSearch());
    this.el('place-along').addEventListener('click', () => { const action = this.options?.alongRoute; this.close(); action?.(); });
    this.el('place-confirm').addEventListener('click', () => { void this.confirm(); });
  }

  private el<T extends HTMLElement = HTMLElement>(id: string) { return this.root.querySelector<T>(`#${id}`)!; }
  setPosition(position: { lat: number; lon: number }) { this.position = position; }
  get open() { return this.root.open; }

  show(options: PickerOptions) {
    this.close(); this.options = options; this.returnFocus = document.activeElement as HTMLElement;
    this.el('place-title').textContent = options.title;
    this.el('place-context').textContent = options.context ?? '';
    this.el<HTMLInputElement>('place-query').value = '';
    this.el('place-status').textContent = '';
    this.el('place-sources').hidden = !options.alongRoute;
    this.el('place-saved-list').replaceChildren(); this.el('place-saved-list').hidden = false; this.results([]);
    this.list(this.el('place-saved-list'), options.places, options.places.length ? 'Mes lieux' : '');
    this.list(this.el('place-saved-list'), (options.recent ?? []).map(place => ({ place })), 'Récents');
    this.root.showModal(); this.showSearch();
    if (options.initial) this.preview(options.initial);
    else this.el('place-title').focus();
  }

  private list(parent: HTMLElement, choices: PlaceChoice[], title: string) {
    if (!choices.length) return;
    if (title) { const heading = document.createElement('h2'); heading.textContent = title; parent.append(heading); }
    for (const choice of choices) parent.append(this.row(choice.place, choice.label));
  }

  private row(place: Place, label = place.name) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'place-row';
    button.innerHTML = `${icon('pin')}<span><strong></strong><small></small></span>${icon('arrow')}`;
    button.querySelector('strong')!.textContent = label;
    button.querySelector('small')!.textContent = label === place.name ? place.detail ?? 'France' : [place.name, place.detail].filter(Boolean).join(' · ');
    button.addEventListener('click', () => this.preview(place)); return button;
  }

  private showSearch() {
    this.generation++; this.el<HTMLButtonElement>('place-locate').disabled = false;
    this.view = 'search'; this.map?.remove(); this.map = undefined;
    this.el('place-search-panel').hidden = false; this.el('place-preview-panel').hidden = true; this.el('place-confirm-bar').hidden = true;
    this.selected = undefined; this.el('place-status').textContent = '';
    this.el('place-query').focus({ preventScroll: true });
  }

  private preview(place: Place) {
    if (!isInFrance(place)) { this.el('place-status').textContent = 'Choisissez un lieu en France métropolitaine ou en Corse.'; return; }
    this.generation++; this.cancelSearch(); this.el<HTMLButtonElement>('place-confirm').disabled = false; this.view = 'preview'; this.selected = { ...place };
    this.el<HTMLInputElement>('place-query').blur(); this.el('place-status').textContent = '';
    this.el('place-search-panel').hidden = true; this.el('place-preview-panel').hidden = false; this.el('place-confirm-bar').hidden = false;
    this.el('place-name').textContent = place.name; this.el('place-detail').textContent = place.detail ?? '';
    this.el('place-edit').hidden = false; this.el('place-adjust').hidden = false;
    this.el('place-confirm').textContent = this.options?.confirmLabel ?? 'Utiliser ce lieu';
    this.createMap(place); this.el('place-confirm').focus({ preventScroll: true });
  }

  private createMap(place?: { lat: number; lon: number }) {
    this.map?.remove();
    this.map = L.map(this.el('place-preview-map'), { zoomControl: false, maxBounds: [[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]] });
    this.map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'national-tiles', maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(this.map);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    if (place) {
      this.map.setView([place.lat, place.lon], 16);
      this.marker = L.marker([place.lat, place.lon], { icon: L.divIcon({ className: 'choice-marker', html: icon('pin'), iconSize: [40, 48], iconAnchor: [20, 44] }) }).addTo(this.map);
    } else this.map.fitBounds([[franceBounds[0], franceBounds[1]], [franceBounds[2], franceBounds[3]]]);
  }

  private showMap(place = this.selected) {
    this.generation++; this.cancelSearch(); this.view = 'map';
    this.el('place-search-panel').hidden = true; this.el('place-preview-panel').hidden = false; this.el('place-confirm-bar').hidden = false;
    this.el('place-edit').hidden = true; this.el('place-adjust').hidden = true;
    this.el('place-name').textContent = 'Choisir sur la carte'; this.el('place-detail').textContent = 'Touchez un lieu pour placer le repère, puis confirmez.';
    this.el('place-confirm').textContent = this.options?.confirmLabel ?? 'Utiliser ce lieu';
    this.selected = place ? { ...place } : undefined;
    this.createMap(place ?? this.position);
    this.el<HTMLButtonElement>('place-confirm').disabled = !this.selected;
    this.map!.on('click', event => {
      if (!isInFrance({ lat: event.latlng.lat, lon: event.latlng.lng })) { this.el('place-status').textContent = 'Choisissez un lieu en France métropolitaine ou en Corse.'; return; }
      this.marker?.remove();
      this.selected = { name: 'Point choisi sur la carte', lat: event.latlng.lat, lon: event.latlng.lng, detail: `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}` };
      this.marker = L.marker(event.latlng, { icon: L.divIcon({ className: 'choice-marker', html: icon('pin'), iconSize: [40, 48], iconAnchor: [20, 44] }) }).addTo(this.map!);
      this.el('place-detail').textContent = this.selected.detail!; this.el('place-status').textContent = 'Lieu choisi. Confirmez pour l’utiliser.';
      this.el<HTMLButtonElement>('place-confirm').disabled = false;
    });
  }

  private suggest() {
    this.generation++; this.el<HTMLButtonElement>('place-locate').disabled = false; this.cancelSearch();
    const query = this.el<HTMLInputElement>('place-query').value.trim();
    const local = (this.options?.suggestions ?? []).filter(place => place.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))).slice(0, 6);
    this.results(local); this.el('place-saved-list').hidden = !!query;
    if (query.length < 3) { this.el('place-status').textContent = query ? 'Saisissez au moins trois caractères.' : ''; return; }
    const controller = this.search = new AbortController();
    this.timer = window.setTimeout(() => {
      this.el('place-status').textContent = 'Recherche des lieux…';
      const deadline = requestDeadline(10_000, controller.signal);
      const render = (places: Place[]) => {
        if (controller.signal.aborted) return;
        const seen = new Set<string>();
        const merged = [...places, ...local].filter(place => { const key = `${place.name}:${place.lat.toFixed(4)}:${place.lon.toFixed(4)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12);
        this.results(merged); this.el('place-status').textContent = merged.length ? 'Choisissez un lieu pour vérifier son emplacement.' : 'Aucun lieu trouvé. Précisez la commune ou choisissez sur la carte.';
      };
      void searchFrance(query, deadline.signal, render).then(render).catch(() => {
        if (!controller.signal.aborted) this.el('place-status').textContent = deadline.timedOut ? 'Recherche trop longue. Les résultats reçus restent disponibles.' : 'Recherche indisponible. Réessayez ou choisissez sur la carte.';
      }).finally(() => deadline.dispose());
    }, 300);
  }

  private results(places: Place[]) {
    this.el('place-results').replaceChildren(...places.map(place => { const item = document.createElement('li'); item.append(this.row(place)); return item; }));
  }

  private async locate() {
    const generation = ++this.generation; this.el<HTMLButtonElement>('place-locate').disabled = true;
    this.el('place-status').textContent = 'Recherche d’une position précise…';
    try {
      if (Capacitor.isNativePlatform()) await preciseLocationPermission(Geolocation);
      const position = selectionPosition(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 }));
      if (generation === this.generation) this.preview({ name: 'Position choisie', lat: position.lat, lon: position.lon, detail: `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}` });
    } catch (error) { if (generation === this.generation) this.el('place-status').textContent = locationError(error); }
    finally { if (generation === this.generation) this.el<HTMLButtonElement>('place-locate').disabled = false; }
  }

  private async confirm() {
    if (!this.selected || this.busy) return;
    this.busy = true; this.el<HTMLButtonElement>('place-confirm').disabled = true;
    try { if (await this.options?.confirm({ ...this.selected }) !== false) this.close(); }
    catch (error) { this.el('place-status').textContent = error instanceof Error ? error.message : 'Impossible de confirmer ce lieu. Réessayez.'; }
    finally { this.busy = false; this.el<HTMLButtonElement>('place-confirm').disabled = false; }
  }

  private cancelSearch() { this.search?.abort(); clearTimeout(this.timer); }
  private back() { if (this.busy) return; if (this.view === 'search') this.close(); else this.showSearch(); }
  close() {
    this.generation++; this.cancelSearch(); this.map?.remove(); this.map = undefined;
    if (this.root.open) this.root.close();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.el<HTMLButtonElement>('place-locate').disabled = false; this.el<HTMLButtonElement>('place-confirm').disabled = false;
  }
}
