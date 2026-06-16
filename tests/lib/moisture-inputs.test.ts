import { describe, expect, it } from 'vitest';
import { buildMoistureInputs, isFeedbackEligible, FEEDBACK_DRIFT_THRESHOLD_PCT } from '../../src/lib/moisture-inputs';
import { ANCHORS, waterCapacityMl } from '../../src/lib/moisture';
import type { MoistureFeedback, UserLocation } from '../../src/lib/types';
import { baseProfile, daysAgo, makePlant, measurement, NOW, observation, treatment } from './moisture-fixtures';

const CAPACITY = waterCapacityMl({ diameterCm: 12, heightCm: 10, substrate: 'standard', drains: true });

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
    expect(estimate.groundTruthCount).toBeCloseTo(2); // soil_state(1) + meter@-1d(1) + feedback@same-as-soil_state(0)

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

  it('excludes corrections and feedback older than the 60-day window', () => {
    const plant = makePlant({
      observations: [
        observation(daysAgo(90), {
          observation_type: 'measurement',
          measurements: [measurement({ soil_state: 'wet' })],
        }),
      ],
    });
    const feedback: MoistureFeedback[] = [
      {
        $id: 'fb-old',
        $createdAt: daysAgo(90),
        $updatedAt: daysAgo(90),
        user_id: 'user-1',
        observed_at: daysAgo(90),
        estimate_feedback: 'wetter',
        magnitude: 3,
        predicted_moisture_percent: 40,
      },
    ];
    const { estimate } = buildMoistureInputs({ plant, careProfile: null, feedback, now: NOW });
    expect(estimate.corrections).toHaveLength(0);
    expect(estimate.groundTruthCount).toBe(0);
  });

  it("'correct' feedback pins observed water content to the prediction", () => {
    const feedback: MoistureFeedback[] = [
      {
        $id: 'fb-correct',
        $createdAt: daysAgo(1),
        $updatedAt: daysAgo(1),
        user_id: 'user-1',
        observed_at: daysAgo(1),
        estimate_feedback: 'correct',
        magnitude: null,
        predicted_moisture_percent: 60,
      },
    ];
    const { estimate } = buildMoistureInputs({ plant: makePlant(), careProfile: null, feedback, now: NOW });
    expect(estimate.corrections).toHaveLength(1);
    expect(estimate.corrections[0].waterContentMl).toBeCloseTo(0.6 * CAPACITY);
  });

  it('treats a null magnitude as a zero offset', () => {
    const feedback: MoistureFeedback[] = [
      {
        $id: 'fb-null-mag',
        $createdAt: daysAgo(1),
        $updatedAt: daysAgo(1),
        user_id: 'user-1',
        observed_at: daysAgo(1),
        estimate_feedback: 'drier',
        magnitude: null,
        predicted_moisture_percent: 60,
      },
    ];
    const { estimate } = buildMoistureInputs({ plant: makePlant(), careProfile: null, feedback, now: NOW });
    expect(estimate.corrections[0].waterContentMl).toBeCloseTo(0.6 * CAPACITY);
  });
});

describe('weighted confidence and eligibility data', () => {
  it('counts effective correction weight, not raw count, so spam cannot inflate confidence', () => {
    const base = Date.parse(daysAgo(1));
    const minute = 60 * 1000;
    const plant = makePlant({
      observations: [
        observation(new Date(base).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + 5 * minute).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + 10 * minute).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
      ],
    });
    const { estimate } = buildMoistureInputs({ plant, careProfile: null, feedback: [], now: NOW });
    // First correction weight 1; the next two are <20 min later ⇒ weight 0.
    expect(estimate.groundTruthCount).toBeCloseTo(1);
    expect(estimate.corrections).toHaveLength(3);
  });

  it('gives a correction 6h after the previous one full weight', () => {
    const base = Date.parse(daysAgo(2));
    const sixHours = 6 * 60 * 60 * 1000;
    const plant = makePlant({
      observations: [
        observation(new Date(base).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + sixHours).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'wet' })],
        }),
      ],
    });
    const { estimate } = buildMoistureInputs({ plant, careProfile: null, feedback: [], now: NOW });
    expect(estimate.groundTruthCount).toBeCloseTo(2);
  });
});

describe('isFeedbackEligible', () => {
  const stepPct = ((ANCHORS.wet - ANCHORS.dry) / 5) * 100; // 14

  it('is eligible when there is no prior feedback', () => {
    expect(isFeedbackEligible({ currentPercent: 50, latestFeedback: null, lastNonFeedbackEventMs: null })).toBe(true);
  });

  it('hides immediately after a high-magnitude rating (anchor matches post-blend value)', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: -1 as const, magnitude: 4, weight: 1 };
    const currentPercent = 60 - 4 * stepPct; // post-blend value the engine now holds
    expect(isFeedbackEligible({ currentPercent, latestFeedback, lastNonFeedbackEventMs: null })).toBe(false);
  });

  it('re-shows after a new correction event logged later than the feedback', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: 0 as const, magnitude: 0, weight: 1 };
    expect(isFeedbackEligible({ currentPercent: 60, latestFeedback, lastNonFeedbackEventMs: NOW + 1000 })).toBe(true);
  });

  it('re-shows once the estimate drifts past the threshold from the anchor', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: 0 as const, magnitude: 0, weight: 1 };
    const drifted = 60 - FEEDBACK_DRIFT_THRESHOLD_PCT;
    expect(isFeedbackEligible({ currentPercent: drifted, latestFeedback, lastNonFeedbackEventMs: null })).toBe(true);
    expect(isFeedbackEligible({ currentPercent: 60 - (FEEDBACK_DRIFT_THRESHOLD_PCT - 1), latestFeedback, lastNonFeedbackEventMs: null })).toBe(false);
  });
});
