/**
 * Pure row builders for the knowledge loader (roadmap Phase 4A, slice B). Kept
 * SDK-free so they unit-test without Appwrite. The admin script
 * (scripts/knowledge/load-knowledge.ts) consumes these and upserts by natural
 * key, so re-running is idempotent.
 */

import { KNOWLEDGE_SOURCES } from './sources';
import { CARE_PROFILES } from './care-profiles';
import { editorialProfileToFacts, type CareFact } from './facts';

export interface SourceRow {
  source_key: string;
  name: string;
  url: string;
  license: string;
  commercial_ok: boolean;
  quarantined: boolean;
  attribution: string;
}

export interface FactRow {
  species_slug: string;
  source_key: string;
  attribute: string;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  value_unit: string | null;
  trust: CareFact['trust'];
}

/** Share-alike licenses whose derived data must stay attributed and out of
 *  commercial/export paths (spec decision 4). */
const QUARANTINED_LICENSES = new Set(['CC-BY-SA', 'ODbL']);

export function buildSourceRows(): SourceRow[] {
  return KNOWLEDGE_SOURCES.map((s) => ({
    source_key: s.id,
    name: s.name,
    url: s.url,
    license: s.license,
    commercial_ok: s.commercialOk,
    quarantined: QUARANTINED_LICENSES.has(s.license),
    attribution: s.attribution,
  }));
}

export function buildFactRows(): FactRow[] {
  const rows: FactRow[] = [];
  for (const profile of CARE_PROFILES) {
    for (const fact of editorialProfileToFacts(profile)) {
      rows.push({
        species_slug: profile.slug,
        source_key: fact.sourceId,
        attribute: fact.attribute,
        value_min: fact.valueMin ?? null,
        value_max: fact.valueMax ?? null,
        value_text: fact.valueText ?? null,
        value_unit: fact.valueUnit ?? null,
        trust: fact.trust,
      });
    }
  }
  return rows;
}

/** Stable upsert key. Value is included so multi-value attributes (pests) dedupe per item. */
export function factNaturalKey(row: FactRow): string {
  return [
    row.species_slug,
    row.source_key,
    row.attribute,
    row.value_text ?? `${row.value_min}-${row.value_max}`,
  ].join('|');
}
