# Water-Balance Moisture Inference (Indoor v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Infer an **indoor** potted plant's soil moisture and give an honest watering recommendation — physics prior (pot + seasonal indoor climate + logged water) on an internal capacity-fraction scale, corrected by behavior-independent ground truth (soil checks, meter logs, post-check estimate feedback). No watering-frequency or health calibration; no outdoor/rainfall (deferred).

**Architecture:** Pure engine `src/lib/moisture.ts` consumes pot spec + timeline + species moisture prior → `{ moisturePercent, confidence, recommendation }`. `plants` gains pot columns; `measurements` gains `soil_state`; a **private `moisture_feedback`** table holds model telemetry (never exported). Thin glue assembles inputs in `PlantScreen` from the already-loaded table-backed care profile; UI captures pot + feedback and renders an `EXPERIMENTAL` insight + hero gauge.

**Tech Stack:** TypeScript, React 19, Vite, Appwrite TablesDB, Vitest. Spec: `docs/superpowers/specs/2026-06-14-water-balance-moisture-inference-design.md`.

**Gate (after each task):** `node ./node_modules/vitest/vitest.mjs run` · `node ./node_modules/eslint/bin/eslint.js .` · `node ./node_modules/typescript/bin/tsc -b`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `appwrite/schema.ts` | `plants` pot columns; `measurements.soil_state`; new `moisture_feedback` table | Modify |
| `src/lib/types.ts` | `Plant` pot fields; `Measurement.soil_state`; `MoistureFeedback`; enums | Modify |
| `src/lib/log.ts` | `LogInput.measurement.soil_state` | Modify |
| `src/lib/moisture.ts` | **Pure engine** | Create |
| `src/lib/repo.ts` | `PlantInput` pot fields; `createMoistureFeedback`; `moistureForPlant` glue | Modify |
| `scripts/export/transform.ts` | (no change) — verified `moisture_feedback` is not an exportable type | Verify + test |
| `src/features/plants/PlantForm.tsx` | Pot capture + disclosure | Modify |
| `src/features/timeline/LogSheet.tsx` | Repot updates pot; water-amount "unknown" default; Check-soil | Modify |
| `src/features/timeline/PlantScreen.tsx` | moisture insight + hero gauge + feedback tap | Modify |
| `tests/lib/moisture.test.ts`, `tests/lib/moisture-inputs.test.ts`, `tests/export/*` | Tests | Create/Modify |

---

## Phase 1 — Data model

### Task 1: Pot columns on `plants`
**Files:** `appwrite/schema.ts` (plants columns), `src/lib/types.ts`, `src/lib/repo.ts` (`PlantInput`).

- [ ] **Step 1:** Add to the `plants` table columns:
```ts
      { kind: 'float', key: 'pot_diameter_cm', min: 1, max: 200 },
      { kind: 'float', key: 'pot_height_cm', min: 1, max: 200 },
      { kind: 'enum', key: 'substrate_type',
        elements: ['standard', 'succulent_gritty', 'chunky_aroid', 'peat_seedling'] },
      { kind: 'boolean', key: 'pot_drains' },
      { kind: 'enum', key: 'light_level', elements: ['low', 'medium', 'bright', 'direct_sun'] },
```
> **No DB defaults on `substrate_type`/`pot_drains`** (they stay nullable = "unknown"). The engine applies its own defaults (`standard`, `drains=true`) when null, but confidence only counts them as *present* when the stored value is non-null — so an Appwrite default can't masquerade as user-provided data (review P1).

- [ ] **Step 2:** Types in `types.ts`: `SubstrateType`, `LightLevel`, and the five optional fields on `Plant`. Mirror on `PlantInput` in `repo.ts`.
- [ ] **Step 3:** Update `docs/schema.md` (plants columns). Apply schema (the schema-sync script in `package.json`, run via `node ./node_modules/tsx/dist/cli.mjs <script>`), run gate. **Commit** — `feat(moisture): add pot columns to plants`.

### Task 2: `soil_state` on `measurements`
**Files:** `appwrite/schema.ts`, `src/lib/types.ts`, `src/lib/log.ts`.

- [ ] **Step 1:** Add `{ kind: 'enum', key: 'soil_state', elements: ['dry', 'moist', 'wet'] }` to the `measurements` table.
- [ ] **Step 2:** `SoilState` type + `Measurement.soil_state?`; add `soil_state?` to `LogInput.measurement` (`buildLogPayload` already passes through defined fields — confirm).
- [ ] **Step 3:** Update `docs/schema.md` (measurements columns). Apply schema, gate. **Commit** — `feat(moisture): add soil_state to measurements`.

### Task 3: Private `moisture_feedback` table (telemetry)
**Files:** `appwrite/schema.ts` (new table), `src/lib/types.ts`, `src/lib/repo.ts`, `tests/export/`.

- [ ] **Step 1: Failing export-guard test** in `tests/export/` (mirror existing export tests): construct an observation graph and assert nothing shaped like moisture feedback can be produced by `toPublicRow`; and assert `EXPORTABLE_TYPES` does not contain a feedback type. (Codifies that telemetry can never export.)
- [ ] **Step 2:** Add the table to `appwrite/schema.ts` (owner-scoped, `rowSecurity: true`, `permissions: ['create:users']`):
```ts
  {
    id: 'moisture_feedback',
    name: 'Moisture feedback',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      { kind: 'relationship', key: 'plant_id', relatedTableId: 'plants',
        relationType: 'manyToOne', twoWay: true, twoWayKey: 'moisture_feedback', onDelete: 'cascade' },
      { kind: 'datetime', key: 'observed_at', required: true },
      { kind: 'enum', key: 'estimate_feedback', elements: ['wetter', 'drier', 'correct'], required: true },
      { kind: 'integer', key: 'magnitude', min: 1, max: 5 },
      { kind: 'float', key: 'predicted_moisture_percent', min: 0, max: 100 },
    ],
    indexes: [{ key: 'idx_user_id', type: 'key', columns: ['user_id'] }],
  },
```
> **Two-way relation** (`twoWayKey: 'moisture_feedback'`) so the rows are reachable via the plant in a nested `select` — Appwrite relationship columns can't be filtered directly, and the timeline read works by selecting nested relations (review P1). The read is wired in Task 16.

- [ ] **Step 3:** `MoistureFeedback` type + `createMoistureFeedback(userId, input)` in `repo.ts` (owner permissions, like `createLog`). It is **not** an observation, so it is outside `EXPORTABLE_TYPES` by construction.
- [ ] **Step 4: Update the hard-coded schema tests** — add `'moisture_feedback'` to `REQUIRED_TABLES` and the `privateTables` list in `tests/appwrite/schema.test.ts` (the `defines all Phase 0 tables` assertion is exact-equality, so it fails otherwise). The `user_id required` test already covers it (it has `user_id`).
- [ ] **Step 5: Update docs** (AGENTS.md mandates): `docs/schema.md` (new table + relationship), `docs/privacy.md` (private telemetry table, never exported; `soil_state` is an exportable observation), and a short entry in `docs/architecture_decisions.md` (telemetry split from observations; internal capacity-fraction scale).
- [ ] **Step 6:** Apply schema, run the export-guard + schema tests (PASS) + gate. **Commit** — `feat(moisture): private moisture_feedback table (never exported)`.

---

## Phase 2 — Moisture engine (`src/lib/moisture.ts`, pure)

Test file `tests/lib/moisture.test.ts`; run one file: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture.test.ts`.

### Task 4: Geometry + capacity
- [ ] **Step 1: Failing test:**
```ts
import { describe, expect, it } from 'vitest';
import { potSoilVolumeMl, waterCapacityMl } from '../../src/lib/moisture';
describe('pot geometry', () => {
  it('volume of a 12×10 cm pot is ~960 ml', () => {
    expect(potSoilVolumeMl(12, 10)).toBeGreaterThan(900);
    expect(potSoilVolumeMl(12, 10)).toBeLessThan(1000);
  });
  it('capacity ranks by substrate and rises for a sealed pot', () => {
    const p = { diameterCm: 12, heightCm: 10 } as const;
    const std = waterCapacityMl({ ...p, substrate: 'standard', drains: true });
    expect(std).toBeGreaterThan(waterCapacityMl({ ...p, substrate: 'succulent_gritty', drains: true }));
    expect(waterCapacityMl({ ...p, substrate: 'standard', drains: false })).toBeGreaterThan(std);
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `PotSpec`, `SubstrateType`, `FIELD_CAPACITY`, `potSoilVolumeMl`, `waterCapacityMl` (as in the spec §B.1–2: `π·(d/2)²·h·0.85`; `C = V·θ_fc`, sealed ×1.15).
- [ ] **Step 4: PASS. Commit** — `feat(moisture): pot geometry + capacity`.

### Task 5: Seasonal indoor climate
- [ ] **Step 1: Failing test:** `seasonalIndoorTempC('2026-07-15','north')===25`, `'2026-01-15','north'===23`, southern inverted.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `Hemisphere`, `seasonalIndoorTempC` (May–Oct = northern summer → 25 else 23; south inverted), `INDOOR_DEFAULT_RH = 45`.
- [ ] **Step 4: PASS. Commit** — `feat(moisture): seasonal indoor climate`.

### Task 6: Daily ET
- [ ] **Step 1: Failing test** — monotonic in temp, dryness, light; positive.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `LightLevel`, `LIGHT_FACTOR`, `EtInputs`, `dailyEtMl` (spec §B.3: `base = C·speciesDailyFraction`; `f_temp = clamp(1+(T−20)·0.04, .3, 2.5)`; `f_rh = clamp(1+(50−RH)·0.01, .4, 1.8)`).
- [ ] **Step 4: PASS. Commit** — `feat(moisture): evapotranspiration`.

### Task 7: Water-balance simulation (indoor; with repot boundary + corrections)
- [ ] **Step 1: Failing test** — conservation (≤ C; ≥ residual), dry-down over time, a correction overrides forward, the **repot boundary resets** the start (repot later than last watering ⇒ simulation begins there), and the **initial-water rule**: a repot boundary with **no watering logged at/after it** seeds `W` at the moist default (`0.5·C`) and returns `lowConfidenceStart: true`; a watering at/after the boundary overrides that. No rainfall in v1.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `simulateWaterContent(input)` per spec §B.4: start at `boundaryMs = max(windowStart, lastWatering, lastRepot)`. **Seed `W`:** if a watering is logged at/after `boundaryMs`, start dry (it sets `W`); else if the boundary is a repot with no following watering, seed `W = 0.5·C` and flag `lowConfidenceStart` (fresh substrate, moisture unknown); else seed at residual. Then iterate days: add waterings; cap+drain; subtract `dailyEtMl`; floor at residual; apply `corrections` (override `W`). `SimInput`: `pot, startMs, endMs, waterings, dailyClimate(iso)→DayClimate, speciesDailyFraction, canopyFactor, corrections, repotBoundaryMs?`. `SimResult` adds `lowConfidenceStart: boolean`. (No `dailyRainMm` in v1 — extension point in the deferred appendix.)
- [ ] **Step 4: PASS. Commit** — `feat(moisture): water-balance simulation`.

### Task 8: Anchors, estimate, confidence
- [ ] **Step 1: Failing test** — `moisturePercent` in 0–100; confidence rises with substrate set + ground-truth count + a **measured** water amount (a placeholder/unknown amount must NOT raise it).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement:**
```ts
export const ANCHORS = { dry: 0.15, moist: 0.5, wet: 0.85 } as const; // fraction of C
export type Confidence = 'low' | 'medium' | 'high';
export interface EstimateInput extends SimInput {
  substratePresent: boolean; // stored substrate_type is non-null (not an Appwrite default)
  amountMeasured: boolean;   // user entered an amount, not a placeholder
  groundTruthCount: number;  // corrections in the recent window
}
export interface MoistureEstimate { moisturePercent: number; confidence: Confidence; capacityMl: number; }
// score = substratePresent + amountMeasured + min(groundTruthCount,3); high≥4, med≥2.
// A `lowConfidenceStart` simulation (repot with unknown moisture) caps confidence at 'medium'.
export function estimateMoisture(input: EstimateInput): MoistureEstimate { /* ... */ }
```
- [ ] **Step 4: PASS. Commit** — `feat(moisture): estimate + confidence`.

### Task 9: Recommendation (anchored thresholds + species prior)
- [ ] **Step 1: Failing test** — on the **internal scale**: `water_now` at/below the Dry anchor (15%), `drying` just above, `comfortable` mid, `overwatered` near/above Wet (85%). The species prior (`MoistureBand`) only adjusts wording/`speciesDailyFraction`, not the raw threshold.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `recommendWatering(moisturePercent, opts)` → `{ status }` using `ANCHORS` (×100) as thresholds; accept an optional species-prior descriptor for phrasing. Optionally a predicted-dry-date by projecting `dailyEtMl` forward to the Dry anchor (test: hotter ⇒ sooner).
- [ ] **Step 4: PASS. Commit** — `feat(moisture): watering recommendation`.

---

## Phase 3 — Read integration

### Task 10: Build engine inputs from a plant (pure)
**Files:** `src/lib/moisture-inputs.ts` (new pure module) + `tests/lib/moisture-inputs.test.ts`.

- [ ] **Step 1: Failing test** — given a `Plant` (pot fields) + `observations` (waterings with/without `amount_value`; a `soil_state` measurement; a meter `soil_moisture_percent`) + `moistureFeedback` rows + a `SpeciesCareProfile` → produces `EstimateInput`:
  - **waterings** with `amountMeasured` per event (`amount_value` non-null = measured);
  - **corrections**: soil-check → `ANCHORS`·C; estimate-feedback → `predicted ± m·step`; **meter → qualitative bucket** (`<30%`→dry, `30–70%`→moist, `>70%`→wet anchor), *not* `pct/100·C` — a meter reading is an approximate qualitative anchor in v1 (consistent with the scale fix; a true learned device→capacity mapping is deferred);
  - **`speciesDailyFraction`** from `careProfile.cultivationFacts.find(c => c.attribute === 'water_requirement')` (Permapeople: Dry/Moist/Wet → 0.08/0.12/0.18, default 0.12 when absent);
  - **`band`** from `careProfile.communityRanges.find(r => r.attribute === 'soil_moisture_percent')`;
  - indoor `dailyClimate` resolver, `repotBoundaryMs` (latest `repotting` `observed_at`), `groundTruthCount`, `substratePresent` (stored substrate non-null), `amountMeasured`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** the pure builder. Climate resolver: `tempC = seasonalIndoorTempC(iso, hemisphere)`, `humidityPct = INDOOR_DEFAULT_RH`, `light = plant.light_level ?? 'medium'`. (Indoor/greenhouse only; caller guarantees indoor.) Engine capacity defaults: `substrate ?? 'standard'`, `drains ?? true`.
- [ ] **Step 4: PASS. Commit** — `feat(moisture): build engine inputs from a plant`.

### Task 11: `moistureForPlant` entry point
**Files:** `src/lib/repo.ts` or a thin `src/lib/moisture-read.ts`.

- [ ] **Step 1: Failing test** — hydrated indoor plant + its `SpeciesCareProfile` + `moistureFeedback[]` → `{ moisturePercent, confidence, recommendation }`. Returns `null` when pot size is missing OR placement is outdoor/balcony (deferred) so the UI hides.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `moistureForPlant(plant, careProfile, feedback, now)`: guard pot + indoor; band ← `careProfile.communityRanges?.find(r => r.attribute==='soil_moisture_percent')` (bundled fallback → default band + reduced confidence); call builder + `estimateMoisture` + `recommendWatering`.
- [ ] **Step 4: PASS. Commit** — `feat(moisture): moistureForPlant read entry point`.

---

## Phase 4 — Capture UI

### Task 12: Pot fields in `PlantForm`
- [ ] **Step 1:** Add a "Pot" group (diameter + height, friendly defaults as *placeholders* not values) + "Improve accuracy" disclosure (substrate `select`, drainage toggle, light `select`) to **both** theme branches; wire into `save(...)`.
- [ ] **Step 2:** Gate + preview (add a plant with a pot; reopen edit shows values). **Commit** — `feat(moisture): capture pot details in the plant form`.

### Task 13: Repot updates pot + water-amount "unknown" default
- [ ] **Step 1:** In `LogSheet.tsx`: (a) the `repotting` treatment gains optional new diameter/height; on submit also `updatePlant(plantId, { pot_diameter_cm, pot_height_cm, substrate_type? })`. (b) **Fix false-confidence:** ensure the water-amount field's state starts **empty** (250 stays a placeholder only), so an empty amount persists as `amount_value: null` (unknown) and a present value means the user actually entered it. Confirm `water-amount.ts`/state init; adjust if it pre-fills.
- [ ] **Step 2:** Gate + preview (repot updates pot; logging water without touching the field stores null). **Commit** — `feat(moisture): repot updates pot; water amount defaults to unknown`.

---

## Phase 5 — Ground-truth feedback UI

### Task 14: "Check soil" quick action
- [ ] **Step 1:** A "Check soil" action on the plant screen → Dry / Moist / Wet → `createLog` measurement with `soil_state` (one tap; no other field needed).
- [ ] **Step 2:** Gate + preview (soil check appears in timeline). **Commit** — `feat(moisture): soil-check quick action`.

### Task 15: Post-check estimate feedback
- [ ] **Step 1:** On the recommendation (Task 16), render the **post-check** prompt: "Checked the soil? Tell us: Wetter / Spot-on / Drier"; wetter/drier reveal a 1–5 magnitude. On submit → `createMoistureFeedback({ plantId, estimate_feedback, magnitude, predicted_moisture_percent: <shown %> })` (private table, Task 3).
- [ ] **Step 2:** Gate + preview. **Commit** — `feat(moisture): post-check estimate feedback`.

---

## Phase 6 — Surfacing

### Task 16: Moisture insight
**Files:** pure `moistureInsight(...)` (in `src/lib/moisture.ts` or `insights.ts`); render in `PlantScreen.tsx`.

- [ ] **Step 1: Failing test** (pure): `MoistureEstimate` + `Recommendation` + species name → an `Insight` (`kind:'soil_moisture'`; severity `water_now`/`overwatered`→`warning`, `drying`→`suggestion`, else `info`; detail names the status + an approximate % + the species prior; one enrichment nudge for low confidence).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** the pure builder; render it in `PlantScreen` from the **already-loaded table-backed `careProfile`** + `moistureForPlant`, labeled `EXPERIMENTAL`, coexisting with `plantInsights` and the knowledge layers; attach the Task 15 feedback tap. **Load `moisture_feedback` via the timeline read:** add `'moisture_feedback.*'` to the `Query.select([...])` in `getPlantWithTimeline` (`src/lib/repo.ts`, the existing nested select) — reachable now that the relation is two-way (Task 3) — and pass the rows into `moistureForPlant`.
- [ ] **Step 4: PASS + preview. Commit** — `feat(moisture): experimental soil-moisture insight`.

### Task 17: Hero moisture gauge
- [ ] **Step 1:** Add a `MOISTURE` stat to the hero row (beside `WATERED`/`CADENCE`): approximate % + status color (comfortable/drying/water_now/overwatered), hidden when `moistureForPlant` is `null`.
- [ ] **Step 2:** Gate + preview (screenshot). **Commit** — `feat(moisture): hero moisture gauge`.

---

## Deferred to v1.1 (not in this plan)

Build only after the indoor core is proven:
- **Outdoor / balcony:** a daily temp/RH series across the window (extend `openmeteo.ts` with a range fetch); engine `dailyClimate` resolver switches to it for outdoor placements.
- **Rainfall:** `rain_exposed` column; `precipitation_sum` in the daily fetch; engine `simulateWaterContent` gains a `dailyRainMm` input adding `precip_mm · potTopAreaCm² · 0.1 · throughfall` (capped at C). (Engine signature extension point in Task 7.)
- **Health-symptom calibration:** only once the base model is trustworthy; needs the health_score 1–10 vs /5 display mismatch resolved first (pre-existing bug, `docs/schema.md:159` vs `PlantScreen.tsx:87`).
- Suggested watering **amount**; predicted-dry **push notifications**.

---

## Self-Review (completed)
- **Spec coverage:** pot model + repot boundary (T1,T12,T13) · `soil_state` observation (T2) · private telemetry table + export guard (T3) · pure engine on internal scale (T4–T9) · indoor seasonal climate (T5,T10) · anchored thresholds + species prior (T8,T9) · ground truth meter/soil-check/post-check feedback, NO health/frequency (T10,T14,T15) · measured-vs-unknown amount (T8,T13) · explicit table-backed band path (T11,T16) · insight + gauge (T16,T17). Outdoor/rain/health explicitly deferred.
- **Review findings (round 1):** P1 scale → internal capacity-fraction + anchors (T8,T9); P1 repot → boundary not history (T7,T13); P1 band path → T11/T16 from `careProfile`; P2 privacy → private table + guard test (T3); P2 independence → post-check framing + magnitude math, health dropped (T10,T15); P2 daily weather → indoor-only (deferred outdoor); P2 amount confidence → measured flag (T8,T13).
- **Review findings (round 2):** P1 feedback read path → two-way relation + nested select (T3,T16); P1 docs/schema-tests → `schema.test.ts` table+private lists, `docs/schema.md`/`privacy.md`/`architecture_decisions.md` (T1,T2,T3); P1 Appwrite defaults vs confidence → drop `substrate_type`/`pot_drains` DB defaults, engine-side defaults, `substratePresent` = stored non-null (T1,T8,T10); P2 repot initial water → moist-default + `lowConfidenceStart` (T7); P2 meter scale → qualitative bucketing not `pct/100·C` (T10, spec §scale); P2 species prior → extract `water_requirement` from `cultivationFacts` (T10).
- **Types:** `PotSpec`/`SubstrateType`/`LightLevel`/`DayClimate`/`SimInput`/`EstimateInput`/`ANCHORS`/`Confidence`/`MoistureBand`/`MoistureFeedback`/`Insight` consistent across tasks.

## Execution Handoff
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline** — execute here with checkpoints.

Build order: **Phase 1 → 2 → 3 → 4 → 5 → 6.**
