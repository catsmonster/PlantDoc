# PlantDoc Database Schema

This schema assumes Appwrite Cloud using Databases/TablesDB. Some Appwrite UI/API surfaces may refer to tables/rows or collections/documents depending on SDK version; keep the domain model below intact either way.

## Design Goals

- Keep private user data separate from public export data.
- Model observations as a timeline that can include treatments, measurements, notes, photos, and environment snapshots.
- Preserve enough structure for future climate-aware recommendations.
- Use Appwrite spatial columns for private location features and coarse public geography.
- Make anonymized public exports reproducible and versioned.
- Keep the MVP small enough to fit Appwrite student/free-plan constraints.

## Phase 0 Implementation Notes

The schema below is implemented declaratively in [`appwrite/schema.ts`](../appwrite/schema.ts) and applied by `npm run appwrite:setup`. Where Appwrite's data model constrains the documented design, the implementation resolves it as follows (see ADR-006):

- **Timestamps**: `created_at`/`updated_at` columns are not created. Appwrite's built-in `$createdAt`/`$updatedAt` row metadata serves these roles.
- **Relationships**: columns documented as `relationship/string` (`species_id`, `location_id`, `plant_id`, `observation_id`) are native TablesDB relationship columns, created from the child side as `manyToOne`. Timeline children (`observations.plant_id`, `treatments/measurements/photos.observation_id`, and since Phase 3 `environment_snapshots.observation_id`) are two-way with cascade delete; optional links (`plants.species_id`, `plants.location_id`, `environment_snapshots.plant_id`) are one-way with set-null on delete. `user_id` stays a plain string everywhere because Auth users are not TablesDB rows.
- **Relationship reads**: Appwrite does not hydrate relationship columns by default — a plain read returns related-row IDs as strings. Embedding requires an explicit nested select (e.g. `Query.select(['*', 'observations.*', 'observations.treatments.*'])`), which is how the app loads a plant's timeline (`getPlantWithTimeline` in `src/lib/repo.ts`). Relationship columns also cannot be filtered on, so the timeline is always read through the parent row.
- **Required + default**: Appwrite forbids defaults on required columns. Columns documented as "required with default" (`preferred_units`, `public_contribution_default`, `contribute_to_public_dataset`, `exif_stripped`, `allow_public_image`, `status`) are optional-with-default. Relationship columns cannot be required in Appwrite, so `observations.plant_id` requiredness is enforced at the app layer.
- **String types**: short indexable strings use `varchar`; private notes/captions/summaries use off-page `text` (keeps rows under Appwrite's 64 KB inline row budget).
- **Dates**: `plants.acquired_on` is a datetime column (Appwrite has no date-only type); the app treats it as date-only.
- **Indexes**: relationship columns cannot be indexed; the spatial index on `user_locations.location` is deferred until geo queries land (Phase 3).

## Databases

### `plantdoc_main`

Primary application database. Keep all MVP tables here to preserve free-tier portability.

## Tables

### `profiles`

One row per authenticated user.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Appwrite user ID. Unique. |
| `display_name` | string | no | Public only if user explicitly shares a profile later. |
| `preferred_units` | enum/string | yes | `metric` or `imperial`. Default `metric`. |
| `public_contribution_default` | boolean | yes | Default `false`. |
| `created_at` | datetime | yes | Server generated. |
| `updated_at` | datetime | yes | Server generated. |

Permissions: only the owning user can read/write. Service functions may read for export consent checks.

### `user_locations`

Private location records used for climate lookup and user features.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `label` | string | no | Private user label. |
| `country` | string | no | Private until coarsened for export. |
| `region` | string | no | State/province/region. |
| `city` | string | no | Private by default. |
| `postal_code_prefix` | string | no | Never store full postal code unless needed. |
| `location` | point/spatial | no | `[longitude, latitude]`; private. |
| `location_precision` | enum/string | yes | `exact`, `local`, `regional`, `climate`, or `country`. |
| `climate_zone` | string | no | Derived when known. |
| `created_at` | datetime | yes | Server generated. |
| `updated_at` | datetime | yes | Server generated. |

Indexes: spatial index on `location` if geo queries are enabled; index `user_id`.

**As implemented (Phase 3)**: locations are created through a city search against the keyless Open-Meteo geocoding API; coordinates are rounded to 2 decimal places (~1.1 km) before storage and 1 decimal place (~11 km) before any external API call (`src/lib/geo.ts`), so exact GPS never persists and never leaves the device. `climate_zone` is computed in-app at save time: 5 complete years of Open-Meteo archive daily data are aggregated into monthly normals and classified with the Köppen-Geiger rules (`src/lib/koppen.ts`). `location_precision` is chosen by the user at creation (default `climate`) and gates what geography the export pipeline may publish — see `docs/open-data.md`.

### `species`

Canonical plant taxonomy when known.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `scientific_name` | string | yes | Example: `Monstera deliciosa`. |
| `common_names` | string[] | no | Search/display aliases. |
| `family` | string | no | Botanical family. |
| `genus` | string | no | Botanical genus. |
| `cultivar` | string | no | Optional cultivar. |
| `external_taxon_id` | string | no | External taxonomy reference. |
| `created_at` | datetime | yes | Server generated. |

Permissions: readable by any app user; writable only by trusted admin/service workflows.

### `plants`

User-owned plant profiles.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `species_id` | relationship/string | no | Link to `species` when known. |
| `species_text` | string | no | User-entered species when not canonicalized. |
| `nickname` | string | yes | Private by default. |
| `common_name` | string | no | User-facing display name. |
| `acquired_on` | date | no | Optional plant age context. |
| `status` | enum/string | yes | `active`, `archived`, `deceased`, `gifted`. |
| `placement_type` | enum/string | yes | `indoor`, `outdoor`, `greenhouse`, `balcony`. |
| `placement_label` | string | no | Private room/location label. |
| `location_id` | relationship/string | no | Link to `user_locations`. |
| `last_watered_at` | datetime | no | Private summary field: timestamp of the last watering. |
| `watering_count` | integer | no | Private summary field: total count of waterings. |
| `watering_cadence_days` | float | no | Private summary field: computed or default watering interval in days. |
| `latest_photo_file_id` | string | no | Private summary field: Appwrite file ID of the most recent photo. |
| `latest_photo_observed_at` | datetime | no | Private summary field: timestamp of the most recent photo observation. |
| `created_at` | datetime | yes | Server generated. |
| `updated_at` | datetime | yes | Server generated. |

Indexes: `user_id`, `status`, and optionally `species_id`.

### `observations`

Timeline parent table for anything recorded about a plant.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `plant_id` | relationship/string | yes | Parent plant. |
| `observed_at` | datetime | yes | User-selected or captured time. |
| `observation_type` | enum/string | yes | `treatment`, `measurement`, `photo`, `note`, `environment`, `health_check`. |
| `notes_private` | string | no | Never exported directly. |
| `contribute_to_public_dataset` | boolean | yes | Per-observation consent. Default from profile, initially false. |
| `created_at` | datetime | yes | Server generated. |
| `updated_at` | datetime | yes | Server generated. |

Indexes: compound-style query support for `plant_id + observed_at` if available, plus `user_id` and `observation_type`.

### `treatments`

Structured treatment details for `treatment` observations.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Denormalized for permission/query simplicity. |
| `observation_id` | relationship/string | yes | Parent observation. |
| `treatment_type` | enum/string | yes | `watering`, `fertilizing`, `repotting`, `pruning`, `misting`, `pest_control`, `cleaning`, `relocation`. |
| `amount_value` | number | no | Normalized value when possible. |
| `amount_unit` | string | no | `ml`, `l`, `tsp`, `tbsp`, `g`, etc. |
| `product_name` | string | no | Private unless public export rules later allow normalized product categories. |
| `method` | string | no | Example: top water, bottom water, foliar spray. |
| `notes_private` | string | no | Never exported directly. |

Indexes: `user_id`, `observation_id`, `treatment_type`.

### `measurements`

Quantitative plant state.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Denormalized for permission/query simplicity. |
| `observation_id` | relationship/string | yes | Parent observation. |
| `height_cm` | number | no | Store metric internally. |
| `leaf_count` | integer | no | Optional. |
| `soil_moisture_percent` | number | no | Optional. |
| `health_score` | integer | no | 1-10 scale. |
| `pest_severity_score` | integer | no | 0-10 scale. |
| `bloom_count` | integer | no | Optional. |
| `notes_private` | string | no | Never exported directly. |

### `photos`

Image metadata and storage references.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `observation_id` | relationship/string | yes | Parent observation. |
| `private_file_id` | string | yes | File ID in private image bucket. |
| `public_file_id` | string | no | Sanitized derivative file ID, if allowed. |
| `caption_private` | string | no | Private. |
| `width` | integer | no | Optional metadata after processing. |
| `height` | integer | no | Optional metadata after processing. |
| `captured_at` | datetime | no | Do not export exact value by default. |
| `exif_stripped` | boolean | yes | Must be true for public derivatives. |
| `allow_public_image` | boolean | yes | Explicit public image consent. |
| `created_at` | datetime | yes | Server generated. |

Original images are private. Public image use requires `allow_public_image = true` and a sanitized derivative.

### `environment_snapshots`

Manual, sensor, inferred, or weather API context near an observation.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `plant_id` | relationship/string | no | Related plant. |
| `observation_id` | relationship/string | no | Related observation. |
| `recorded_at` | datetime | yes | Timestamp of environmental context. |
| `source` | enum/string | yes | `manual`, `weather_api`, `device_sensor`, `inferred`. |
| `indoor_temperature_c` | number | no | Optional. |
| `outdoor_temperature_c` | number | no | Optional. |
| `relative_humidity_percent` | number | no | Optional. |
| `light_lux` | number | no | Optional. |
| `photoperiod_hours` | number | no | Optional. |
| `weather_summary` | string | no | Keep brief. |
| `climate_zone` | string | no | Derived. |
| `geo_resolution` | string | no | Indicates precision used. |
| `created_at` | datetime | yes | Server generated. |

**As implemented (Phase 3)**: snapshots are created client-side right after a log entry saves (`src/lib/enrich.ts`), when the plant has a location with coordinates. Daily weather comes from Open-Meteo (archive API for dates older than 5 days, forecast API otherwise) using 1-dp-rounded coordinates; enrichment failures only log a console warning and never block the log save. `observation_id` is a two-way cascade relationship (`twoWayKey: environment_snapshots`), so the timeline reads snapshots through the parent observation and deleting an observation deletes its snapshots. Rows carry owner-only permissions like every private table.

### `insight_feedback`

Added in Phase 4. One verdict per plant × insight kind for the experimental
care-insights panel ("was this helpful?").

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string | yes | Owner Appwrite user ID. |
| `plant_id` | relationship/string | yes | Two-way cascade (`plants.insight_feedback`); feedback is read through the plant and dies with it. |
| `insight_kind` | enum-like string | yes | Insight identifier from `src/lib/insights.ts` (e.g. `watering_ok`, `growth_height`). |
| `helpful` | boolean | yes | Latest verdict wins; re-tapping updates the row. |

**As implemented (Phase 4)**: insights themselves are never stored — they are
recomputed deterministically from the timeline on every plant read
(`src/lib/insights.ts`), so only the user's verdict needs a table. Feedback is
private (owner-only rows), is not in `PUBLIC_EXPORT_FIELDS`, and never enters
exports. The roadmap's optional AI features (photo insights, recognition
labels, embeddings) are deferred pending an AI provider decision; their
consent requirements are recorded in
`docs/superpowers/specs/2026-06-10-phase-4-recommendations-design.md`.

## Public Export Tables

Public data should be generated into a separate table/collection or object-storage export. Do not expose private tables directly.

### `public_observations`

Derived, anonymized records for open data releases.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `source_observation_id` | string | yes | Internal traceability. Not exported if it can enable linkage attacks. |
| `species_id` | string | no | Optional canonical species reference. |
| `scientific_name` | string | no | Public. |
| `observed_month` | date/string | yes | Bucketed date, not exact timestamp. |
| `plant_age_days` | integer | no | Approximate. |
| `observation_type` | string | yes | Public. |
| `treatment_type` | string | no | Public when applicable. |
| `amount_value` | number | no | Normalized, non-identifying. |
| `amount_unit` | string | no | Normalized. |
| `height_cm` | number | no | Public if consented. |
| `leaf_count` | integer | no | Public if consented. |
| `soil_moisture_percent` | number | no | Public if consented. |
| `health_score` | integer | no | Public if consented. |
| `country` | string | no | Coarse geography only. |
| `region` | string | no | Publish only when cohort size is safe. |
| `climate_zone` | string | no | Preferred public geography. |
| `geo_cell` | string | no | Deliberately coarse cell, never exact coordinates. |
| `geo_precision` | string | yes | `country`, `regional`, `climate`, or `coarse_cell`. |
| `environment_source` | string | no | `manual`, `weather_api`, `device_sensor`, `inferred`. |
| `outdoor_temperature_c` | number | no | Coarse context. |
| `relative_humidity_percent` | number | no | Coarse context. |
| `light_lux` | number | no | Optional. |
| `public_file_id` | string | no | Sanitized derivative only. |
| `dataset_version` | string | yes | Export version. |
| `published_at` | datetime | yes | Generation/publication time. |

Public exports must exclude:

- user IDs,
- emails,
- plant nicknames,
- exact timestamps when unnecessary,
- exact coordinates,
- room labels,
- private notes,
- private file IDs,
- original image paths,
- image EXIF metadata.

## Storage Buckets

### `plant-private-images`

- Private originals.
- Read/write only by owning user and trusted service functions.
- Do not expose through public export jobs.
- **Privacy note (Phase 1)**: originals are uploaded as-is, so EXIF metadata (including GPS, if present) survives on the private original. That is acceptable only because files carry owner-only permissions; EXIF stripping happens in the `image-sanitize` pipeline before anything can become public. Nothing from this bucket is ever published.

### `plant-public-images`

- Sanitized derivatives only.
- Files appear here only after explicit image consent and metadata stripping.

### `open-data-exports`

- Versioned CSV/JSONL exports.
- Public read once a dataset version is approved.
- Include a data dictionary and changelog with every release.
- **As implemented (Phase 2)**: files upload admin-only; per-file public read is granted only by `npm run export:publish -- --publish` after review. See `docs/open-data.md`.

## Functions

### `image-sanitize`

Triggered after upload or called explicitly. Strips metadata, generates safe derivatives, and writes `photos` metadata.

### `climate-enrich`

Looks up climate/weather context from private location data and writes `environment_snapshots`.

**As implemented (Phase 3)**: this runs in the browser at log time (`src/lib/enrich.ts`), not as an Appwrite Function — Open-Meteo is keyless and CORS-enabled, so no server secret is needed and the rounded coordinates never transit our backend. A scheduled Function could later backfill snapshots for historical observations using the same modules.

### `public-export`

Builds `public_observations` and export files from consented observations only. Applies privacy thresholds before publishing.

**As implemented (Phase 2)**: this runs as two admin scripts rather than an Appwrite Function — `npm run export:build` (table reconciliation, including deletion of revoked/removed sources) and `npm run export:publish` (versioned artifact generation/upload). Operations guide: `docs/open-data.md`. A scheduled Function can wrap the same modules later without changing the privacy boundary (`scripts/export/transform.ts`).

## Permissions

- Users can read and write only their own private rows.
- Species rows can be public-read but admin/service-write.
- Public export rows/files are service-write and public-read only after approval.
- Service functions perform export generation and privileged maintenance.
- Avoid granting broad public access to any source table.

As implemented (Phase 1): private user tables and the `plant-private-images` bucket carry a table/bucket-level `create("users")` grant (row/file security is on, and Appwrite cannot grant create per-row, so authenticated users need the table-level grant to insert). Each row/file is then written with owner-only `read/update/delete(user:<id>)` permissions stamped by the app (`src/lib/owner.ts`). `species` is `read("users")` only; `public_observations` and the public/export buckets have no user grants at all. `npm run appwrite:setup` reconciles any permission drift and refuses `any()` grants.

## Indexes

Indexes created in Phase 0 (relationship columns are not indexable in Appwrite; relationship lookups go through the relation itself):

- `profiles.user_id` (unique)
- `user_locations.user_id`
- `plants.user_id`
- `plants.status`
- `observations.user_id`
- `observations.observed_at`
- `observations.observation_type`
- `treatments.user_id`
- `treatments.treatment_type`
- `public_observations.scientific_name`
- `public_observations.observed_month`
- `public_observations.climate_zone`
- `public_observations.source_observation_id` (unique, added Phase 2 — upsert/revocation key for the export builder)
- `insight_feedback.user_id` (added Phase 4)

Deferred: spatial index on `user_locations.location` until geo queries are introduced (Phase 3).

Add more indexes only after query patterns are real.

## Analytics Migration Path

If PlantDoc outgrows Appwrite for public research queries:

- keep Appwrite as the app backend,
- export anonymized records to object storage,
- ingest public/export-safe data into Postgres/PostGIS, DuckDB, BigQuery, or another analytics store,
- preserve the same privacy model and public export fields.
