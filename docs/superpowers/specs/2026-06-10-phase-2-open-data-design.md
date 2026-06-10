# Phase 2 Open Data Pipeline Design

## Approval Context

Produced under the same autonomous `/goal` run as Phases 0-1 ("Create this app according to the roadmap; you are allowed to make decisions that improve on the product"). Decisions follow [privacy.md](../../privacy.md) and [roadmap.md](../../roadmap.md) Phase 2. Hosting-dependent items stay deferred (public dataset portal, hosted dashboard).

## Scope

Roadmap Phase 2 decomposed:

- **A. Export pipeline (this spec):** consented-observation builder for `public_observations`, versioned CSV/JSONL export artifacts, data dictionary, changelog, privacy-safe aggregates, deletion/opt-out reconciliation.
- **B. Already delivered (Phase 1):** per-account contribution default + per-observation consent checkbox.
- **C. Deferred:** hosted public dashboard/portal (needs Cloudflare infra), public image derivatives (needs image-sanitize Function), realtime.

## Decisions

1. **Builder runs as an admin script** (`npm run export:build`), same pattern as setup/seed — node-appwrite server SDK via `scripts/appwrite/client.ts`. An Appwrite Function deployment is deferred infra; the script is the unit of automation.
2. **Source of truth for consent is the per-observation flag.** Only observations with `contribute_to_public_dataset === true` are read (account default only seeds the UI checkbox, matching privacy.md).
3. **Only observation types `treatment` and `measurement` are exported.** Notes are private by definition; photo observations join once the image-sanitize pipeline exists; environment/health_check once those features land.
4. **Privacy transform is a pure module** (`scripts/export/transform.ts`) with unit tests. It builds rows containing ONLY `PUBLIC_EXPORT_FIELDS` + `source_observation_id` (internal): month-bucketed dates (`YYYY-MM`), `plant_age_days` from `acquired_on`, catalog `species_id`/`scientific_name` (free-text `species_text` as fallback per privacy.md), treatment type/amount, measurement values. Nicknames, notes, user ids, placement labels, exact timestamps, and file ids never enter the row shape. `public_file_id` stays null until a sanitized derivative pipeline exists.
5. **Geo fields are null + `geo_precision: 'country'`** for now — the app does not collect location yet (Phase 3). Cohort coarsening (k >= 5 per species x geo group, coarsen region → country → null) is implemented in the transform so it is already enforced when geo data arrives.
6. **Upsert + revocation by `source_observation_id`.** New unique index `idx_source_observation` on `public_observations`. Builder diffs consented source observations against existing public rows: creates new, updates changed, **deletes** rows whose source observation was deleted or un-consented (privacy.md revocation), and reports counts for the changelog.
7. **Dataset versioning:** `dataset_version` = `vN` (monotonic; next after the highest existing manifest in the `open-data-exports` bucket; seed rows' `seed-0` counts as none). Each publish writes immutable per-version files: `plantdoc-observations-{v}.csv`, `.jsonl`, `manifest-{v}.json`, plus refreshed `data-dictionary.md`, `changelog.md`, and `aggregates-{v}.json`.
8. **Aggregates instead of a hosted dashboard:** `aggregates-{v}.json` ships per species x month x treatment/measurement metric cells (count, mean) with cells below n=5 suppressed — the "early aggregate dashboard" data artifact a future portal renders.
9. **Nothing becomes world-readable by default.** Uploaded export files keep bucket-default (no) permissions; a `--publish` flag grants file-level public read for an approved version. This session never passes `--publish` (synthetic data, license not yet user-visible at opt-in).
10. **License visibility:** per privacy.md, opt-in must show the intended license before real contributions are collected. Consent hints in onboarding + LogSheet gain "shared as open data (CC BY 4.0, draft)". Final license choice stays a pre-launch decision.
11. **Export artifacts are also written to a gitignored `exports/` directory** for inspection; the bucket is the distribution channel.

## Components

- `appwrite/schema.ts`: + unique index on `public_observations.source_observation_id`.
- `scripts/export/transform.ts`: pure — `toPublicRow()`, `coarsenGeoCohorts()`, `buildAggregates()`, `toCsv()`, `nextVersion()`.
- `scripts/export/build.ts`: fetch consented observations (paginated, nested select for plant/species/children), transform, reconcile `public_observations` (create/update/delete), print summary.
- `scripts/export/publish.ts`: read `public_observations`, emit CSV/JSONL/aggregates/manifest/dictionary/changelog to `exports/` + upload to `open-data-exports` (private unless `--publish`).
- `tests/export/transform.test.ts`: field allowlist (every produced key ∈ PUBLIC_EXPORT_FIELDS ∪ {source_observation_id}), consent rejection, type skipping, month bucketing, age derivation, cohort coarsening, aggregate suppression, CSV escaping, no private strings in serialized output.
- UI: consent hint copy in `OnboardingScreen.tsx` + `LogSheet.tsx`.
- Docs: `docs/open-data.md` (pipeline operation), schema.md index note.

## Error Handling

Builder/publisher fail loudly (non-zero exit) on any Appwrite error; no partial-success silent states. Reconciliation deletes only rows whose `source_observation_id` is provably absent from the consented set. Transform throws on non-consented input rather than filtering silently.

## Testing

Pure transform fully unit-tested (TDD); live verification by running build + publish against the real project (seed data + the Phase 1 test user's consented watering log) and inspecting resulting rows/files via the admin SDK.

## Non-Goals

Hosted portal/dashboard, public image derivatives, image-sanitize Function, k-anonymity beyond species x geo coarsening, license finalization, Appwrite Function scheduling, deletion UI in-app (data layer honors deletions already).
