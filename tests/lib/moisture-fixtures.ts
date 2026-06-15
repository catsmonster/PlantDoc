/**
 * Shared pure-data builders for the moisture read-layer tests, mirroring the real
 * row shapes in src/lib/types.ts. Keep in sync with those types. Not a test file.
 */
import type { Measurement, Observation, Plant, Treatment, TreatmentType } from '../../src/lib/types';
import type { SpeciesCareProfile } from '../../src/lib/knowledge/care-profiles';

export const NOW = Date.parse('2026-07-15T12:00:00.000Z');
export const daysAgo = (n: number): string => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

export function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    $id: 'plant-1',
    $createdAt: daysAgo(120),
    $updatedAt: daysAgo(0),
    user_id: 'user-1',
    species_id: null,
    species_text: 'Ocimum basilicum',
    nickname: 'Basil',
    common_name: 'Basil',
    acquired_on: null,
    status: 'active',
    placement_type: 'indoor',
    placement_label: null,
    pot_diameter_cm: 12,
    pot_height_cm: 10,
    substrate_type: 'standard',
    pot_drains: true,
    light_level: 'bright',
    observations: [],
    ...overrides,
  };
}

export function treatment(type: TreatmentType, amountMl: number | null = null): Treatment {
  return {
    $id: `treatment-${Math.random()}`,
    $createdAt: daysAgo(0),
    $updatedAt: daysAgo(0),
    user_id: 'user-1',
    treatment_type: type,
    amount_value: amountMl,
    amount_unit: amountMl === null ? null : 'ml',
    product_name: null,
    method: null,
    notes_private: null,
  };
}

export function measurement(overrides: Partial<Measurement>): Measurement {
  return {
    $id: `measurement-${Math.random()}`,
    $createdAt: daysAgo(0),
    $updatedAt: daysAgo(0),
    user_id: 'user-1',
    height_cm: null,
    leaf_count: null,
    soil_moisture_percent: null,
    health_score: null,
    pest_severity_score: null,
    bloom_count: null,
    soil_state: null,
    notes_private: null,
    ...overrides,
  };
}

export function observation(observedAt: string, parts: Partial<Observation>): Observation {
  return {
    $id: `obs-${Math.random()}`,
    $createdAt: observedAt,
    $updatedAt: observedAt,
    user_id: 'user-1',
    observed_at: observedAt,
    observation_type: 'note',
    notes_private: null,
    contribute_to_public_dataset: false,
    ...parts,
  };
}

export function baseProfile(overrides: Partial<SpeciesCareProfile> = {}): SpeciesCareProfile {
  return {
    slug: 'basil',
    scientificName: 'Ocimum basilicum',
    nameSourceId: 'powo',
    commonNames: ['Basil'],
    synonyms: [],
    family: { value: 'Lamiaceae', sourceId: 'powo' },
    light: { value: 'Bright', sourceId: 'editorial' },
    waterCadenceDays: { value: { min: 3, max: 5 }, sourceId: 'editorial' },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: 'editorial' },
    humidity: { value: 'Average', sourceId: 'editorial' },
    toxicity: { value: 'Non-toxic', sourceId: 'editorial' },
    commonStressSigns: { value: [], sourceId: 'editorial' },
    likelyPests: { value: [], sourceId: 'editorial' },
    ...overrides,
  };
}
