import { describe, expect, it } from 'vitest';
import { plantInsights, type Insight } from '../../src/lib/insights';
import type { Observation, Plant } from '../../src/lib/types';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

let idCounter = 0;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function obs(partial: Partial<Observation> & { observed_at: string }): Observation {
  idCounter += 1;
  return {
    $id: `obs_${idCounter}`,
    $createdAt: partial.observed_at,
    $updatedAt: partial.observed_at,
    user_id: 'user_1',
    observation_type: 'treatment',
    notes_private: null,
    contribute_to_public_dataset: false,
    treatments: [],
    measurements: [],
    photos: [],
    ...partial,
  };
}

function watering(daysBack: number): Observation {
  idCounter += 1;
  return obs({
    observed_at: daysAgo(daysBack),
    observation_type: 'treatment',
    treatments: [
      {
        $id: `t_${idCounter}`,
        $createdAt: daysAgo(daysBack),
        $updatedAt: daysAgo(daysBack),
        user_id: 'user_1',
        treatment_type: 'watering',
        amount_value: 200,
        amount_unit: 'ml',
        product_name: null,
        method: null,
        notes_private: null,
      },
    ],
  });
}

function pestControl(daysBack: number): Observation {
  const o = watering(daysBack);
  o.treatments![0].treatment_type = 'pest_control';
  return o;
}

function measurement(
  daysBack: number,
  fields: Partial<{
    height_cm: number | null;
    leaf_count: number | null;
    soil_moisture_percent: number | null;
    health_score: number | null;
    pest_severity_score: number | null;
  }>,
): Observation {
  idCounter += 1;
  return obs({
    observed_at: daysAgo(daysBack),
    observation_type: 'measurement',
    measurements: [
      {
        $id: `m_${idCounter}`,
        $createdAt: daysAgo(daysBack),
        $updatedAt: daysAgo(daysBack),
        user_id: 'user_1',
        height_cm: null,
        leaf_count: null,
        soil_moisture_percent: null,
        health_score: null,
        pest_severity_score: null,
        bloom_count: null,
        notes_private: null,
        ...fields,
      },
    ],
  });
}

function plant(observations: Observation[]): Plant {
  return {
    $id: 'plant_1',
    $createdAt: daysAgo(120),
    $updatedAt: daysAgo(0),
    user_id: 'user_1',
    species_id: null,
    species_text: null,
    nickname: 'Testy',
    common_name: null,
    acquired_on: null,
    status: 'active',
    placement_type: 'indoor',
    placement_label: null,
    observations,
  };
}

function byKind(insights: Insight[], kind: string): Insight | undefined {
  return insights.find((i) => i.kind === kind);
}

describe('watering cadence', () => {
  it('reports not enough data under three waterings', () => {
    const out = plantInsights(plant([watering(3), watering(8)]), NOW, 'metric');
    const insight = byKind(out, 'watering_data');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('info');
    expect(insight!.evidenceCount).toBe(2);
    expect(out.some((i) => i.kind.startsWith('watering_') && i.kind !== 'watering_data')).toBe(
      false,
    );
  });

  it('omits the species reference hint when the species is unknown', () => {
    const out = plantInsights(plant([watering(3), watering(8)]), NOW, 'metric');
    const insight = byKind(out, 'watering_data');
    expect(insight!.detail).not.toContain('starter guide');
  });

  it('adds the sourced reference cadence to the baseline when the species matches', () => {
    const matched = { ...plant([watering(3), watering(8)]), species_text: 'Monstera deliciosa' };
    const insight = byKind(plantInsights(matched, NOW, 'metric'), 'watering_data');
    expect(insight!.detail).toContain('Monstera deliciosa');
    expect(insight!.detail).toContain('7-10 days');
    expect(insight!.detail).toContain('starter guide');
  });

  it('reports cadence as info when watering is not yet due', () => {
    // Waterings 2, 7, 12, 17 days ago: median interval 5, last 2 days ago.
    const out = plantInsights(
      plant([watering(2), watering(7), watering(12), watering(17)]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'watering_ok');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('info');
    expect(insight!.detail).toContain('every 5 days');
    expect(insight!.evidenceCount).toBe(4);
  });

  it('suggests watering when days since last reaches the median', () => {
    const out = plantInsights(
      plant([watering(6), watering(11), watering(16), watering(21)]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'watering_due');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('suggestion');
    expect(insight!.detail).toContain('6 days');
  });

  it('warns when watering is 1.5x past the median', () => {
    const out = plantInsights(
      plant([watering(9), watering(14), watering(19), watering(24)]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'watering_overdue');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('warning');
  });

  it('uses the median so one long gap does not skew the baseline', () => {
    // Intervals 5, 5, 30 -> median 5, not mean 13.3. Last watering 6 days ago = due.
    const out = plantInsights(
      plant([watering(6), watering(11), watering(16), watering(46)]),
      NOW,
      'metric',
    );
    expect(byKind(out, 'watering_due')).toBeDefined();
  });
});

describe('growth trend', () => {
  it('skips growth with fewer than three points', () => {
    const out = plantInsights(
      plant([measurement(20, { height_cm: 10 }), measurement(1, { height_cm: 12 })]),
      NOW,
      'metric',
    );
    expect(out.some((i) => i.kind.startsWith('growth_'))).toBe(false);
  });

  it('skips growth when points span under 14 days', () => {
    const out = plantInsights(
      plant([
        measurement(10, { height_cm: 10 }),
        measurement(5, { height_cm: 11 }),
        measurement(1, { height_cm: 12 }),
      ]),
      NOW,
      'metric',
    );
    expect(out.some((i) => i.kind.startsWith('growth_'))).toBe(false);
  });

  it('reports growing height per 30 days', () => {
    // 10 -> 16 cm over 60 days = +3 cm / 30 days.
    const out = plantInsights(
      plant([
        measurement(60, { height_cm: 10 }),
        measurement(30, { height_cm: 13 }),
        measurement(0, { height_cm: 16 }),
      ]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'growth_height');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('info');
    expect(insight!.detail).toContain('3');
    expect(insight!.title.toLowerCase()).toContain('growing');
  });

  it('classifies a small slope as stable', () => {
    const out = plantInsights(
      plant([
        measurement(60, { height_cm: 10 }),
        measurement(30, { height_cm: 10.1 }),
        measurement(0, { height_cm: 10.2 }),
      ]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'growth_height');
    expect(insight!.title.toLowerCase()).toContain('stable');
  });

  it('flags declining leaf count as a warning', () => {
    const out = plantInsights(
      plant([
        measurement(60, { leaf_count: 20 }),
        measurement(30, { leaf_count: 15 }),
        measurement(0, { leaf_count: 10 }),
      ]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'growth_leaves');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('warning');
    expect(insight!.title.toLowerCase()).toContain('losing');
  });
});

describe('stress signals', () => {
  it('warns on a critical latest health score', () => {
    const out = plantInsights(plant([measurement(1, { health_score: 2 })]), NOW, 'metric');
    const insight = byKind(out, 'health_low');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('warning');
  });

  it('warns when health drops versus the previous reading', () => {
    const out = plantInsights(
      plant([measurement(10, { health_score: 5 }), measurement(1, { health_score: 3 })]),
      NOW,
      'metric',
    );
    const insight = byKind(out, 'health_drop');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('warning');
  });

  it('stays quiet on healthy stable scores', () => {
    const out = plantInsights(
      plant([measurement(10, { health_score: 4 }), measurement(1, { health_score: 5 })]),
      NOW,
      'metric',
    );
    expect(byKind(out, 'health_low')).toBeUndefined();
    expect(byKind(out, 'health_drop')).toBeUndefined();
  });

  it('warns on high pest severity', () => {
    const out = plantInsights(plant([measurement(1, { pest_severity_score: 6 })]), NOW, 'metric');
    expect(byKind(out, 'pest_severity')).toBeDefined();
  });

  it('warns on repeated pest control treatments within 30 days', () => {
    const out = plantInsights(plant([pestControl(20), pestControl(5)]), NOW, 'metric');
    const insight = byKind(out, 'pest_pressure');
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe('warning');
  });

  it('does not warn for a single old pest control', () => {
    const out = plantInsights(plant([pestControl(45), pestControl(5)]), NOW, 'metric');
    expect(byKind(out, 'pest_pressure')).toBeUndefined();
  });

  it('warns on very dry soil when watering is also due', () => {
    const out = plantInsights(
      plant([
        watering(6),
        watering(11),
        watering(16),
        watering(21),
        measurement(0, { soil_moisture_percent: 5 }),
      ]),
      NOW,
      'metric',
    );
    expect(byKind(out, 'soil_dry')).toBeDefined();
  });

  it('does not warn on dry soil right after watering', () => {
    const out = plantInsights(
      plant([
        watering(1),
        watering(6),
        watering(11),
        watering(16),
        measurement(0, { soil_moisture_percent: 5 }),
      ]),
      NOW,
      'metric',
    );
    expect(byKind(out, 'soil_dry')).toBeUndefined();
  });
});

describe('ordering and formatting', () => {
  it('sorts warnings before suggestions before info', () => {
    const out = plantInsights(
      plant([
        watering(6),
        watering(11),
        watering(16),
        watering(21),
        measurement(1, { health_score: 2 }),
        measurement(40, { height_cm: 10 }),
        measurement(20, { height_cm: 11 }),
        measurement(0, { height_cm: 12 }),
      ]),
      NOW,
      'metric',
    );
    const severities = out.map((i) => i.severity);
    const order = { warning: 0, suggestion: 1, info: 2 };
    const sorted = [...severities].sort((a, b) => order[a] - order[b]);
    expect(severities).toEqual(sorted);
  });

  it('formats height in imperial units when preferred', () => {
    const out = plantInsights(
      plant([
        measurement(60, { height_cm: 10 }),
        measurement(30, { height_cm: 13 }),
        measurement(0, { height_cm: 16 }),
      ]),
      NOW,
      'imperial',
    );
    expect(byKind(out, 'growth_height')!.detail).toContain('in');
  });

  it('returns empty for a plant with no observations', () => {
    expect(plantInsights(plant([]), NOW, 'metric')).toEqual([]);
  });
});

// ─── Summary helper tests ────────────────────────────────────────────────────
import {
  isPlantThirstyFromSummary,
  getUpdatedWateringSummary,
  getUpdatedPhotoSummary,
} from '../../src/lib/insights';
import type { Plant as PlantType } from '../../src/lib/types';

function summaryPlant(overrides: Partial<PlantType> = {}): PlantType {
  return {
    $id: 'plant_s',
    $createdAt: daysAgo(120),
    $updatedAt: daysAgo(0),
    user_id: 'user_1',
    species_id: null,
    species_text: null,
    nickname: 'Summary',
    common_name: null,
    acquired_on: null,
    status: 'active',
    placement_type: 'indoor',
    placement_label: null,
    observations: [],
    ...overrides,
  };
}

describe('isPlantThirstyFromSummary', () => {
  it('returns false when last_watered_at is absent', () => {
    expect(isPlantThirstyFromSummary(summaryPlant(), NOW)).toBe(false);
  });

  it('uses 8-day baseline for fewer than 3 waterings — not thirsty yet', () => {
    // Watered 6 days ago, only 2 waterings recorded → 8-day baseline → NOT thirsty
    const p = summaryPlant({
      last_watered_at: daysAgo(6),
      watering_count: 2,
      watering_cadence_days: null,
    });
    expect(isPlantThirstyFromSummary(p, NOW)).toBe(false);
  });

  it('uses 8-day baseline — thirsty when 8+ days since last watering', () => {
    const p = summaryPlant({
      last_watered_at: daysAgo(9),
      watering_count: 1,
      watering_cadence_days: null,
    });
    expect(isPlantThirstyFromSummary(p, NOW)).toBe(true);
  });

  it('uses cadence when 3+ waterings recorded', () => {
    // Cadence 7 days, watered 7 days ago → due
    const p = summaryPlant({
      last_watered_at: daysAgo(7),
      watering_count: 5,
      watering_cadence_days: 7,
    });
    expect(isPlantThirstyFromSummary(p, NOW)).toBe(true);
  });

  it('returns false for non-active plants regardless of watering state', () => {
    const archived = summaryPlant({
      status: 'archived',
      last_watered_at: daysAgo(30),
      watering_count: 5,
      watering_cadence_days: 7,
    });
    expect(isPlantThirstyFromSummary(archived, NOW)).toBe(false);
  });
});

describe('getUpdatedWateringSummary', () => {
  it('sets last_watered_at when there is no prior watering', () => {
    const result = getUpdatedWateringSummary({}, daysAgo(0));
    expect(result.last_watered_at).toBe(daysAgo(0));
    expect(result.watering_count).toBe(1);
  });

  it('updates last_watered_at when new date is more recent', () => {
    const result = getUpdatedWateringSummary(
      { last_watered_at: daysAgo(3), watering_count: 2 },
      daysAgo(0),
    );
    expect(result.last_watered_at).toBe(daysAgo(0));
    expect(result.watering_count).toBe(3);
  });

  it('does NOT replace last_watered_at for a backdated watering', () => {
    const existing = daysAgo(1);
    const result = getUpdatedWateringSummary(
      { last_watered_at: existing, watering_count: 3 },
      daysAgo(5), // older date
    );
    expect(result.last_watered_at).toBe(existing);
    expect(result.watering_count).toBe(4);
  });
});

describe('getUpdatedPhotoSummary', () => {
  it('sets photo fields when none existed before', () => {
    const result = getUpdatedPhotoSummary({}, 'file_new', daysAgo(0));
    expect(result.latest_photo_file_id).toBe('file_new');
    expect(result.latest_photo_observed_at).toBe(daysAgo(0));
  });

  it('replaces photo when new observation is newer', () => {
    const result = getUpdatedPhotoSummary(
      { latest_photo_file_id: 'file_old', latest_photo_observed_at: daysAgo(10) },
      'file_new',
      daysAgo(2),
    );
    expect(result.latest_photo_file_id).toBe('file_new');
  });

  it('keeps existing photo when new observation is older', () => {
    const result = getUpdatedPhotoSummary(
      { latest_photo_file_id: 'file_recent', latest_photo_observed_at: daysAgo(1) },
      'file_old',
      daysAgo(30),
    );
    expect(result.latest_photo_file_id).toBe('file_recent');
  });
});
