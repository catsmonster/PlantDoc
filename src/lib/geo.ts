/**
 * Pure coordinate-privacy helpers. Exact GPS never persists and never leaves
 * the device unrounded: storage keeps ~1.1 km precision, third-party API
 * calls get ~11 km. `exportGeo` is the single mapping from a location's
 * sharing tier to what the public dataset may carry (docs/privacy.md).
 */

export type LocationPrecision = 'exact' | 'local' | 'regional' | 'climate' | 'country';

export interface Coords {
  lat: number;
  lon: number;
}

export interface GeoLocation {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code_prefix?: string | null;
  climate_zone?: string | null;
  location_precision: LocationPrecision;
}

export interface ExportGeo {
  country: string | null;
  region: string | null;
  climate_zone: string | null;
  geo_precision: 'regional' | 'climate' | 'country';
}

export function roundCoord(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Storage precision: 2 decimal places (~1.1 km). */
export function forStorage(coords: Coords): Coords {
  return { lat: roundCoord(coords.lat, 2), lon: roundCoord(coords.lon, 2) };
}

/** Third-party API precision: 1 decimal place (~11 km). */
export function forApi(coords: Coords): Coords {
  return { lat: roundCoord(coords.lat, 1), lon: roundCoord(coords.lon, 1) };
}

const NO_GEO: ExportGeo = {
  country: null,
  region: null,
  climate_zone: null,
  geo_precision: 'country',
};

/**
 * Public-export geography for a location. City and postal prefix never
 * export at any tier; finer tiers cap at regional granularity.
 */
export function exportGeo(location: GeoLocation | null | undefined): ExportGeo {
  if (!location) return NO_GEO;
  switch (location.location_precision) {
    case 'exact':
    case 'local':
    case 'regional':
      return {
        country: location.country ?? null,
        region: location.region ?? null,
        climate_zone: location.climate_zone ?? null,
        geo_precision: 'regional',
      };
    case 'climate':
      return {
        country: location.country ?? null,
        region: null,
        climate_zone: location.climate_zone ?? null,
        geo_precision: 'climate',
      };
    case 'country':
      return {
        country: location.country ?? null,
        region: null,
        climate_zone: null,
        geo_precision: 'country',
      };
    default:
      return NO_GEO;
  }
}
