/**
 * Source registry and license policy for the open plant knowledge layer
 * (roadmap Phase 4A). Every reference fact in a care profile points at one of
 * these source rows by `id`, so the UI can show provenance and so a future
 * commercial build can filter to `commercialOk` sources with one predicate.
 *
 * `editorial` means PlantDoc's own human-reviewed baseline — general
 * horticultural knowledge written by us, owned by us. It is deliberately NOT
 * presented as scientifically sourced; it is a starter hypothesis the user's
 * own logs and feedback refine over time.
 */

export type SourceLicense = 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'editorial';

export interface KnowledgeSource {
  id: string;
  name: string;
  url: string;
  license: SourceLicense;
  /** True when the license permits commercial use (with attribution where required). */
  commercialOk: boolean;
  /** Human-readable attribution string to display alongside sourced facts. */
  attribution: string;
}

export const KNOWLEDGE_SOURCES: readonly KnowledgeSource[] = [
  {
    id: 'plantdoc-editorial',
    name: 'PlantDoc curated baseline',
    url: 'https://plantdoc.galvando.com',
    license: 'editorial',
    commercialOk: true,
    attribution: 'PlantDoc curated baseline (human-reviewed starter care, not a scientific source)',
  },
  {
    id: 'powo',
    name: 'Plants of the World Online (Kew)',
    url: 'https://powo.science.kew.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'Plants of the World Online, Royal Botanic Gardens, Kew (CC BY)',
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    license: 'CC0',
    commercialOk: true,
    attribution: 'Wikidata (CC0)',
  },
  {
    id: 'gbif',
    name: 'GBIF Backbone Taxonomy',
    url: 'https://www.gbif.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'GBIF Secretariat: GBIF Backbone Taxonomy (CC BY)',
  },
] as const;

const SOURCE_BY_ID = new Map(KNOWLEDGE_SOURCES.map((source) => [source.id, source]));

export type KnowledgeSourceId = (typeof KNOWLEDGE_SOURCES)[number]['id'];

export function getSource(id: string): KnowledgeSource | null {
  return SOURCE_BY_ID.get(id) ?? null;
}

/** Sources usable in a commercial build (free of non-commercial restrictions). */
export function commercialSources(): KnowledgeSource[] {
  return KNOWLEDGE_SOURCES.filter((source) => source.commercialOk);
}
