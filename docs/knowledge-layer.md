# Open Plant Knowledge Layer

Inbound reference data that makes PlantDoc useful before its own community
dataset is large enough for species-specific recommendations. Roadmap:
`docs/roadmap.md` (Phase 4A). This is the opposite direction from the outbound
export pipeline in `docs/open-data.md`.

The layer now lives in **relational Appwrite tables** (`species`,
`source_datasets`, `taxon_references`, `care_facts` — see `docs/schema.md`),
read through the species relation. The bundled `CARE_PROFILES` pack is retained
as the editorial seed, the onboarding name index, and the offline fallback, so
the layer stays deterministic and offline-safe. When new tables or columns land,
update `docs/schema.md`.

## Source acceptance policy

Every reference fact is bound to a source row in
`src/lib/knowledge/sources.ts` by `id`. The registry is the single source of
truth for licensing; `commercialSources()` filters to what a future commercial
build may use.

| Source | License | Commercial use | Used for |
| --- | --- | --- | --- |
| PlantDoc curated baseline | editorial (owned) | ✅ Yes | Care ranges (light, water cadence, temp, humidity, stress signs, pests, toxicity) |
| [Plants of the World Online (Kew)](https://powo.science.kew.org) | CC BY | ✅ Yes (attribute) | Accepted scientific names, family |
| [Wikidata](https://www.wikidata.org) | CC0 | ✅ Yes | Common names, cross-link IDs |
| [GBIF Backbone Taxonomy](https://www.gbif.org) | CC BY | ✅ Yes (attribute) | Name resolution / synonyms, cross-link ID |
| [USDA PLANTS](https://plants.usda.gov), [IPNI](https://www.ipni.org), [EOL](https://eol.org) | public domain / CC BY | ✅ Yes (attribute) | Cross-link ID targets (slice 2) — catalogs a species' IDs index into |
| [OpenPlantbook](https://open.plantbook.io) | "free for any purpose" (modeled public-domain) | ✅ Yes | Indoor ranges (temp, humidity, light lux, soil moisture/EC) — **crowd-sourced, `community_unverified`** |
| [Permapeople](https://permapeople.org) | CC BY-SA 4.0 | ⚠️ ShareAlike (**quarantined**) | Cited cultivation traits (light/water requirement, soil, growth, hardiness zone, edible parts) |

`editorial` means PlantDoc's own human-reviewed baseline — general
horticultural knowledge, owned by us, deliberately **not** presented as a
scientific source. It is a starter hypothesis the user's own logs and feedback
refine over time.

**Not used** (free tier is non-commercial — would have to be quarantined or
licensed before a commercial build): Perenual free tier, Pl@ntNet API, and any
CC BY-NC, no-license, or scraped web content.

## Pieces

| Piece | Role |
| --- | --- |
| `src/lib/knowledge/sources.ts` | Source registry + license policy; `getSource`, `commercialSources`. Seeds the `source_datasets` table and is the client-side source cache. |
| `src/lib/knowledge/care-profiles.ts` | 10-species editorial starter pack + the synchronous name index (`findCareProfile`, `careProfileForPlant`, `searchCareProfiles`) that keeps onboarding search instant/offline. The loader's editorial dataset; also the bundled fallback when a species has no table facts. |
| `src/lib/knowledge/facts.ts` | The relational care-fact model (slice B). `composeCareProfile` shapes `care_facts` rows into `SpeciesCareProfile` with read-time precedence; `editorialProfileToFacts` adapts the bundled pack; `careFactsFromSpeciesRow` maps a hydrated Appwrite species row. |
| `src/lib/knowledge/load-rows.ts` + `scripts/knowledge/load-knowledge.ts` | Pure row builders + the `knowledge:mine` admin script that upserts `source_datasets`, `species`, and `care_facts` for the editorial dataset (idempotent). |
| `scripts/knowledge/catalog.ts` + `species-list.ts` + `scripts/knowledge/seed-species.ts` | Catalog builder (editorial pack + common-plants seed, deduped by slug) + cursor-paginated `listAllSpecies` table lister + the `knowledge:seed-species` admin script that upserts the catalog and source registry (slice 5). The extractor loaders read the table via `listAllSpecies`, so this is the one place that decides which species the mine covers. |
| `src/lib/knowledge/gbif.ts` | GBIF backbone name resolution (taxonomy only, never care inference). Pure URL builder + parser, plus a non-throwing fetch wrapper. |
| `src/lib/knowledge/wikidata.ts` | Wikidata cross-link extractor (slice 2). SPARQL URL builder + parser + non-throwing fetch wrapper; maps a taxon name to its QID and its IDs in GBIF/USDA/POWO/IPNI/EOL. CC0, so cross-links inherit no share-alike obligation. Admin-script use only (sets a User-Agent). |
| `src/lib/knowledge/taxon-refs.ts` + `scripts/knowledge/load-cross-links.ts` | Pure `taxon_references` row builder (deduped by species+source, GBIF match preferred over Wikidata P846) + the `knowledge:cross-links` admin script that resolves each species' cross-links live from Wikidata + GBIF and upserts them (idempotent). |
| `src/lib/knowledge/openplantbook.ts` + `scripts/knowledge/load-openplantbook.ts` | OpenPlantbook indoor-care extractor (OAuth token → fuzzy search → **exact-match** pick → detail → pure parser) + the `knowledge:mine-openplantbook` admin script. Facts are `community_unverified`, source `openplantbook`; the loader is source-scoped so it composes with `knowledge:mine`. `composeCareProfile` surfaces these as `communityRanges`. |
| `src/lib/knowledge/permapeople.ts` + `scripts/knowledge/load-permapeople.ts` | Permapeople cultivation extractor (keyed search → **exact** scientific-name match → detail → pure parser of the key-value `data` array) + the `knowledge:mine-permapeople` admin script. Source `permapeople` is **CC-BY-SA → quarantined**; facts map to distinct cultivation attributes (never the editorial fields) and `composeCareProfile` surfaces them as `cultivationFacts`. Source-scoped loader. |
| `src/features/knowledge/CareProfilePanel.tsx` | Plant-detail panel rendering sourced reference facts with per-fact provenance, then a separate **"Community indoor ranges · Unverified"** block (OpenPlantbook) and an attributed **"Cultivation"** block (Permapeople, CC BY-SA shown) — distinct from the deterministic insights and the Gemini AI preview. |

**Storage (slice B):** care profiles now live in Appwrite relational tables —
`care_facts` related to `species` and `source_datasets` (see `docs/schema.md`) —
read through the species relation by `getCareProfile` in `src/lib/repo.ts` and
composed by `facts.ts`. The bundled `CARE_PROFILES` is retained as the editorial
seed and as the offline fallback / onboarding name index. The three-care-layers
separation below is unchanged.

**Which species exist (slice 5):** the `species` table is the single authority
for the mine's scope. `scripts/knowledge/catalog.ts` builds the catalog (10-species
editorial pack + the deduped common-plants seed), and `knowledge:seed-species`
upserts it (by slug) alongside the source registry. Every extractor loader then
reads the table via `listAllSpecies` rather than the bundled pack, so **growing
coverage is just growing the seed and re-running the loaders** — the pipeline
scales to whatever the table holds. Latest live mine (2026-06-13, 256-species
catalog): **~259 species, 1,378 taxon_references, ~697 care_facts** (Permapeople
503, editorial 94, OpenPlantbook 90, POWO 10). OpenPlantbook is rate-limit-capped
at 90 (its free tier exhausts after a few hundred requests in a batch) — the
hardened loader keeps the existing facts and the count tops up on a later re-run;
this never blocks reads because every loader is idempotent and the bundled
editorial pack is the fallback.

Tests: `tests/lib/knowledge.test.ts`, `tests/lib/knowledge-facts.test.ts`,
`tests/lib/knowledge-load-rows.test.ts`, `tests/lib/knowledge-wikidata.test.ts`,
`tests/lib/knowledge-taxon-refs.test.ts`, `tests/lib/knowledge-openplantbook.test.ts`,
`tests/lib/knowledge-permapeople.test.ts`, `tests/lib/knowledge-catalog.test.ts`,
`tests/ui/CareProfilePanel.test.ts`.

## The three care layers stay distinct

The plant detail page deliberately separates, in this order:

1. **Species care guide** — sourced reference facts (this layer), labeled
   `SOURCED` with visible provenance. Crowd-sourced indoor ranges (OpenPlantbook)
   render within this layer but in a separate block labeled
   **`UNVERIFIED`** — never mixed into the sourced/editorial values, which keep
   display precedence (`sourced > editorial > community_unverified`).
2. **Care insights** — deterministic, computed from the user's own logs
   (`src/lib/insights.ts`), labeled `EXPERIMENTAL`. The starter pack's watering
   cadence enriches the "building a baseline" message but never overrides the
   user's measured rhythm.
3. **Gemini AI preview** — opt-in, quota-limited model output. This never
   replaces layers 1 or 2; all three coexist.

## Provenance rule

A profile field we cannot source is omitted, never guessed or generated. Adding
a fact means adding (or reusing) a source row and pointing the field's
`sourceId` at it.

## Candidate inbound sources (survey 2026-06-13)

Open databases evaluated for growing the knowledge layer beyond the 10-species
starter pack, so future work doesn't start from zero. Sorted by how cleanly the
license fits this project (which tracks commercial use via `commercialSources()`).

| Candidate | License | Commercial | Mine for | Status |
| --- | --- | --- | --- | --- |
| [Wikidata](https://www.wikidata.org) | CC0 | ✅ | Multilingual common names, toxicity claims, cross-links | Live; already an accepted source |
| [USDA PLANTS](https://plants.usda.gov/downloads) | Public domain | ✅ | Coarse outdoor traits (shade/moisture/drought tolerance, min temp); US species | Live, bulk download |
| [EOL TraitBank](https://eol.org/traitbank) | CC BY / CC0 sources | ✅ (attribute) | Coarse biological traits, toxicity, growth habit — well-provenanced | Live, bulk download + search |
| [OpenFarm](https://github.com/openfarmcc/OpenFarm) | CC BY 4.0 | ✅ (attribute) | Growing guides (sun, sowing, spacing, watering notes); garden-crop heavy | **Servers shut down ~Apr 2025** — recover data from GitHub/archives |
| [Permapeople](https://permapeople.org/knowledgebase/api-docs/) | CC BY-SA 4.0 | ⚠️ ShareAlike | Cultivation data, tens of thousands of plants; API (request access) | Live, most actively maintained |
| PFAF / [Practical Plants](https://practicalplants.org) | CC BY-SA | ⚠️ ShareAlike | ~7,000 edible/medicinal/useful plants, cultivation detail | Practical Plants live (Semantic MediaWiki, exportable); upstream of the two above |

ShareAlike (BY-SA) sources are commercial-usable but require any **derived
dataset** to be published under BY-SA with attribution. Mined BY-SA data must
therefore live in a clearly-attributed file with its own `sourceId`, kept
separate from the editorial profiles — stricter than the CC0/PD/BY sources
above, but still inside policy (unlike the quarantined CC BY-NC tiers).

**The houseplant-care gap remains.** Every candidate skews edible / permaculture
/ garden-crop and temperate-outdoor. They shrink the "from zero" problem for a
larger names index, coarse sourced traits, toxicity flags, and herb/veg growing
guides — but precise **indoor** care (watering cadence, light, humidity for an
ornamental houseplant) still has no open, citable source and stays editorial.

**Cleared for current work:** the common-plants names index
(`docs/superpowers/specs/2026-06-13-common-name-species-autocomplete-design.md`)
pulls from GBIF, already accepted. Wikidata (CC0, already accepted) is available
for common-name enrichment if we choose to add it — neither carries a ShareAlike
obligation.
