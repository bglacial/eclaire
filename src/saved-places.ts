import type { Place } from './types';
import { isInFrance } from './national';

type SavedPlaces = { home?: Place; work?: Place; favorites: Place[]; recent: Place[] };
const key = 'eclaire.destinations';
const valid = (value: unknown): value is Place => {
  if (!value || typeof value !== 'object') return false;
  const place = value as Place;
  return typeof place.name === 'string' && place.name.length > 0 && place.name.length <= 300 &&
    (place.detail === undefined || typeof place.detail === 'string' && place.detail.length <= 500) && isInFrance(place);
};

export function readPlaces(storage: Storage): SavedPlaces {
  try {
    const data = JSON.parse(storage.getItem(key) || '{}');
    return { home: valid(data.home) ? data.home : undefined, work: valid(data.work) ? data.work : undefined,
      favorites: Array.isArray(data.favorites) ? data.favorites.filter(valid).slice(0, 20) : [],
      recent: Array.isArray(data.recent) ? data.recent.filter(valid).slice(0, 8) : [] };
  } catch { return { favorites: [], recent: [] }; }
}

export function savePlaces(storage: Storage, places: SavedPlaces) { storage.setItem(key, JSON.stringify(places)); }
export function rememberPlace(places: SavedPlaces, place: Place) {
  places.recent = [place, ...places.recent.filter(item => item.lat !== place.lat || item.lon !== place.lon)].slice(0, 8);
}
