# Water-Balance Moisture Inference — Design

**Status:** Revised after code review · 2026-06-14
**Roadmap:** Phase 4 (care intelligence), follows the Open Plant Knowledge Layer (Phase 4A, PR #10/#11).
**Related:** `docs/knowledge-layer.md` (mined `soil_moisture_percent` band feeds this), `src/lib/insights.ts` (existing deterministic insights this coexists with), `scripts/export/transform.ts` (export boundary — see Privacy).

## Goal

Estimate a potted **indoor** plant's soil moisture and turn it into an honest **watering recommendation** ("likely drying — near this species' dry side; check soon" → "water now"), for the common case where the user has **no moisture meter**. The estimate is a physics prior (pot size + seasonal indoor climate + logged water) corrected by **behavior-independent ground truth** (a soil check, optional meter logs, estimate feedback) — explicitly *not* by how often the user waters, and *not* by plant-health symptoms (a self-confirming loop, deferred).

## Scope (tightened after review)

**v1 — indoor only.** Indoor (and greenhouse) plants use a low-variance **seasonal climate default** (~23 °C winter / 25 °C summer), so no per-day weather fetch is needed — which is exactly why the indoor case is the honest place to prove the model.

**Deferred to v1.1+ (each needs the core model proven first):**
- **Outdoor / balcony plants** — their evapotranspiration needs a *daily* temp/RH series across the dry-down window, but `environment_snapshots` are created only at log time (sparse). Requires a daily-weather series fetch.
- **Rainfall ingestion** — depends on the outdoor daily series; rain is an unlogged watering that would otherwise skew outdoor estimates. (Toggle + model designed for, but not built in v1.)
- **Health-symptom calibration** — using inferred moisture to explain ambiguous plant stress is a self-confirming loop; too risky until the base model is trustworthy.
- Suggested watering **amount** (ml); predicted-dry **push notifications**.

## Why physics-first, not watering-rhythm, not health

A tempting calibrator is the user's watering interval — rejected: if the model learns the dry-down rate from how often the user waters, and the user waters because the model told them to, that closed loop amplifies their existing bias with no ground truth. **Health symptoms are rejected for v1 for the same reason** (attributing ambiguous stress to moisture using our own moisture estimate is circular). Calibration must come from signals that reflect actual soil state, independent of behavior and of our own output.

## Architecture (units)

| Unit | Responsibility | Purity |
| --- | --- | --- |
| **A. Pot & repot data model** | Pot dimensions + optional substrate/drainage/light on a plant; repotting marks a simulation boundary. | Schema + repo glue |
| **B. Moisture engine** (`src/lib/moisture.ts`) | Pure: soil volume, capacity, seasonal indoor climate, daily ET, water-balance simulation, internal moisture estimate + confidence, qualitative recommendation. | **Pure, fully unit-tested** |
| **C. Ground-truth feedback** | Soil check (Dry/Moist/Wet, an observation) + estimate feedback (telemetry, private) calibrating B. | Schema + small UI |
| **D. Recommendation + surfacing** | Map estimate → recommendation using species band as a prior; render insight (build first) + hero gauge. | Pure rec logic + UI |

B is pure/deterministic so it is testable without a backend.

## A. Pot & repot data model

New columns on `plants` (nullable; only pot size is *encouraged* at creation):
- `pot_diameter_cm: float`, `pot_height_cm: float` — top inner diameter + soil depth.
- `substrate_type: enum` — `standard` | `succulent_gritty` | `chunky_aroid` | `peat_seedling` (default `standard`).
- `pot_drains: boolean` (default `true`).
- `light_level: enum` — `low` | `medium` | `bright` | `direct_sun` (optional).

*(`rain_exposed` is deferred with outdoor support.)*

**Repot = a simulation boundary, not a history table.** Current pot lives on the plant. A `repotting` treatment's `observed_at` marks where the simulation restarts (fresh pot, from that date forward) with the *current* pot geometry; on repot the form updates the plant's pot columns. Because estimates are **recomputed on read** (no stored estimate), backdated or deleted repot logs need no invalidation rules — the next read simply uses the new inputs. No pot-history table in v1 (YAGNI); old geometry is not reconstructed.

**Capture UX:** `PlantForm` gains a "Pot" group — diameter + height (friendly default), and a collapsible "Improve accuracy" disclosure for substrate / drainage / light.

## B. Moisture engine

Units: ml, °C, days. Per plant, from its timeline.

1. **Soil volume** `V ≈ π·(d/2)²·h·0.85` (cm³ = ml; 0.85 = taper + root/headspace).
2. **Capacity** `C = V · θ_fc`; `θ_fc`: `standard 0.35`, `peat_seedling 0.45`, `succulent_gritty 0.20`, `chunky_aroid 0.18`. Non-draining ×1.15.
3. **Daily ET** `= base · f_temp(T) · f_rh(RH) · f_light(L) · f_size`, `base = C · speciesDailyFraction`. **Climate (v1):** indoor seasonal default — `seasonalIndoorTempC(date, hemisphere)` (23/25 °C), `INDOOR_DEFAULT_RH ≈ 45%`, light from `light_level` (default `medium`). Hemisphere from the user's location; none → northern.
4. **Water-balance simulation** from the latest of {window start, last watering, **last repot**}:
   - Watering event: `W += amount` (or, if unknown, default pour `0.4·C` flagged low-confidence). Cap at `C`; excess drains.
   - Daily: `W -= ET(day)`, floored at residual `0.05·C`.
   - Ground-truth corrections (below) override `W` forward at their timestamps.

### Moisture scale & thresholds (resolving the units mismatch)

The engine's **`moisture% = W / C`** is an **internal, relative scale**: percent of the pot's *modeled field capacity* (~5–100%). This is **not** the same quantity as a capacitive sensor reading or OpenPlantbook's `soil_moisture_percent` (`min_soil_moist`/`max_soil_moist`, device-relative) — those are uncalibrated to our capacity model. We therefore **never compare them as equal numbers**. Instead:

- **Thresholds live on the internal scale, anchored by the qualitative soil checks.** Dry/Moist/Wet ↔ internal capacity bands (`Dry ≈ 0.15·C`, `Moist ≈ 0.5·C`, `Wet ≈ 0.85·C`). `water_now` triggers as the estimate approaches the Dry anchor; `overwatered` near/above Wet. These anchors calibrate per-plant from the user's actual Dry/Moist/Wet observations.
- **The mined `soil_moisture_percent` band is a coarse prior** — it nudges the species' default `speciesDailyFraction` and phrases guidance ("likes it on the drier/wetter side"), and is **not** a direct numeric threshold against the internal scale.
- **Meter logs are approximate qualitative anchors, not direct percentages.** In v1 a logged sensor reading is bucketed (`<30%`→Dry, `30–70%`→Moist, `>70%`→Wet) onto the same capacity anchors as a soil check — never read as `pct = capacity%`. A true *learned* device→capacity mapping (from repeated readings) is deferred until the base model is proven.

The recommendation is **qualitative first** (comfortable / drying / water-now / overwatered); the internal percent is shown only as an approximate, confidence-tagged figure.

### Ground-truth calibration (behavior-independent; v1 set)

These correct the simulation; watering frequency and health symptoms do **not**.
- **Soil check** (Dry/Moist/Wet): sets observed `W` to the matching anchor band; multiple checks calibrate the dry-down rate so the model's predicted "Dry" matches when the user actually finds it dry. The no-meter anchor.
- **Estimate feedback** (telemetry; see Unit C): **wetter / drier / spot-on** *after the user checks the soil*, with a **1–5 magnitude**. Maps to observed `W = predicted ± m·step`, where `step = (0.85−0.15)·C / 5` (each step ≈ 14 % of the Dry→Wet span). `spot-on` ⇒ observed = predicted. Stored with `predicted_moisture_percent` so the signed, sized error is recoverable.
- **Meter log** (`soil_moisture_percent`): bucketed to a qualitative anchor (above). Useful but rare; treated as approximate in v1.

### Confidence

Low/Med/High from inputs *actually* present: pot size, substrate set, ground-truth count in the recent window, and **a user-measured water amount** — where "measured" means the user entered an amount, **not** an accepted placeholder (the form must not pre-fill a default that counts as measured). Each missing item widens the band and yields one concrete enrichment nudge.

## C. Ground-truth feedback (no meter required)

Privacy split (measurements are exportable — `transform.ts` `EXPORTABLE_TYPES` includes `measurement`):
- **`soil_state: enum(dry|moist|wet)` on `measurements`** — a genuine soil observation (like `soil_moisture_percent`); may be exported when consented. Captured via a "Check soil" quick action.
- **A new private `moisture_feedback` table** — `user_id`, `plant_id`, `observed_at`, `estimate_feedback (wetter|drier|correct)`, `magnitude (1..5)`, `predicted_moisture_percent`. This is **model telemetry, not a plant observation**, so it is owner-scoped and **never exported** (it is not an observation type, so `EXPORTABLE_TYPES` excludes it by construction — locked by an export-exclusion test).

**Prompts:** the recommendation insight carries an inline **"Check the soil, then: wetter / spot-on / drier (+ how much)"** — feedback is framed as *post-check*, so it stays independent ground truth, not a guess anchored to our number. The plant screen also has a standalone "Check soil" Dry/Moist/Wet action.

## D. Recommendation + surfacing

- **Recommendation (pure):** map the internal estimate to a status (`comfortable` | `drying` | `water_now` | `overwatered`) via the anchored thresholds; phrase with the species prior. Never overrides a directly logged measurement.
- **Data path (explicit):** computed in `PlantScreen` from the **already-loaded table-backed `careProfile`** (`tableProfile`), reading `communityRanges` filtered to `soil_moisture_percent` for the species prior — *not* inside `plantInsights` (which only receives `plant, now, units`). Bundled-fallback profiles have no mined band → those plants use the default species prior at reduced confidence.
- **Insight (build first):** a new `EXPERIMENTAL` insight, coexisting with `plantInsights` and the three knowledge layers (never replacing them); carries the confidence chip, one enrichment nudge, and the post-check feedback tap.
- **Gauge (fast-follow):** a `MOISTURE` dial in the hero stat row beside `WATERED`/`CADENCE`, color-coded to status.

## Risks & decisions

- **Internal vs sensor scale** — engine % is capacity-fraction, anchored by qualitative checks; mined band is a prior; meter is a learned anchor. No raw cross-scale comparison. (Resolves review P1.)
- **Indoor microclimate is modeled, not sensed** — accepted; the seasonal default is low-variance and ground-truth checks correct per-plant.
- **No feedback loops** — watering frequency is a weak sanity check only; health-symptom calibration is deferred; estimate feedback is post-check.
- **Privacy** — pot fields + `soil_state` live on owner-scoped rows; `soil_state` may export anonymized. Model telemetry (`moisture_feedback`) is a separate private table, never exported, with a guard test. No new third-party calls in v1 (indoor uses the seasonal default; no weather fetch).
- **Cold-start** — pot size only, no ground truth → physics-only at Low confidence; UI nudges the first soil check.

## Testing

- **Unit B** is pure → exhaustive tests: volume/capacity; ET monotonicity (hotter/drier/brighter ⇒ faster); simulation conservation (≤ C, ≥ residual) and repot-boundary reset; each ground-truth correction (meter anchor, soil-check band, signed+sized estimate feedback); confidence tiers (incl. "measured amount" vs placeholder); recommendation thresholds vs the internal anchors with a species prior. Fixture: basil (mined band `15–60%` as the prior).
- **Privacy guard:** a test asserting `moisture_feedback` rows never appear in `toPublicRow`/export output.
- **Repo/UI glue** stays thin; verified by the gate + a preview pass (indoor plant: add pot, log a soil check, give post-check feedback, see insight + gauge update).

## Resolved decisions

- v1 is **indoor-only**; outdoor + rainfall + health-calibration deferred.
- Engine moisture is an **internal capacity-fraction scale**; thresholds anchored to Dry/Moist/Wet; mined band is a prior; meter is a learned anchor.
- **`soil_state` on `measurements`** (observation); **estimate feedback in a private `moisture_feedback` table** (telemetry, never exported).
- Estimate feedback is **post-check**, with explicit magnitude→offset math.
- **No measured-amount false confidence** — only user-entered amounts count.
- **Repot = simulation boundary** on the current pot; no pot-history table.
