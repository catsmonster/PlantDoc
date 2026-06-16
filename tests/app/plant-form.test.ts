import { describe, expect, it } from 'vitest';
import { potDimensionInitialValue, potDimensionToCm } from '../../src/features/plants/plant-form-logic';

describe('pot dimension conversion (PlantForm boundary)', () => {
  it('saves metric input straight to cm', () => {
    expect(potDimensionToCm('12', 'metric')).toBe(12);
  });
  it('saves imperial inches as cm', () => {
    expect(potDimensionToCm('10', 'imperial')).toBeCloseTo(25.4);
  });
  it('returns null for blank or non-finite input', () => {
    expect(potDimensionToCm('', 'imperial')).toBeNull();
    expect(potDimensionToCm('abc', 'metric')).toBeNull();
  });
  it('returns null when the converted value is out of the 1–200 cm range', () => {
    expect(potDimensionToCm('0', 'metric')).toBeNull();
    expect(potDimensionToCm('-5', 'metric')).toBeNull();
    expect(potDimensionToCm('250', 'metric')).toBeNull();
    expect(potDimensionToCm('80', 'imperial')).toBeNull(); // 80 in = 203.2 cm > 200
  });
  it('keeps fractional imperial entries inside range, rounded to 2 dp', () => {
    expect(potDimensionToCm('5.5', 'imperial')).toBeCloseTo(13.97); // 5.5 in = 13.97 cm
    expect(potDimensionToCm('0.5', 'imperial')).toBeCloseTo(1.27); // 0.5 in = 1.27 cm, still >= 1
  });
  it('prefills the editing field in the user unit', () => {
    expect(potDimensionInitialValue(25.4, 'imperial')).toBe('10');
    expect(potDimensionInitialValue(12, 'metric')).toBe('12');
    expect(potDimensionInitialValue(null, 'imperial')).toBe('');
  });
});
