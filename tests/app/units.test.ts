import { describe, expect, it } from 'vitest';
import { formatHeight, formatTemperature, formatVolume } from '../../src/lib/units';

describe('unit display helpers', () => {
  it('formats heights in metric and imperial', () => {
    expect(formatHeight(62, 'metric')).toBe('62 cm');
    expect(formatHeight(30, 'imperial')).toBe('11.8 in');
  });

  it('formats volumes in metric and imperial', () => {
    expect(formatVolume(250, 'metric')).toBe('250 ml');
    expect(formatVolume(250, 'imperial')).toBe('8.5 fl oz');
    expect(formatVolume(1500, 'metric')).toBe('1.5 l');
  });

  it('formats temperatures', () => {
    expect(formatTemperature(21.5, 'metric')).toBe('21.5°C');
    expect(formatTemperature(21.5, 'imperial')).toBe('70.7°F');
  });
});
