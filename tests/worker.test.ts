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
