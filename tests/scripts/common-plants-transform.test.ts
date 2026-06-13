import { describe, expect, it } from 'vitest';
import { COMMON_PLANT_SEED } from '../../scripts/knowledge/common-plants.seed';
import {
  englishVernaculars,
  plantFromMatch,
} from '../../scripts/knowledge/common-plants-transform';

describe('COMMON_PLANT_SEED', () => {
  it('is a non-empty list of unique, non-blank names', () => {
    expect(COMMON_PLANT_SEED.length).toBeGreaterThan(40);
    const norm = COMMON_PLANT_SEED.map((n) => n.trim().toLowerCase());
    expect(norm.every((n) => n.length > 0)).toBe(true);
    expect(new Set(norm).size).toBe(norm.length);
  });
});

const PLANT_MATCH = { usageKey: 2927096, canonicalName: 'Ocimum basilicum', rank: 'SPECIES', kingdom: 'Plantae', matchType: 'EXACT' };
const ANIMAL_MATCH = { usageKey: 1, canonicalName: 'Canis lupus', rank: 'SPECIES', kingdom: 'Animalia', matchType: 'EXACT' };
const VERNACULARS = { results: [
  { vernacularName: 'basil', language: 'eng' },
  { vernacularName: 'sweet basil', language: 'eng' },
  { vernacularName: 'basil', language: 'eng' },
  { vernacularName: 'Basilikum', language: 'deu' },
] };

describe('plantFromMatch', () => {
  it('accepts a Plantae species and returns key + canonical name', () => {
    expect(plantFromMatch(PLANT_MATCH)).toEqual({ usageKey: 2927096, scientificName: 'Ocimum basilicum' });
  });
  it('rejects non-Plantae, non-species, or NONE matches', () => {
    expect(plantFromMatch(ANIMAL_MATCH)).toBeNull();
    expect(plantFromMatch({ matchType: 'NONE' })).toBeNull();
    expect(plantFromMatch({ ...PLANT_MATCH, rank: 'GENUS' })).toBeNull();
  });
});

describe('englishVernaculars', () => {
  it('returns deduped English names in order, capped at 4', () => {
    expect(englishVernaculars(VERNACULARS)).toEqual(['basil', 'sweet basil']);
  });
  it('returns [] when there is no English name', () => {
    expect(englishVernaculars({ results: [{ vernacularName: 'Basilikum', language: 'deu' }] })).toEqual([]);
  });
});
