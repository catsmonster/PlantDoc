import { describe, expect, it } from 'vitest';
import {
  parseWaterAmountMl,
  WATER_AMOUNT_MAX_ML,
  WATER_AMOUNT_MIN_ML,
  WATER_AMOUNT_STEP_ML,
} from '../../src/lib/water-amount';

describe('water amount input bounds', () => {
  it('accepts arbitrary in-range milliliter amounts, not only presets', () => {
    expect(parseWaterAmountMl('333')).toBe(333);
    expect(parseWaterAmountMl('275.5')).toBe(275.5);
  });

  it('keeps blank water amount optional', () => {
    expect(parseWaterAmountMl('')).toBeUndefined();
    expect(parseWaterAmountMl('   ')).toBeUndefined();
  });

  it('sets explicit slider bounds and rejects amounts outside them', () => {
    expect(WATER_AMOUNT_MIN_ML).toBe(10);
    expect(WATER_AMOUNT_MAX_ML).toBe(2000);
    expect(WATER_AMOUNT_STEP_ML).toBe(10);

    expect(() => parseWaterAmountMl('9')).toThrow('between 10 ml and 2000 ml');
    expect(() => parseWaterAmountMl('2001')).toThrow('between 10 ml and 2000 ml');
  });
});
