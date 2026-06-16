/**
 * Pure builder: turns a hydrated indoor Plant + its observations, private
 * moisture feedback, and SpeciesCareProfile into the engine's EstimateInput plus
 * the species moisture band used as a recommendation prior (spec Unit C). No I/O —
 * the caller (moistureForPlant) supplies already-loaded data and `now`.
 */
import type { LightLevel, MoistureFeedback, Plant } from './types';
import type { SpeciesCareProfile } from './knowledge/care-profiles';
import {
  ANCHORS,
  INDOOR_DEFAULT_RH,
  recencyWeight,
  seasonalIndoorTempC,
  waterCapacityMl,
  type DayClimate,
  type EstimateInput,
  type Hemisphere,
  type MoistureBand,
  type PotSpec,
  type WaterContentCorrection,
  type WateringEvent,
} from './moisture';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back ground-truth corrections count toward confidence and the recent window. */
const OBSERVATION_WINDOW_DAYS = 60;
/** Permapeople water_requirement -> daily ET fraction of capacity (spec §B.3). */
const WATER_REQUIREMENT_FRACTION: Record<MoistureBand, number> = { dry: 0.08, moist: 0.12, wet: 0.18 };
/** Species with no stated water requirement default to the "moist" fraction. */
const DEFAULT_SPECIES_DAILY_FRACTION = WATER_REQUIREMENT_FRACTION.moist;
/** Each estimate-feedback magnitude step ~= 14% of the Dry->Wet span (spec Unit C). */
const FEEDBACK_STEP_FRACTION = (ANCHORS.wet - ANCHORS.dry) / 5;

export const FEEDBACK_DRIFT_THRESHOLD_PCT = 8;

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface LatestFeedbackAnchor {
  observedAtMs: number;
  predictedPercent: number;
  dir: -1 | 0 | 1;
  magnitude: number;
  weight: number;
}

type TaggedCorrection = WaterContentCorrection & {
  weight: number;
  source: 'measurement' | 'feedback';
  feedback?: { predictedPercent: number; dir: -1 | 0 | 1; magnitude: number };
};

/** Bucket a device/range soil-moisture percent to a qualitative band: <30 dry, 30-70 moist, >70 wet. */
function percentToBand(pct: number): MoistureBand {
  if (pct < 30) return 'dry';
  if (pct > 70) return 'wet';
  return 'moist';
}

function resolveSpeciesDailyFraction(profile: SpeciesCareProfile | null): number {
  const fact = profile?.cultivationFacts?.find((c) => c.attribute === 'water_requirement');
  if (!fact) return DEFAULT_SPECIES_DAILY_FRACTION;
  const value = fact.value.trim().toLowerCase();
  if (value.includes('wet')) return WATER_REQUIREMENT_FRACTION.wet;
  if (value.includes('moist')) return WATER_REQUIREMENT_FRACTION.moist;
  if (value.includes('dry')) return WATER_REQUIREMENT_FRACTION.dry;
  return DEFAULT_SPECIES_DAILY_FRACTION;
}

function resolveSpeciesBand(profile: SpeciesCareProfile | null): { band: MoistureBand; sourced: boolean } {
  const range = profile?.communityRanges?.find((r) => r.attribute === 'soil_moisture_percent');
  if (!range) return { band: 'moist', sourced: false };
  return { band: percentToBand((range.min + range.max) / 2), sourced: true };
}

function resolveHemisphere(plant: Plant): Hemisphere {
  const location = plant.location_id;
  if (location && typeof location === 'object' && Array.isArray(location.location)) {
    const latitude = location.location[1];
    if (typeof latitude === 'number') return latitude < 0 ? 'south' : 'north';
  }
  return 'north';
}

function makeClimateResolver(plant: Plant, hemisphere: Hemisphere): (iso: string) => DayClimate {
  const light: LightLevel = plant.light_level ?? 'medium';
  return (iso) => ({ tempC: seasonalIndoorTempC(iso, hemisphere), humidityPct: INDOOR_DEFAULT_RH, light });
}

export interface BuildMoistureInputsArgs {
  plant: Plant;
  careProfile: SpeciesCareProfile | null;
  feedback: MoistureFeedback[];
  now: number;
}

export interface MoistureInputs {
  estimate: EstimateInput;
  band: MoistureBand;
  /** False when the band fell back to the default (no mined range) — caller lowers confidence. */
  bandSourced: boolean;
  /** Latest in-window feedback as a post-blend anchor (Unit C); null when none. */
  latestFeedback: LatestFeedbackAnchor | null;
  /** Latest watering/repot/ground-truth measurement time, for the "new event" eligibility check. */
  lastNonFeedbackEventMs: number | null;
  /** True when at least one ground-truth soil measurement exists in-window. */
  hasRecentGroundTruth: boolean;
}

export function buildMoistureInputs(args: BuildMoistureInputsArgs): MoistureInputs {
  const { plant, careProfile, feedback, now } = args;
  const observations = plant.observations ?? [];
  const startMs = now - OBSERVATION_WINDOW_DAYS * DAY_MS;
  const hemisphere = resolveHemisphere(plant);

  const pot: PotSpec = {
    diameterCm: plant.pot_diameter_cm ?? 0,
    heightCm: plant.pot_height_cm ?? 0,
    substrate: plant.substrate_type ?? 'standard',
    drains: plant.pot_drains ?? true,
  };
  const capacityMl = waterCapacityMl(pot);

  const waterings: WateringEvent[] = [];
  const tagged: TaggedCorrection[] = [];
  let repotBoundaryMs: number | undefined;
  let lastNonFeedbackEventMs: number | null = null;
  const noteEvent = (ms: number) => {
    lastNonFeedbackEventMs = lastNonFeedbackEventMs === null ? ms : Math.max(lastNonFeedbackEventMs, ms);
  };

  for (const observation of observations) {
    const observedAtMs = Date.parse(observation.observed_at);
    if (!Number.isFinite(observedAtMs)) continue;
    const withinWindow = observedAtMs >= startMs && observedAtMs <= now;

    for (const treatment of observation.treatments ?? []) {
      if (treatment.treatment_type === 'watering') {
        waterings.push({ observedAtMs, amountMl: treatment.amount_value });
        noteEvent(observedAtMs);
      } else if (treatment.treatment_type === 'repotting') {
        repotBoundaryMs =
          repotBoundaryMs === undefined ? observedAtMs : Math.max(repotBoundaryMs, observedAtMs);
        noteEvent(observedAtMs);
      }
    }

    if (!withinWindow) continue;
    for (const measurement of observation.measurements ?? []) {
      if (measurement.soil_state) {
        tagged.push({ observedAtMs, waterContentMl: ANCHORS[measurement.soil_state] * capacityMl, weight: 1, source: 'measurement' });
        noteEvent(observedAtMs);
      } else if (typeof measurement.soil_moisture_percent === 'number') {
        tagged.push({
          observedAtMs,
          waterContentMl: ANCHORS[percentToBand(measurement.soil_moisture_percent)] * capacityMl,
          weight: 1,
          source: 'measurement',
        });
        noteEvent(observedAtMs);
      }
    }
  }

  const stepMl = FEEDBACK_STEP_FRACTION * capacityMl;
  for (const entry of feedback) {
    const observedAtMs = Date.parse(entry.observed_at);
    if (!Number.isFinite(observedAtMs) || observedAtMs < startMs || observedAtMs > now) continue;
    if (entry.predicted_moisture_percent === null) continue;
    const predictedMl = (entry.predicted_moisture_percent / 100) * capacityMl;
    const dir: -1 | 0 | 1 = entry.estimate_feedback === 'wetter' ? 1 : entry.estimate_feedback === 'drier' ? -1 : 0;
    const magnitude = entry.magnitude ?? 0;
    tagged.push({
      observedAtMs,
      waterContentMl: predictedMl + dir * magnitude * stepMl,
      weight: 1,
      source: 'feedback',
      feedback: { predictedPercent: entry.predicted_moisture_percent, dir, magnitude },
    });
  }

  // Recency-weight every correction by the gap to the previous one (spec Unit B).
  tagged.sort((a, b) => a.observedAtMs - b.observedAtMs);
  let prevMs: number | null = null;
  for (const c of tagged) {
    c.weight = prevMs === null ? 1 : recencyWeight(c.observedAtMs - prevMs);
    prevMs = c.observedAtMs;
  }

  const corrections: WaterContentCorrection[] = tagged.map((c) => ({
    observedAtMs: c.observedAtMs,
    waterContentMl: c.waterContentMl,
    weight: c.weight,
  }));
  const groundTruthCount = tagged.reduce((sum, c) => sum + c.weight, 0);
  const hasRecentGroundTruth = tagged.some((c) => c.source === 'measurement');

  let latestFeedback: LatestFeedbackAnchor | null = null;
  for (const c of tagged) {
    if (c.source === 'feedback' && c.feedback && (!latestFeedback || c.observedAtMs >= latestFeedback.observedAtMs)) {
      latestFeedback = {
        observedAtMs: c.observedAtMs,
        predictedPercent: c.feedback.predictedPercent,
        dir: c.feedback.dir,
        magnitude: c.feedback.magnitude,
        weight: c.weight,
      };
    }
  }

  const { band, sourced } = resolveSpeciesBand(careProfile);

  const estimate: EstimateInput = {
    pot,
    startMs,
    endMs: now,
    waterings,
    dailyClimate: makeClimateResolver(plant, hemisphere),
    speciesDailyFraction: resolveSpeciesDailyFraction(careProfile),
    corrections,
    repotBoundaryMs,
    substratePresent: plant.substrate_type != null,
    amountMeasured: waterings.some((w) => typeof w.amountMl === 'number' && Number.isFinite(w.amountMl)),
    groundTruthCount,
  };

  return { estimate, band, bandSourced: sourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth };
}

/**
 * Whether the feedback prompt should be offered (spec Unit C). Eligible when there
 * is no prior feedback, a new correction event happened after the last rating, or
 * the live estimate has drifted past the threshold from the rating's post-blend anchor.
 */
export function isFeedbackEligible(args: {
  currentPercent: number;
  latestFeedback: LatestFeedbackAnchor | null;
  lastNonFeedbackEventMs: number | null;
}): boolean {
  const { currentPercent, latestFeedback, lastNonFeedbackEventMs } = args;
  if (!latestFeedback) return true;
  if (lastNonFeedbackEventMs !== null && lastNonFeedbackEventMs > latestFeedback.observedAtMs) return true;
  const stepPct = FEEDBACK_STEP_FRACTION * 100;
  const anchorPct = clampPct(
    latestFeedback.predictedPercent + latestFeedback.weight * latestFeedback.dir * latestFeedback.magnitude * stepPct,
  );
  return Math.abs(Math.round(currentPercent) - anchorPct) >= FEEDBACK_DRIFT_THRESHOLD_PCT;
}
