import { describe, expect, it } from 'vitest';
import {
  mergeSuggestions,
  shouldQueryRemote,
  speciesSelectionFromSuggestion,
  suggestionRowView,
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

describe('suggestionRowView', () => {
  it('leads with the common name, scientific name as sub, care tag for curated', () => {
    expect(suggestionRowView({ scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' }))
      .toEqual({ lead: 'Swiss cheese plant', sub: 'Monstera deliciosa', tag: 'care' });
  });
  it('tags gbif rows and shows no tag for plain local/catalog rows', () => {
    expect(suggestionRowView({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' }).tag).toBe('gbif');
    expect(suggestionRowView({ scientificName: 'Ficus elastica', commonName: 'Rubber plant', speciesId: 'abc', slug: null }).tag).toBeNull();
  });
  it('falls back to scientific name as the lead when there is no common name', () => {
    expect(suggestionRowView({ scientificName: 'Ocimum basilicum', commonName: null, speciesId: null, slug: null }))
      .toEqual({ lead: 'Ocimum basilicum', sub: null, tag: null });
  });
});

describe('speciesSelectionFromSuggestion', () => {
  it('uses the relation id for catalog-backed picks', () => {
    expect(speciesSelectionFromSuggestion({ scientificName: 'Ficus elastica', commonName: 'Rubber plant', speciesId: 'abc', slug: null }))
      .toEqual({ speciesId: 'abc', speciesText: '' });
  });
  it('uses free scientific text for non-catalog picks', () => {
    expect(speciesSelectionFromSuggestion({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' }))
      .toEqual({ speciesId: '', speciesText: 'Ocimum basilicum' });
  });
});
