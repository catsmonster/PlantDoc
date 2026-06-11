import { describe, expect, it } from 'vitest';
import { exportGeo, forApi, forStorage, roundCoord, type GeoLocation } from '../../src/lib/geo';

describe('roundCoord', () => {
  it('rounds half up to the requested decimals', () => {
    expect(roundCoord(40.4168, 2)).toBe(40.42);
    expect(roundCoord(40.4168, 1)).toBe(40.4);
    expect(roundCoord(-3.7038, 2)).toBe(-3.7);
    expect(roundCoord(51.555, 2)).toBe(51.56);
  });
});

describe('coordinate privacy tiers', () => {
  it('forStorage keeps at most 2 decimal places (~1.1 km)', () => {
    expect(forStorage({ lat: 52.520008, lon: 13.404954 })).toEqual({ lat: 52.52, lon: 13.4 });
  });

  it('forApi keeps at most 1 decimal place (~11 km)', () => {
    expect(forApi({ lat: 52.520008, lon: 13.404954 })).toEqual({ lat: 52.5, lon: 13.4 });
  });
});

const baseLocation: GeoLocation = {
  country: 'Spain',
  region: 'Madrid',
  city: 'Alcobendas',
  postal_code_prefix: '28100',
  climate_zone: 'Csa',
  location_precision: 'regional',
};

describe('exportGeo', () => {
  it.each(['exact', 'local', 'regional'] as const)(
    '%s precision exports country + region + climate zone at regional precision',
    (tier) => {
      expect(exportGeo({ ...baseLocation, location_precision: tier })).toEqual({
        country: 'Spain',
        region: 'Madrid',
        climate_zone: 'Csa',
        geo_precision: 'regional',
      });
    },
  );

  it('climate precision drops region', () => {
    expect(exportGeo({ ...baseLocation, location_precision: 'climate' })).toEqual({
      country: 'Spain',
      region: null,
      climate_zone: 'Csa',
      geo_precision: 'climate',
    });
  });

  it('country precision exports country only', () => {
    expect(exportGeo({ ...baseLocation, location_precision: 'country' })).toEqual({
      country: 'Spain',
      region: null,
      climate_zone: null,
      geo_precision: 'country',
    });
  });

  it('missing location yields all-null country-precision geo', () => {
    expect(exportGeo(null)).toEqual({
      country: null,
      region: null,
      climate_zone: null,
      geo_precision: 'country',
    });
    expect(exportGeo(undefined)).toEqual({
      country: null,
      region: null,
      climate_zone: null,
      geo_precision: 'country',
    });
  });

  it('never exposes city or postal prefix in any tier', () => {
    for (const tier of ['exact', 'local', 'regional', 'climate', 'country'] as const) {
      const out = exportGeo({ ...baseLocation, location_precision: tier });
      const serialized = JSON.stringify(out);
      expect(Object.keys(out)).toEqual(['country', 'region', 'climate_zone', 'geo_precision']);
      expect(serialized).not.toContain('Alcobendas');
      expect(serialized).not.toContain('28100');
    }
  });
});
