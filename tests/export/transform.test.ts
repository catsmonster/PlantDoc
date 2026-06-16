import { describe, expect, it } from 'vitest';
import { INTERNAL_ONLY_FIELDS, PUBLIC_EXPORT_FIELDS } from '../../appwrite/schema';
import {
  buildAggregates,
  coarsenGeoCohorts,
  nextVersion,
  toCsv,
  toJsonl,
  toPublicRow,
  type SourceObservation,
} from '../../scripts/export/transform';

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

const HOME_LOCATION = {
  $id: 'loc_home',
  label: 'Home',
  country: 'Spain',
  region: 'Madrid',
  city: 'Alcobendas',
  postal_code_prefix: '28100',
  location: [-3.7, 40.42] as [number, number],
  location_precision: 'regional' as const,
  climate_zone: 'Csa',
};

describe('toPublicRow geography', () => {
  function locatedObs(precision: 'exact' | 'local' | 'regional' | 'climate' | 'country') {
    const obs = wateringObs();
    obs.plant_id!.location_id = { ...HOME_LOCATION, location_precision: precision };
    return obs;
  }

  it('regional precision exports country, region, and climate zone', () => {
    const row = toPublicRow(locatedObs('regional'), OPTS)!;
    expect(row.country).toBe('Spain');
    expect(row.region).toBe('Madrid');
    expect(row.climate_zone).toBe('Csa');
    expect(row.geo_precision).toBe('regional');
  });

  it('climate precision drops region', () => {
    const row = toPublicRow(locatedObs('climate'), OPTS)!;
    expect(row.country).toBe('Spain');
    expect(row.region).toBeNull();
    expect(row.climate_zone).toBe('Csa');
    expect(row.geo_precision).toBe('climate');
  });

  it('country precision exports country only', () => {
    const row = toPublicRow(locatedObs('country'), OPTS)!;
    expect(row.country).toBe('Spain');
    expect(row.region).toBeNull();
    expect(row.climate_zone).toBeNull();
    expect(row.geo_precision).toBe('country');
  });

  it('no location keeps all geo fields null', () => {
    const row = toPublicRow(wateringObs(), OPTS)!;
    expect(row.country).toBeNull();
    expect(row.region).toBeNull();
    expect(row.climate_zone).toBeNull();
    expect(row.geo_precision).toBe('country');
  });

  it('never leaks city, postal prefix, or coordinates at any precision', () => {
    for (const tier of ['exact', 'local', 'regional', 'climate', 'country'] as const) {
      const row = toPublicRow(locatedObs(tier), OPTS)!;
      const serialized = toCsv([row], PUBLIC_EXPORT_FIELDS) + toJsonl([row], PUBLIC_EXPORT_FIELDS);
      expect(serialized).not.toContain('Alcobendas');
      expect(serialized).not.toContain('28100');
      expect(serialized).not.toContain('40.42');
      expect(serialized).not.toContain('-3.7');
      expect(serialized).not.toContain('loc_home');
      expect(serialized).not.toContain('Home');
    }
  });
});

describe('toPublicRow', () => {
  it('throws on non-consented observations', () => {
    expect(() =>
      toPublicRow(wateringObs({ contribute_to_public_dataset: false }), OPTS),
    ).toThrow(/consent/i);
  });

  it('skips note and photo observation types', () => {
    expect(toPublicRow(wateringObs({ observation_type: 'note' }), OPTS)).toBeNull();
    expect(toPublicRow(wateringObs({ observation_type: 'photo' }), OPTS)).toBeNull();
  });

  it('produces only allowlisted fields plus internal source id', () => {
    const row = toPublicRow(wateringObs(), OPTS)!;
    const allowed = new Set([...PUBLIC_EXPORT_FIELDS, ...INTERNAL_ONLY_FIELDS]);
    for (const key of Object.keys(row)) {
      expect(allowed.has(key), key).toBe(true);
    }
    // Full shape: every public field present (null when absent).
    for (const key of PUBLIC_EXPORT_FIELDS) {
      expect(key in row, key).toBe(true);
    }
  });

  it('does not carry rain_exposed into a public row', () => {
    const row = toPublicRow(wateringObs(), OPTS)!;
    expect(Object.keys(row)).not.toContain('rain_exposed');
  });

  it('buckets dates to months and derives plant age', () => {
    const row = toPublicRow(wateringObs(), OPTS)!;
    expect(row.observed_month).toBe('2026-06');
    expect(row.plant_age_days).toBe(38);
    expect(row.source_observation_id).toBe('obs_water_1');
    expect(row.treatment_type).toBe('watering');
    expect(row.amount_value).toBe(250);
    expect(row.dataset_version).toBe('v1');
  });

  it('falls back to species_text when no catalog species', () => {
    const obs = wateringObs();
    obs.plant_id!.species_id = null;
    obs.plant_id!.species_text = 'some fern';
    const row = toPublicRow(obs, OPTS)!;
    expect(row.species_id).toBeNull();
    expect(row.scientific_name).toBe('some fern');
  });

  it('keeps public_file_id null until a sanitize pipeline exists', () => {
    const obs = wateringObs();
    obs.photos = [{ $id: 'p1', private_file_id: 'priv_123', allow_public_image: true }];
    const row = toPublicRow(obs, OPTS)!;
    expect(row.public_file_id).toBeNull();
  });

  it('maps measurement values', () => {
    const obs = wateringObs({
      observation_type: 'measurement',
      treatments: [],
      measurements: [
        {
          $id: 'm1',
          height_cm: 45,
          leaf_count: 6,
          soil_moisture_percent: null,
          health_score: 4,
        },
      ],
    });
    const row = toPublicRow(obs, OPTS)!;
    expect(row.height_cm).toBe(45);
    expect(row.leaf_count).toBe(6);
    expect(row.health_score).toBe(4);
    expect(row.treatment_type).toBeNull();
  });
});

describe('coarsenGeoCohorts', () => {
  it('drops region then country for cohorts under k', () => {
    const mk = (i: number, name: string, region: string | null, country: string | null) => ({
      ...toPublicRow(wateringObs({ $id: `obs_${name}_${i}` }), OPTS)!,
      scientific_name: name,
      region,
      country,
      geo_precision: 'regional',
    });
    const big = Array.from({ length: 5 }, (_, i) => mk(i, 'Ficus lyrata', 'Utrecht', 'NL'));
    const small = [mk(9, 'Rare orchid', 'Utrecht', 'NL')];
    const out = coarsenGeoCohorts([...big, ...small], 5);
    const bigOut = out.filter((r) => r.scientific_name === 'Ficus lyrata');
    const smallOut = out.filter((r) => r.scientific_name === 'Rare orchid');
    expect(bigOut.every((r) => r.region === 'Utrecht')).toBe(true);
    // 1 < k: region dropped, then species x country cohort (1) also < k: country dropped.
    expect(smallOut[0].region).toBeNull();
    expect(smallOut[0].country).toBeNull();
    expect(smallOut[0].geo_precision).toBe('country');
  });

  it('keeps climate precision when only the climate zone survives', () => {
    const row = {
      ...toPublicRow(wateringObs(), OPTS)!,
      country: 'Spain',
      region: 'Madrid',
      climate_zone: 'Csa',
      geo_precision: 'regional',
    };
    const out = coarsenGeoCohorts([row], 5);
    expect(out[0].country).toBeNull();
    expect(out[0].region).toBeNull();
    expect(out[0].climate_zone).toBe('Csa');
    expect(out[0].geo_precision).toBe('climate');
  });
});

describe('buildAggregates', () => {
  it('suppresses cells below the minimum cohort', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) =>
        toPublicRow(wateringObs({ $id: `obs_a_${i}` }), OPTS)!,
      ),
      toPublicRow(
        wateringObs({
          $id: 'obs_b',
          observed_at: '2026-05-02T10:00:00.000Z',
        }),
        OPTS,
      )!,
    ];
    const aggregates = buildAggregates(rows, 5);
    const june = aggregates.find((a) => a.observed_month === '2026-06');
    expect(june).toMatchObject({
      scientific_name: 'Monstera deliciosa',
      metric: 'watering_amount_ml',
      n: 5,
      mean: 250,
    });
    expect(aggregates.some((a) => a.observed_month === '2026-05')).toBe(false);
  });
});

describe('serialization', () => {
  it('escapes CSV values and projects only requested fields', () => {
    const csv = toCsv(
      [{ a: 'plain', b: 'with "quotes", commas\nand newline', c: null }],
      ['a', 'b', 'c'],
    );
    expect(csv).toBe('a,b,c\r\nplain,"with ""quotes"", commas\nand newline",\r\n');
  });

  it('never leaks private markers into csv/jsonl', () => {
    const row = toPublicRow(wateringObs(), OPTS)!;
    const csv = toCsv([row], PUBLIC_EXPORT_FIELDS);
    const jsonl = toJsonl([row], PUBLIC_EXPORT_FIELDS);
    for (const banned of ['user_abc123', 'Secret Window Fern', 'Fern Street', 'obs_water_1']) {
      expect(csv).not.toContain(banned);
      expect(jsonl).not.toContain(banned);
    }
  });
});

describe('nextVersion', () => {
  it('increments past the highest existing manifest', () => {
    expect(nextVersion([])).toBe('v1');
    expect(nextVersion(['manifest-v1.json', 'manifest-v3.json', 'changelog.md'])).toBe('v4');
  });
});
