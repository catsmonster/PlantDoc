# Phase 3 Geo-Climate Enrichment — Design Spec

Roadmap phase 3: coarse climate-zone lookup, weather enrichment, environment
snapshots on timelines, and user-controlled geographic precision in public
exports. Builds on the Phase 0 schema (`user_locations`, `environment_snapshots`,
`plants.location_id`) and the Phase 2 export pipeline.

## Decisions

1. **Provider: Open-Meteo.** Geocoding, historical archive, and forecast APIs
   are free, keyless, and CORS-enabled, so the browser can call them directly —
   no server proxy, no new secrets, no Appwrite Function. Disclosure appears in
   the location form UI ("city search and weather lookups call the Open-Meteo
   API"). Coordinates are rounded before any third-party call (decision 3).

2. **Climate zone = Köppen-Geiger, computed in the app.** A pure module
   classifies the standard Köppen zones (A/B/C/D/E plus second/third letters)
   from 12 monthly mean temperatures (°C) and 12 monthly precipitation sums
   (mm) plus hemisphere. Normals come from the Open-Meteo archive API (daily
   means over the last 5 complete years, aggregated to months in code — an
   approximation of the 30-year normal, documented as such). Computed once
   when a location is created and stored on `user_locations.climate_zone`.

3. **Coordinate handling.** A pure `src/lib/geo.ts` module owns rounding:
   coordinates are stored at 2 decimal places (~1.1 km) at most, and rounded
   to 1 decimal place (~11 km) before every Open-Meteo request. Exact GPS
   never persists and never leaves the device unrounded. Users pick the city
   via geocoding search rather than entering coordinates.

4. **Location management UI.** A Locations screen (reached from the plants
   screen header) lists locations and hosts an add form: city search →
   pick geocoding result (gives name, region, country, lat/lon) → choose
   `location_precision` (default `climate`) with a hint explaining exactly
   what each tier allows into public exports. Rows carry owner-only
   permissions like every private table. `PlantForm` gains an optional
   location select. Onboarding is untouched.

5. **Environment snapshots at log time, never blocking.** When a log is saved
   for a plant whose location has coordinates, the app fetches that date's
   weather (archive API for past dates, forecast API with `past_days` for
   recent ones) and writes an `environment_snapshots` row: source
   `weather_api`, outdoor temperature, relative humidity, photoperiod from
   daylight duration, a weather-code summary, the location's climate zone,
   and `geo_resolution` = the location's precision tier. Enrichment failures
   are logged to the console and never fail the log write. The timeline
   renders an environment line (e.g. "18°C · 64% RH · partly cloudy") under
   entries that have a snapshot.

6. **Relationship migration for timeline reads.** Appwrite cannot filter by
   relationship columns, so the timeline reads snapshots through the parent:
   `environment_snapshots.observation_id` becomes a two-way relationship
   (`twoWayKey: environment_snapshots`, `onDelete: cascade` so snapshots die
   with their observation — privacy: enrichment derived from a deleted
   observation must not outlive it). The table is empty, so the setup script
   migration deletes and recreates the column. `getPlantWithTimeline` adds
   `observations.environment_snapshots.*` to its nested select (depth 3, at
   the limit).

7. **Precision tiers gate export geography.** The per-location
   `location_precision` enum is the user control the roadmap asks for.
   Mapping in the pure transform (`scripts/export/transform.ts`):
   - `exact` / `local` / `regional` → `country` + `region` + `climate_zone`,
     `geo_precision: regional` (city/postal never export at any tier);
   - `climate` → `country` + `climate_zone`, `geo_precision: climate`;
   - `country` → `country` only, `geo_precision: country`;
   - no location → all geo fields null (current behavior).
   The existing k=5 cohort coarsening then applies on top. The builder's
   nested select adds `plant_id.location_id.*` (depth 3).

8. **Deferred.** Appwrite spatial index and geo queries (no user-facing
   feature needs them yet — an index without queries is dead weight),
   Postgres/PostGIS read model (roadmap marks it optional, Appwrite still
   fits), indoor sensor data (Phase 6), backfill enrichment for historical
   logs (a later script/Function can reuse the same modules).

## Components

| Unit | Responsibility |
| --- | --- |
| `src/lib/geo.ts` | Pure: coordinate rounding, precision→export-fields mapping shared with transform tests. |
| `src/lib/koppen.ts` | Pure: monthly aggregation of daily series + Köppen-Geiger classification. |
| `src/lib/openmeteo.ts` | Thin fetch wrappers (geocode, climate normals, daily weather) with injectable fetch for tests; rounds coordinates before every call. |
| `src/lib/repo.ts` | `listLocations`, `createLocation`, `createEnvironmentSnapshot`, timeline select extension, `updatePlant` location wiring. |
| `src/features/locations/*` | Locations screen + add form with geocoding search and precision selector. |
| `src/features/timeline/*` | Snapshot creation hook-in after log save; environment line rendering. |
| `appwrite/schema.ts` + setup | Two-way cascade migration for `observation_id`. |
| `scripts/export/transform.ts` + build | Location-aware geo fields per decision 7. |

## Error handling

- Open-Meteo failures: geocoding/normals errors surface inline in the
  location form; weather enrichment failures only log to console.
- Köppen classification with incomplete normals (any missing month) returns
  null — no zone is better than a wrong zone.
- Transform treats missing/partial location objects as "no location".

## Testing

Pure modules get unit tests (Köppen known-zone fixtures such as tropical
rainforest → Af, hot desert → BWh, Mediterranean → Csa, humid continental →
Dfb; rounding boundaries; precision mapping including "city never exports").
Transform tests extend the existing suite with location fixtures, asserting
city/postal/coordinates never appear in serialized output. Live verification
follows the Phase 1/2 pattern (preview MCP + admin scripts).
