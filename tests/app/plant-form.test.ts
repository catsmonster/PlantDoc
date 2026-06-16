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
  it('prefills the editing field in the user unit', () => {
    expect(potDimensionInitialValue(25.4, 'imperial')).toBe('10');
    expect(potDimensionInitialValue(12, 'metric')).toBe('12');
    expect(potDimensionInitialValue(null, 'imperial')).toBe('');
  });
});
