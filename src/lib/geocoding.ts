export interface GeocodeResult {
  name: string;
  region: string | null;
  subregion: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  municipality?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  region?: string;
  province?: string;
  country?: string;
  house_number?: string;
  road?: string;
}

export interface NominatimRow {
  class?: string;
  type?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
}

const LOCALITY_TYPES = new Set([
  'administrative',
  'city',
  'city_district',
  'county',
  'hamlet',
  'municipality',
  'neighbourhood',
  'quarter',
  'state',
  'suburb',
  'town',
  'village',
]);

const DISALLOWED_CLASSES = new Set(['amenity', 'building', 'highway', 'shop', 'tourism']);
const DISALLOWED_TYPES = new Set(['house', 'residential', 'road', 'street', 'yes']);

const STREET_QUERY_PATTERN =
  /^\s*\d+[a-z]?\s+.*\b(?:avenida|avenue|av|ave|boulevard|blvd|calle|carretera|cerrada|circuito|drive|dr|highway|hwy|lane|ln|privada|road|rd|street|st)\b/i;

export function isLikelyStreetAddressQuery(query: string): boolean {
  return STREET_QUERY_PATTERN.test(query);
}

export function mapNominatimRows(rows: unknown): GeocodeResult[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(nominatimResult).filter((result): result is GeocodeResult => result !== null);
}

function nominatimResult(row: NominatimRow): GeocodeResult | null {
  if (!isLocalityRow(row)) return null;

  const latitude = Number(row.lat);
  const longitude = Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = row.address ?? {};
  const name = firstText(
    row.name,
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.city_district,
    address.municipality,
    address.city,
    address.town,
    address.village,
    address.hamlet,
  );
  if (!name) return null;

  return {
    name,
    region: firstText(address.state, address.region, address.province),
    subregion: firstText(address.county, address.municipality, address.city, address.town),
    country: cleanText(address.country),
    latitude,
    longitude,
  };
}

function isLocalityRow(row: NominatimRow): boolean {
  const className = row.class?.toLowerCase();
  const type = row.type?.toLowerCase();
  if (className && DISALLOWED_CLASSES.has(className)) return false;
  if (type && DISALLOWED_TYPES.has(type)) return false;
  if (row.address?.house_number || row.address?.road) return false;
  return Boolean(type && LOCALITY_TYPES.has(type));
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstText(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}
