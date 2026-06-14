import type { SubstrateType } from './types';

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
