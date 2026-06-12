import type {
  EnvironmentSnapshot,
  Measurement,
  Observation,
  Plant,
  Treatment,
  Units,
} from './types';

export const GEMINI_PREVIEW_MODEL = 'gemini-3.5-flash';
export const AI_PREVIEW_DAILY_LIMIT = 3;
export const AI_PREVIEW_IMAGE_MAX_BYTES = 750_000;
export const AI_PREVIEW_MAX_BODY_BYTES = 1_200_000;
export const AI_PREVIEW_WARNING =
  'AI preview uses Gemini 3.5 Flash with aggressive free-tier limits; response quality and availability may vary based on provider load and rate limits.';

export interface GeminiPreviewImage {
  mimeType: string;
  base64: string;
  byteLength: number;
}

export interface GeminiPreviewTreatment {
  type: string;
  amountValue?: number;
  amountUnit?: string;
  method?: string;
}

export interface GeminiPreviewMeasurement {
  heightCm?: number;
  leafCount?: number;
  soilMoisturePercent?: number;
  healthScore?: number;
  pestSeverityScore?: number;
  bloomCount?: number;
}

export interface GeminiPreviewEnvironment {
  source: string;
  indoorTemperatureC?: number;
  outdoorTemperatureC?: number;
  relativeHumidityPercent?: number;
  lightLux?: number;
  photoperiodHours?: number;
  weatherSummary?: string;
  climateZone?: string;
}

export interface GeminiPreviewObservation {
  observedAt: string;
  type: string;
  treatment?: GeminiPreviewTreatment;
  measurement?: GeminiPreviewMeasurement;
  environment?: GeminiPreviewEnvironment;
  hasPhoto: boolean;
}

export interface GeminiPlantSummary {
  nickname: string;
  commonName?: string;
  scientificName?: string;
  status: string;
  placementType: string;
  placementLabel?: string;
  climateZone?: string;
  units: Units;
  observationCount: number;
  photoCount: number;
  observations: GeminiPreviewObservation[];
}

export interface GeminiPreviewPayload {
  plantSummary: GeminiPlantSummary;
  image?: GeminiPreviewImage;
}

interface GeminiTextPart {
  text: string;
}

interface GeminiInlineDataPart {
  inline_data: {
    mime_type: string;
    data: string;
  };
}

export type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiGenerateContentRequest {
  model: string;
  contents: Array<{
    role: 'user';
    parts: GeminiRequestPart[];
  }>;
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
  };
}

export interface AiPreviewQuota {
  allowed: boolean;
  remaining: number;
  limit: number;
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function valueOrUndefined<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const compacted = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return Object.fromEntries(compacted) as T;
}

function summarizeTreatment(treatment: Treatment | undefined): GeminiPreviewTreatment | undefined {
  if (!treatment) return undefined;
  return compactObject({
    type: treatment.treatment_type,
    amountValue: valueOrUndefined(treatment.amount_value),
    amountUnit: valueOrUndefined(treatment.amount_unit),
    method: valueOrUndefined(treatment.method),
  });
}

function summarizeMeasurement(
  measurement: Measurement | undefined,
): GeminiPreviewMeasurement | undefined {
  if (!measurement) return undefined;
  const summary = compactObject({
    heightCm: valueOrUndefined(measurement.height_cm),
    leafCount: valueOrUndefined(measurement.leaf_count),
    soilMoisturePercent: valueOrUndefined(measurement.soil_moisture_percent),
    healthScore: valueOrUndefined(measurement.health_score),
    pestSeverityScore: valueOrUndefined(measurement.pest_severity_score),
    bloomCount: valueOrUndefined(measurement.bloom_count),
  });
  return Object.keys(summary).length ? summary : undefined;
}

function summarizeEnvironment(
  snapshot: EnvironmentSnapshot | undefined,
): GeminiPreviewEnvironment | undefined {
  if (!snapshot) return undefined;
  return compactObject({
    source: snapshot.source,
    indoorTemperatureC: valueOrUndefined(snapshot.indoor_temperature_c),
    outdoorTemperatureC: valueOrUndefined(snapshot.outdoor_temperature_c),
    relativeHumidityPercent: valueOrUndefined(snapshot.relative_humidity_percent),
    lightLux: valueOrUndefined(snapshot.light_lux),
    photoperiodHours: valueOrUndefined(snapshot.photoperiod_hours),
    weatherSummary: valueOrUndefined(snapshot.weather_summary),
    climateZone: valueOrUndefined(snapshot.climate_zone),
  });
}

function summarizeObservation(observation: Observation): GeminiPreviewObservation {
  return compactObject({
    observedAt: observation.observed_at,
    type: observation.observation_type,
    treatment: summarizeTreatment(observation.treatments?.[0]),
    measurement: summarizeMeasurement(observation.measurements?.[0]),
    environment: summarizeEnvironment(observation.environment_snapshots?.[0]),
    hasPhoto: (observation.photos?.length ?? 0) > 0,
  });
}

function climateZoneFor(plant: Plant): string | undefined {
  if (typeof plant.location_id === 'object' && plant.location_id) {
    return valueOrUndefined(plant.location_id.climate_zone);
  }
  return undefined;
}

export function buildPlantGeminiPreviewPayload(
  plant: Plant,
  units: Units,
  image?: GeminiPreviewImage,
): GeminiPreviewPayload {
  const observations = plant.observations ?? [];
  const species = plant.species_id ?? null;
  const photoCount = observations.reduce((count, observation) => {
    return count + (observation.photos?.length ?? 0);
  }, 0);
  const summary = compactObject({
    nickname: plant.nickname,
    commonName: valueOrUndefined(plant.common_name ?? species?.common_names[0]),
    scientificName: valueOrUndefined(species?.scientific_name ?? plant.species_text),
    status: plant.status,
    placementType: plant.placement_type,
    placementLabel: valueOrUndefined(plant.placement_label),
    climateZone: climateZoneFor(plant),
    units,
    observationCount: observations.length,
    photoCount,
    observations: observations.slice(0, 16).map(summarizeObservation),
  });

  return compactObject({
    plantSummary: summary,
    image,
  });
}

function buildPrompt(summary: GeminiPlantSummary): string {
  return [
    'You are PlantDoc AI Preview. Give cautious, non-diagnostic houseplant care observations from the supplied structured log data and optional latest photo.',
    'Do not claim medical, pesticide, or species certainty. Distinguish logged facts from visual guesses. Prefer practical next checks over confident instructions.',
    'Return 3 concise bullets and a one-line "Why" based only on the data below.',
    'Never mention private notes, hidden IDs, or exact location because they are intentionally excluded.',
    'Plant summary JSON:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

export function buildGeminiGenerateContentRequest(
  payload: GeminiPreviewPayload,
  model = GEMINI_PREVIEW_MODEL,
): GeminiGenerateContentRequest {
  const parts: GeminiRequestPart[] = [{ text: buildPrompt(payload.plantSummary) }];
  if (payload.image) {
    parts.push({
      inline_data: {
        mime_type: payload.image.mimeType,
        data: payload.image.base64,
      },
    });
  }
  return {
    model,
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: 384,
      temperature: 0.35,
    },
  };
}

export function parseGeminiPreviewText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const candidates = (response as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const text = candidates
    .flatMap((candidate) => {
      const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
      if (!Array.isArray(parts)) return [];
      return parts.map((part) => (part as { text?: unknown }).text).filter((part) => typeof part === 'string');
    })
    .join('\n')
    .trim();
  return text || null;
}

export interface AiPreviewResponseBody {
  text?: string;
  error?: string;
  warning?: string;
}

/**
 * Reads the /api/gemini-insights response without assuming it is JSON.
 * Stale deployments and dev servers without the worker answer /api/* with
 * empty or HTML bodies; those must degrade to {} so the caller can show its
 * own error copy instead of a raw JSON-parse exception.
 */
export async function readAiPreviewResponseBody(response: {
  text(): Promise<string>;
}): Promise<AiPreviewResponseBody> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return compactObject({
      text: typeof record.text === 'string' ? record.text : undefined,
      error: typeof record.error === 'string' ? record.error : undefined,
      warning: typeof record.warning === 'string' ? record.warning : undefined,
    });
  } catch {
    return {};
  }
}

export function aiPreviewQuotaKey(userId: string, plantId: string, now = new Date()): string {
  return `plantdoc:ai-preview:${userId}:${plantId}:${now.toISOString().slice(0, 10)}`;
}

function readAiPreviewCount(storage: Pick<KeyValueStorage, 'getItem'>, key: string): number {
  const raw = storage.getItem(key);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function canUseAiPreview(
  storage: Pick<KeyValueStorage, 'getItem'>,
  userId: string,
  plantId: string,
  now = new Date(),
  limit = AI_PREVIEW_DAILY_LIMIT,
): AiPreviewQuota {
  const used = readAiPreviewCount(storage, aiPreviewQuotaKey(userId, plantId, now));
  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
  };
}

export function recordAiPreviewUse(
  storage: KeyValueStorage,
  userId: string,
  plantId: string,
  now = new Date(),
  limit = AI_PREVIEW_DAILY_LIMIT,
): AiPreviewQuota {
  const key = aiPreviewQuotaKey(userId, plantId, now);
  const used = readAiPreviewCount(storage, key);
  if (used >= limit) {
    return { allowed: false, remaining: 0, limit };
  }
  storage.setItem(key, String(used + 1));
  return {
    allowed: used + 1 < limit,
    remaining: Math.max(0, limit - used - 1),
    limit,
  };
}
