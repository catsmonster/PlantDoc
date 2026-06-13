import { describe, expect, it } from 'vitest';
import {
  buildGbifVernacularSearchUrl,
  parseGbifVernacularResults,
} from '../../src/lib/knowledge/gbif';

describe('buildGbifVernacularSearchUrl', () => {
  it('queries the vernacular index filtered to accepted Plantae species', () => {
    const url = new URL(buildGbifVernacularSearchUrl('  basil '));
    expect(url.origin + url.pathname).toBe('https://api.gbif.org/v1/species/search');
    expect(url.searchParams.get('q')).toBe('basil');
    expect(url.searchParams.get('qField')).toBe('VERNACULAR');
    expect(url.searchParams.get('rank')).toBe('SPECIES');
    expect(url.searchParams.get('status')).toBe('ACCEPTED');
    expect(url.searchParams.get('highertaxonKey')).toBe('6');
    expect(url.searchParams.get('limit')).toBe('8');
  });
});

const BASIL_RESPONSE = {
  results: [
    {
      kingdom: 'Plantae',
      rank: 'SPECIES',
      canonicalName: 'Ocimum basilicum',
      scientificName: 'Ocimum basilicum L.',
      nubKey: 2927096,
      vernacularNames: [
        { vernacularName: 'Basilikum', language: 'deu' },
        { vernacularName: 'sweet basil', language: 'eng' },
        { vernacularName: 'basil', language: 'eng' },
      ],
    },
    { kingdom: 'Plantae', rank: 'SPECIES', canonicalName: 'Ocimum basilicum', vernacularNames: [] },
    { kingdom: 'Animalia', rank: 'SPECIES', canonicalName: 'Basilosaurus cetoides', vernacularNames: [] },
    { kingdom: 'Plantae', rank: 'GENUS', canonicalName: 'Ocimum', vernacularNames: [] },
  ],
};

describe('parseGbifVernacularResults', () => {
  it('maps plant species to suggestions, picks the closest English name, dedupes, tags via gbif', () => {
    const out = parseGbifVernacularResults(BASIL_RESPONSE, 'basil');
    expect(out).toEqual([
      { scientificName: 'Ocimum basilicum', commonName: 'basil', speciesId: null, slug: null, via: 'gbif' },
    ]);
  });
  it('drops non-Plantae and non-species rows', () => {
    const names = parseGbifVernacularResults(BASIL_RESPONSE, 'basil').map((s) => s.scientificName);
    expect(names).not.toContain('Basilosaurus cetoides');
    expect(names).not.toContain('Ocimum');
  });
  it('returns [] for junk input', () => {
    expect(parseGbifVernacularResults(null)).toEqual([]);
    expect(parseGbifVernacularResults({})).toEqual([]);
  });
});
