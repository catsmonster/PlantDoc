import { describe, expect, it } from 'vitest';
import { buildMoistureInputs } from '../../src/lib/moisture-inputs';
import { ANCHORS, waterCapacityMl } from '../../src/lib/moisture';
import type {
  Measurement,
  MoistureFeedback,
  Observation,
  Plant,
  Treatment,
  TreatmentType,
  UserLocation,
} from '../../src/lib/types';
import type { SpeciesCareProfile } from '../../src/lib/knowledge/care-profiles';

const NOW = Date.parse('2026-07-15T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const CAPACITY = waterCapacityMl({ diameterCm: 12, heightCm: 10, substrate: 'standard', drains: true });

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

describe('buildMoistureInputs', () => {
  it('maps waterings, ground-truth anchors, feedback, and the species prior', () => {
    const profile = baseProfile({
      communityRanges: [
        { attribute: 'soil_moisture_percent', label: 'Soil moisture', min: 15, max: 60, unit: '%', sourceId: 'opb' },
      ],
      cultivationFacts: [
        { attribute: 'water_requirement', label: 'Water', value: 'Moist', sourceId: 'permapeople' },
      ],
    });
    const plant = makePlant({
      observations: [
        observation(daysAgo(3), { observation_type: 'treatment', treatments: [treatment('watering', 200)] }),
        observation(daysAgo(10), { observation_type: 'treatment', treatments: [treatment('watering', null)] }),
        observation(daysAgo(2), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_moisture_percent: 80 })] }),
        observation(daysAgo(40), { observation_type: 'treatment', treatments: [treatment('repotting')] }),
      ],
    });
    const feedback: MoistureFeedback[] = [
      {
        $id: 'fb-1',
        $createdAt: daysAgo(2),
        $updatedAt: daysAgo(2),
        user_id: 'user-1',
        observed_at: daysAgo(2),
        estimate_feedback: 'drier',
        magnitude: 2,
        predicted_moisture_percent: 50,
      },
    ];

    const { estimate, band, bandSourced } = buildMoistureInputs({ plant, careProfile: profile, feedback, now: NOW });

    expect(estimate.waterings).toHaveLength(2);
    expect(estimate.amountMeasured).toBe(true);
    expect(estimate.speciesDailyFraction).toBeCloseTo(0.12);
    expect(band).toBe('moist'); // midpoint (15+60)/2 = 37.5 -> moist
    expect(bandSourced).toBe(true);
    expect(estimate.repotBoundaryMs).toBe(Date.parse(daysAgo(40)));
    expect(estimate.substratePresent).toBe(true);
    expect(estimate.groundTruthCount).toBe(3);

    const climate = estimate.dailyClimate('2026-07-10');
    expect(climate.tempC).toBe(25); // July, northern hemisphere -> warm
    expect(climate.humidityPct).toBe(45);
    expect(climate.light).toBe('bright');

    const stepMl = ((ANCHORS.wet - ANCHORS.dry) / 5) * CAPACITY;
    const soilCheck = estimate.corrections.find((c) => Math.abs(c.waterContentMl - ANCHORS.moist * CAPACITY) < 1e-6);
    const meter = estimate.corrections.find((c) => Math.abs(c.waterContentMl - ANCHORS.wet * CAPACITY) < 1e-6);
    const feedbackCorrection = estimate.corrections.find(
      (c) => Math.abs(c.waterContentMl - (0.5 * CAPACITY - 2 * stepMl)) < 1e-6,
    );
    expect(soilCheck).toBeDefined();
    expect(meter).toBeDefined();
    expect(feedbackCorrection).toBeDefined();
  });

  it('falls back to the default prior and an unsourced band when the profile lacks data', () => {
    const plant = makePlant({ substrate_type: null });
    const { estimate, band, bandSourced } = buildMoistureInputs({
      plant,
      careProfile: null,
      feedback: [],
      now: NOW,
    });
    expect(estimate.speciesDailyFraction).toBeCloseTo(0.12);
    expect(band).toBe('moist');
    expect(bandSourced).toBe(false);
    expect(estimate.substratePresent).toBe(false);
    expect(estimate.amountMeasured).toBe(false);
    expect(estimate.groundTruthCount).toBe(0);
  });

  it('reads hemisphere from the plant location and a dry water requirement', () => {
    const profile = baseProfile({
      cultivationFacts: [{ attribute: 'water_requirement', label: 'Water', value: 'Dry', sourceId: 'permapeople' }],
    });
    const plant = makePlant({
      // Cape Town: GeoJSON [longitude, latitude] with negative latitude -> southern hemisphere
      location_id: { location: [18.42, -33.92] } as unknown as UserLocation,
    });
    const { estimate } = buildMoistureInputs({ plant, careProfile: profile, feedback: [], now: NOW });
    expect(estimate.speciesDailyFraction).toBeCloseTo(0.08);
    expect(estimate.dailyClimate('2026-07-10').tempC).toBe(23); // July in the south -> cool
  });
});
