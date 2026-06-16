import { describe, expect, it } from 'vitest';
import { cmToLengthInput, lengthInputToCm, mlToVolumeInput, volumeInputToMl } from '../../src/lib/units';

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
