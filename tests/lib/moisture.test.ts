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
