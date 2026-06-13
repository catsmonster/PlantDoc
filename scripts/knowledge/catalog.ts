/**
 * The species catalog to mine (roadmap Phase 4A, slice 5). Unions the editorial
 * care pack (rich, hand-authored) with the common-plants onboarding seed
 * (name-only) into one deduped list keyed by a stable slug. The mining loaders
 * read the live `species` table, which this catalog seeds — so growing coverage
 * is just growing the seed. Pure + SDK-free so it unit-tests without Appwrite.
 * Lives with the mining scripts (Node-only infrastructure).
 */

import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { COMMON_PLANT_SEED } from './common-plants.seed';

export interface CatalogSpecies {
  slug: string;
  scientificName: string;
  commonNames: string[];
}

/** Stable slug from a scientific name: lowercased, non-alphanumerics → single hyphens. */
export function slugify(scientificName: string): string {
  return scientificName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Editorial species (own slug + names) unioned with the common-plants seed,
 *  deduped by slug with editorial taking precedence. */
export function buildSpeciesCatalog(): CatalogSpecies[] {
  const bySlug = new Map<string, CatalogSpecies>();
  for (const p of CARE_PROFILES) {
    bySlug.set(p.slug, {
      slug: p.slug,
      scientificName: p.scientificName,
      commonNames: [...p.commonNames],
    });
  }
  for (const seed of COMMON_PLANT_SEED) {
    const slug = slugify(seed.scientific);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, scientificName: seed.scientific, commonNames: [seed.common] });
    }
  }
  return [...bySlug.values()];
}
