import { describe, expect, it } from 'vitest';
import { buildGbifVernacularSearchUrl } from '../../src/lib/knowledge/gbif';

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
