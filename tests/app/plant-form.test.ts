import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  placementNeedsRainAnswer,
  potDimensionInitialValue,
  potDimensionToCm,
  resolveRainExposed,
} from '../../src/features/plants/plant-form-logic';

const plantFormSource = readFileSync(join(process.cwd(), 'src', 'features', 'plants', 'PlantForm.tsx'), 'utf8');

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

describe('rain-exposure rule (PlantForm boundary)', () => {
  it('asks only for outdoor and balcony placements', () => {
    expect(placementNeedsRainAnswer('outdoor')).toBe(true);
    expect(placementNeedsRainAnswer('balcony')).toBe(true);
    expect(placementNeedsRainAnswer('indoor')).toBe(false);
    expect(placementNeedsRainAnswer('greenhouse')).toBe(false);
  });

  it('persists null for placements that do not need the answer', () => {
    expect(resolveRainExposed('indoor', true)).toBeNull();
    expect(resolveRainExposed('greenhouse', false)).toBeNull();
  });

  it('persists the explicit choice for outdoor/balcony', () => {
    expect(resolveRainExposed('outdoor', true)).toBe(true);
    expect(resolveRainExposed('balcony', false)).toBe(false);
    // Not yet answered -> stays null; the form blocks the save until answered.
    expect(resolveRainExposed('outdoor', null)).toBeNull();
  });
});

describe('rain-exposure markup', () => {
  it('does not wrap the Yes/No buttons in a label', () => {
    expect(plantFormSource).not.toMatch(/<label[^>]*>\s*<span[^>]*>Exposed to rain\?<\/span>/);
  });
});
