import { describe, expect, it } from 'vitest';
import { COMMON_PLANT_SEED } from '../../scripts/knowledge/common-plants.seed';

describe('COMMON_PLANT_SEED', () => {
  it('is a non-empty list of unique, non-blank names', () => {
    expect(COMMON_PLANT_SEED.length).toBeGreaterThan(40);
    const norm = COMMON_PLANT_SEED.map((n) => n.trim().toLowerCase());
    expect(norm.every((n) => n.length > 0)).toBe(true);
    expect(new Set(norm).size).toBe(norm.length);
  });
});
