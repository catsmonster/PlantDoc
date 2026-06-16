import { describe, expect, it } from 'vitest';
import { waterAmountFromDisplay, waterAmountToDisplay } from '../../src/lib/water-amount';

describe('water amount display boundary', () => {
  it('shows canonical ml unchanged for metric', () => {
    expect(waterAmountToDisplay('250', 'metric')).toBe('250');
    expect(waterAmountFromDisplay('250', 'metric')).toBe('250');
  });
  it('round-trips fl oz <-> ml for imperial, storing canonical ml', () => {
    expect(waterAmountToDisplay('295.735', 'imperial')).toBe('10');
    expect(waterAmountFromDisplay('10', 'imperial')).toBe('295.735');
  });
  it('passes through empty input', () => {
    expect(waterAmountToDisplay('', 'imperial')).toBe('');
    expect(waterAmountFromDisplay('', 'imperial')).toBe('');
  });
  it('returns the raw text when it is not a finite number', () => {
    expect(waterAmountFromDisplay('abc', 'imperial')).toBe('abc');
    expect(waterAmountToDisplay('abc', 'imperial')).toBe('');
  });
});
