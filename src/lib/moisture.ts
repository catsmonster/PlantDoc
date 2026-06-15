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
        waterContentMl = clamp(event.waterContentMl, residualMl, capacityMl);
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

export function estimateMoisture(input: EstimateInput): MoistureEstimate {
  const simulation = simulateWaterContent(input);
  const score =
    (input.substratePresent ? 1 : 0) + (input.amountMeasured ? 1 : 0) + Math.min(input.groundTruthCount, 3);
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
