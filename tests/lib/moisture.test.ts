import { describe, expect, it } from 'vitest';
import {
  dailyEtMl,
  INDOOR_DEFAULT_RH,
  potSoilVolumeMl,
  seasonalIndoorTempC,
  waterCapacityMl,
} from '../../src/lib/moisture';

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
