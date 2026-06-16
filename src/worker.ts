import {
  AI_PREVIEW_MAX_BODY_BYTES,
  AI_PREVIEW_IMAGE_MAX_BYTES,
  AI_PREVIEW_WARNING,
  buildGeminiGenerateContentRequest,
  parseGeminiPreviewText,
  type GeminiPreviewPayload,
} from './lib/gemini-preview';
import { isLikelyStreetAddressQuery, mapNominatimRows } from './lib/geocoding';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ASSETS?: AssetsBinding;
  fetcher?: typeof fetch;
  geocodeCache?: Pick<Cache, 'match' | 'put'>;
  geocodeThrottle?: Map<string, number>;
  now?: () => number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidPreviewPayload(value: unknown): value is GeminiPreviewPayload {
  if (!isRecord(value) || !isRecord(value.plantSummary)) return false;
  const summary = value.plantSummary;
  const hasRequiredSummary =
    typeof summary.nickname === 'string' &&
    typeof summary.status === 'string' &&
    typeof summary.placementType === 'string' &&
    (summary.units === 'metric' || summary.units === 'imperial') &&
    typeof summary.observationCount === 'number' &&
    typeof summary.photoCount === 'number' &&
    Array.isArray(summary.observations);
  if (!hasRequiredSummary) return false;

  if (value.image === undefined) return true;
  if (!isRecord(value.image)) return false;
  return (
    typeof value.image.mimeType === 'string' &&
    value.image.mimeType.startsWith('image/') &&
    typeof value.image.base64 === 'string' &&
    typeof value.image.byteLength === 'number' &&
    value.image.byteLength <= AI_PREVIEW_IMAGE_MAX_BYTES
  );
}

function geminiModelPath(model: string): string {
  return encodeURIComponent(model.trim().replace(/^models\//, ''));
}

function geocodeCache(): Pick<Cache, 'match' | 'put'> | null {
  if (typeof caches === 'undefined') return null;
  return (caches as CacheStorage & { default?: Cache }).default ?? null;
}

function geocodeCacheKey(requestUrl: URL, query: string): Request {
  const url = new URL('/api/geocode-location', requestUrl.origin);
  url.searchParams.set('query', query.toLowerCase());
  return new Request(url.toString(), { method: 'GET' });
}

const GEOCODE_MIN_INTERVAL_MS = 1000;
const geocodeThrottle = new Map<string, number>();

function geocodeClientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous'
  );
}

function isGeocodeRateLimited(request: Request, env: WorkerEnv): boolean {
  const store = env.geocodeThrottle ?? geocodeThrottle;
  const now = (env.now ?? Date.now)();
  const key = geocodeClientKey(request);
  const last = store.get(key);
  if (last != null && now - last < GEOCODE_MIN_INTERVAL_MS) return true;
  store.set(key, now);
  return false;
}

function geocodeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store',
    },
  });
}

async function handleGeocodeLocation(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get('query')?.trim() ?? '';
  if (query.length < 2 || query.length > 128) {
    return jsonResponse({ error: 'Enter a city, neighborhood, or municipality.' }, 400);
  }
  if (isLikelyStreetAddressQuery(query)) {
    return jsonResponse({ error: 'Search by city, neighborhood, or municipality.' }, 400);
  }

  const cache = env.geocodeCache ?? geocodeCache();
  const cacheKey = geocodeCacheKey(requestUrl, query);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;
  if (isGeocodeRateLimited(request, env)) {
    return jsonResponse({ error: 'Location search is rate-limited. Try again shortly.' }, 429);
  }

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
    });
  const fetcher = env.fetcher ?? fetch;
  const upstream = await fetcher(url, {
    headers: new Headers({
      accept: 'application/json',
      'accept-language': 'en',
      referer: `${requestUrl.origin}/`,
      'user-agent': 'PlantDoc/0.0 (https://github.com/catsmonster/PlantDoc)',
    }),
  });

  if (!upstream.ok) {
    return jsonResponse({ error: 'Location search failed upstream.' }, 502);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonResponse({ error: 'Location search returned an unreadable response.' }, 502);
  }

  const response = geocodeResponse(mapNominatimRows(payload));
  try {
    await cache?.put(cacheKey, response.clone());
  } catch {
    // Cache failures should not block a valid user-triggered location search.
  }
  return response;
}

async function handleGeminiInsights(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse({ error: 'Gemini preview is not configured.' }, 503);
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > AI_PREVIEW_MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Gemini preview request is too large.' }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  if (!isValidPreviewPayload(payload)) {
    return jsonResponse({ error: 'Invalid Gemini preview payload.' }, 400);
  }

  // `|| undefined` so a blank var falls back to the default model instead of ''.
  const requestBody = buildGeminiGenerateContentRequest(payload, env.GEMINI_MODEL?.trim() || undefined);
  const { model, ...generateContentBody } = requestBody;
  const headers = new Headers({
    'content-type': 'application/json',
    'x-goog-api-key': apiKey,
  });
  const fetcher = env.fetcher ?? fetch;
  const geminiResponse = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelPath(model)}:generateContent`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(generateContentBody),
    },
  );

  if (!geminiResponse.ok) {
    const status = geminiResponse.status === 429 ? 429 : 502;
    return jsonResponse(
      {
        error:
          status === 429
            ? 'Gemini preview is rate-limited right now. Try again later.'
            : 'Gemini preview failed upstream.',
        warning: AI_PREVIEW_WARNING,
      },
      status,
    );
  }

  let geminiJson: unknown;
  try {
    geminiJson = await geminiResponse.json();
  } catch {
    return jsonResponse({ error: 'Gemini preview returned an unreadable response.' }, 502);
  }
  const text = parseGeminiPreviewText(geminiJson);
  if (!text) {
    return jsonResponse({ error: 'Gemini preview returned no text.' }, 502);
  }

  return jsonResponse({
    text,
    model,
    warning: AI_PREVIEW_WARNING,
  });
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/geocode-location') {
    return handleGeocodeLocation(request, env);
  }
  if (url.pathname === '/api/gemini-insights') {
    return handleGeminiInsights(request, env);
  }
  return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
}

export default {
  fetch: handleRequest,
};
