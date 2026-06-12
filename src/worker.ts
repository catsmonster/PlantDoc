import {
  AI_PREVIEW_MAX_BODY_BYTES,
  AI_PREVIEW_IMAGE_MAX_BYTES,
  AI_PREVIEW_WARNING,
  buildGeminiGenerateContentRequest,
  parseGeminiPreviewText,
  type GeminiPreviewPayload,
} from './lib/gemini-preview';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ASSETS?: AssetsBinding;
  fetcher?: typeof fetch;
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

  const requestBody = buildGeminiGenerateContentRequest(payload, env.GEMINI_MODEL?.trim());
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

  const geminiJson = await geminiResponse.json();
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
  if (url.pathname === '/api/gemini-insights') {
    return handleGeminiInsights(request, env);
  }
  return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
}

export default {
  fetch: handleRequest,
};
