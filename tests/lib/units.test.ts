import { describe, expect, it } from 'vitest';
import {
  cmToLengthInput,
  formatSuggestedWater,
  lengthInputToCm,
  mlToVolumeInput,
  volumeInputToMl,
} from '../../src/lib/units';

describe('length conversion', () => {
  it('passes through metric and converts imperial inches to cm', () => {
    expect(lengthInputToCm(12, 'metric')).toBeCloseTo(12);
    expect(lengthInputToCm(10, 'imperial')).toBeCloseTo(25.4);
  });
  it('round-trips cm back to the input unit', () => {
    expect(cmToLengthInput(25.4, 'imperial')).toBeCloseTo(10);
    expect(cmToLengthInput(12, 'metric')).toBeCloseTo(12);
  });
});

describe('volume conversion', () => {
  it('passes through metric and converts imperial fl oz to ml', () => {
    expect(volumeInputToMl(250, 'metric')).toBeCloseTo(250);
    expect(volumeInputToMl(10, 'imperial')).toBeCloseTo(295.735);
  });
  it('round-trips ml back to the input unit', () => {
    expect(mlToVolumeInput(295.735, 'imperial')).toBeCloseTo(10);
    expect(mlToVolumeInput(250, 'metric')).toBeCloseTo(250);
  });
});

describe('formatSuggestedWater', () => {
  it('rounds metric to the nearest 25 ml', () => {
    expect(formatSuggestedWater(440, 'metric')).toBe('450 ml');
  });
  it('shows litres for large metric amounts', () => {
    expect(formatSuggestedWater(1240, 'metric')).toBe('1.3 l');
  });
  it('rounds imperial to the nearest 0.5 fl oz', () => {
    expect(formatSuggestedWater(200, 'imperial')).toBe('7 fl oz'); // 200/29.5735 = 6.76 -> nearest 0.5 = 7
  });
  it('suppresses an amount that rounds to zero in the active unit', () => {
    expect(formatSuggestedWater(5, 'metric')).toBeNull(); // -> 0 ml
    expect(formatSuggestedWater(5, 'imperial')).toBeNull(); // -> 0 fl oz
  });
});
