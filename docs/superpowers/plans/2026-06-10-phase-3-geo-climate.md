# Phase 3 Geo-Climate Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Locations with computed Köppen climate zones, weather-API environment snapshots on plant timelines, and precision-tier-gated geography in public exports.

**Architecture:** Three pure/thin modules (`geo`, `koppen`, `openmeteo`) + repo/UI wiring + a two-way relationship migration + transform extension. Spec: `docs/superpowers/specs/2026-06-10-phase-3-geo-climate-design.md`.

**Tech Stack:** Open-Meteo APIs (keyless, browser-direct), Appwrite TablesDB, Vitest.

---

### Task 1: Pure geo module (TDD)

**Files:** Create `src/lib/geo.ts`, `tests/lib/geo.test.ts`.

- [x] **1.1** Tests first: `roundCoord(v, dp)` half-up rounding; `forStorage({lat,lon})` = 2 dp; `forApi({lat,lon})` = 1 dp; `exportGeo(location)` mapping — exact/local/regional → {country, region, climate_zone, geo_precision:'regional'}; climate → {country, climate_zone, region:null, geo_precision:'climate'}; country → {country only, geo_precision:'country'}; null/missing location → all-null with geo_precision:'country'; city/postal_code_prefix never present in output keys. FAIL.
- [x] **1.2** Implement; export `ExportGeo` type `{ country: string | null; region: string | null; climate_zone: string | null; geo_precision: 'regional' | 'climate' | 'country' }`. PASS. Commit.

### Task 2: Köppen module (TDD)

**Files:** Create `src/lib/koppen.ts`, `tests/lib/koppen.test.ts`.

- [x] **2.1** Tests first: `aggregateMonthly(dates, tempMeans, precipSums)` returns `{ tempC: number[12], precipMm: number[12] }` averaging temp and averaging monthly precip totals across years, null if any month has no data; `koppenZone(tempC, precipMm, latitudeSign)` fixtures — Af (Singapore-like), Aw (savanna), BWh (hot desert), BSk (cold steppe), Csa (Mediterranean), Cfb (oceanic), Dfb (humid continental), ET (tundra); returns null on 12-month input violations. FAIL.
- [x] **2.2** Implement standard Köppen-Geiger rules (E by warmest month <10°C; B by aridity threshold `20*meanT + offset` with summer/winter precip split; A by coldest month ≥18°C; C/D by coldest month threshold 0°C; second letter s/w/f; third letter a/b/c + h/k for B). PASS. Commit.

### Task 3: Open-Meteo client

**Files:** Create `src/lib/openmeteo.ts`, `tests/lib/openmeteo.test.ts`.

- [x] **3.1** Tests with injected fetch stub: `geocodeCity(name, fetchFn)` → top 5 results `{name, region, country, latitude, longitude}` from geocoding-api response, [] on no results; `fetchClimateNormals(coords, fetchFn)` calls archive-api with 1-dp coords, last 5 complete years, daily `temperature_2m_mean,precipitation_sum`, returns aggregated monthly normals via koppen module; `fetchDailyWeather(coords, isoDate, fetchFn)` picks archive vs forecast (date older than 5 days → archive), returns `{ outdoorTempC, humidityPercent, photoperiodHours, summary }` (weathercode → text map), null on API failure. Assert request URLs contain rounded coords only. FAIL.
- [x] **3.2** Implement; default `fetchFn = fetch`. PASS. Live API variable names verified (archive + forecast). Commit.

### Task 4: Snapshot relationship migration

**Files:** Modify `appwrite/schema.ts`, `tests/appwrite/schema.test.ts`, `scripts/appwrite/setup.ts` (only if reconcile can't replace relationships).

- [x] **4.1** Schema: `environment_snapshots.observation_id` → `twoWay: true`, `twoWayKey: 'environment_snapshots'`, `onDelete: 'cascade'`. Test asserts twoWay+cascade. PASS locally.
- [x] **4.2** Live: `scripts/appwrite/migrate-snapshot-rel.ts` deleted the 2 seed snapshot rows + one-way column; `appwrite:setup` recreated it two-way; `appwrite:seed` restored seed rows; `appwrite:check` green. Commit.

### Task 5: Locations repo + UI

**Files:** Modify `src/lib/repo.ts`, `src/lib/types.ts`, `src/App.tsx`, `src/features/plants/PlantsScreen.tsx`, `src/features/plants/PlantForm.tsx`; create `src/features/locations/LocationsScreen.tsx`, `src/features/locations/LocationForm.tsx`.

- [ ] **5.1** Repo: `listLocations()`, `createLocation(input)` (owner perms, stores `forStorage` coords + computed climate_zone), `deleteLocation(id)`; `UserLocation` type. `PlantForm`: optional location select (loads locations, value plant.location_id, handles string|object like species). `getPlantWithTimeline`: add `observations.environment_snapshots.*` select; sort/attach.
- [ ] **5.2** UI: `LocationsScreen` (list + delete + "Add location"), `LocationForm` (city search via `geocodeCity`, result picker, precision select with export-impact hint + Open-Meteo disclosure, computes climate zone via `fetchClimateNormals`+`koppenZone` on save). `App.tsx` view `{name:'locations'}`, entry point from PlantsScreen header. Lint/build/test green. Commit.

### Task 6: Log-time enrichment + timeline display

**Files:** Modify `src/lib/repo.ts`, `src/features/timeline/LogSheet.tsx`, `src/features/timeline/PlantScreen.tsx`, `src/lib/types.ts`.

- [ ] **6.1** `createEnvironmentSnapshot(input)` repo fn (owner perms, source `weather_api`). After `createLog` succeeds in LogSheet: if plant's location has coords, `fetchDailyWeather` → snapshot row linked to the new observation; failures `console.warn` only, UI unaffected.
- [ ] **6.2** `PlantScreen` TimelineEntry renders environment line ("18°C · 64% RH · partly cloudy") when `observation.environment_snapshots[0]` exists. Lint/build/test green. Commit.

### Task 7: Export pipeline geo wiring

**Files:** Modify `scripts/export/transform.ts`, `scripts/export/build.ts`, `tests/export/transform.test.ts`.

- [ ] **7.1** Tests: `SourceLocation` on `plant_id.location_id`; toPublicRow uses `exportGeo` mapping (regional location → country+region+climate_zone; climate → no region; country → country only; no location → nulls); serialized output never contains city/postal/lat/lon markers from fixtures. FAIL.
- [ ] **7.2** Implement via `src/lib/geo.ts` `exportGeo`; build.ts select adds `plant_id.location_id.*`. PASS. Run `npm run export:build` live (no location rows yet → 0 changes expected). Commit.

### Task 8: Docs, gates, live verification, merge

**Files:** Modify `docs/schema.md`, `docs/open-data.md`.

- [ ] **8.1** Live browser verification (preview MCP): create location (geocoded, climate zone computed), assign to plant, save a log, snapshot appears on timeline with environment line; verify snapshot row perms owner-only.
- [ ] **8.2** Docs: schema.md "As implemented (Phase 3)" notes (two-way snapshot relationship, precision gating); open-data.md geo-fields section update.
- [ ] **8.3** All gates (lint, build, test, appwrite:check). Tick checkboxes, merge to master locally, keep unpushed.

## Self-Review Notes

Spec decisions 1-8 map to Tasks 3 (1), 2 (2), 1 (3), 5 (4), 6 (5), 4 (6), 7 (7), 8 (docs/deferred). Depth-3 selects verified against Appwrite limit. `exportGeo` lives in `src/lib/geo.ts` so the same mapping is unit-tested once and shared by transform.
