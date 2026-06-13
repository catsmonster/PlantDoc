# Common-name-driven species onboarding + GBIF vernacular fallback — Design

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
species. We keep the typeahead instant and offline, and reach for GBIF only
when the local search comes up empty.

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

## Testing

- **Pure / unit (Vitest, node env):** `buildGbifVernacularSearchUrl`;
  `parseGbifVernacularResults` against a real captured "basil" GBIF response
  (accepted-plant filter, dedupe, English-vernacular pick, null id/slug);
  `mergeSuggestions` (order, dedupe, cap).
- **Component (SSR `renderToStaticMarkup`):** common-name-leads row layout; the
  derived species chip renders its resolved state.
- **Live (preview):** typing "basil" in Common name surfaces *Ocimum
  basilicum* via GBIF; picking it fills the Species chip; no console errors;
  offline still degrades to the local-only dropdown.
