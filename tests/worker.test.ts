import { describe, expect, it, vi } from 'vitest';
import { AI_PREVIEW_MAX_BODY_BYTES } from '../src/lib/gemini-preview';
import { handleRequest, type WorkerEnv } from '../src/worker';

const payload = {
  plantSummary: {
    nickname: 'Desk Pothos',
    status: 'active',
    placementType: 'indoor',
    units: 'metric',
    observationCount: 1,
    photoCount: 0,
    observations: [],
  },
};

function env(fetcher: typeof fetch = fetch): WorkerEnv {
  return {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-3.5-flash',
    ASSETS: {
      fetch: async () => new Response('asset'),
    },
    fetcher,
  };
}

describe('Worker Gemini preview route', () => {
  it('keeps the API key server-side and calls Gemini with a bounded request body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Check the newest leaf.' }] } }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );

    const response = await handleRequest(
      new Request('https://plantdoc.example/api/gemini-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env(fetcher),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: 'Check the newest leaf.',
      model: 'gemini-3.5-flash',
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-3.5-flash:generateContent');
    expect((init?.headers as Headers).get('x-goog-api-key')).toBe('test-key');
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('model');
  });

  it('does not call Gemini when the server key is missing', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await handleRequest(
      new Request('https://plantdoc.example/api/gemini-insights', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      { ...env(fetcher), GEMINI_API_KEY: '' },
    );

    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a JSON 502 when Gemini responds OK with an unparsable body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }));
    const response = await handleRequest(
      new Request('https://plantdoc.example/api/gemini-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env(fetcher),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Gemini preview'),
    });
  });

  it('rejects oversized preview requests before reading the body', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await handleRequest(
      new Request('https://plantdoc.example/api/gemini-insights', {
        method: 'POST',
        headers: { 'content-length': String(AI_PREVIEW_MAX_BODY_BYTES + 1) },
        body: JSON.stringify(payload),
      }),
      env(fetcher),
    );

    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Worker geocode route', () => {
  it('proxies locality searches to Nominatim with identifying headers and caches responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
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
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const geocodeCache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const response = await handleRequest(
      new Request('https://plantdoc.example/api/geocode-location?query=Manuel%20Gomez%20Pedraza'),
      { ...env(fetcher), geocodeCache } as WorkerEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        name: 'Manuel Gomez Pedraza',
        region: 'Jalisco',
        subregion: 'Guadalajara',
        country: 'Mexico',
        latitude: 20.6851,
        longitude: -103.3529,
      },
    ]);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    const upstream = new URL(String(url));
    expect(upstream.hostname).toBe('nominatim.openstreetmap.org');
    expect(upstream.searchParams.get('q')).toBe('Manuel Gomez Pedraza');
    const headers = init?.headers as Headers;
    expect(headers.get('user-agent')).toContain('PlantDoc');
    expect(headers.get('referer')).toBe('https://plantdoc.example/');
    expect(geocodeCache.match).toHaveBeenCalledOnce();
    expect(geocodeCache.put).toHaveBeenCalledOnce();
  });

  it('does not fail a geocode response when cache storage fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            class: 'place',
            type: 'city',
            name: 'Guadalajara',
            lat: '20.6767',
            lon: '-103.3475',
            address: { city: 'Guadalajara', state: 'Jalisco', country: 'Mexico' },
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const geocodeCache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new Error('cache unavailable')),
    };

    const response = await handleRequest(
      new Request('https://plantdoc.example/api/geocode-location?query=Guadalajara', {
        headers: { 'cf-connecting-ip': '203.0.113.9' },
      }),
      { ...env(fetcher), geocodeCache } as WorkerEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        name: 'Guadalajara',
        region: 'Jalisco',
        subregion: 'Guadalajara',
        country: 'Mexico',
        latitude: 20.6767,
        longitude: -103.3475,
      },
    ]);
    expect(geocodeCache.put).toHaveBeenCalledOnce();
  });

  it('rejects likely street-address queries before calling Nominatim', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const response = await handleRequest(
      new Request('https://plantdoc.example/api/geocode-location?query=123%20Main%20Street'),
      env(fetcher),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Search by city, neighborhood, or municipality.' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rate-limits repeated uncached geocode proxy requests by client', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('[]', { headers: { 'content-type': 'application/json' } }),
    );
    const geocodeThrottle = new Map<string, number>();
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_250);
    const workerEnv = { ...env(fetcher), geocodeThrottle, now } as WorkerEnv;
    const request = () =>
      new Request('https://plantdoc.example/api/geocode-location?query=Guadalajara', {
        headers: { 'cf-connecting-ip': '203.0.113.4' },
      });

    const first = await handleRequest(request(), workerEnv);
    const second = await handleRequest(request(), workerEnv);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({ error: 'Location search is rate-limited. Try again shortly.' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
