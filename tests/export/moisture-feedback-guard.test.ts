import { describe, expect, it } from 'vitest';
import { PUBLIC_EXPORT_FIELDS } from '../../appwrite/schema';
import { toPublicRow, type SourceObservation } from '../../scripts/export/transform';

const OPTS = { datasetVersion: 'v1', publishedAt: '2026-06-10T12:00:00.000Z' };

function wateringObs(overrides: Partial<SourceObservation> = {}): SourceObservation {
  return {
    $id: 'obs_water_1',
    user_id: 'user_abc123',
    observed_at: '2026-06-08T07:30:00.000Z',
    observation_type: 'treatment',
    notes_private: 'my address is 12 Fern Street',
    contribute_to_public_dataset: true,
    plant_id: {
      $id: 'plant_1',
      nickname: 'Secret Window Fern',
      acquired_on: '2026-05-01T00:00:00.000Z',
      species_text: null,
      species_id: { $id: 'seed_species_monstera', scientific_name: 'Monstera deliciosa' },
    },
    treatments: [
      {
        $id: 't1',
        treatment_type: 'watering',
        amount_value: 250,
        amount_unit: 'ml',
        method: 'top water',
        product_name: null,
      },
    ],
    measurements: [],
    photos: [],
    ...overrides,
  };
}

const FEEDBACK_FIELDS = ['estimate_feedback', 'magnitude', 'predicted_moisture_percent'];

describe('moisture_feedback export guard', () => {
  it('PUBLIC_EXPORT_FIELDS never contains moisture_feedback telemetry columns', () => {
    for (const field of FEEDBACK_FIELDS) {
      expect(PUBLIC_EXPORT_FIELDS, field).not.toContain(field);
    }
  });

  it('a consented measurement observation never carries feedback fields', () => {
    const obs = wateringObs({
      observation_type: 'measurement',
      treatments: [],
      measurements: [
        {
          $id: 'm1',
          height_cm: 45,
          leaf_count: 6,
          soil_moisture_percent: 38,
          health_score: 4,
        },
      ],
    });
    const row = toPublicRow(obs, OPTS)!;
    expect(row).not.toBeNull();
    for (const field of FEEDBACK_FIELDS) {
      expect(Object.keys(row), field).not.toContain(field);
    }
  });

  it('an observation typed moisture_feedback never produces a public row', () => {
    const obs = wateringObs({ observation_type: 'moisture_feedback' });
    expect(toPublicRow(obs, OPTS)).toBeNull();
  });
});
