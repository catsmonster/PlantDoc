import { describe, expect, it } from 'vitest';
import { slugify, buildSpeciesCatalog } from '../../scripts/knowledge/catalog';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';

describe('slugify', () => {
  it('lowercases and hyphenates a scientific name', () => {
    expect(slugify('Monstera deliciosa')).toBe('monstera-deliciosa');
    expect(slugify('Mentha x piperita')).toBe('mentha-x-piperita');
    expect(slugify('Hibiscus rosa-sinensis')).toBe('hibiscus-rosa-sinensis');
  });
});

describe('buildSpeciesCatalog', () => {
  const catalog = buildSpeciesCatalog();
  it('includes every editorial species by its own slug', () => {
    for (const p of CARE_PROFILES) {
      expect(
        catalog.find((c) => c.slug === p.slug),
        p.slug,
      ).toBeDefined();
    }
  });
  it('is much larger than the editorial pack and has unique slugs', () => {
    expect(catalog.length).toBeGreaterThan(CARE_PROFILES.length + 50);
    const slugs = catalog.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('every entry has a slug, scientific name, and common names array', () => {
    expect(
      catalog.every(
        (c) => c.slug.length > 0 && c.scientificName.length > 0 && Array.isArray(c.commonNames),
      ),
    ).toBe(true);
  });
});
