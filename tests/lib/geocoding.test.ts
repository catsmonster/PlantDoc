import { describe, expect, it } from 'vitest';
import { isLikelyStreetAddressQuery, mapNominatimRows } from '../../src/lib/geocoding';

describe('mapNominatimRows', () => {
  it('keeps locality-style rows and maps administrative context', () => {
    expect(
      mapNominatimRows([
        {
          class: 'place',
          type: 'neighbourhood',
          name: 'Manuel Gomez Pedraza',
          lat: '20.6851',
          lon: '-103.3529',
          address: {
            neighbourhood: 'Manuel Gomez Pedraza',
            city: 'Guadalajara',
            county: 'Guadalajara',
            state: 'Jalisco',
            country: 'Mexico',
          },
        },
      ]),
    ).toEqual([
      {
        name: 'Manuel Gomez Pedraza',
        region: 'Jalisco',
        subregion: 'Guadalajara',
        country: 'Mexico',
        latitude: 20.6851,
        longitude: -103.3529,
      },
    ]);
  });

  it('rejects street, building, and amenity rows so addresses are not collected as locations', () => {
    expect(
      mapNominatimRows([
        {
          class: 'building',
          type: 'yes',
          name: '123 Main Street',
          lat: '20.1',
          lon: '-103.1',
          address: {
            house_number: '123',
            road: 'Main Street',
            city: 'Guadalajara',
            state: 'Jalisco',
            country: 'Mexico',
          },
        },
        {
          class: 'amenity',
          type: 'school',
          name: 'Neighborhood School',
          lat: '20.2',
          lon: '-103.2',
          address: {
            road: 'School Road',
            city: 'Guadalajara',
            state: 'Jalisco',
            country: 'Mexico',
          },
        },
        {
          class: 'highway',
          type: 'residential',
          name: 'Avenida Mexico',
          lat: '20.3',
          lon: '-103.3',
          address: {
            road: 'Avenida Mexico',
            state: 'Jalisco',
            country: 'Mexico',
          },
        },
      ]),
    ).toEqual([]);
  });
});

describe('isLikelyStreetAddressQuery', () => {
  it('rejects house-number plus street-suffix queries before proxying to a geocoder', () => {
    expect(isLikelyStreetAddressQuery('123 Main Street')).toBe(true);
    expect(isLikelyStreetAddressQuery('42 Av Mexico')).toBe(true);
    expect(isLikelyStreetAddressQuery('Manuel Gomez Pedraza')).toBe(false);
    expect(isLikelyStreetAddressQuery('Tlaquepaque, Jalisco')).toBe(false);
  });
});
