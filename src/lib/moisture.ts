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

export const LIGHT_FACTOR: Record<LightLevel, number> = {
  low: 0.7,
  medium: 1,
  bright: 1.25,
  direct_sun: 1.5,
};

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
