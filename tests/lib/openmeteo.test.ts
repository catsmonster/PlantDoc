import { describe, expect, it } from 'vitest';
import { fetchClimateNormals, fetchDailyWeather, fetchWeatherSeries, geocodeCity } from '../../src/lib/openmeteo';

type FetchFn = typeof fetch;

function stubFetch(payload: unknown, capture: { url?: string } = {}): FetchFn {
  return (async (input: Parameters<FetchFn>[0]) => {
    capture.url = String(input);
    return {
      ok: true,
      json: async () => payload,
    } as Response;
  }) as FetchFn;
}

function response(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function failingFetch(): FetchFn {
  return (async () => {
    throw new Error('network down');
  }) as FetchFn;
}

describe('geocodeCity', () => {
  it('maps geocoding results to name/region/country/coords', async () => {
    const capture: { url?: string } = {};
    const fetchFn = stubFetch(
      {
        results: [
          { name: 'Madrid', latitude: 40.4165, longitude: -3.7026, country: 'Spain', admin1: 'Madrid' },
          { name: 'Madrid', latitude: 4.73, longitude: -73.99, country: 'Colombia', admin1: 'Cundinamarca' },
        ],
      },
      capture,
    );
    const results = await geocodeCity('Madrid', fetchFn);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      name: 'Madrid',
      region: 'Madrid',
      subregion: null,
      country: 'Spain',
      latitude: 40.4165,
      longitude: -3.7026,
    });
    expect(capture.url).toContain('geocoding-api.open-meteo.com');
    expect(capture.url).toContain('name=Madrid');
  });

  it('returns empty array when there are no results', async () => {
    expect(await geocodeCity('Xyzzy', stubFetch({}))).toEqual([]);
  });

  it('retries comma-separated queries with the leading place token', async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: Parameters<FetchFn>[0]) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      return response(
        url.searchParams.get('name') === 'Tlaquepaque'
          ? {
              results: [
                {
                  name: 'Tlaquepaque',
                  latitude: 20.6407,
                  longitude: -103.2933,
                  country: 'Mexico',
                  admin1: 'Jalisco',
                  admin2: 'San Pedro Tlaquepaque',
                },
              ],
            }
          : {},
      );
    }) as FetchFn;

    const results = await geocodeCity('Tlaquepaque, Guadalajara, Jalisco', fetchFn);

    expect(calls.map((url) => new URL(url).searchParams.get('name'))).toEqual([
      'Tlaquepaque, Guadalajara, Jalisco',
      'Tlaquepaque',
    ]);
    expect(results).toEqual([
      {
        name: 'Tlaquepaque',
        region: 'Jalisco',
        subregion: 'San Pedro Tlaquepaque',
        country: 'Mexico',
        latitude: 20.6407,
        longitude: -103.2933,
      },
    ]);
  });

  it('falls back to the PlantDoc geocode proxy for neighborhood text when the city gazetteer has no match', async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: Parameters<FetchFn>[0]) => {
      const rawUrl = String(input);
      calls.push(rawUrl);
      const url = new URL(rawUrl, 'https://plantdoc.test');
      if (url.hostname === 'geocoding-api.open-meteo.com') return response({});
      return response([
        {
          name: 'Manuel Gomez Pedraza',
          region: 'Jalisco',
          subregion: 'Guadalajara',
          country: 'Mexico',
          latitude: 20.6851,
          longitude: -103.3529,
        },
      ]);
    }) as FetchFn;

    const results = await geocodeCity('Manuel Gomez Pedraza', fetchFn);

    expect(calls.map((url) => new URL(url, 'https://plantdoc.test').host)).toEqual([
      'geocoding-api.open-meteo.com',
      'plantdoc.test',
    ]);
    const proxyUrl = new URL(calls[1], 'https://plantdoc.test');
    expect(proxyUrl.pathname).toBe('/api/geocode-location');
    expect(proxyUrl.searchParams.get('query')).toBe('Manuel Gomez Pedraza');
    expect(results).toEqual([
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
});

describe('fetchClimateNormals', () => {
  it('requests rounded coordinates over past complete years and aggregates', async () => {
    const dates: string[] = [];
    const temps: number[] = [];
    const precs: number[] = [];
    for (let month = 1; month <= 12; month++) {
      dates.push(`2025-${String(month).padStart(2, '0')}-15`);
      temps.push(15);
      precs.push(30);
    }
    const capture: { url?: string } = {};
    const fetchFn = stubFetch(
      { daily: { time: dates, temperature_2m_mean: temps, precipitation_sum: precs } },
      capture,
    );
    const normals = await fetchClimateNormals({ lat: 40.4165, lon: -3.7026 }, fetchFn);
    expect(normals).not.toBeNull();
    expect(normals!.tempC).toHaveLength(12);
    expect(capture.url).toContain('latitude=40.4');
    expect(capture.url).toContain('longitude=-3.7');
    expect(capture.url).not.toContain('40.41');
    expect(capture.url).not.toContain('-3.70');
    expect(capture.url).toContain('archive-api.open-meteo.com');
  });

  it('returns null on API failure', async () => {
    expect(await fetchClimateNormals({ lat: 1, lon: 1 }, failingFetch())).toBeNull();
  });
});

describe('fetchDailyWeather', () => {
  const payload = (date: string) => ({
    daily: {
      time: [date],
      temperature_2m_max: [21],
      temperature_2m_min: [11],
      relative_humidity_2m_mean: [64],
      daylight_duration: [43200],
      weather_code: [2],
    },
  });

  it('uses the archive API for dates older than five days', async () => {
    const capture: { url?: string } = {};
    const weather = await fetchDailyWeather(
      { lat: 52.52, lon: 13.405 },
      '2026-01-15',
      stubFetch(payload('2026-01-15'), capture),
    );
    expect(capture.url).toContain('archive-api.open-meteo.com');
    expect(capture.url).toContain('latitude=52.5');
    expect(weather).toEqual({
      outdoorTempC: 16,
      humidityPercent: 64,
      photoperiodHours: 12,
      summary: 'partly cloudy',
    });
  });

  it('uses the forecast API for recent dates', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const capture: { url?: string } = {};
    const weather = await fetchDailyWeather(
      { lat: 52.52, lon: 13.405 },
      today,
      stubFetch(payload(today), capture),
    );
    expect(capture.url).toContain('api.open-meteo.com/v1/forecast');
    expect(weather?.outdoorTempC).toBe(16);
  });

  it('returns null when the requested date is missing from the response', async () => {
    const weather = await fetchDailyWeather(
      { lat: 0, lon: 0 },
      '2026-01-15',
      stubFetch(payload('2026-01-14')),
    );
    expect(weather).toBeNull();
  });

  it('returns null on API failure', async () => {
    expect(await fetchDailyWeather({ lat: 0, lon: 0 }, '2026-01-15', failingFetch())).toBeNull();
  });
});

describe('fetchWeatherSeries', () => {
  const coords = { lat: 52.2, lon: 4.9 };

  it('merges archive + forecast, forecast wins on overlapping dates', async () => {
    const archive = response({
      daily: {
        time: ['2026-06-10', '2026-06-11'],
        temperature_2m_max: [20, 22],
        temperature_2m_min: [10, 12],
        relative_humidity_2m_mean: [60, 62],
        precipitation_sum: [0, 5],
      },
    });
    const forecast = response({
      daily: {
        time: ['2026-06-11', '2026-06-12'], // 06-11 overlaps archive
        temperature_2m_max: [30, 32],
        temperature_2m_min: [20, 22],
        relative_humidity_2m_mean: [40, 42],
        precipitation_sum: [99, 1],
      },
    });
    let call = 0;
    const fetchFn = (async () => (call++ === 0 ? archive : forecast)) as unknown as typeof fetch;

    const series = await fetchWeatherSeries(coords, '2026-06-10', '2026-06-12', fetchFn);
    expect(series).not.toBeNull();
    expect(series!.get('2026-06-10')).toEqual({ tempC: 15, humidityPct: 60, precipMm: 0 });
    // 06-11 comes from forecast, not archive
    expect(series!.get('2026-06-11')).toEqual({ tempC: 25, humidityPct: 40, precipMm: 99 });
    expect(series!.get('2026-06-12')).toEqual({ tempC: 27, humidityPct: 42, precipMm: 1 });
  });

  it('returns null when both endpoints fail', async () => {
    const fetchFn = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await fetchWeatherSeries(coords, '2026-06-10', '2026-06-12', fetchFn)).toBeNull();
  });
});
