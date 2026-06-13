/**
 * Pure builder for taxon_references rows (roadmap Phase 4A, slice 2). Turns a
 * species' resolved cross-links (Wikidata QID + external catalog IDs, plus the
 * authoritative GBIF match usageKey) into upsertable rows, deduped by
 * (species, source) since a species has one ID per catalog. SDK-free so it unit
 * tests without Appwrite; the admin script is thin glue over this.
 */

import type { WikidataCrossLinks } from './wikidata';

export interface TaxonRefRow {
  species_slug: string;
  source_key: string;
  external_id: string;
  external_url: string;
}

/** GBIF match usageKey takes precedence over Wikidata's P846, so it is added first. */
export function buildTaxonRefRows(
  speciesSlug: string,
  wikidata: WikidataCrossLinks,
  gbifUsageKey?: number | null,
): TaxonRefRow[] {
  const candidates: TaxonRefRow[] = [];
  if (typeof gbifUsageKey === 'number') {
    candidates.push({
      species_slug: speciesSlug,
      source_key: 'gbif',
      external_id: String(gbifUsageKey),
      external_url: `https://www.gbif.org/species/${gbifUsageKey}`,
    });
  }
  if (wikidata.qid && wikidata.entityUrl) {
    candidates.push({
      species_slug: speciesSlug,
      source_key: 'wikidata',
      external_id: wikidata.qid,
      external_url: wikidata.entityUrl,
    });
  }
  for (const id of wikidata.ids) {
    candidates.push({
      species_slug: speciesSlug,
      source_key: id.sourceKey,
      external_id: id.externalId,
      external_url: id.externalUrl,
    });
  }
  const seen = new Set<string>();
  const rows: TaxonRefRow[] = [];
  for (const row of candidates) {
    const key = taxonRefNaturalKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

/** A species has at most one ID per catalog, so (species, source) is the key. */
export function taxonRefNaturalKey(row: TaxonRefRow): string {
  return `${row.species_slug}|${row.source_key}`;
}
