/**
 * Thin browser-direct clients for location search and Open-Meteo weather.
 * Weather requests get coordinates rounded to ~11 km via forApi — exact
 * coordinates never leave the device. Geocoding sends user-entered place text
 * only. All functions resolve to null/[] on failure; callers decide whether
 * that is fatal (location form) or silent (log-time enrichment).
 */
import { forApi, type Coords } from './geo';
import type { GeocodeResult as SharedGeocodeResult } from './geocoding';
import { aggregateMonthly, type MonthlyNormals } from './koppen';

type FetchFn = typeof fetch;

export type GeocodeResult = SharedGeocodeResult;

export async function geocodeCity(name: string, fetchFn: FetchFn = fetch): Promise<GeocodeResult[]> {
  const query = name.trim();
  if (!query) return [];

  const rawResults = await searchOpenMeteo(query, fetchFn);
  if (rawResults.length > 0) return rawResults;

  const leadingToken = leadingCommaToken(query);
  if (leadingToken && leadingToken !== query) {
    const tokenResults = await searchOpenMeteo(leadingToken, fetchFn);
    if (tokenResults.length > 0) return tokenResults;
  }

  return searchPlantDocGeocoder(query, fetchFn);
}

interface OpenMeteoGeocodeRow {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  admin2?: string;
}

async function searchOpenMeteo(name: string, fetchFn: FetchFn): Promise<GeocodeResult[]> {
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name, count: '10', language: 'en', format: 'json' });
    const response = await fetchFn(url);
    if (!response.ok) return [];
    const body = (await response.json()) as { results?: OpenMeteoGeocodeRow[] };
    return (body.results ?? []).map((r) => ({
      name: r.name,
      region: cleanText(r.admin1),
      subregion: cleanText(r.admin2),
      country: cleanText(r.country),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    return [];
  }
}

async function searchPlantDocGeocoder(query: string, fetchFn: FetchFn): Promise<GeocodeResult[]> {
  try {
    const url =
      '/api/geocode-location?' +
      new URLSearchParams({ query });
    const response = await fetchFn(url);
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return body.filter(isGeocodeResult);
  } catch {
    return [];
  }
}

function leadingCommaToken(query: string): string | null {
  const token = query.split(',')[0]?.trim();
  return token && token.length > 1 ? token : null;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isGeocodeResult(value: unknown): value is GeocodeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === 'string' &&
    (typeof row.region === 'string' || row.region === null) &&
    (typeof row.subregion === 'string' || row.subregion === null) &&
    (typeof row.country === 'string' || row.country === null) &&
    typeof row.latitude === 'number' &&
    typeof row.longitude === 'number'
  );
}

interface DailyResponse {
  daily?: {
    time?: string[];
    temperature_2m_mean?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    relative_humidity_2m_mean?: (number | null)[];
    daylight_duration?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

/**
 * Monthly climate normals from the last five complete years of daily data.
 * An approximation of the 30-year normal that is good enough for a coarse
 * Köppen zone (see design spec decision 2).
 */
export async function fetchClimateNormals(
  coords: Coords,
  fetchFn: FetchFn = fetch,
): Promise<MonthlyNormals | null> {
  try {
    const { lat, lon } = forApi(coords);
    const year = new Date().getUTCFullYear();
    const url =
      'https://archive-api.open-meteo.com/v1/archive?' +
      new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: `${year - 5}-01-01`,
        end_date: `${year - 1}-12-31`,
        daily: 'temperature_2m_mean,precipitation_sum',
        timezone: 'UTC',
      });
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const body = (await response.json()) as DailyResponse;
    const daily = body.daily;
    if (!daily?.time || !daily.temperature_2m_mean || !daily.precipitation_sum) return null;
    return aggregateMonthly(daily.time, daily.temperature_2m_mean, daily.precipitation_sum);
  } catch {
    return null;
  }
}

export interface DailyWeather {
  outdoorTempC: number | null;
  humidityPercent: number | null;
  photoperiodHours: number | null;
  summary: string | null;
}

const WEATHER_SUMMARIES: [number, string][] = [
  [0, 'clear sky'],
  [1, 'mainly clear'],
  [2, 'partly cloudy'],
  [3, 'overcast'],
  [45, 'fog'],
  [48, 'rime fog'],
  [51, 'light drizzle'],
  [53, 'drizzle'],
  [55, 'heavy drizzle'],
  [56, 'freezing drizzle'],
  [57, 'freezing drizzle'],
  [61, 'light rain'],
  [63, 'rain'],
  [65, 'heavy rain'],
  [66, 'freezing rain'],
  [67, 'freezing rain'],
  [71, 'light snow'],
  [73, 'snow'],
  [75, 'heavy snow'],
  [77, 'snow grains'],
  [80, 'light showers'],
  [81, 'showers'],
  [82, 'heavy showers'],
  [85, 'snow showers'],
  [86, 'snow showers'],
  [95, 'thunderstorm'],
  [96, 'thunderstorm with hail'],
  [99, 'thunderstorm with hail'],
];

function weatherSummary(code: number | null | undefined): string | null {
  if (code == null) return null;
  return WEATHER_SUMMARIES.find(([c]) => c === code)?.[1] ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVE_CUTOFF_DAYS = 5;
const DAILY_VARS =
  'temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,daylight_duration,weather_code';

/** Daily weather for one ISO date: archive for the past, forecast for recent/near-future dates. */
export async function fetchDailyWeather(
  coords: Coords,
  isoDate: string,
  fetchFn: FetchFn = fetch,
): Promise<DailyWeather | null> {
  try {
    const { lat, lon } = forApi(coords);
    const ageDays = (Date.now() - Date.parse(`${isoDate}T00:00:00Z`)) / DAY_MS;
    const base = { latitude: String(lat), longitude: String(lon), daily: DAILY_VARS };
    const url =
      ageDays > ARCHIVE_CUTOFF_DAYS
        ? 'https://archive-api.open-meteo.com/v1/archive?' +
          new URLSearchParams({ ...base, start_date: isoDate, end_date: isoDate, timezone: 'UTC' })
        : 'https://api.open-meteo.com/v1/forecast?' +
          new URLSearchParams({ ...base, past_days: '7', forecast_days: '7', timezone: 'UTC' });
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const body = (await response.json()) as DailyResponse;
    const daily = body.daily;
    const index = daily?.time?.indexOf(isoDate) ?? -1;
    if (!daily || index < 0) return null;

    const max = daily.temperature_2m_max?.[index] ?? null;
    const min = daily.temperature_2m_min?.[index] ?? null;
    const daylightSeconds = daily.daylight_duration?.[index] ?? null;
    return {
      outdoorTempC: max != null && min != null ? Math.round(((max + min) / 2) * 10) / 10 : null,
      humidityPercent: daily.relative_humidity_2m_mean?.[index] ?? null,
      photoperiodHours:
        daylightSeconds != null ? Math.round((daylightSeconds / 3600) * 10) / 10 : null,
      summary: weatherSummary(daily.weather_code?.[index]),
    };
  } catch {
    return null;
  }
}

export interface DayWeather {
  tempC: number;
  humidityPct: number;
  precipMm: number;
}

export type WeatherSeries = Map<string, DayWeather>;

const SERIES_DAILY_VARS =
  'temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum';

function fillSeries(target: WeatherSeries, body: DailyResponse): void {
  const daily = body.daily;
  if (!daily?.time) return;
  daily.time.forEach((iso, i) => {
    const max = daily.temperature_2m_max?.[i];
    const min = daily.temperature_2m_min?.[i];
    const rh = daily.relative_humidity_2m_mean?.[i];
    const precip = daily.precipitation_sum?.[i];
    if (max == null || min == null || rh == null || precip == null) return;
    target.set(iso, {
      tempC: Math.round(((max + min) / 2) * 10) / 10,
      humidityPct: rh,
      precipMm: precip,
    });
  });
}

/**
 * Daily temp/RH/precip across [startIso, endIso]. One archive call for the
 * window plus one forecast call for recent/near-present days; on overlapping
 * dates the forecast value wins (fresher endpoint). Null when both fail.
 */
export async function fetchWeatherSeries(
  coords: Coords,
  startIso: string,
  endIso: string,
  fetchFn: FetchFn = fetch,
): Promise<WeatherSeries | null> {
  const { lat, lon } = forApi(coords);
  const base = { latitude: String(lat), longitude: String(lon), daily: SERIES_DAILY_VARS, timezone: 'UTC' };
  const archiveUrl =
    'https://archive-api.open-meteo.com/v1/archive?' +
    new URLSearchParams({ ...base, start_date: startIso, end_date: endIso });
  const forecastUrl =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({ ...base, past_days: '7', forecast_days: '7' });

  const series: WeatherSeries = new Map();
  let any = false;
  try {
    const res = await fetchFn(archiveUrl);
    if (res.ok) {
      fillSeries(series, (await res.json()) as DailyResponse);
      any = true;
    }
  } catch {
    /* archive optional */
  }
  try {
    const res = await fetchFn(forecastUrl);
    if (res.ok) {
      // Forecast applied after archive so overlapping dates are overwritten (forecast wins).
      fillSeries(series, (await res.json()) as DailyResponse);
      any = true;
    }
  } catch {
    /* forecast optional */
  }
  return any && series.size > 0 ? series : null;
}
