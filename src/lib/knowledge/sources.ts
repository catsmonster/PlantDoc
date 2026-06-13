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

export type SourceLicense =
  | 'CC0'
  | 'CC-BY'
  | 'CC-BY-SA'
  | 'ODbL'
  | 'public-domain'
  | 'editorial';

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
  // Cross-link target catalogs (slice 2): the external registries a species'
  // stable IDs index into. All permissive, so cross-links inherit no share-alike
  // obligation. The IDs themselves are mined from Wikidata (CC0) + GBIF (CC BY).
  {
    id: 'usda',
    name: 'USDA PLANTS Database',
    url: 'https://plants.usda.gov',
    license: 'public-domain',
    commercialOk: true,
    attribution: 'USDA, NRCS PLANTS Database (public domain)',
  },
  {
    id: 'ipni',
    name: 'International Plant Names Index',
    url: 'https://www.ipni.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'International Plant Names Index (CC BY)',
  },
  {
    id: 'eol',
    name: 'Encyclopedia of Life',
    url: 'https://eol.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'Encyclopedia of Life (CC BY)',
  },
  // Crowd-sourced indoor care (slice 3). Terms (verified 2026-06-13): "Anyone can
  // use information from the database for any purpose without limitations" — modeled
  // as public-domain; data quality is conveyed per-fact by the community_unverified
  // trust, never presented as authoritative.
  {
    id: 'openplantbook',
    name: 'OpenPlantbook',
    url: 'https://open.plantbook.io',
    license: 'public-domain',
    commercialOk: true,
    attribution:
      'OpenPlantbook — community-contributed plant database, free for any purpose without limitations (open.plantbook.io); values are crowd-sourced and unverified',
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
