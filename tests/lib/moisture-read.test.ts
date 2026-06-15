import { describe, expect, it } from 'vitest';
import { moistureForPlant } from '../../src/lib/moisture-read';
import type { Measurement, Observation, Plant, Treatment, TreatmentType } from '../../src/lib/types';
import type { SpeciesCareProfile } from '../../src/lib/knowledge/care-profiles';

const NOW = Date.parse('2026-07-15T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

function makePlant(overrides: Partial<Plant> = {}): Plant {
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

function treatment(type: TreatmentType, amountMl: number | null = null): Treatment {
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

function measurement(overrides: Partial<Measurement>): Measurement {
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

function observation(observedAt: string, parts: Partial<Observation>): Observation {
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

function baseProfile(overrides: Partial<SpeciesCareProfile> = {}): SpeciesCareProfile {
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

describe('moistureForPlant', () => {
  it('returns a bounded estimate for an indoor potted plant', () => {
    const result = moistureForPlant(makePlant(), null, [], NOW);
    if (result === null) throw new Error('expected a moisture estimate');
    expect(result.moisturePercent).toBeGreaterThanOrEqual(0);
    expect(result.moisturePercent).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high']).toContain(result.confidence);
    expect(['water_now', 'drying', 'comfortable', 'overwatered']).toContain(result.recommendation.status);
  });

  it('returns null when the pot size is unknown', () => {
    expect(moistureForPlant(makePlant({ pot_diameter_cm: null }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ pot_height_cm: null }), null, [], NOW)).toBeNull();
  });

  it('returns null for outdoor and balcony placements (deferred to v1.1)', () => {
    expect(moistureForPlant(makePlant({ placement_type: 'outdoor' }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ placement_type: 'balcony' }), null, [], NOW)).toBeNull();
  });

  it('still estimates for a greenhouse plant', () => {
    expect(moistureForPlant(makePlant({ placement_type: 'greenhouse' }), null, [], NOW)).not.toBeNull();
  });

  it('lowers confidence one tier when the species band is an unsourced fallback', () => {
    const plant = makePlant({
      substrate_type: 'standard',
      observations: [
        observation(daysAgo(2), { observation_type: 'treatment', treatments: [treatment('watering', 200)] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_moisture_percent: 55 })] }),
      ],
    });
    const sourced = baseProfile({
      communityRanges: [
        { attribute: 'soil_moisture_percent', label: 'Soil moisture', min: 20, max: 50, unit: '%', sourceId: 'opb' },
      ],
    });
    const sourcedResult = moistureForPlant(plant, sourced, [], NOW);
    const fallbackResult = moistureForPlant(plant, null, [], NOW);
    if (sourcedResult === null || fallbackResult === null) throw new Error('expected estimates');
    expect(sourcedResult.confidence).toBe('high');
    expect(fallbackResult.confidence).toBe('medium');
  });
});
