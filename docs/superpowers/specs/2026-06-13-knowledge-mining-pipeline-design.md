# Open-knowledge mining pipeline (Phase 4A, slice B) — Design

Date: 2026-06-13. Builds on the Phase 4A knowledge layer
(`src/lib/knowledge/sources.ts`, `care-profiles.ts`, `gbif.ts`,
`src/features/knowledge/CareProfilePanel.tsx`, `docs/knowledge-layer.md`) and
the admin-script harness (`scripts/appwrite/`, `scripts/export/`,
`scripts/knowledge/`).

## Problem

The knowledge layer is a hand-written, bundled 10-species starter pack. Care
ranges are all editorial (unsourced), the houseplant-care gap is unfilled, and
there is no path to grow coverage without hand-authoring every profile. A
2026-06-13 source survey (`docs/knowledge-layer.md`) plus a live feasibility
probe identified open databases that are *readily mineable* — several as direct
downloads, no scraping — that can grow coverage to a few hundred species and
replace editorial guesses with cited facts, including indoor care.

This spec covers **slice B**: mine the permissive-license core **and** the
share-alike (quarantined) cultivation sources into relational Appwrite tables,
with per-fact provenance, and surface them on the plant detail page.

## Feasibility findings (probe, 2026-06-13)

| Source | Access | License | Mine for |
| --- | --- | --- | --- |
| Trefle dump (`github.com/treflehq/dump`) | One TSV, no key | ODbL (share-alike) | Names, cross-link IDs (USDA/GBIF/Wikipedia/PlantNet URLs), coarse traits (light, soil, pH, humidity, growth form, bloom months, heights, edible parts), distribution, common names |
| OpenPlantbook (`open.plantbook.io`) | Free API key | "Free, any purpose, no limits" (verify exact text) | Indoor care: min/max temperature, humidity, light (lux + mmol), soil moisture, soil EC. **Crowd-sourced, unverified.** |
| Permapeople (`permapeople.org/.../api-docs`) | Self-service key, per-request | CC BY-SA 4.0 | Water/light requirement, USDA hardiness, soil type, layer, edible. **Commercial API access not free.** |
| PFAF / Practical Plants | Already-scraped public CSVs (`saulshanabrook/pfaf-data`, `TahriT/PLANTalytics`) | CC BY-SA | Hardiness, soils, pH, edibility, medicinal rating, height/width, foliage |
| Wikidata | SPARQL, no key | CC0 | Cross-link IDs, multilingual common names, toxicity claims |
| GBIF | Match API, no key (already wired) | CC BY | Accepted names, synonyms, family, usageKey |
| USDA PLANTS | Bulk download | Public domain | Coarse outdoor traits, min temp (optional in this slice) |

Dropped: OpenFarm (servers down Apr 2025, no published dump — superseded by
Trefle + PFAF). Deferred: climate envelope (GBIF occurrences → Köppen) and pest
associations (GloBI) — low value-per-effort, own later slices.

## Decisions

1. **Storage: relational Appwrite tables**, not a bundled file. The offline/
   bundled constraint is dropped for the species care guide; an online fetch
   with a graceful empty/loading state is acceptable. The editorial 10 migrate
   into the tables so there is a single read path. (A thin bundled fallback of
   the editorial 10 may be retained as a last-resort offline cache; optional,
   YAGNI until measured.)

2. **Full relations, no duplication.** Source metadata (name, license,
   attribution) lives once in `source_datasets`; facts and references hold a
   *relationship* to it, never a copied attribution string. On a plain Appwrite
   read a relationship column returns the related row `$id`; the read-layer maps
   that against the ~9 `source_datasets` rows it caches once per session, so no
   deep nested select and no denormalization.

3. **Care facts are a normalized EAV table** (`care_facts`), one row per fact,
   each carrying its own `source_id` relation — preserving the per-field
   provenance the current `Sourced<T>` model already expresses. Adding a source
   or a care dimension is row inserts, never a schema migration. Multiple
   sources for one attribute coexist as separate rows (agreement/conflict is
   first-class).

4. **Quarantine is a flag, not a separate file.** `source_datasets.quarantined`
   (+ `commercial_ok=false`) marks share-alike sources (Trefle ODbL, Permapeople
   & PFAF CC BY-SA). Every quarantined fact relates to its source row carrying
   the required attribution; export/commercial paths filter on the flag. Where
   the same datum is independently available from a permissive source (e.g. a
   GBIF/Wikidata ID), cite the permissive source to avoid inheriting ODbL/BY-SA
   obligations.

5. **Trust precedence at read time:** `sourced > editorial > community_unverified`.
   OpenPlantbook facts are always `community_unverified` and labelled as such in
   the UI. The shaper picks the display value by precedence and exposes
   agreeing/conflicting sources on disclosure; multi-value attributes (pests,
   stress signs) union and dedupe across sources.

6. **Mining is admin scripts**, in the `scripts/knowledge/` + `scripts/appwrite/`
   family (tsx, the existing admin client/env). Per-source pure extractors,
   a deterministic normalizer, and an idempotent loader. Re-runnable; provenance
   rule enforced (no `care_facts` row without a `source_id`).

7. **YAGNI deferrals:** climate envelope, pest associations (GloBI), USDA
   (optional), and `care_tip_feedback` are out of this slice. The existing
   `insight_feedback` already covers the deterministic-insights layer; care-tip
   feedback is its own later slice.

## Tables (additions to `appwrite/schema.ts`)

All public-read, admin/service-write, `rowSecurity: false`, no `user_id`
(reference data, not user data).

### `source_datasets`
- `source_key` varchar(64) required — stable slug; unique index.
- `name` varchar(128) required.
- `url` varchar(255).
- `license` enum: `editorial`, `CC0`, `CC-BY`, `CC-BY-SA`, `ODbL`, `public-domain`.
- `commercial_ok` boolean (default true).
- `quarantined` boolean (default false).
- `attribution` text.

### `species` (extend existing)
- add `slug` varchar(128) — stable key; unique index. Existing columns unchanged.

### `taxon_references`
- `species_id` relationship → `species`, manyToOne, twoWay `taxon_references`, cascade.
- `source_id` relationship → `source_datasets`, manyToOne, oneWay, restrict.
- `external_id` varchar(128) required.
- `external_url` varchar(512).
- Uniqueness of (species, source) enforced at the app/loader layer (relationship
  columns are not indexable in Appwrite).

### `care_facts`
- `species_id` relationship → `species`, manyToOne, twoWay `care_facts`, cascade.
- `source_id` relationship → `source_datasets`, manyToOne, oneWay, restrict.
- `attribute` varchar(48) required — open set; known keys registered in code
  (`light`, `water_cadence_days`, `temperature_c`, `humidity_percent`,
  `light_lux`, `soil_moisture_percent`, `soil_ec`, `toxicity`, `stress_sign`,
  `pest`, `soil`, `ph`, `hardiness_zone`, `mature_height_cm`, `growth_rate`,
  `edibility`, …).
- `value_min` float, `value_max` float, `value_text` text, `value_unit` varchar(24).
- `trust` enum: `sourced`, `editorial`, `community_unverified` (default `sourced`).

`docs/schema.md` is updated when these tables land (per AGENTS.md working rules).

## Mining pipeline (`scripts/knowledge/`)

- **Seed** — extend `common-plants.seed.ts` toward ~300–500 cultivated houseplants
  (the "what to include"). Names resolve to accepted scientific names via the
  existing GBIF match step.
- **Extractors** — one module per source, each a pure `raw → CandidateFact[]`
  transform plus a thin non-throwing fetch/parse wrapper (mirrors `gbif.ts`):
  - `trefle.ts` — parse the TSV dump rows for seed species → names, cross-link
    IDs, coarse traits, distribution.
  - `wikidata.ts` — SPARQL → QIDs, cross-link IDs, common names, toxicity claims.
  - `openplantbook.ts` — API (free key) → indoor temp/humidity/light/moisture/EC.
  - `permapeople.ts` — API (key) → cultivation fields (quarantined).
  - `pfaf.ts` — parse the already-scraped public CSV (quarantined).
- **Normalizer** (`normalize.ts`) — deterministic vocabulary maps from each
  source's terms to our `attribute` keys + value slots + unit. Pure, fixture-tested.
- **Loader** (`load.ts` / `npm run knowledge:mine`) — upsert `source_datasets`,
  `species`, `taxon_references`, `care_facts` via the admin client; idempotent by
  natural key (species `slug`+source for refs; species+source+attribute for facts).
  Provenance enforced; quarantine flag stamped from the source registry.
- **Raw cache** — downloaded dumps under gitignored `scripts/knowledge/.cache/`
  with a documented fetch step. Committed artifacts: seed, normalizer maps, test
  fixtures. Multi-MB dumps are not committed.

## Read layer & UI

- `src/lib/knowledge/care-profiles.ts` evolves from a constant into a **shaper**:
  `(careFacts, sources) → SpeciesCareProfile` with per-field provenance + the
  precedence policy. The `SpeciesCareProfile` shape the UI consumes is preserved.
- `src/lib/knowledge/sources.ts` keeps the typed registry as the loader seed and
  the client-side source cache.
- `repo.ts` reads facts through the species relation
  (`getRow('species', id, Query.select(['*','care_facts.*','taxon_references.*']))`),
  cached per session.
- `CareProfilePanel.tsx` renders facts grouped by attribute with provenance chips
  (source name + license), a distinct **"community-sourced · unverified"** label
  for OpenPlantbook, and an "other sources" disclosure on conflict. The three
  care layers (sourced reference / deterministic insights / Gemini preview) stay
  visibly separate per `docs/knowledge-layer.md`.

## Privacy & licensing

- Knowledge tables are public reference data: no `user_id`, public-read,
  admin-write — must never carry or leak private user fields, and are not part of
  the `public_observations` export path.
- Attribution shown wherever sourced facts render. Quarantined (BY-SA/ODbL) facts
  excluded from commercial/export paths via the `quarantined`/`commercial_ok`
  flags. Verify OpenPlantbook's exact terms text before the live pull.

## Testing

- **Pure/unit (Vitest, node):** each extractor (captured-fixture → candidate
  facts), the normalizer vocabulary maps, the precedence/conflict shaper, the
  quarantine filter, loader natural-key idempotency (fake client).
- **Schema validation:** the existing schema tests cover the four new
  tables/relations/permissions and the `species.slug` addition.
- **Component (SSR `renderToStaticMarkup`):** provenance chips, the
  community-unverified label, the conflict disclosure.
- **Privacy:** assert knowledge tables declare no `user_id` and never appear in
  `PUBLIC_EXPORT_FIELDS`.
- **Live (preview):** a seeded species shows mined facts with provenance;
  OpenPlantbook facts render the unverified label; conflicting sources disclose.

## Credential / access gates

Buildable unattended: all schema, extractors, normalizer, loader, shaper, UI,
tests; plus the keyless data pulls (Trefle, Wikidata, GBIF, PFAF CSV, USDA).
Owner-gated for the live data load:

1. **Appwrite admin key** in `.env` to create tables / run `appwrite:setup` +
   `knowledge:mine`. Verify presence on this machine; else owner-gated.
2. **OpenPlantbook API key** (free signup) — indoor-care pull.
3. **Permapeople API key** (free self-service signup) — quarantined cultivation pull.

Until those land, the pipeline is built and tested against captured fixtures;
the live pull is a documented script step.

## Build order (slices within slice B)

1. `source_datasets` + `species.slug` + registry seed; migrate editorial 10 into
   `care_facts`; shaper + `CareProfilePanel` read from tables (proves the spine
   end-to-end with zero new external data).
2. `taxon_references` + the cross-link ID map (Wikidata + GBIF permissive;
   Trefle quarantined where needed).
3. Permissive trait/care extractors: Trefle coarse traits, Wikidata toxicity,
   OpenPlantbook indoor care + the unverified label.
4. Quarantine sources: Permapeople + PFAF, `quarantined` flag, conflict
   disclosure, attribution UI.
5. Seed expansion to ~300–500 species + the live mine run (credential-gated).
