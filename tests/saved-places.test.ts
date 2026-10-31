import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPlaces, rememberPlace, savePlaces } from '../src/saved-places';

test('saved destinations survive reload, stay bounded, and reject damaged entries', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as Storage;
  const places = readPlaces(storage);
  const home = { name: 'Maison', lat: 48, lon: 2 };
  places.home = home;
  places.favorites.push(home);
  for (let i = 0; i < 10; i++) rememberPlace(places, { name: `Lieu ${i}`, lat: 48 + i / 100, lon: 2 });
  rememberPlace(places, home); rememberPlace(places, home);
  savePlaces(storage, places);
  assert.equal(readPlaces(storage).home?.name, 'Maison');
  assert.equal(readPlaces(storage).favorites[0].name, 'Maison');
  assert.equal(readPlaces(storage).recent.length, 8);
  assert.equal(readPlaces(storage).recent.filter(place => place.name === 'Maison').length, 1);
  storage.setItem('eclaire.destinations', '{"home":{"name":"bad","lat":1000,"lon":2},"recent":[null]}');
  assert.deepEqual(readPlaces(storage), { home: undefined, work: undefined, favorites: [], recent: [] });
});
