import { icon } from './icons';
import { PlacePicker, type PlaceChoice } from './place-picker';
import { readPlaces, rememberPlace, savePlaces } from './saved-places';
import type { Place } from './types';

export class SavedPlacesUI {
  private data = (() => { try { return readPlaces(localStorage); } catch { return { favorites: [], recent: [] } as ReturnType<typeof readPlaces>; } })();
  private root = document.createElement('dialog');
  private undoData?: ReturnType<typeof readPlaces>;
  private returnFocus?: HTMLElement;

  constructor(private picker: PlacePicker, private choose: (place: Place) => void, private announce: (message: string) => void) {
    this.root.id = 'saved-places-page'; this.root.className = 'place-page'; this.root.setAttribute('aria-labelledby', 'saved-places-title');
    this.root.innerHTML = `<header class="page-header"><button id="saved-places-close" class="text-button">${icon('back')}<span>Carte</span></button><span class="page-brand" translate="no">éclaire</span></header><div class="page-content"><h1 id="saved-places-title">Mes lieux</h1><div id="saved-places-list"></div><button id="save-favorite" class="outline-button">${icon('plus')}<span>Enregistrer un lieu</span></button><h2>Récents</h2><div id="saved-recent-list"></div><button id="clear-recent" class="text-button">Effacer les récents</button><p id="saved-places-status" role="status" aria-live="polite"></p><button id="saved-places-undo" class="text-button" hidden>Annuler la suppression</button><p class="page-hint">Ces lieux restent sur cet appareil.</p></div>`;
    document.body.append(this.root);
    this.el('saved-places-close').addEventListener('click', () => this.close());
    this.root.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    window.addEventListener('eclaire-back', event => {
      if (this.root.open && !picker.open) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
    }, { capture: true });
    this.el('save-favorite').addEventListener('click', () => this.define());
    this.el('clear-recent').addEventListener('click', () => {
      if (confirm('Effacer les destinations récentes sur cet appareil ?')) this.update(data => { data.recent = []; }, 'Destinations récentes effacées.', true);
    });
    this.el('saved-places-undo').addEventListener('click', () => {
      if (!this.undoData) return;
      const previous = this.undoData;
      if (this.update(data => Object.assign(data, previous), 'Suppression annulée.')) { this.undoData = undefined; this.el('saved-places-undo').hidden = true; }
    });
    for (const slot of ['home', 'work'] as const) document.getElementById(`shortcut-${slot}`)!.addEventListener('click', () => {
      const place = this.data[slot]; if (place) choose(place); else this.define(slot);
    });
    document.getElementById('open-saved-places')!.addEventListener('click', () => this.open());
    this.render();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string) { return this.root.querySelector<T>(`#${id}`)!; }
  get recent() { return this.data.recent; }
  choices(): PlaceChoice[] {
    return [...(['home', 'work'] as const).flatMap(slot => this.data[slot] ? [{ label: slot === 'home' ? 'Domicile' : 'Travail', place: this.data[slot]! }] : []), ...this.data.favorites.map(place => ({ place }))];
  }

  remember(place: Place) { this.update(data => rememberPlace(data, place), ''); }

  private update(change: (data: ReturnType<typeof readPlaces>) => void, message: string, undo = false) {
    const next = structuredClone(this.data); change(next);
    try { savePlaces(localStorage, next); }
    catch { this.el('saved-places-status').textContent = 'Impossible de mémoriser ces lieux sur cet appareil. Réessayez.'; this.announce('Impossible de mémoriser les lieux sur cet appareil.'); return false; }
    if (undo) { this.undoData = structuredClone(this.data); this.el('saved-places-undo').hidden = false; }
    else { this.undoData = undefined; this.el('saved-places-undo').hidden = true; }
    this.data = next; this.render(); this.el('saved-places-status').textContent = message;
    if (message) this.announce(message); return true;
  }

  private define(slot?: 'home' | 'work', favorite?: Place) {
    if (!slot && !favorite && this.data.favorites.length >= 20) { this.el('saved-places-status').textContent = 'Vingt favoris maximum. Retirez un lieu pour en ajouter un.'; return; }
    const label = slot === 'home' ? 'domicile' : 'travail';
    this.picker.show({ title: slot ? `Définir mon ${label}` : favorite ? 'Modifier ce lieu' : 'Enregistrer un lieu', confirmLabel: slot ? `Enregistrer mon ${label}` : 'Enregistrer ce lieu', initial: slot ? this.data[slot] : favorite, places: this.choices(), recent: this.recent, context: 'Enregistré sur cet appareil', confirm: place => {
      const ok = this.update(data => {
        if (slot) data[slot] = place;
        else if (favorite) data.favorites[data.favorites.findIndex(item => item.lat === favorite.lat && item.lon === favorite.lon)] = place;
        else if (!data.favorites.some(item => item.lat === place.lat && item.lon === place.lon)) data.favorites.push(place);
      }, slot ? `${slot === 'home' ? 'Domicile' : 'Travail'} enregistré.` : 'Lieu enregistré.');
      if (!ok) throw new Error('Impossible d’enregistrer ce lieu sur cet appareil. Réessayez.');
    } });
  }

  private row(place: Place, label = place.name, slot?: 'home' | 'work') {
    const row = document.createElement('div'); row.className = 'saved-place';
    const choose = document.createElement('button'); choose.className = 'place-row';
    choose.innerHTML = `${icon(slot === 'home' ? 'home' : slot === 'work' ? 'work' : 'bookmark')}<span><strong></strong><small></small></span>${icon('arrow')}`;
    choose.querySelector('strong')!.textContent = label;
    choose.querySelector('small')!.textContent = label === place.name ? place.detail ?? '' : [place.name, place.detail].filter(Boolean).join(' · ');
    choose.addEventListener('click', () => { this.close(); this.choose(place); });
    const actions = document.createElement('details'); actions.className = 'place-actions';
    const summary = document.createElement('summary'); summary.innerHTML = `${icon('edit')}<span>Modifier</span>`; summary.setAttribute('aria-label', `Modifier ${label}`);
    const edit = document.createElement('button'); edit.textContent = 'Modifier l’adresse'; edit.addEventListener('click', () => this.define(slot, slot ? undefined : place));
    const remove = document.createElement('button'); remove.textContent = `Retirer ${slot ? label.toLowerCase() : 'ce favori'}`; remove.className = 'danger-text'; remove.setAttribute('aria-label', slot ? `Supprimer ${label.toLowerCase()}` : `Supprimer ${label} des favoris`);
    remove.addEventListener('click', () => this.update(data => {
      if (slot) delete data[slot]; else data.favorites = data.favorites.filter(item => item.lat !== place.lat || item.lon !== place.lon);
    }, `${label} retiré des lieux enregistrés.`, true));
    actions.append(summary, edit, remove); row.append(choose, actions); return row;
  }

  private render() {
    const list = this.el('saved-places-list'); list.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = 'Mes raccourcis'; list.append(heading);
    for (const [slot, label] of [['home', 'Domicile'], ['work', 'Travail']] as const) {
      const place = this.data[slot];
      const shortcut = document.getElementById(`shortcut-${slot}`)!;
      shortcut.querySelector('small')!.textContent = place ? 'Y aller' : 'Définir';
      shortcut.setAttribute('aria-label', place ? `Aller au ${label.toLowerCase()}` : `Définir mon ${label.toLowerCase()}`);
      if (place) list.append(this.row(place, label, slot));
      else {
        const button = document.createElement('button'); button.className = 'place-row'; button.innerHTML = `${icon(slot === 'home' ? 'home' : 'work')}<span><strong>${label}</strong><small>Définir</small></span>${icon('arrow')}`;
        button.addEventListener('click', () => this.define(slot)); list.append(button);
      }
    }
    const favorites = document.createElement('h2'); favorites.textContent = 'Favoris'; list.append(favorites);
    if (!this.data.favorites.length) { const empty = document.createElement('p'); empty.className = 'page-hint'; empty.textContent = 'Enregistrez un lieu pour le retrouver ici.'; list.append(empty); }
    for (const place of this.data.favorites) list.append(this.row(place));
    this.el('saved-recent-list').replaceChildren();
    const homeRecent = document.getElementById('home-recent')!; homeRecent.replaceChildren();
    for (const place of this.data.recent) {
      const button = document.createElement('button'); button.className = 'place-row';
      button.innerHTML = `${icon('pin')}<span><strong></strong><small></small></span>${icon('arrow')}`;
      button.querySelector('strong')!.textContent = place.name; button.querySelector('small')!.textContent = place.detail ?? '';
      button.addEventListener('click', () => { this.close(); this.choose(place); }); this.el('saved-recent-list').append(button);
      if (homeRecent.children.length < 2) { const recent = button.cloneNode(true) as HTMLButtonElement; recent.addEventListener('click', () => this.choose(place)); homeRecent.append(recent); }
    }
    document.getElementById('home-recent-section')!.hidden = !this.data.recent.length;
    this.el('clear-recent').hidden = !this.data.recent.length;
  }

  open() { this.returnFocus = document.activeElement as HTMLElement; this.root.showModal(); this.root.scrollTop = 0; this.el('saved-places-close').focus(); }
  close() { if (this.root.open) this.root.close(); if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true }); }
}
