# Open Plant Knowledge Layer

Inbound reference data that makes PlantDoc useful before its own community
dataset is large enough for species-specific recommendations. Roadmap:
`docs/roadmap.md` (Phase 4A). This is the opposite direction from the outbound
export pipeline in `docs/open-data.md`.

The layer is **bundled data, not an Appwrite table** (yet), so it is
deterministic, offline-safe, and ships in the client bundle. When any of it
graduates to a real table, update `docs/schema.md`.

## Source acceptance policy

Every reference fact is bound to a source row in
`src/lib/knowledge/sources.ts` by `id`. The registry is the single source of
truth for licensing; `commercialSources()` filters to what a future commercial
build may use.

| Source | License | Commercial use | Used for |
| --- | --- | --- | --- |
| PlantDoc curated baseline | editorial (owned) | ✅ Yes | Care ranges (light, water cadence, temp, humidity, stress signs, pests, toxicity) |
| [Plants of the World Online (Kew)](https://powo.science.kew.org) | CC BY | ✅ Yes (attribute) | Accepted scientific names, family |
| [Wikidata](https://www.wikidata.org) | CC0 | ✅ Yes | Common names, cross-links |
| [GBIF Backbone Taxonomy](https://www.gbif.org) | CC BY | ✅ Yes (attribute) | Name resolution / synonyms |

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
| `src/lib/knowledge/sources.ts` | Source registry + license policy; `getSource`, `commercialSources`. |
| `src/lib/knowledge/care-profiles.ts` | 10-species starter pack; every field carries a `sourceId`. Lookup (`findCareProfile`, `careProfileForPlant`) and ranked search (`searchCareProfiles`). |
| `src/lib/knowledge/gbif.ts` | GBIF backbone name resolution (taxonomy only, never care inference). Pure URL builder + parser, plus a non-throwing fetch wrapper. |
| `src/features/knowledge/CareProfilePanel.tsx` | Plant-detail panel rendering sourced reference facts with per-fact provenance, distinct from the deterministic insights and the Gemini AI preview. |

Tests: `tests/lib/knowledge.test.ts`.

## The three care layers stay distinct

The plant detail page deliberately separates, in this order:

1. **Species care guide** — sourced reference facts (this layer), labeled
   `SOURCED` with visible provenance.
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
