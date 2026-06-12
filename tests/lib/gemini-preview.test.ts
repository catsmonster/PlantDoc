import { describe, expect, it } from 'vitest';
import {
  AI_PREVIEW_DAILY_LIMIT,
  AI_PREVIEW_WARNING,
  buildGeminiGenerateContentRequest,
  buildPlantGeminiPreviewPayload,
  canUseAiPreview,
  parseGeminiPreviewText,
  readAiPreviewResponseBody,
  recordAiPreviewUse,
} from '../../src/lib/gemini-preview';
import type { Plant } from '../../src/lib/types';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function plant(): Plant {
  return {
    $id: 'plant_1',
    $createdAt: '2026-01-01T00:00:00.000Z',
    $updatedAt: NOW.toISOString(),
    user_id: 'user_secret',
    species_id: {
      $id: 'species_1',
      $createdAt: '2026-01-01T00:00:00.000Z',
      $updatedAt: '2026-01-01T00:00:00.000Z',
      scientific_name: 'Monstera deliciosa',
      common_names: ['Swiss cheese plant'],
      family: 'Araceae',
      genus: 'Monstera',
    },
    species_text: 'fallback species text',
    nickname: 'Kitchen Monstera',
    common_name: 'Monstera',
    acquired_on: null,
    status: 'active',
    placement_type: 'indoor',
    placement_label: 'East window',
    location_id: {
      $id: 'loc_1',
      $createdAt: '2026-01-01T00:00:00.000Z',
      $updatedAt: '2026-01-01T00:00:00.000Z',
      user_id: 'user_secret',
      label: 'Home',
      country: 'US',
      region: 'California',
      city: 'San Francisco',
      postal_code_prefix: '941',
      location: [-122.42, 37.77],
      location_precision: 'local',
      climate_zone: 'Csb',
    },
    observations: [
      {
        $id: 'obs_secret',
        $createdAt: NOW.toISOString(),
        $updatedAt: NOW.toISOString(),
        user_id: 'user_secret',
        observed_at: NOW.toISOString(),
        observation_type: 'treatment',
        notes_private: 'secret private observation note',
        contribute_to_public_dataset: false,
        treatments: [
          {
            $id: 'treatment_secret',
            $createdAt: NOW.toISOString(),
            $updatedAt: NOW.toISOString(),
            user_id: 'user_secret',
            treatment_type: 'watering',
            amount_value: 250,
            amount_unit: 'ml',
            product_name: 'private fertilizer brand',
            method: 'bottom water',
            notes_private: 'secret treatment note',
          },
        ],
        measurements: [
          {
            $id: 'measurement_secret',
            $createdAt: NOW.toISOString(),
            $updatedAt: NOW.toISOString(),
            user_id: 'user_secret',
            height_cm: 42,
            leaf_count: 11,
            soil_moisture_percent: 14,
            health_score: 4,
            pest_severity_score: null,
            bloom_count: null,
            notes_private: 'secret measurement note',
          },
        ],
        photos: [
          {
            $id: 'photo_secret',
            $createdAt: NOW.toISOString(),
            $updatedAt: NOW.toISOString(),
            user_id: 'user_secret',
            private_file_id: 'private_file_should_not_leak',
            caption_private: 'secret photo caption',
            exif_stripped: true,
            allow_public_image: false,
          },
        ],
        environment_snapshots: [
          {
            $id: 'env_secret',
            $createdAt: NOW.toISOString(),
            $updatedAt: NOW.toISOString(),
            user_id: 'user_secret',
            recorded_at: NOW.toISOString(),
            source: 'weather_api',
            indoor_temperature_c: null,
            outdoor_temperature_c: 21.4,
            relative_humidity_percent: 62,
            light_lux: null,
            photoperiod_hours: null,
            weather_summary: 'Partly cloudy',
            climate_zone: 'Csb',
            geo_resolution: '1dp_api_call',
          },
        ],
      },
    ],
  };
}

describe('Gemini preview payload', () => {
  it('builds a text summary without private notes, IDs, exact location, or photo file IDs', () => {
    const payload = buildPlantGeminiPreviewPayload(plant(), 'metric');
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain('Kitchen Monstera');
    expect(serialized).toContain('Monstera deliciosa');
    expect(serialized).toContain('watering');
    expect(serialized).toContain('soilMoisturePercent');
    expect(serialized).toContain('Partly cloudy');
    expect(serialized).toContain('"photoCount":1');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('private_file_should_not_leak');
    expect(serialized).not.toContain('San Francisco');
    expect(serialized).not.toContain('-122.42');
    expect(serialized).not.toContain('private fertilizer brand');
  });

  it('adds text and optional inline image parts to a bounded Gemini request', () => {
    const payload = buildPlantGeminiPreviewPayload(plant(), 'metric', {
      mimeType: 'image/jpeg',
      base64: 'abc123',
      byteLength: 3,
    });
    const request = buildGeminiGenerateContentRequest(payload);

    // Thinking is allowed, but its tokens count against maxOutputTokens, so
    // the visible answer must keep at least the old 384-token budget after
    // thinking exhausts its bounded share.
    const { maxOutputTokens, thinkingConfig } = request.generationConfig;
    expect(thinkingConfig.thinkingBudget).toBeGreaterThan(0);
    expect(maxOutputTokens - thinkingConfig.thinkingBudget).toBeGreaterThanOrEqual(384);
    expect(maxOutputTokens).toBeLessThanOrEqual(2048);
    expect(request.contents[0].parts[0]).toHaveProperty('text');
    expect(request.contents[0].parts[1]).toEqual({
      inline_data: { mime_type: 'image/jpeg', data: 'abc123' },
    });
    expect(JSON.stringify(request)).toContain('gemini-3.5-flash');
  });

  it('parses text and returns a null result for an empty candidate', () => {
    expect(
      parseGeminiPreviewText({
        candidates: [{ content: { parts: [{ text: ' Check leaves before watering. ' }] } }],
      }),
    ).toBe('Check leaves before watering.');
    expect(parseGeminiPreviewText({ candidates: [{ content: { parts: [] } }] })).toBeNull();
  });
});

describe('AI preview response body reading', () => {
  it('parses a JSON body from the preview endpoint', async () => {
    const response = new Response(JSON.stringify({ text: 'Check the soil.', warning: 'w' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readAiPreviewResponseBody(response)).resolves.toEqual({
      text: 'Check the soil.',
      warning: 'w',
    });
  });

  it('returns an empty body instead of throwing on empty responses', async () => {
    // A stale assets-only deployment answers POST /api/* with an empty 405 body;
    // dev servers without the worker answer with an empty 404.
    await expect(readAiPreviewResponseBody(new Response(null, { status: 405 }))).resolves.toEqual(
      {},
    );
  });

  it('returns an empty body instead of throwing on non-JSON responses', async () => {
    const html = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    await expect(readAiPreviewResponseBody(html)).resolves.toEqual({});
    await expect(
      readAiPreviewResponseBody(new Response('[1,2,3]', { status: 200 })),
    ).resolves.toEqual({});
  });
});

describe('Gemini preview quota', () => {
  it('keeps a small local per-user plant daily limit', () => {
    const storage = new Map<string, string>();
    const readWriteStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    for (let i = 0; i < AI_PREVIEW_DAILY_LIMIT; i += 1) {
      expect(canUseAiPreview(readWriteStorage, 'user_1', 'plant_1', NOW).allowed).toBe(true);
      recordAiPreviewUse(readWriteStorage, 'user_1', 'plant_1', NOW);
    }

    expect(canUseAiPreview(readWriteStorage, 'user_1', 'plant_1', NOW)).toEqual({
      allowed: false,
      remaining: 0,
      limit: AI_PREVIEW_DAILY_LIMIT,
    });
    expect(canUseAiPreview(readWriteStorage, 'user_1', 'plant_2', NOW).allowed).toBe(true);
  });

  it('uses explicit preview warning copy', () => {
    expect(AI_PREVIEW_WARNING).toContain('Gemini 3.5 Flash');
    expect(AI_PREVIEW_WARNING).toContain('load');
  });
});
