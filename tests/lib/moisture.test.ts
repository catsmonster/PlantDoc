import { describe, expect, it } from 'vitest';
import { potSoilVolumeMl, waterCapacityMl } from '../../src/lib/moisture';

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
