# Common-name-driven species onboarding + offline common-plants index + GBIF vernacular fallback — Design

Date: 2026-06-13. Builds on the Phase 4A knowledge layer
(`src/lib/knowledge/species-suggest.ts`, `src/lib/knowledge/gbif.ts`,
`src/features/knowledge/SpeciesAutocomplete.tsx`,
`src/features/plants/PlantForm.tsx`).

## Problem

The onboarding typeahead can't find common plants people actually know by name
— e.g. "basil" returns nothing. Two causes, both confirmed:

1. **The typeahead is local-only.** `suggestSpecies` ranks over just the 10
   curated `CARE_PROFILES` plus the user's Appwrite species catalog, and makes
   no external call. "basil" is in neither corpus, so the dropdown is empty.
2. **The one wired GBIF endpoint ignores common names.** The "Verify name with
   GBIF" button calls `/species/match`, which resolves *scientific* names;
   `GET /species/match?name=basil` returns `{"matchType":"NONE"}`. The endpoint
   that *does* know basil — `/species/search?qField=VERNACULAR` →
   `Ocimum basilicum` (backbone usageKey 2927096) — is never called.

A full local mirror is off the table: the GBIF backbone dump is ~971 MB, and a
filtered English-plant vernacular index is still a few MB of mostly-irrelevant
species (~447k plants, almost none of them cultivated). Instead we bundle a
*curated* offline index of the few hundred plants people actually grow —
generated from GBIF, not hand-written or mirrored wholesale (see "Offline
common-plants index" below) — keep the typeahead instant and offline for those,
and reach for GBIF live only when even the enriched local search comes up empty:
the rare, weird species.

## Decisions

1. **GBIF vernacular fallback, pure-split** (`gbif.ts`, mirroring the existing
   `buildGbifMatchUrl` / `parseGbifMatch` shape):
   - `buildGbifVernacularSearchUrl(query)` →
     `/species/search?q=<query>&qField=VERNACULAR&rank=SPECIES&status=ACCEPTED&highertaxonKey=6&limit=8`
     (`highertaxonKey=6` = kingdom Plantae).
   - `parseGbifVernacularResults(json)` → `SpeciesSuggestion[]`: keep accepted
     plant species, dedupe by `canonicalName`, choose the English vernacular
     closest to the query as the displayed `commonName`, and set
     `speciesId: null`, `slug: null` — GBIF is taxonomy only, never care, so a
     fallback row carries no care guide until a human curates one.
   - `searchGbifVernacular(query, fetcher = fetch)` — thin async wrapper that
     returns `[]` on any network/parse failure and never throws (onboarding
     stays usable offline).

2. **`mergeSuggestions(local, remote, limit)`** — pure: local hits first, then
   remote, deduped by scientific name (case-insensitive), capped at `limit`.
   Lets the merge order be unit-tested without the network.

3. **`useSpeciesSuggestions(query, catalog)` hook** → `{ suggestions, loading }`.
   Computes `suggestSpecies` synchronously (instant, offline — unchanged).
   **Only when the local result is empty** and `query.trim().length >= 3`, it
   debounces ~300ms and calls `searchGbifVernacular`, cancelling stale calls
   with `AbortController`, then merges GBIF rows after the local ones. All
   async/debounce/abort logic lives here, isolated from the presentational
   component.

4. **Novice-friendly rows in `SpeciesAutocomplete`**: the common name leads
   (bold); the scientific name is the small secondary line; when an entry has
   no common name, the scientific name leads. Tags: existing **"Care guide"**
   for curated rows, a muted **"via GBIF"** for fallback rows. A quiet
   "Searching…" row shows while the fallback is in flight, and a small
   "Matches via GBIF · CC BY" line shows when GBIF rows are present (license
   compliance; the attribution string already lives in `sources.ts`).

5. **`PlantForm` — common name fills species, species as a derived result
   (mockup Option A).**
   - The **Common name** field becomes the hero entry, backed by
     `SpeciesAutocomplete` (`value = commonName`, `onTextChange = setCommonName`).
     Free text is still allowed; placeholder invites common names
     ("e.g. basil, snake plant, monstera").
   - **On select** (shared `applySuggestion` helper): fill the species —
     `setSpeciesId` when catalog-backed, else `setSpeciesText(scientificName)` —
     and set the common name to the row's `commonName`, or leave the user's
     typed text untouched when the row has none (a scientific-only entry). A
     common name that maps to several species simply shows several rows; the
     user picks.
   - The **Species** field is demoted from a task to a result: once filled it
     renders as a resolved chip (leaf icon + scientific name + "Filled from the
     name above" + **Change**), reusing the existing locked-relation chip
     pattern. **Change** reveals the current botanical path —
     `SpeciesAutocomplete` + `SpeciesNameResolver` (GBIF verify) — unchanged.
     When empty, a soft hint invites either picking a name above or setting the
     species directly.
   - Both fields are kept; the species selection still back-fills an empty
     common name, so the two directions stay coherent. No feedback loop:
     suggestions derive from the input value and selection is a discrete action.

6. **No schema or storage change** (YAGNI). `common_name`, `species_text`, and
   `species_id` keep their current meaning and persistence; no new fields, no
   caching/persistence layer for GBIF results.

7. **Privacy & licensing**: the only new network call is the on-miss vernacular
   search — same third-party trust posture as the existing `/species/match`
   call, and GBIF stays taxonomy-only (never care). CC BY attribution is shown
   in the dropdown and the existing resolver. No query is logged or persisted.

8. **Error handling**: `searchGbifVernacular` swallows all failures to `[]`;
   offline or GBIF-down degrades to exactly today's local-only behavior. The
   debounce + `AbortController` prevent stale or overlapping responses from
   landing out of order.

## Offline common-plants index

Generated from GBIF, not hand-written or mirrored wholesale.

- **Seed list** (`scripts/knowledge/common-plants.seed.ts` or a `.txt`): a
  hand-maintained list of cultivated-plant names — the "what to include" —
  starting at a few hundred across houseplants, herbs, vegetables, and common
  flowering/greenhouse plants. Entries may be common or scientific names; GBIF
  resolves either. This is the only hand-edited artifact and grows over time.
- **Generator** (`scripts/knowledge/build-common-plants.ts`, run manually via
  the project's existing tsx setup, like the export scripts): for each seed
  name, `GET /species/match` → accepted scientific name + usageKey (skip
  non-Plantae and `matchType: NONE`), then fetch English vernaculars for that
  usageKey, dedupe, and emit `{ scientificName, commonNames }`. Polite
  sequential calls; output is committed so the app ships a fixed snapshot with
  no build-time network.
- **Output** (`src/lib/knowledge/common-plants.ts`, generated): a typed
  `COMMON_PLANTS` array with a header comment citing GBIF (CC BY) plus the
  generation date and script. Estimated tens of KB for a few hundred species.
- **Wiring**: `mergeCorpus` (in `species-suggest.ts`) gains `COMMON_PLANTS` as a
  third source via the existing `upsert` — `speciesId: null`, `slug: null`. An
  entry that coincides with a `CARE_PROFILE` merges (the care slug stays, common
  names union), so a curated plant keeps its "Care guide" tag. Bundled-only rows
  show as clean suggestions with no per-row GBIF tag (they're offline now); GBIF
  is credited in the generated file header and the existing `sources.ts`
  attribution.
- **Effect on the live fallback**: with the index in place, GBIF is queried only
  for names absent from the care profiles **and** the common-plants index
  **and** the user's catalog — genuinely uncommon species. Common plants like
  basil resolve offline, instantly.
- **Provenance & YAGNI**: name data only (common ↔ scientific) — never care
  fields, which stay human-reviewed and sourced in `CARE_PROFILES`. No new
  Appwrite table; the index is a bundled asset, not user data. The seed list and
  generator are a separable slice (their own commit) from the form-UX and
  live-fallback work — they compose, and the live fallback already covers
  anything not yet in the bundle.

## Testing

- **Pure / unit (Vitest, node env):** `buildGbifVernacularSearchUrl`;
  `parseGbifVernacularResults` against a real captured "basil" GBIF response
  (accepted-plant filter, dedupe, English-vernacular pick, null id/slug);
  `mergeSuggestions` (order, dedupe, cap); the generator's pure transforms
  (`/species/match` + vernacular fixtures → `{ scientificName, commonNames }`,
  Plantae filter, vernacular dedupe); `suggestSpecies` resolving a representative
  bundled plant (e.g. "basil") to its scientific name from `COMMON_PLANTS` with
  no network.
- **Component (SSR `renderToStaticMarkup`):** common-name-leads row layout; the
  derived species chip renders its resolved state.
- **Live (preview):** typing "basil" resolves offline from the common-plants
  index and fills the Species chip; a genuinely uncommon name (not in the seed
  list) surfaces its match via the GBIF live fallback; picking either fills the
  chip; no console errors; offline still degrades to the bundled local dropdown.
