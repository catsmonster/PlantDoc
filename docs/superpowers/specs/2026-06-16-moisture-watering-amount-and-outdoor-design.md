# Soil-Moisture Watering Guidance — Amount + Outdoor/Balcony — Design

**Status:** Approved in brainstorming · 2026-06-16
**Roadmap:** Phase 4 (care intelligence). Extends the shipped indoor Water-Balance Moisture Inference (PRs #14–#17).
**Related:** `docs/superpowers/specs/2026-06-14-water-balance-moisture-inference-design.md` (the v1 engine this builds on — see its "Deferred to v1.1" list), `src/lib/moisture.ts` (pure engine), `src/lib/moisture-inputs.ts` / `src/lib/moisture-read.ts` (read glue), `src/lib/openmeteo.ts` (weather rails), `scripts/export/transform.ts` (export boundary — see Privacy).

## Goal

Two related additions to the existing soil-moisture feature, shipped together because they share the same surface (insight + hero gauge):

1. **"How much to water"** — when a plant is due, show a species-driven suggested amount ("Add about 400 ml / 13 fl oz"), gated on having mined moisture data for that species. Pure, low-risk, independently shippable.
2. **Outdoor + balcony support** — extend inference beyond indoor by feeding the engine a real daily weather series (temp/RH) and **rainfall** across the dry-down window. This is the deferred v1.1 outdoor slice; the indoor core is now proven and hardened, so it's the honest next expansion.

## Scope & sequencing

One spec, one plan, sequenced so the low-risk piece lands first:

- **Unit 1 (amount)** — built and shippable on its own; touches only the pure engine + read glue + plant-screen surfacing. No schema, no network.
- **Units 2–5 (outdoor + rain)** — the larger expansion: weather-series fetch, rainfall in the engine, a `rain_exposed` column + onboarding question, and the outdoor wiring/gate.

Indoor and **greenhouse** plants are unchanged — they keep the low-variance seasonal indoor default (`seasonalIndoorTempC` + `INDOOR_DEFAULT_RH`) and fetch no weather. Only `placement_type` of `outdoor` or `balcony` takes the new path.

## Unit 1 — "How much to water" (pure amount)

The engine already computes capacity `C` (`waterCapacityMl`) and the current water fraction (`moisturePercent/100`). The suggested amount is the volume that brings the soil up to the species' comfortable peak.

**Engine (`src/lib/moisture.ts`, pure):** `recommendWatering(moisturePercent, opts)` gains optional `targetFraction` and `capacityMl` on `RecommendOptions`. When **both** are present **and** `status === 'water_now'`, it computes:

```
target  = clamp(targetFraction, 0, 1)        // defensive
current = clamp(moisturePercent / 100, 0, 1)  // defensive
suggestedWaterMl = max(0, (target - current)) * capacityMl
```

`WateringRecommendation` gains `suggestedWaterMl?: number`. **Two-layer zero rule (the boundary is explicit):** the engine omits the field **only on a raw non-positive result** (`suggestedWaterMl <= 0`) — it does not and must not know the display granularity. **Suppressing a *zero-after-rounding* amount is the display formatter's job**, because metric and imperial round at different thresholds (~25 ml vs ~0.5 fl oz ≈ 14.8 ml), so the same raw ml can round to a shown value in one unit and to nothing in the other. Engine → raw ml or `undefined`; formatter in `PlantScreen` → renders "Add about X" or nothing when *its* rounding yields 0.

**Target by mined band** (fraction of `C`):

| Band (mined `soil_moisture_percent`) | Fill target |
| --- | --- |
| `dry` (dries-out species) | `0.40` |
| `moist` | `0.60` |
| `wet` (consistently damp) | `0.80` |

**Gate:** the amount is produced **only when `bandSourced === true`** — i.e., a real mined OpenPlantbook `soil_moisture_percent` range exists for the species (`moisture-inputs.ts` already tracks this). No mined range → no `targetFraction` is passed → no amount; the card stays qualitative exactly as today.

**Surfacing (`PlantScreen`):** on `water_now` with a `suggestedWaterMl`, render a units-formatted line — "Add about **400 ml** (**13 fl oz**)" — using the PR #17 conversion layer (`mlToVolumeInput` / formatters in `units.ts`), rounded to a friendly figure (~25 ml or ~0.5 fl oz). The pure engine stays unit-agnostic; formatting happens where `units` is available.

## Unit 2 — Outdoor daily weather series (`src/lib/openmeteo.ts`)

Outdoor plants can't use the indoor constant; they need real per-day temp/RH/precip across the simulation window (`OBSERVATION_WINDOW_DAYS = 60`).

New range fetch returning a map `iso → { tempC, humidityPct, precipMm }`:

- One **archive** call (`archive-api`) for the older part of the window and one **forecast** call (`api ... /forecast` with `past_days`/`forecast_days`) for recent days, merged into a single map. `DAILY_VARS` gains `precipitation_sum`; daily mean temp from `temperature_2m_max/min`, RH from `relative_humidity_2m_mean`.
- **Merge precedence:** for any ISO date present in **both** responses, the **forecast/recent** value overrides the archive value — the forecast endpoint is the fresher source for near-present days.
- Cached per `(coords, windowStart, windowEnd)`; any failure or missing field resolves to `null` (caller degrades gracefully — see Unit 5).

## Unit 3 — Rainfall in the engine (`src/lib/moisture.ts`, pure)

`simulateWaterContent` (and therefore `SimInput`) gains optional `dailyRainMm?: (iso: string) => number`. Rain falling on an exposed pot adds water:

```
rainMl(iso) = dailyRainMm(iso) * potTopAreaCm2 * 0.1 * THROUGHFALL
potTopAreaCm2 = π * (diameterCm / 2)^2
// 1 mm depth over 1 cm² = 0.1 ml; THROUGHFALL accounts for foliage/rim interception.
```

- `THROUGHFALL` is an **internal module constant** (`≈ 0.8`), **not** a caller parameter — no per-plant tuning need is known yet (YAGNI). Revisit only if real data shows it must vary.
- `THROUGHFALL` and `potTopAreaCm2` are derived inside the engine; the caller supplies only `dailyRainMm`.
- **Day order (one rule, no contradiction):** rain accrues **proportionally across the day, exactly like ET** — the simulator already splits a day into sub-steps at events and day boundaries ([moisture.ts:229](../../../src/lib/moisture.ts)), so each sub-step of fraction `f` receives `rainMl(iso)·f` of that day's rain (total over the day = `rainMl(iso)`). **Within a sub-step, rain is added first (capped at `C`), then ET is subtracted (floored at residual).** This is deliberately *not* "all rain at day start": a watering or correction occurring midday sees only the rain that fell before it. Encoded in the test names — e.g. `"rain accrues proportionally; a midday watering sees only the earlier fraction's rain"` — with an explicit intra-day-event test alongside the simple whole-day case.
- Backward compatible: with no `dailyRainMm` (indoor/greenhouse, or outdoor not rain-exposed), the simulation reproduces today's behavior exactly.

## Unit 4 — `rain_exposed` column + explicit onboarding question

- **Schema (`appwrite/schema.ts`, `plants`):** new `{ kind: 'boolean', key: 'rain_exposed' }` — **nullable, no DB default**. `Plant` (in `src/lib/types.ts`) and `PlantInput` (in `src/lib/repo.ts:184`, *not* `types.ts`) get `rain_exposed?: boolean | null`. **Add `'rain_exposed'` to the `listPlants` `Query.select` ([repo.ts:216](../../../src/lib/repo.ts))** so the dashboard's scalar plant list carries it. Update `docs/schema.md`.
- **Semantics — `null` means "not applicable," `false` means "outdoor but user said no":**
  - Indoor / greenhouse → stored `null` (the question is never shown).
  - Outdoor / balcony → the user makes an **explicit** Yes/No choice; stored as a real boolean.
  - The engine treats `null` on an outdoor/balcony plant as **not rain-exposed** (no phantom rain — safe default), distinct from a user-chosen `false` only in that `null` also drives the backfill nudge below.
- **Onboarding (`src/features/plants/PlantForm.tsx`):** in the placement section, when `placement_type` is `outdoor` or `balcony`, show an explicit **"Exposed to rain?"** Yes/No control (both add + edit, both theme branches), presented as a clear question, not buried in a disclosure. It has **no pre-selected default and a choice is required to save** when outdoor/balcony — honoring "force an explicit boolean." When placement is indoor/greenhouse the control is hidden and the value is written `null`.
- **Migration / existing rows.** Adding a nullable column leaves existing outdoor/balcony plants at `null` (predating the question). They stay valid: the engine treats `null` as not rain-exposed (above), and the plant surfaces a **non-blocking nudge** to set rain exposure — mirroring the existing pot-size nudge pattern (`shouldPromptForPotSize` → `PotSizeMoistureNudge`). The form's "required to save" rule means the **first edit of such a plant doubles as the backfill** (the user must answer before saving), so no separate migration script is needed.

## Unit 5 — Outdoor wiring, gate & card state (`moisture-inputs.ts`, `moisture-read.ts`, `PlantScreen`, `PlantsScreen`)

- **Async stays out of the pure layer.** The weather-series fetch (Unit 2) runs in the React layer; the *resolved fetch state* is passed *into* the pure builder. `buildMoistureInputs` / `moistureForPlant` stay pure (already-loaded data + `now` + optional weather state).
- **Climate resolver:** for outdoor/balcony, `makeClimateResolver` reads `tempC`/`humidityPct` from the series instead of the seasonal constant; `light` still from `plant.light_level ?? 'medium'`. `dailyRainMm` reads the series **only when `rain_exposed === true`** (otherwise the engine gets no rain function).

- **Explicit card state — `loading` is its own state, not an "unavailable" flash.** Both screens compute moisture **synchronously during render** today ([PlantScreen.tsx:861](../../../src/features/timeline/PlantScreen.tsx), [PlantsScreen.tsx:94](../../../src/features/plants/PlantsScreen.tsx)), so an outdoor plant has *no series yet* on the first render before its effect resolves. To stop a wrong-prompt flash, `moistureForPlant` returns a discriminated **`MoistureCardState`** instead of `PlantMoisture | null`:

  ```ts
  type MoistureCardState =
    | { kind: 'ready'; moisture: PlantMoisture }
    | { kind: 'needs_pot' }            // pot size missing (indoor or outdoor)
    | { kind: 'needs_location' }       // outdoor/balcony, no location to fetch weather for
    | { kind: 'weather_loading' }      // outdoor/balcony, has location, series not yet provided
    | { kind: 'weather_unavailable' }; // outdoor/balcony, has location, fetch resolved to null
  ```

  The pure function can't tell `loading` from `unavailable` on its own, so the **caller passes the fetch state**: `weather?: { status: 'loading' } | { status: 'ready'; series } | { status: 'unavailable' }` (omitted/ignored for indoor/greenhouse). Mapping: indoor/greenhouse → `needs_pot` or `ready`; outdoor/balcony → `needs_pot` → `needs_location` (no location) → by `weather.status`: `loading`→`weather_loading`, `unavailable`→`weather_unavailable`, `ready`→`ready`. (A thin `PlantMoisture | null` accessor can wrap `kind==='ready'` for call sites that only want the value.)

- **Shared weather-series source so the dashboard isn't N fetches.** A small module-level cache keyed by **`(coords, windowStart, windowEnd)`** plus a `useWeatherSeries(plants)` hook, consumed by **both** `PlantScreen` and `PlantsScreen`. Plants that share a location (same home) collapse to **one** fetch; the hook returns each plant's `weather` fetch-state from the cache and kicks off fetches for the distinct outdoor/balcony locations. This is the answer to finding (1): the dashboard does not silently drop outdoor badges, nor does it fan out a fetch per plant.

- **Where each state renders:**
  - **`PlantScreen` (detail):** renders the distinct prompt per `kind` — `needs_pot` keeps today's pot nudge; `needs_location` → "Add a location to estimate outdoor moisture"; `weather_loading` → a subtle placeholder (no prompt text); `weather_unavailable` → "Weather data unavailable right now." Only `ready` shows the gauge/insight/amount.
  - **`PlantsScreen` (dashboard badges):** shows the badge **only on `ready`**; every non-ready `kind` hides the badge (a list row is the wrong place for prompts/spinners). This keeps the dashboard clean while staying correct for outdoor plants once their shared series resolves.

- **`shouldPromptForPotSize`** updated: outdoor/balcony plants now *do* need a pot size (previously short-circuited to `false`).
- Greenhouse continues through the indoor seasonal path untouched (no fetch, `weather` omitted).

## Data flow

```
PlantScreen / PlantsScreen
  ├─ useWeatherSeries(plants): shared cache keyed by (coords, window)               [Unit 5]
  │     → per-plant weather state: loading | ready(series) | unavailable
  │       (one fetch per distinct outdoor/balcony location; indoor/greenhouse: none) [Unit 2]
  └─ moistureForPlant(plant, careProfile, feedback, now, weather?) → MoistureCardState  [Unit 5]
        └─ buildMoistureInputs → climate resolver (series for outdoor, constant for indoor)
                               → dailyRainMm (series, only when rain_exposed)         [Unit 3]
        └─ estimateMoisture → recommendWatering(pct, { band, targetFraction, capacityMl })  [Unit 1]
  → detail: prompt-per-kind; ready ⇒ insight + hero gauge + "Add about X" (units-formatted)
  → dashboard: badge only when kind === 'ready'
```

## Privacy & export

- **`rain_exposed` is excluded from public exports**, consistent with the existing precedent: plant-level environmental fields (`placement_type`, `substrate_type`, `light_level`) are already excluded by not being selected into `SourcePlant` / `PUBLIC_EXPORT_FIELDS` in `scripts/export/transform.ts`. `rain_exposed` is coarse environmental context (not occupancy- or location-revealing), but there is no demonstrated research need yet, so v1 excludes it by the same mechanism (don't select it; not in `PUBLIC_EXPORT_FIELDS`). A guard test locks this in.
- **No new exact-location exposure.** Outdoor weather uses the plant's existing coarse location (per ADR-007, browser-direct Open-Meteo); the daily series is transient model input, never persisted to a public row. Update `docs/privacy.md` with the new field + the weather-series note.

## Testing

Pure-engine and logic tests (extend `tests/lib/*`, `tests/export/*`, `tests/appwrite/*`):

- **Amount (Unit 1):** per-band target math (`dry .40 / moist .60 / wet .80`); `targetFraction`/`currentFraction` clamped to `[0,1]`; **engine** omits the field only on raw `<= 0` and when `status !== 'water_now'`; absent when `targetFraction` not supplied (i.e. `!bandSourced`); **formatter** suppresses a zero-after-rounding amount independently per unit (a raw ml that shows in ml but rounds to 0 fl oz, and vice-versa); ml↔fl oz round-trip.
- **Weather series (Unit 2):** archive+forecast merge; **forecast overrides archive for overlapping ISO dates**; fetch failure / missing field ⇒ `null`.
- **Rainfall (Unit 3):** rain adds the correct ml for a given mm + pot diameter; capped at `C`; not-exposed (no `dailyRainMm`) ⇒ unchanged; **proportional day-order encoded in test name** ("rain accrues proportionally; a midday watering sees only the earlier fraction's rain") with both a whole-day case and an **intra-day-event** case; no-rain reproduces the current simulation exactly.
- **Card state (Unit 5):** `moistureForPlant` returns each `MoistureCardState` kind distinctly — `needs_pot` vs `needs_location` vs `weather_loading` vs `weather_unavailable` vs `ready`; **`weather_loading` is returned before the series resolves and is not the same as `weather_unavailable`** (the flash-prevention guarantee); outdoor plant uses series temp/RH; rain wired only when `rain_exposed`; greenhouse uses the seasonal constant with no `weather`; `shouldPromptForPotSize` now true for outdoor/balcony.
- **Shared series / dashboard (Unit 5):** the cache keys by `(coords, window)` so two plants at one location trigger a single fetch; the dashboard shows a badge only for `ready` and hides it for every other kind.
- **Migration (Unit 4):** an existing outdoor plant with `rain_exposed === null` is treated as not-exposed by the engine and flagged for the backfill nudge; the form requires a Yes/No before saving an outdoor/balcony plant; indoor/greenhouse save writes `null`.
- **Schema/privacy:** `rain_exposed` present in the schema test and `docs/schema.md`; **export guard** asserts `rain_exposed` is absent from `PUBLIC_EXPORT_FIELDS` and never appears in `toPublicRow` output.
- **Live preview:** an outdoor plant with pot + location shows the gauge/insight (after a brief load, no wrong-prompt flash); a rainy day in the series visibly raises the estimate; the `water_now` amount renders in both unit systems and both themes.

## Risks & decisions

- **Outdoor microclimate variance** — higher than indoor, but the model is proven indoors and ground-truth checks still correct per-plant. Accepted.
- **Throughfall is a fixed estimate** — `0.8` internal constant; pots under partial cover are handled by the `rain_exposed=false` switch, not by tuning the constant. Revisit only with data.
- **Async in the read path** — the weather fetch is the one new I/O. It lives in a shared `useWeatherSeries` hook / `(coords, window)` cache used by **both** the detail screen and the dashboard, is deduped per location, and fails closed, so `moistureForPlant` and its tests stay pure and synchronous.
- **Dashboard fetch cost** — a dashboard with outdoor plants across several locations triggers one 60-day Open-Meteo fetch per *distinct* location (not per plant); same-home plants collapse to one. Acceptable for v1 (free, cached); revisit with batching only if users routinely have many distinct outdoor locations.
- **Card states must not flash** — outdoor cards can be `needs_pot` / `needs_location` / `weather_loading` / `weather_unavailable`; the UI must show `weather_loading` (not `weather_unavailable`) until the series resolves, and must not conflate a missing location with a missing pot.

## Resolved decisions

- Watering-amount target is **species-driven** (`dry .40 / moist .60 / wet .80`), gated on a **sourced** mined moisture band. Zero handling is **two-layer**: engine omits only raw `<= 0`; the display formatter suppresses zero-after-rounding (per unit).
- Outdoor v1 **includes rainfall**; rain exposure is captured by an **explicit onboarding question** for outdoor/balcony (no default, required to save), stored as a real boolean (vs `null` = not applicable for indoor/greenhouse). Existing `null` rows are not-exposed + nudged; first edit backfills.
- Weather series merges **forecast over archive** for overlapping dates.
- `THROUGHFALL` is an **internal constant**; rain accrues **proportionally across the day** (added before ET within each sub-step), with an intra-day-event test.
- Moisture read returns a **`MoistureCardState`** discriminating `ready` / `needs_pot` / `needs_location` / `weather_loading` / `weather_unavailable`, so the UI never flashes the wrong prompt; a **shared `(coords, window)` series cache** serves both the detail screen and the dashboard with one fetch per location.
- `rain_exposed` is **excluded from public export**, consistent with the other plant-level environmental fields; locked by a guard test.
- Sequencing: **Unit 1 first (independent), then Units 2–5.**
