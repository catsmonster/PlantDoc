import { describe, expect, it } from 'vitest';
import {
  pickOpenPlantbookMatch,
  parseOpenPlantbookCareFacts,
} from '../../src/lib/knowledge/openplantbook';

describe('pickOpenPlantbookMatch', () => {
  it('returns the pid whose display_pid matches the scientific name (case-insensitive)', () => {
    const results = [
      { pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' },
      { pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa' },
    ];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBe('monstera deliciosa');
  });
  it('returns null when no result matches exactly (no fuzzy guess)', () => {
    const results = [{ pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' }];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBeNull();
  });
});

describe('parseOpenPlantbookCareFacts', () => {
  const DETAIL = {
    pid: 'monstera deliciosa',
    min_temp: 12,
    max_temp: 32,
    min_env_humid: 30,
    max_env_humid: 85,
    min_light_lux: 800,
    max_light_lux: 15000,
    min_soil_moist: 15,
    max_soil_moist: 60,
    min_soil_ec: 350,
    max_soil_ec: 2000,
  };
  it('emits community_unverified ranges for each present indoor metric, sourced to openplantbook', () => {
    const facts = parseOpenPlantbookCareFacts(DETAIL);
    const byAttr = new Map(facts.map((f) => [f.attribute, f]));
    expect(
      facts.every((f) => f.trust === 'community_unverified' && f.sourceId === 'openplantbook'),
    ).toBe(true);
    expect(byAttr.get('temperature_c')).toMatchObject({ valueMin: 12, valueMax: 32, valueUnit: 'C' });
    expect(byAttr.get('humidity_percent')).toMatchObject({ valueMin: 30, valueMax: 85, valueUnit: '%' });
    expect(byAttr.get('light_lux')).toMatchObject({ valueMin: 800, valueMax: 15000, valueUnit: 'lux' });
    expect(byAttr.get('soil_moisture_percent')).toMatchObject({ valueMin: 15, valueMax: 60 });
    expect(byAttr.get('soil_ec')).toMatchObject({ valueMin: 350, valueMax: 2000 });
  });
  it('skips a metric when either bound is missing or non-numeric', () => {
    const facts = parseOpenPlantbookCareFacts({ pid: 'x', min_temp: 12, max_temp: null });
    expect(facts.find((f) => f.attribute === 'temperature_c')).toBeUndefined();
  });
  it('returns [] for a malformed detail', () => {
    expect(parseOpenPlantbookCareFacts(null)).toEqual([]);
  });
});
