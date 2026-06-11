# Open Data Pipeline Operations

How consented observations become versioned public dataset artifacts. Design
rationale: `docs/superpowers/specs/2026-06-10-phase-2-open-data-design.md`.
Privacy rules: `docs/privacy.md`. Field definitions: `docs/schema.md`.

## Overview

Two admin scripts (server SDK, run with the `.env` API key, never from the
browser) and one pure transform module:

| Piece | Role |
| --- | --- |
| `scripts/export/transform.ts` | Pure privacy boundary: source observation → public row, geo cohort coarsening, aggregates, CSV/JSONL serialization, version math. Unit-tested in `tests/export/transform.test.ts`. |
| `scripts/export/build.ts` (`npm run export:build`) | Reconciles the `public_observations` table against currently-consented source observations. |
| `scripts/export/publish.ts` (`npm run export:publish`) | Snapshots `public_observations` into versioned artifacts and uploads them to the `open-data-exports` bucket. |
| `scripts/export/verify-bucket.ts` (`tsx scripts/export/verify-bucket.ts`) | Lists bucket files and fails if any carries a public (`any`) grant. |

## Running a release

```bash
npm run export:build     # 1. reconcile public_observations with consent
npm run export:publish   # 2. generate + upload vN artifacts (admin-only)
tsx scripts/export/verify-bucket.ts   # 3. confirm no accidental public grants
```

`export:build` is idempotent: re-running with no source changes reports
`0 created, 0 updated, 0 removed`. `export:publish` is **not** idempotent —
every run mints the next version number, so run it only when you intend to
cut a release.

## What build does

- Fetches all observations with `contribute_to_public_dataset = true`
  (paginated, nested select for plant → species, treatments, measurements,
  photos).
- Transforms each through `toPublicRow` — only `treatment` and `measurement`
  observations produce rows; notes and photos are skipped entirely.
- Applies `coarsenGeoCohorts` (k = 5): species×country×region cohorts under 5
  lose region; species×country cohorts under 5 lose country too.

## Geography fields (Phase 3)

`country`, `region`, `climate_zone`, and `geo_precision` are populated from
the plant's linked location (`plant_id.location_id`, nested-selected at depth
3) through `exportGeo` in `src/lib/geo.ts`. The location's user-chosen
`location_precision` tier caps what may export:

| Location precision | Exported geography | `geo_precision` |
| --- | --- | --- |
| `exact`, `local`, `regional` | country + region + climate zone | `regional` |
| `climate` (default) | country + climate zone | `climate` |
| `country` | country only | `country` |
| no location | all geo fields null | `country` |

City, postal prefix, coordinates, location labels, and location IDs never
export at any tier. `coarsenGeoCohorts` applies on top of the tier gate; when
coarsening strips country/region but the climate zone survives,
`geo_precision` is relabeled `climate` so the field always describes what the
row actually contains. `geo_cell` stays null until a coarse spatial cell
scheme is designed.
- Diffs against existing `public_observations` by `source_observation_id`
  (unique index `idx_source_observation`): creates new rows, updates changed
  ones, and **deletes rows whose source observation disappeared or had its
  consent revoked**. This is the revocation path — a user unchecking consent
  (or deleting an observation/their account) removes the row on the next
  build, and it never appears in any later dataset version.

Already-published artifact files are immutable history; revocation guarantees
forward-looking removal, which is the contract stated in `docs/privacy.md`.

## What publish does

- Reads all `public_observations`, projects exactly `PUBLIC_EXPORT_FIELDS`
  (defined in `appwrite/schema.ts`; `source_observation_id` is internal-only
  and never serialized).
- Computes the next version: highest `manifest-vN.json` in the bucket + 1.
- Writes to the local `exports/` directory (gitignored) and uploads:
  - `plantdoc-observations-vN.csv` / `.jsonl` — row-level data
  - `aggregates-vN.json` — species×month×metric cells, mean + n, cells with
    n < 5 suppressed
  - `manifest-vN.json` — row/species counts, months covered, field list,
    license, public flag
  - `data-dictionary.md` / `changelog.md` — fixed file IDs, refreshed each
    release (changelog prepends the new entry)

## Publishing publicly (`--publish`)

By default every uploaded file is **admin-only** (no file permissions; the
bucket has no user grants). This is the review window: inspect the artifacts
before anyone outside can read them.

```bash
npm run export:publish -- --publish
```

grants file-level `read("any")` on that release's files. Do not pass it until
the release has been reviewed and the license finalized. The current license
string is `CC BY 4.0 (draft — to be finalized before public launch)`; replace
it in `scripts/export/publish.ts` before the first truly public release.

## Privacy invariants (enforced in code + tests)

- `toPublicRow` throws on any non-consented observation — callers cannot
  publish by accident.
- Note text, photos, user IDs, nicknames, exact timestamps (only `YYYY-MM`
  months), and exact locations never enter the transform output;
  `tests/export/transform.test.ts` asserts serialized CSV/JSONL contains no
  private markers.
- `public_file_id` stays `null` until the image-sanitize pipeline exists,
  even when `allow_public_image` is true.
- `verify-bucket.ts` exits non-zero if any bucket file gains an `any` grant
  outside the `--publish` path.
