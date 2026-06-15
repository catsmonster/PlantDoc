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
const DEFAULT_SPECIES_DAILY_FRACTION = 0.12;
/** Permapeople water_requirement -> daily ET fraction of capacity (spec §B.3). */
const WATER_REQUIREMENT_FRACTION: Record<MoistureBand, number> = { dry: 0.08, moist: 0.12, wet: 0.18 };
/** Each estimate-feedback magnitude step ~= 14% of the Dry->Wet span (spec Unit C). */
const FEEDBACK_STEP_FRACTION = (ANCHORS.wet - ANCHORS.dry) / 5;

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
  const corrections: WaterContentCorrection[] = [];
  let repotBoundaryMs: number | undefined;

  for (const observation of observations) {
    const observedAtMs = Date.parse(observation.observed_at);
    if (!Number.isFinite(observedAtMs)) continue;
    const withinWindow = observedAtMs >= startMs && observedAtMs <= now;

    for (const treatment of observation.treatments ?? []) {
      if (treatment.treatment_type === 'watering') {
        waterings.push({ observedAtMs, amountMl: treatment.amount_value });
      } else if (treatment.treatment_type === 'repotting') {
        repotBoundaryMs =
          repotBoundaryMs === undefined ? observedAtMs : Math.max(repotBoundaryMs, observedAtMs);
      }
    }

    if (!withinWindow) continue;
    for (const measurement of observation.measurements ?? []) {
      if (measurement.soil_state) {
        corrections.push({ observedAtMs, waterContentMl: ANCHORS[measurement.soil_state] * capacityMl });
      } else if (typeof measurement.soil_moisture_percent === 'number') {
        corrections.push({
          observedAtMs,
          waterContentMl: ANCHORS[percentToBand(measurement.soil_moisture_percent)] * capacityMl,
        });
      }
    }
  }

  const stepMl = FEEDBACK_STEP_FRACTION * capacityMl;
  for (const entry of feedback) {
    const observedAtMs = Date.parse(entry.observed_at);
    if (!Number.isFinite(observedAtMs) || observedAtMs < startMs || observedAtMs > now) continue;
    if (entry.predicted_moisture_percent === null) continue;
    const predictedMl = (entry.predicted_moisture_percent / 100) * capacityMl;
    const direction = entry.estimate_feedback === 'wetter' ? 1 : entry.estimate_feedback === 'drier' ? -1 : 0;
    corrections.push({ observedAtMs, waterContentMl: predictedMl + direction * (entry.magnitude ?? 0) * stepMl });
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
    groundTruthCount: corrections.length,
  };

  return { estimate, band, bandSourced: sourced };
}
