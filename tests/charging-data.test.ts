import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeChargingStations } from '../src/charging-data';

test('les bornes publiques affichent les données connues sans inventer une disponibilité', () => {
  const feature = (extra: object, coordinates: unknown[] = [2.3, 48.8]) => ({ geometry: { coordinates }, properties: { osm_key: 'amenity', osm_value: 'charging_station', name: 'Recharge', extra } });
  const stations = decodeChargingStations({ features: [feature({ 'socket:type2:output': '22 kW' }), feature({ access: 'private' }), feature({}, [999, 48])] });
  assert.deepEqual(stations, [{ lat: 48.8, lon: 2.3, name: 'Recharge', address: '', power: '22 kW' }]);
  assert.equal(decodeChargingStations({ features: [feature({})] })[0].power, '');
  assert.throws(() => decodeChargingStations({ features: null }));
});
