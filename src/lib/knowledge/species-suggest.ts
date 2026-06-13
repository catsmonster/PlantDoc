/**
 * Common-name → species suggestions for the onboarding typeahead (roadmap
 * Phase 4A). Merges the curated starter care pack with the user's Appwrite
 * species catalog and ranks matches over scientific names, common names, and
 * legacy synonyms — so typing "swiss cheese plant" surfaces Monstera deliciosa.
 *
 * Pure and offline: GBIF's free suggest endpoint indexes scientific names and
 * is weak at common names, so the guess leans on our own curated data. A
 * suggestion carries the Appwrite id (when catalog-backed, to set the relation)
 * and the care-pack slug (when a care guide exists for it).
 */

import { CARE_PROFILES } from './care-profiles';

export interface SpeciesSuggestion {
  scientificName: string;
  /** Best common name to display (the one that matched, else the first known). */
  commonName: string | null;
  /** Appwrite species catalog id when catalog-backed; lets the form set species_id. */
  speciesId: string | null;
  /** Care-pack slug when a curated care profile backs this suggestion. */
  slug: string | null;
}

/** The subset of an Appwrite species row this module needs. */
export interface CatalogSpeciesLike {
  $id: string;
  scientific_name: string;
  common_names: string[];
}

interface MergedSpecies {
  scientificName: string;
  commonNames: string[];
  synonyms: string[];
  speciesId: string | null;
  slug: string | null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = normalize(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Exact = 0, prefix = 1, substring = 2, no match = Infinity. */
function scoreText(haystack: string, query: string): number {
  if (haystack === query) return 0;
  if (haystack.startsWith(query)) return 1;
  if (haystack.includes(query)) return 2;
  return Infinity;
}

function mergeCorpus(catalog: CatalogSpeciesLike[]): MergedSpecies[] {
  const byName = new Map<string, MergedSpecies>();
  const upsert = (
    scientificName: string,
    commonNames: string[],
    synonyms: string[],
    speciesId: string | null,
    slug: string | null,
  ) => {
    const key = normalize(scientificName);
    if (!key) return;
    const existing = byName.get(key);
    if (existing) {
      existing.commonNames = dedupeNames([...existing.commonNames, ...commonNames]);
      existing.synonyms = dedupeNames([...existing.synonyms, ...synonyms]);
      existing.speciesId = existing.speciesId ?? speciesId;
      existing.slug = existing.slug ?? slug;
    } else {
      byName.set(key, {
        scientificName,
        commonNames: dedupeNames(commonNames),
        synonyms: dedupeNames(synonyms),
        speciesId,
        slug,
      });
    }
  };

  for (const profile of CARE_PROFILES) {
    upsert(profile.scientificName, profile.commonNames, profile.synonyms, null, profile.slug);
  }
  for (const row of catalog) {
    upsert(row.scientific_name, row.common_names ?? [], [], row.$id, null);
  }
  return [...byName.values()];
}

/**
 * Ranked species suggestions for a free-text query. Searches scientific names,
 * common names, and synonyms; exact hits rank ahead of prefix, then substring.
 * Returns [] for a blank query so the typeahead stays closed until the user types.
 */
export function suggestSpecies(
  query: string,
  catalog: CatalogSpeciesLike[] = [],
  limit = 6,
): SpeciesSuggestion[] {
  const q = normalize(query);
  if (!q) return [];

  const scored: { suggestion: SpeciesSuggestion; score: number }[] = [];
  for (const entry of mergeCorpus(catalog)) {
    let best = scoreText(normalize(entry.scientificName), q);
    let matchedCommon: { name: string; score: number } | null = null;
    for (const common of entry.commonNames) {
      const score = scoreText(normalize(common), q);
      if (score < (matchedCommon?.score ?? Infinity)) matchedCommon = { name: common, score };
      best = Math.min(best, score);
    }
    for (const synonym of entry.synonyms) {
      best = Math.min(best, scoreText(normalize(synonym), q));
    }
    if (best === Infinity) continue;

    const commonName =
      matchedCommon && matchedCommon.score < Infinity
        ? matchedCommon.name
        : (entry.commonNames[0] ?? null);
    scored.push({
      score: best,
      suggestion: {
        scientificName: entry.scientificName,
        commonName,
        speciesId: entry.speciesId,
        slug: entry.slug,
      },
    });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.suggestion.scientificName.localeCompare(b.suggestion.scientificName),
    )
    .slice(0, limit)
    .map((s) => s.suggestion);
}
