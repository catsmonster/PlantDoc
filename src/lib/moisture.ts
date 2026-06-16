import type { Insight, InsightSeverity } from './insights';
import type { LightLevel, SubstrateType } from './types';

export type { LightLevel } from './types';

export interface PotSpec {
  diameterCm: number;
  heightCm: number;
  substrate: SubstrateType;
  drains: boolean;
}

/** Field-capacity volumetric water fraction θ_fc by substrate (spec §B.2). */
export const FIELD_CAPACITY: Record<SubstrateType, number> = {
  standard: 0.35,
  peat_seedling: 0.45,
  succulent_gritty: 0.2,
  chunky_aroid: 0.18,
};

/** Soil volume in ml (cm³): π·(d/2)²·h·0.85 (0.85 = taper + root/headspace). */
export function potSoilVolumeMl(diameterCm: number, heightCm: number): number {
  const r = diameterCm / 2;
  return Math.PI * r * r * heightCm * 0.85;
}

/** Water-holding capacity at field capacity, ml. Non-draining pots hold ~15% more. */
export function waterCapacityMl(spec: PotSpec): number {
  const volume = potSoilVolumeMl(spec.diameterCm, spec.heightCm);
  const capacity = volume * FIELD_CAPACITY[spec.substrate];
  return spec.drains ? capacity : capacity * 1.15;
}

export const ANCHORS = { dry: 0.15, moist: 0.5, wet: 0.85 } as const;

/** Correction recency weighting (spec Unit B): a correction's influence ramps
 *  from 0 at/below FLOOR to 1 at/above SATURATION, by the gap to the previous
 *  correction. Spam (sub-floor) is ignored; well-spaced ground truth is trusted. */
export const CORRECTION_WEIGHT_FLOOR_MS = 20 * 60 * 1000;
export const CORRECTION_WEIGHT_SATURATION_MS = 6 * 60 * 60 * 1000;

export function recencyWeight(gapMs: number): number {
  if (gapMs >= CORRECTION_WEIGHT_SATURATION_MS) return 1;
  const span = CORRECTION_WEIGHT_SATURATION_MS - CORRECTION_WEIGHT_FLOOR_MS;
  return clamp((gapMs - CORRECTION_WEIGHT_FLOOR_MS) / span, 0, 1);
}

export const LIGHT_FACTOR: Record<LightLevel, number> = {
  low: 0.7,
  medium: 1,
  bright: 1.25,
  direct_sun: 1.5,
};

export interface DayClimate {
  tempC: number;
  humidityPct: number;
  light: LightLevel;
}

export interface EtInputs {
  capacityMl: number;
  speciesDailyFraction: number;
  tempC: number;
  humidityPct: number;
  light: LightLevel;
  canopyFactor?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Daily evapotranspiration in ml (spec §B.3). */
export function dailyEtMl(inputs: EtInputs): number {
  const base = inputs.capacityMl * inputs.speciesDailyFraction;
  const tempFactor = clamp(1 + (inputs.tempC - 20) * 0.04, 0.3, 2.5);
  const humidityFactor = clamp(1 + (50 - inputs.humidityPct) * 0.01, 0.4, 1.8);
  const canopyFactor = inputs.canopyFactor ?? 1;

  return base * tempFactor * humidityFactor * LIGHT_FACTOR[inputs.light] * canopyFactor;
}

export interface WateringEvent {
  observedAtMs: number;
  amountMl?: number | null;
}

export interface WaterContentCorrection {
  observedAtMs: number;
  waterContentMl: number;
  /** Recency weight 0..1; omitted ⇒ 1 (full correction). Blended in simulateWaterContent. */
  weight?: number;
}

export interface SimInput {
  pot: PotSpec;
  startMs: number;
  endMs: number;
  waterings: WateringEvent[];
  dailyClimate: (iso: string) => DayClimate;
  speciesDailyFraction: number;
  canopyFactor?: number;
  corrections: WaterContentCorrection[];
  repotBoundaryMs?: number;
}

export interface SimResult {
  waterContentMl: number;
  capacityMl: number;
  residualMl: number;
  lowConfidenceStart: boolean;
}

export type Confidence = 'low' | 'medium' | 'high';

export interface EstimateInput extends SimInput {
  substratePresent: boolean;
  amountMeasured: boolean;
  groundTruthCount: number;
}

export interface MoistureEstimate {
  moisturePercent: number;
  confidence: Confidence;
  capacityMl: number;
}

type TimelineEvent =
  | {
      kind: 'watering';
      observedAtMs: number;
      amountMl?: number | null;
    }
  | {
      kind: 'correction';
      observedAtMs: number;
      waterContentMl: number;
      weight: number;
    };

const DAY_MS = 24 * 60 * 60 * 1000;
const RESIDUAL_FRACTION = 0.05;
const UNKNOWN_WATERING_FRACTION = 0.4;
const UNKNOWN_REPOT_WATER_FRACTION = 0.5;

function dateIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function nextUtcDayBoundaryMs(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/** Indoor water-balance simulation from the latest watering/repot/window boundary. */
export function simulateWaterContent(input: SimInput): SimResult {
  const capacityMl = waterCapacityMl(input.pot);
  const residualMl = capacityMl * RESIDUAL_FRACTION;
  const lastWateringMs = input.waterings.reduce(
    (latest, watering) =>
      watering.observedAtMs <= input.endMs ? Math.max(latest, watering.observedAtMs) : latest,
    Number.NEGATIVE_INFINITY,
  );
  const activeRepotBoundaryMs =
    input.repotBoundaryMs !== undefined && input.repotBoundaryMs <= input.endMs
      ? input.repotBoundaryMs
      : Number.NEGATIVE_INFINITY;
  const boundaryMs = Math.max(input.startMs, lastWateringMs, activeRepotBoundaryMs);
  const hasWateringAtOrAfterBoundary = input.waterings.some(
    (watering) => watering.observedAtMs >= boundaryMs && watering.observedAtMs <= input.endMs,
  );
  const lowConfidenceStart = !hasWateringAtOrAfterBoundary && activeRepotBoundaryMs === boundaryMs;
  let waterContentMl = hasWateringAtOrAfterBoundary
    ? residualMl
    : lowConfidenceStart
      ? capacityMl * UNKNOWN_REPOT_WATER_FRACTION
      : residualMl;

  const events: TimelineEvent[] = [
    ...input.waterings.map(
      (watering): TimelineEvent => ({
        kind: 'watering',
        observedAtMs: watering.observedAtMs,
        amountMl: watering.amountMl,
      }),
    ),
    ...input.corrections.map(
      (correction): TimelineEvent => ({
        kind: 'correction',
        observedAtMs: correction.observedAtMs,
        waterContentMl: correction.waterContentMl,
        weight: correction.weight ?? 1,
      }),
    ),
  ]
    .filter((event) => event.observedAtMs >= boundaryMs && event.observedAtMs <= input.endMs)
    .sort((a, b) => {
      const timeOrder = a.observedAtMs - b.observedAtMs;
      if (timeOrder !== 0) {
        return timeOrder;
      }
      if (a.kind === b.kind) {
        return 0;
      }
      return a.kind === 'watering' ? -1 : 1;
    });

  let nextEventIndex = 0;
  const applyEventsAt = (timestampMs: number) => {
    while (nextEventIndex < events.length && events[nextEventIndex].observedAtMs === timestampMs) {
      const event = events[nextEventIndex];
      if (event.kind === 'watering') {
        waterContentMl = Math.min(
          capacityMl,
          waterContentMl + (event.amountMl ?? capacityMl * UNKNOWN_WATERING_FRACTION),
        );
      } else {
        const blended = event.weight * event.waterContentMl + (1 - event.weight) * waterContentMl;
        waterContentMl = clamp(blended, residualMl, capacityMl);
      }
      nextEventIndex += 1;
    }
  };

  let cursorMs = boundaryMs;
  applyEventsAt(cursorMs);

  while (cursorMs < input.endMs) {
    const nextEventMs = events[nextEventIndex]?.observedAtMs ?? Number.POSITIVE_INFINITY;
    const nextTimestampMs = Math.min(nextEventMs, nextUtcDayBoundaryMs(cursorMs), input.endMs);
    const climate = input.dailyClimate(dateIso(cursorMs));
    waterContentMl = Math.max(
      residualMl,
      waterContentMl -
        dailyEtMl({
          capacityMl,
          speciesDailyFraction: input.speciesDailyFraction,
          tempC: climate.tempC,
          humidityPct: climate.humidityPct,
          light: climate.light,
          canopyFactor: input.canopyFactor,
        }) *
          ((nextTimestampMs - cursorMs) / DAY_MS),
    );

    cursorMs = nextTimestampMs;
    applyEventsAt(cursorMs);
  }

  return {
    waterContentMl: clamp(waterContentMl, residualMl, capacityMl),
    capacityMl,
    residualMl,
    lowConfidenceStart,
  };
}

function normalizedGroundTruthCount(count: number): number {
  return Number.isFinite(count) ? clamp(Math.round(count), 0, 3) : 0;
}

function hasMeasuredWateringAmount(waterings: WateringEvent[]): boolean {
  return waterings.some((watering) => typeof watering.amountMl === 'number' && Number.isFinite(watering.amountMl));
}

export function estimateMoisture(input: EstimateInput): MoistureEstimate {
  const simulation = simulateWaterContent(input);
  const score =
    (input.substratePresent ? 1 : 0) +
    (input.amountMeasured && hasMeasuredWateringAmount(input.waterings) ? 1 : 0) +
    normalizedGroundTruthCount(input.groundTruthCount);
  let confidence: Confidence = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';

  if (simulation.lowConfidenceStart && confidence === 'high') {
    confidence = 'medium';
  }

  return {
    moisturePercent:
      simulation.capacityMl > 0 ? clamp((simulation.waterContentMl / simulation.capacityMl) * 100, 0, 100) : 0,
    confidence,
    capacityMl: simulation.capacityMl,
  };
}

export type Hemisphere = 'north' | 'south';

/** Default indoor relative humidity (%) when unmeasured (spec §B.3). */
export const INDOOR_DEFAULT_RH = 45;

/**
 * Indoor air temperature (°C) from a low-variance seasonal default (spec §B.3):
 * ~25 in the warm half of the year, ~23 in the cool half. The warm half is
 * May–Oct in the northern hemisphere, inverted in the south.
 */
export function seasonalIndoorTempC(iso: string, hemisphere: Hemisphere): number {
  const month = new Date(iso).getUTCMonth() + 1; // 1–12
  const northernWarm = month >= 5 && month <= 10;
  const warm = hemisphere === 'north' ? northernWarm : !northernWarm;
  return warm ? 25 : 23;
}

export type MoistureBand = 'dry' | 'moist' | 'wet';

export type WateringStatus = 'water_now' | 'drying' | 'comfortable' | 'overwatered';

export interface RecommendOptions {
  /** Species moisture preference; colors downstream wording only, never the thresholds. */
  band?: MoistureBand;
  /** When provided, projects forward to estimate days until the Dry anchor. */
  et?: EtInputs;
}

export interface WateringRecommendation {
  status: WateringStatus;
  /** Days until soil reaches the Dry anchor — present only when `opts.et` is supplied and soil sits above it. */
  daysUntilDry?: number;
}

/**
 * Watering recommendation on the internal capacity-fraction scale (spec §B.4).
 * The three ANCHORS (×100) partition 0–100 into four statuses; the species `band`
 * only colors downstream wording, never the cutoffs.
 */
export function recommendWatering(
  moisturePercent: number,
  opts: RecommendOptions = {},
): WateringRecommendation {
  const pct = clamp(moisturePercent, 0, 100);
  const dry = ANCHORS.dry * 100;
  const moist = ANCHORS.moist * 100;
  const wet = ANCHORS.wet * 100;

  let status: WateringStatus;
  if (pct <= dry) {
    status = 'water_now';
  } else if (pct < moist) {
    status = 'drying';
  } else if (pct < wet) {
    status = 'comfortable';
  } else {
    status = 'overwatered';
  }

  const recommendation: WateringRecommendation = { status };

  if (opts.et) {
    const dailyLoss = dailyEtMl(opts.et);
    const aboveDryMl = (pct / 100 - ANCHORS.dry) * opts.et.capacityMl;
    if (dailyLoss > 0 && aboveDryMl > 0) {
      recommendation.daysUntilDry = aboveDryMl / dailyLoss;
    }
  }

  return recommendation;
}

const MOISTURE_INSIGHT_SEVERITY: Record<WateringStatus, InsightSeverity> = {
  water_now: 'warning',
  overwatered: 'warning',
  drying: 'suggestion',
  comfortable: 'info',
};

const MOISTURE_INSIGHT_TITLE: Record<WateringStatus, string> = {
  water_now: 'Time to water',
  drying: 'Starting to dry out',
  comfortable: 'Soil moisture looks comfortable',
  overwatered: 'Soil looks waterlogged',
};

/** Short human phrase per status — reused by the insight detail and the Gemini estimate summary. */
export const MOISTURE_INSIGHT_STATUS_PHRASE: Record<WateringStatus, string> = {
  water_now: 'likely dry enough to water',
  drying: 'drying down',
  comfortable: 'comfortably moist',
  overwatered: 'wetter than ideal',
};

/** Low-confidence nudge built from only the missing signals (spec Unit E) — never
 *  mentions pot size, which is always present when this card renders. */
function enrichmentNudge(needsSoilCheck: boolean, needsSubstrate: boolean): string | null {
  const actions: string[] = [];
  if (needsSoilCheck) actions.push('log a soil check');
  if (needsSubstrate) actions.push('set your soil type');
  if (actions.length === 0) return null;
  const joined = actions.length === 2 ? `${actions[0]} and ${actions[1]}` : actions[0];
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} to sharpen this estimate.`;
}

const MOISTURE_BAND_PREFERENCE: Record<MoistureBand, string> = {
  dry: 'prefers to dry out between waterings',
  moist: 'likes evenly moist soil',
  wet: 'likes staying consistently damp',
};

/** Experimental "soil moisture" insight built from a model estimate, not a timeline-entry count. */
export function moistureInsight(
  estimate: { moisturePercent: number; confidence: Confidence },
  recommendation: WateringRecommendation,
  speciesName: string | null,
  band: MoistureBand | null,
  enrichment: { needsSoilCheck: boolean; needsSubstrate: boolean } = { needsSoilCheck: false, needsSubstrate: false },
): Insight {
  const pct = Math.round(estimate.moisturePercent);
  const statusPhrase = MOISTURE_INSIGHT_STATUS_PHRASE[recommendation.status];
  const speciesClause = speciesName ? ` for ${speciesName}` : '';

  let detail = `Estimated around ${pct}% of capacity — ${statusPhrase}${speciesClause}.`;
  if (band) {
    const subject = speciesName ? 'It' : 'This plant';
    detail += ` ${subject} ${MOISTURE_BAND_PREFERENCE[band]}.`;
  }
  if (estimate.confidence === 'low') {
    const nudge = enrichmentNudge(enrichment.needsSoilCheck, enrichment.needsSubstrate);
    if (nudge) detail += ` ${nudge}`;
  }

  return {
    kind: 'soil_moisture',
    severity: MOISTURE_INSIGHT_SEVERITY[recommendation.status],
    title: MOISTURE_INSIGHT_TITLE[recommendation.status],
    detail,
    // This is a model estimate, not an entry count — the card shows confidence, not an evidence tally.
    evidenceCount: 0,
  };
}

/** Status→accent color for the moisture %, per theme. Shared by the plant-detail
 *  hero gauge and the home dashboard chip so both render on one scale. */
export function moistureStatusColor(status: WateringStatus, isDark: boolean): string {
  const dark: Record<WateringStatus, string> = {
    comfortable: '#C7F24A',
    drying: '#E0C56B',
    water_now: '#E0A36B',
    overwatered: '#7FC8E0',
  };
  const light: Record<WateringStatus, string> = {
    comfortable: '#3C7140',
    drying: '#A88A3C',
    water_now: '#B07F57',
    overwatered: '#3F7E91',
  };
  return (isDark ? dark : light)[status];
}
