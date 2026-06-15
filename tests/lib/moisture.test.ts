import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  dailyEtMl,
  estimateMoisture,
  INDOOR_DEFAULT_RH,
  moistureInsight,
  moistureStatusColor,
  potSoilVolumeMl,
  recommendWatering,
  seasonalIndoorTempC,
  simulateWaterContent,
  waterCapacityMl,
} from '../../src/lib/moisture';
import type { Confidence, EstimateInput, EtInputs, MoistureEstimate } from '../../src/lib/moisture';

describe('pot geometry', () => {
  it('volume of a 12×10 cm pot is ~960 ml', () => {
    expect(potSoilVolumeMl(12, 10)).toBeGreaterThan(900);
    expect(potSoilVolumeMl(12, 10)).toBeLessThan(1000);
  });
  it('capacity ranks by substrate and rises for a sealed pot', () => {
    const p = { diameterCm: 12, heightCm: 10 } as const;
    const std = waterCapacityMl({ ...p, substrate: 'standard', drains: true });
    expect(std).toBeGreaterThan(waterCapacityMl({ ...p, substrate: 'succulent_gritty', drains: true }));
    expect(waterCapacityMl({ ...p, substrate: 'standard', drains: false })).toBeGreaterThan(std);
  });
});

describe('daily evapotranspiration', () => {
  const base = {
    capacityMl: 500,
    speciesDailyFraction: 0.12,
    tempC: 23,
    humidityPct: 45,
    light: 'medium',
    canopyFactor: 1,
  } as const;

  it('is positive for a valid indoor pot', () => {
    expect(dailyEtMl(base)).toBeGreaterThan(0);
  });

  it('rises with warmer temperatures', () => {
    expect(dailyEtMl({ ...base, tempC: 30 })).toBeGreaterThan(dailyEtMl({ ...base, tempC: 15 }));
  });

  it('rises as the air gets drier', () => {
    expect(dailyEtMl({ ...base, humidityPct: 30 })).toBeGreaterThan(dailyEtMl({ ...base, humidityPct: 70 }));
  });

  it('rises with brighter light', () => {
    expect(dailyEtMl({ ...base, light: 'direct_sun' })).toBeGreaterThan(
      dailyEtMl({ ...base, light: 'bright' }),
    );
    expect(dailyEtMl({ ...base, light: 'bright' })).toBeGreaterThan(dailyEtMl({ ...base, light: 'medium' }));
    expect(dailyEtMl({ ...base, light: 'medium' })).toBeGreaterThan(dailyEtMl({ ...base, light: 'low' }));
  });

  it('defaults canopy factor to one', () => {
    const withoutCanopyFactor = {
      capacityMl: base.capacityMl,
      speciesDailyFraction: base.speciesDailyFraction,
      tempC: base.tempC,
      humidityPct: base.humidityPct,
      light: base.light,
    };

    expect(dailyEtMl(withoutCanopyFactor)).toBeCloseTo(dailyEtMl({ ...withoutCanopyFactor, canopyFactor: 1 }));
    expect(dailyEtMl({ ...withoutCanopyFactor, canopyFactor: 1.5 })).toBeGreaterThan(
      dailyEtMl(withoutCanopyFactor),
    );
  });

  it('clamps temperature factor at its minimum and maximum', () => {
    const neutral = { ...base, tempC: 20, humidityPct: 50 };
    const neutralEt = dailyEtMl(neutral);

    expect(dailyEtMl({ ...neutral, tempC: -20 })).toBeCloseTo(neutralEt * 0.3);
    expect(dailyEtMl({ ...neutral, tempC: -40 })).toBeCloseTo(dailyEtMl({ ...neutral, tempC: -20 }));
    expect(dailyEtMl({ ...neutral, tempC: 100 })).toBeCloseTo(neutralEt * 2.5);
    expect(dailyEtMl({ ...neutral, tempC: 120 })).toBeCloseTo(dailyEtMl({ ...neutral, tempC: 100 }));
  });

  it('clamps relative humidity factor at its minimum and maximum', () => {
    const neutral = { ...base, tempC: 20, humidityPct: 50 };
    const neutralEt = dailyEtMl(neutral);

    expect(dailyEtMl({ ...neutral, humidityPct: 200 })).toBeCloseTo(neutralEt * 0.4);
    expect(dailyEtMl({ ...neutral, humidityPct: 250 })).toBeCloseTo(dailyEtMl({ ...neutral, humidityPct: 200 }));
    expect(dailyEtMl({ ...neutral, humidityPct: -50 })).toBeCloseTo(neutralEt * 1.8);
    expect(dailyEtMl({ ...neutral, humidityPct: -100 })).toBeCloseTo(
      dailyEtMl({ ...neutral, humidityPct: -50 }),
    );
  });
});

describe('seasonal indoor climate', () => {
  it('northern hemisphere is warm May–Oct, cool otherwise', () => {
    expect(seasonalIndoorTempC('2026-07-15', 'north')).toBe(25);
    expect(seasonalIndoorTempC('2026-01-15', 'north')).toBe(23);
  });
  it('southern hemisphere is inverted', () => {
    expect(seasonalIndoorTempC('2026-07-15', 'south')).toBe(23);
    expect(seasonalIndoorTempC('2026-01-15', 'south')).toBe(25);
  });
  it('exposes an indoor default relative humidity', () => {
    expect(INDOOR_DEFAULT_RH).toBe(45);
  });
});

describe('water-balance simulation', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const atUtcNoon = (dayOfMonth: number) => Date.UTC(2026, 0, dayOfMonth, 12);
  const pot = {
    diameterCm: 12,
    heightCm: 10,
    substrate: 'standard',
    drains: true,
  } as const;
  const capacityMl = waterCapacityMl(pot);
  const residualMl = capacityMl * 0.05;
  const dailyClimate = () => ({
    tempC: 20,
    humidityPct: 50,
    light: 'medium',
  }) as const;

  it('keeps water content within capacity and residual bounds', () => {
    const saturated = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: atUtcNoon(2),
      waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl * 10 }],
      dailyClimate,
      speciesDailyFraction: 0.05,
      corrections: [],
    });

    expect(saturated.waterContentMl).toBeLessThanOrEqual(saturated.capacityMl);

    const driedDown = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: atUtcNoon(60),
      waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl }],
      dailyClimate,
      speciesDailyFraction: 0.2,
      corrections: [],
    });

    expect(driedDown.waterContentMl).toBeGreaterThanOrEqual(driedDown.residualMl);
  });

  it('dries down over time after the same watering', () => {
    const baseInput = {
      pot,
      startMs: atUtcNoon(1),
      waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl }],
      dailyClimate,
      speciesDailyFraction: 0.05,
      corrections: [],
    };

    const earlier = simulateWaterContent({
      ...baseInput,
      endMs: atUtcNoon(2),
    });
    const later = simulateWaterContent({
      ...baseInput,
      endMs: atUtcNoon(7),
    });

    expect(later.waterContentMl).toBeLessThan(earlier.waterContentMl);
  });

  it('applies corrections forward from their observation time', () => {
    const startMs = atUtcNoon(1);
    const correctionMs = startMs + 6 * 60 * 60 * 1000;
    const endMs = correctionMs + dayMs;
    const speciesDailyFraction = 0.1;
    const correctionWaterContentMl = capacityMl * 0.6;
    const expectedPostCorrectionEtMl =
      dailyEtMl({
        capacityMl,
        speciesDailyFraction,
        ...dailyClimate(),
      }) *
      ((endMs - correctionMs) / dayMs);

    const corrected = simulateWaterContent({
      pot,
      startMs,
      endMs,
      waterings: [{ observedAtMs: startMs, amountMl: capacityMl }],
      dailyClimate,
      speciesDailyFraction,
      corrections: [{ observedAtMs: correctionMs, waterContentMl: correctionWaterContentMl }],
    });

    expect(corrected.waterContentMl).toBeCloseTo(
      Math.max(residualMl, correctionWaterContentMl - expectedPostCorrectionEtMl),
    );
  });

  it('clamps corrections to modeled bounds', () => {
    const clampedWet = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: atUtcNoon(1),
      waterings: [],
      dailyClimate,
      speciesDailyFraction: 0,
      corrections: [{ observedAtMs: atUtcNoon(1), waterContentMl: capacityMl * 2 }],
    });

    expect(clampedWet.waterContentMl).toBeCloseTo(capacityMl);

    const clampedDry = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: atUtcNoon(1),
      waterings: [],
      dailyClimate,
      speciesDailyFraction: 0,
      corrections: [{ observedAtMs: atUtcNoon(1), waterContentMl: 0 }],
    });

    expect(clampedDry.waterContentMl).toBeCloseTo(residualMl);
  });

  it('starts from the repot boundary and seeds unknown fresh substrate as moist', () => {
    const repotMs = atUtcNoon(10);
    const endMs = repotMs + dayMs;
    const speciesDailyFraction = 0.05;
    const expectedDryDownMl =
      capacityMl * 0.5 -
      dailyEtMl({
        capacityMl,
        speciesDailyFraction,
        ...dailyClimate(),
      });

    const result = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs,
      waterings: [{ observedAtMs: atUtcNoon(5), amountMl: capacityMl * 10 }],
      dailyClimate,
      speciesDailyFraction,
      corrections: [],
      repotBoundaryMs: repotMs,
    });

    expect(result.waterContentMl).toBeCloseTo(expectedDryDownMl);
    expect(result.waterContentMl).toBeLessThan(capacityMl * 0.5);
    expect(result.lowConfidenceStart).toBe(true);
  });

  it('uses a watering at or after a repot instead of the moist default seed', () => {
    const repotMs = atUtcNoon(10);
    const wateringMs = repotMs + dayMs;
    const result = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: wateringMs,
      waterings: [{ observedAtMs: wateringMs, amountMl: null }],
      dailyClimate,
      speciesDailyFraction: 0.05,
      corrections: [],
      repotBoundaryMs: repotMs,
    });

    expect(result.lowConfidenceStart).toBe(false);
    expect(result.waterContentMl).toBeCloseTo(residualMl + capacityMl * 0.4);
    expect(result.waterContentMl).toBeLessThan(capacityMl * 0.5);
  });

  it('uses the default pour when a watering amount is omitted', () => {
    const wateringMs = atUtcNoon(12);
    const result = simulateWaterContent({
      pot,
      startMs: atUtcNoon(1),
      endMs: wateringMs,
      waterings: [{ observedAtMs: wateringMs }],
      dailyClimate,
      speciesDailyFraction: 0.05,
      corrections: [],
    });

    expect(result.lowConfidenceStart).toBe(false);
    expect(result.waterContentMl).toBeCloseTo(residualMl + capacityMl * 0.4);
  });
});

describe('moisture estimate and confidence', () => {
  const atUtcNoon = (dayOfMonth: number) => Date.UTC(2026, 0, dayOfMonth, 12);
  const pot = {
    diameterCm: 12,
    heightCm: 10,
    substrate: 'standard',
    drains: true,
  } as const;
  const capacityMl = waterCapacityMl(pot);
  const dailyClimate = () => ({
    tempC: 20,
    humidityPct: 50,
    light: 'medium',
  }) as const;

  const baseInput = (overrides: Partial<EstimateInput> = {}): EstimateInput => ({
    pot,
    startMs: atUtcNoon(1),
    endMs: atUtcNoon(1),
    waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl }],
    dailyClimate,
    speciesDailyFraction: 0.05,
    corrections: [],
    substratePresent: false,
    amountMeasured: false,
    groundTruthCount: 0,
    ...overrides,
  });

  it('exposes dry, moist, and wet anchors as fractions of capacity', () => {
    expect(ANCHORS).toEqual({
      dry: 0.15,
      moist: 0.5,
      wet: 0.85,
    });
  });

  it('returns bounded moisture percent and the simulated capacity', () => {
    const saturated: MoistureEstimate = estimateMoisture(
      baseInput({
        waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl * 10 }],
      }),
    );
    const driedDown = estimateMoisture(
      baseInput({
        endMs: atUtcNoon(60),
        speciesDailyFraction: 0.2,
      }),
    );

    expect(saturated.capacityMl).toBeCloseTo(waterCapacityMl(pot));
    expect(saturated.moisturePercent).toBeGreaterThanOrEqual(0);
    expect(saturated.moisturePercent).toBeLessThanOrEqual(100);
    expect(saturated.moisturePercent).toBe(100);
    expect(driedDown.moisturePercent).toBeGreaterThanOrEqual(0);
    expect(driedDown.moisturePercent).toBeLessThanOrEqual(100);
  });

  it('raises confidence as substrate, measured amount, and ground truth are added', () => {
    const confidenceTrail: Confidence[] = [
      estimateMoisture(baseInput()).confidence,
      estimateMoisture(baseInput({ substratePresent: true, amountMeasured: true })).confidence,
      estimateMoisture(
        baseInput({
          substratePresent: true,
          amountMeasured: true,
          groundTruthCount: 2,
        }),
      ).confidence,
    ];

    expect(confidenceTrail).toEqual(['low', 'medium', 'high']);
  });

  it.each([
    [0, { substratePresent: false, amountMeasured: false, groundTruthCount: 0 }, 'low'],
    [1, { substratePresent: true, amountMeasured: false, groundTruthCount: 0 }, 'low'],
    [2, { substratePresent: true, amountMeasured: true, groundTruthCount: 0 }, 'medium'],
    [3, { substratePresent: false, amountMeasured: false, groundTruthCount: 3 }, 'medium'],
    [4, { substratePresent: true, amountMeasured: false, groundTruthCount: 3 }, 'high'],
    [5, { substratePresent: true, amountMeasured: true, groundTruthCount: 3 }, 'high'],
  ] as const)('maps confidence score %i to %s', (_score, overrides, confidence) => {
    expect(estimateMoisture(baseInput(overrides)).confidence).toBe(confidence);
  });

  it('does not raise confidence for placeholder watering amounts even when flagged as measured', () => {
    const unknownAmountInput = baseInput({
      substratePresent: true,
      waterings: [{ observedAtMs: atUtcNoon(1), amountMl: null }],
    });

    expect(estimateMoisture({ ...unknownAmountInput, amountMeasured: false }).confidence).toBe('low');
    expect(estimateMoisture({ ...unknownAmountInput, amountMeasured: true }).confidence).toBe('low');
    expect(
      estimateMoisture({
        ...unknownAmountInput,
        amountMeasured: true,
        waterings: [{ observedAtMs: atUtcNoon(1), amountMl: capacityMl }],
      }).confidence,
    ).toBe('medium');
  });

  it('normalizes ground truth contribution before confidence scoring', () => {
    expect(
      estimateMoisture(
        baseInput({
          substratePresent: true,
          amountMeasured: true,
          groundTruthCount: -3,
        }),
      ).confidence,
    ).toBe('medium');
    expect(
      estimateMoisture(
        baseInput({
          substratePresent: true,
          amountMeasured: false,
          groundTruthCount: 2.9,
        }),
      ).confidence,
    ).toBe('medium');
    expect(
      estimateMoisture(
        baseInput({
          groundTruthCount: 3,
        }),
      ).confidence,
    ).toBe('medium');
    expect(
      estimateMoisture(
        baseInput({
          groundTruthCount: 30,
        }),
      ).confidence,
    ).toBe('medium');
    expect(
      estimateMoisture(
        baseInput({
          substratePresent: true,
          amountMeasured: true,
          groundTruthCount: Number.POSITIVE_INFINITY,
        }),
      ).confidence,
    ).toBe('medium');
    expect(
      estimateMoisture(
        baseInput({
          substratePresent: true,
          amountMeasured: true,
          groundTruthCount: Number.NaN,
        }),
      ).confidence,
    ).toBe('medium');
  });

  it('caps otherwise high confidence at medium for unknown-moisture repot starts', () => {
    const beforeRepotWatering = atUtcNoon(5);
    const highScoreInput = baseInput({
      startMs: atUtcNoon(1),
      endMs: atUtcNoon(11),
      waterings: [{ observedAtMs: beforeRepotWatering, amountMl: capacityMl }],
      substratePresent: true,
      amountMeasured: true,
      groundTruthCount: 3,
    });

    expect(estimateMoisture(highScoreInput).confidence).toBe('high');
    expect(
      estimateMoisture({
        ...highScoreInput,
        repotBoundaryMs: atUtcNoon(10),
      }).confidence,
    ).toBe('medium');
  });

  it('returns zero moisture percent for zero-capacity pots', () => {
    const estimate = estimateMoisture(
      baseInput({
        pot: { ...pot, diameterCm: 0 },
      }),
    );

    expect(estimate.capacityMl).toBe(0);
    expect(estimate.moisturePercent).toBe(0);
  });
});

describe('watering recommendation', () => {
  it('maps the internal scale onto anchored statuses', () => {
    expect(recommendWatering(10).status).toBe('water_now');   // below dry anchor
    expect(recommendWatering(15).status).toBe('water_now');   // at dry anchor
    expect(recommendWatering(30).status).toBe('drying');      // just above
    expect(recommendWatering(50).status).toBe('comfortable'); // mid (moist anchor)
    expect(recommendWatering(70).status).toBe('comfortable');
    expect(recommendWatering(85).status).toBe('overwatered'); // at wet anchor
    expect(recommendWatering(95).status).toBe('overwatered');
  });

  it('species band changes neither the status nor the thresholds', () => {
    expect(recommendWatering(30, { band: 'dry' }).status).toBe('drying');
    expect(recommendWatering(30, { band: 'wet' }).status).toBe('drying');
    expect(recommendWatering(60, { band: 'dry' }).status).toBe('comfortable');
    expect(recommendWatering(60, { band: 'wet' }).status).toBe('comfortable');
  });

  it('projects a sooner dry-date in hotter air', () => {
    const baseEt: EtInputs = { capacityMl: 1000, speciesDailyFraction: 0.12, tempC: 20, humidityPct: 50, light: 'medium' };
    const cool = recommendWatering(60, { et: baseEt }).daysUntilDry;
    const hot = recommendWatering(60, { et: { ...baseEt, tempC: 32 } }).daysUntilDry;
    expect(cool).toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(0);
    expect(hot).toBeLessThan(cool as number);
  });

  it('omits daysUntilDry when soil is already at or below the dry anchor', () => {
    const baseEt: EtInputs = { capacityMl: 1000, speciesDailyFraction: 0.12, tempC: 20, humidityPct: 50, light: 'medium' };
    expect(recommendWatering(15, { et: baseEt }).daysUntilDry).toBeUndefined();
    expect(recommendWatering(8, { et: baseEt }).daysUntilDry).toBeUndefined();
  });
});

describe('moistureInsight', () => {
  it('describes a comfortable estimate with species and rounded percent', () => {
    const insight = moistureInsight(
      { moisturePercent: 41.6, confidence: 'high' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
    );

    expect(insight.kind).toBe('soil_moisture');
    expect(insight.severity).toBe('info');
    expect(insight.title).toBe('Soil moisture looks comfortable');
    expect(insight.detail).toContain('42');
    expect(insight.detail).toContain('Monstera deliciosa');
    expect(insight.evidenceCount).toBe(0);
  });

  it('flags water_now as a warning with the right title', () => {
    const insight = moistureInsight(
      { moisturePercent: 10, confidence: 'medium' },
      { status: 'water_now' },
      'Monstera deliciosa',
      null,
    );

    expect(insight.severity).toBe('warning');
    expect(insight.title).toBe('Time to water');
  });

  it('flags overwatered as a warning', () => {
    const insight = moistureInsight(
      { moisturePercent: 92, confidence: 'medium' },
      { status: 'overwatered' },
      'Monstera deliciosa',
      null,
    );

    expect(insight.severity).toBe('warning');
    expect(insight.title).toBe('Soil looks waterlogged');
  });

  it('flags drying as a suggestion', () => {
    const insight = moistureInsight(
      { moisturePercent: 35, confidence: 'medium' },
      { status: 'drying' },
      'Monstera deliciosa',
      null,
    );

    expect(insight.severity).toBe('suggestion');
    expect(insight.title).toBe('Starting to dry out');
  });

  it('appends an enrichment nudge only at low confidence', () => {
    const low = moistureInsight(
      { moisturePercent: 50, confidence: 'low' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
    );
    const medium = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
    );
    const high = moistureInsight(
      { moisturePercent: 50, confidence: 'high' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
    );

    expect(low.detail.endsWith('Add your pot size and a soil check to sharpen this estimate.')).toBe(true);
    expect(medium.detail).not.toContain('sharpen');
    expect(high.detail).not.toContain('sharpen');
  });

  it('omits the species clause when no species name is known', () => {
    const insight = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      null,
      null,
    );

    expect(insight.detail).not.toContain(' for ');
  });

  it('colors the detail with the species band preference', () => {
    const dry = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      'dry',
    );
    const moist = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      'moist',
    );
    const wet = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      'wet',
    );

    expect(dry.detail).toContain('It prefers to dry out between waterings.');
    expect(moist.detail).toContain('It likes evenly moist soil.');
    expect(wet.detail).toContain('It likes staying consistently damp.');
  });

  it('uses "This plant" instead of "It" when no species name is known', () => {
    const insight = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      null,
      'moist',
    );

    expect(insight.detail).toContain('This plant likes evenly moist soil.');
  });

  it('omits the preference sentence when no band is provided', () => {
    const insight = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
    );

    expect(insight.detail).not.toContain('likes');
    expect(insight.detail).not.toContain('prefers');
  });
});

describe('moistureStatusColor', () => {
  it('returns the dark-theme accent per status', () => {
    expect(moistureStatusColor('comfortable', true)).toBe('#C7F24A');
    expect(moistureStatusColor('drying', true)).toBe('#E0C56B');
    expect(moistureStatusColor('water_now', true)).toBe('#E0A36B');
    expect(moistureStatusColor('overwatered', true)).toBe('#7FC8E0');
  });

  it('returns the light-theme accent per status', () => {
    expect(moistureStatusColor('comfortable', false)).toBe('#3C7140');
    expect(moistureStatusColor('drying', false)).toBe('#A88A3C');
    expect(moistureStatusColor('water_now', false)).toBe('#B07F57');
    expect(moistureStatusColor('overwatered', false)).toBe('#3F7E91');
  });
});
