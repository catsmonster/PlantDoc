import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  dailyEtMl,
  estimateMoisture,
  INDOOR_DEFAULT_RH,
  potSoilVolumeMl,
  seasonalIndoorTempC,
  simulateWaterContent,
  waterCapacityMl,
} from '../../src/lib/moisture';
import type { Confidence, EstimateInput, MoistureEstimate } from '../../src/lib/moisture';

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

  it('does not raise confidence for placeholder watering amounts unless the amount was measured', () => {
    const unknownAmountInput = baseInput({
      substratePresent: true,
      waterings: [{ observedAtMs: atUtcNoon(1), amountMl: null }],
    });

    expect(estimateMoisture({ ...unknownAmountInput, amountMeasured: false }).confidence).toBe('low');
    expect(estimateMoisture({ ...unknownAmountInput, amountMeasured: true }).confidence).toBe('medium');
  });

  it('caps ground truth contribution at three corrections for confidence scoring', () => {
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
});
