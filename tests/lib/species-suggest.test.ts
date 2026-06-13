import { describe, expect, it } from 'vitest';
import {
  mergeSuggestions,
  shouldQueryRemote,
  type SpeciesSuggestion,
} from '../../src/lib/knowledge/species-suggest';

const local: SpeciesSuggestion = { scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' };
const remoteHit: SpeciesSuggestion = { scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' };
const dupeOfLocal: SpeciesSuggestion = { scientificName: 'monstera deliciosa', commonName: 'X', speciesId: null, slug: null, via: 'gbif' };

describe('mergeSuggestions', () => {
  it('keeps local first, then remote, capped', () => {
    const out = mergeSuggestions([local], [remoteHit], 6);
    expect(out.map((s) => s.scientificName)).toEqual(['Monstera deliciosa', 'Ocimum basilicum']);
  });
  it('dedupes remote that repeats a local name (case-insensitive)', () => {
    const out = mergeSuggestions([local], [dupeOfLocal, remoteHit], 6);
    expect(out.map((s) => s.scientificName)).toEqual(['Monstera deliciosa', 'Ocimum basilicum']);
  });
  it('respects the limit', () => {
    expect(mergeSuggestions([local], [remoteHit], 1)).toHaveLength(1);
  });
});

describe('shouldQueryRemote', () => {
  it('true only when local is empty and query is >= 3 chars', () => {
    expect(shouldQueryRemote('basil', [])).toBe(true);
    expect(shouldQueryRemote('ba', [])).toBe(false);
    expect(shouldQueryRemote('basil', [local])).toBe(false);
    expect(shouldQueryRemote('   ', [])).toBe(false);
  });
});
