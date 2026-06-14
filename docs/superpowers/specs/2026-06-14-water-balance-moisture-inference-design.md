# Water-Balance Moisture Inference — Design

**Status:** Draft for review · 2026-06-14
**Roadmap:** Phase 4 (care intelligence), follows the Open Plant Knowledge Layer (Phase 4A, PR #10).
**Related:** `docs/knowledge-layer.md` (mined `soil_moisture_percent` ranges feed this), `src/lib/insights.ts` (existing deterministic insights this coexists with).

## Goal

Estimate a potted plant's current **soil moisture** and turn it into an honest **watering recommendation** ("likely ~22% and drying — check in ~2 days" → "water now"), for the common case where the user has **no moisture meter**. The estimate is driven by a physics prior (pot size + species + seasonal climate + water added) and corrected by **behavior-independent ground truth** (a quick soil check, plant-health symptoms, optional meter logs) — explicitly *not* by how often the user waters.

## Why physics-first, not watering-rhythm

A tempting calibrator is the user's observed watering interval. We reject it as a primary signal: if the model learns the dry-down rate from how often the user waters, and the user waters because the model told them to, that is a closed feedback loop that amplifies the user's existing over/under-watering bias with no ground truth to correct it. Watering frequency is kept only as a **weak sanity check** (flagging gross disagreement), never as a calibration input. Ground truth must reflect actual soil/plant state, independent of watering behavior.

## Architecture (units, with clear boundaries)

| Unit | Responsibility | Purity |
| --- | --- | --- |
| **A. Pot & repot data model** | Pot dimensions + optional substrate/drainage/light on a plant; repotting updates current pot from that date. | Schema + repo glue |
| **B. Moisture engine** (`src/lib/moisture.ts`) | Pure functions: soil volume, water capacity, daily evapotranspiration (ET), water-balance simulation over the timeline with ground-truth corrections, current-moisture estimate + confidence. | **Pure, fully unit-tested** |
| **C. Ground-truth feedback** | Behavior-independent signals that calibrate B: an inline wetter/drier/spot-on tap on the recommendation + a standalone Dry/Moist/Wet soil check. | Schema + small UI |
| **D. Recommendation + surfacing** | Compare estimate to the species' mined moisture band → recommendation + confidence; render as an insight (build first) and a hero gauge (fast-follow). | Pure rec logic + UI |

B is the heart and is pure/deterministic so it is testable without a backend, matching the project's "pure shaping is unit-tested; SDK glue is thin" convention.

## A. Pot & repot data model

New columns on `plants` (all nullable; only pot size is *encouraged* at creation):
- `pot_diameter_cm: float` — top inner diameter.
- `pot_height_cm: float` — soil depth.
- `substrate_type: enum` — `standard` | `succulent_gritty` | `chunky_aroid` | `peat_seedling` (optional; default `standard`).
- `pot_drains: boolean` — has drainage holes (optional; default `true`).
- `light_level: enum` — `low` | `medium` | `bright` | `direct_sun` (optional).
- `rain_exposed: boolean` — offered for `outdoor`/`balcony` placements at onboarding ("Does rain reach this plant?"). Gates rainfall ingestion (Unit B). Default `false`; a covered balcony or porch plant stays off.

**Repotting:** the `repotting` treatment (already exists) gains optional `amount_value`-style fields for the *new* pot size; on log, the repo updates the plant's current pot columns and stamps the change date so the engine recomputes capacity from that point. Pot history is reconstructable from the timeline (no separate table — YAGNI).

**Capture UX:** `PlantForm` gains a "Pot" group — diameter + height with a friendly default ("e.g. 12 cm"), and a collapsible "Improve accuracy" disclosure for substrate / drainage / light (the progressive-enhancement layer). Re-pot is logged from `LogSheet`'s existing repotting treatment.

## B. Moisture engine (the model)

All quantities derived per plant from its timeline. Units: ml, °C, days.

1. **Soil volume** `V` (ml) from pot dimensions, treated as a slightly tapered cylinder:
   `V ≈ π · (d/2)² · h · 0.85` (the 0.85 accounts for taper + root/headspace), `d,h` in cm → ml.

2. **Water-holding capacity** `C` (ml) = `V · θ_fc`, where `θ_fc` (field-capacity fraction) is substrate-dependent: `standard 0.35`, `peat_seedling 0.45`, `succulent_gritty 0.20`, `chunky_aroid 0.18`. Non-draining pots raise effective retention (water can't escape): multiply by `1.15`.

3. **Daily evapotranspiration** `ET` (ml/day) = `k · demand`:
   - `demand` scales with **temperature**, **dryness of air (low humidity)**, **light**, and **plant size** (a bigger canopy in a small pot transpires more). A simple multiplicative form: `demand = base · f_temp(T) · f_rh(RH) · f_light(L) · f_size`.
   - **Climate source by placement:** `indoor`/`greenhouse` use the **seasonal indoor default** (≈ 23 °C winter, 25 °C summer; season from date + hemisphere via the user's location; no location → 24 °C; RH default ~45%, light from `light_level` or `medium`). `outdoor`/`balcony` use the logged `environment_snapshots` weather (temp/humidity/photoperiod) nearest each day.
   - `base` and the species demand level come from the mined **Permapeople `water_requirement`** (Dry/Moist/Wet) and **`soil_moisture_percent` band**; defaults when absent.

4. **Water-balance simulation** over the timeline:
   - Start each watering event: `W += amount_value` (ml); if `amount_value` not logged, assume a default pour proportional to `C` (e.g. `0.4·C`) flagged as low-confidence. Cap `W` at `C`; excess drains (if `pot_drains`).
   - **Rainfall** (only when `rain_exposed` and placement is `outdoor`/`balcony`): for each day in the window, add `rain_ml = precip_mm · pot_top_area_cm² · 0.1 · throughfall` (1 mm depth over 1 cm² = 0.1 ml; `throughfall ≈ 1` for an open pot, lower under dense foliage). Rain is the unlogged watering that would otherwise wreck outdoor estimates. Daily `precipitation_sum` comes from the existing Open-Meteo layer (see implementation note); cap at `C`, excess drains.
   - Each day: `W -= ET(day)`, floored at a wilting residual (`0.05·C`).
   - **Ground-truth corrections** applied at their observation timestamps (see below) *reset or nudge* `W`, overriding the simulation forward.
   - **Current estimate:** `moisture% = clamp(W / C · 100, 0..100)`.

**Implementation note (weather layer + purity boundary):** `src/lib/openmeteo.ts` already receives `precipitation_sum` in its daily response (used by `fetchClimateNormals`) but `fetchDailyWeather` doesn't request it. Add `precipitation_sum` to its daily vars and expose a small async range helper (the forecast endpoint already returns `past_days`/`forecast_days`; archive takes a date range) that returns a daily-rain series for the window in one or two calls. The **pure engine (Unit B) consumes that series as an input** (`dailyRainMm` keyed by ISO date) and never fetches — keeping it deterministic and offline-testable; the caller (repo glue) does the fetch for `rain_exposed` plants and passes it in. **No location-precision change** — see Risks.

5. **Confidence** (Low/Med/High) from inputs present: pot size (required for any estimate), substrate/drainage/light set, count of ground-truth observations in the recent window, and whether recent waterings logged an amount. Each missing item widens the band and yields a concrete nudge ("add your pot's drainage to sharpen this").

### Ground-truth calibration (behavior-independent)

Applied in priority order; these correct the simulation, watering frequency does not:
- **Meter log** (`soil_moisture_percent` measurement): sets `W = pct/100 · C` at that timestamp. Strongest, but rare.
- **Estimate feedback** (Unit C): a one-tap response *to the recommendation itself* — **wetter / drier / spot-on**, and when wetter/drier a **1–5 "how much" magnitude**. Converted to a *signed, sized* error against the predicted `W` at that moment (direction × magnitude → offset from prediction) and, accumulated, nudges `k`. Lowest-friction signal of all — it lives on the recommendation the user is already looking at — so it is the one users will actually give. Likely the dominant calibrator in practice.
- **Soil check** (Unit C, Dry/Moist/Wet): an *absolute* finger-test, mapped to a `W` band (`Dry → ~0.15·C`, `Moist → ~0.5·C`, `Wet → ~0.85·C`). Over multiple checks it calibrates `k` so the simulated dry-down matches when "Dry" actually occurs. The no-meter anchor when the user proactively checks.
- **Health symptoms** (coarse, v1-lite): a sharp `health_score` drop sustained while inferred moisture was high → nudge `θ_fc`/`k` toward "dries slower than modeled / likely overwatered"; the inverse for chronic low moisture + wilting. Precise symptom→cause attribution is **deferred**; v1 uses only a conservative nudge with a visible caveat.

Estimate-feedback and soil-check are two entry points into the *same* correction path (both yield an observed `W` at a timestamp); the difference is only the question asked (relative vs. absolute) and where it is surfaced (on the recommendation vs. a standalone action).

## C. Ground-truth feedback (no meter required)

Both feedback flavors are stored on the existing **`measurements`** table (decision: reuse, not a new table — it is just another observed value alongside `soil_moisture_percent`, and keeps the timeline model simple):
- `soil_state: enum(dry|moist|wet)` — the absolute finger-test ("Check soil" quick action on the plant screen).
- `estimate_feedback: enum(wetter|drier|correct)` + `estimate_feedback_magnitude: int 1..5` (only meaningful when wetter/drier) — the one-tap response on the watering recommendation. Stored alongside `predicted_moisture_percent` (a snapshot of what we predicted at that moment) so the engine can reconstruct the **signed, sized** error without re-deriving the past estimate.

**Prompts:** the recommendation insight carries the inline *wetter / drier / spot-on* tap; the plant screen also offers a standalone "Check soil" action with a Dry/Moist/Wet nudge ("Not sure? Finger in the top 2–3 cm"). Each is one tap.

Together these are the mechanism that lets the model self-correct honestly **without a meter and without the watering-frequency loop**.

## D. Recommendation + surfacing

- **Recommendation logic** (pure): compare current `moisture%` to the species' mined `soil_moisture_percent` band; the **low end is the water threshold**. Output a status (`comfortable` | `drying` | `water_now` | `overwatered`), a predicted dry-date (when the simulation crosses the threshold), and the confidence. Never overrides a directly logged measurement.
- **Insight (build first):** a new `EXPERIMENTAL` insight in `src/lib/insights.ts`, coexisting with the existing care insights and the three knowledge layers (never replacing them). Carries the confidence chip, the single best enrichment nudge, and the inline **wetter / drier / spot-on** estimate-feedback tap (Unit C) so calibration happens right where the user reads the recommendation.
- **Gauge (fast-follow):** a `MOISTURE` dial in the hero stat row beside `WATERED`/`CADENCE`, color-coded to status, tappable to the recommendation.

## Scope

**v1 (this spec):** Unit A (pot model + `rain_exposed` toggle + capture + repot), Unit B (engine: physics + rainfall ingestion + ground-truth calibration), Unit C (soil check + estimate feedback), Unit D insight + gauge. **Rainfall ingestion is a separable final slice** so the (majority) indoor case ships first; until it lands, a `rain_exposed` plant shows a low-confidence, caveated estimate rather than a wrong-but-confident one.

**Deferred:** suggested watering **amount** (ml) recommendation; push notification when a plant is predicted dry; precise health-symptom → cause attribution; per-region indoor-climate averages beyond the 23/25 °C seasonal default.

## Risks & decisions

- **Indoor microclimate is modeled, not sensed** — accepted; the seasonal default is low-variance and ground-truth checks correct per-plant. Stated honestly via confidence.
- **No feedback loop** — watering frequency is a weak sanity check only; calibration is behavior-independent. (Core design constraint.)
- **Cold-start** — with only pot size and no ground truth, the estimate is physics-only at Low confidence; the UI nudges the first soil check / amount logging.
- **Location stays city-level — and that is sufficient here.** Rainfall ingestion uses the existing captured location (a city centroid, rounded to ~1.1 km per `docs/privacy.md`). Open-Meteo's grid is ~9 km (archive) to ~1–11 km (forecast), i.e. **coarser than a city**, so precipitation is identical regardless of finer placement. This feature needs *which weather cell*, not a street address, so it neither needs nor is blocked by a finer location picker. (Separately, the location picker has its own known UX bug — the geocoder is populated-places-only and the "precision" control is actually a privacy-export tier; tracked as independent work, out of scope here.)
- **Privacy/data** — all new fields live on the user's own `plants`/`observations` (owner-scoped, `user_id`-stamped); none enter the public export path (consistent with `docs/open-data.md`). The only new third-party traffic is daily-precipitation fetches for `rain_exposed` outdoor plants, via the Open-Meteo layer the app already uses for weather — no new vendor.

## Testing

- **Unit B** is pure → exhaustive unit tests: volume/capacity math, ET monotonicity (hotter/drier/brighter ⇒ faster dry-down), simulation conservation (never exceeds `C`, never below residual), rainfall ingestion (a rainy day raises `W`; ignored when `rain_exposed` is off or plant is indoor), each ground-truth correction (meter set, signed+sized estimate feedback, soil-check band, health nudge), confidence tiers, and the recommendation thresholds vs a species band. Fixture species: basil (`15–60%`). Daily rainfall is passed in as a series (not fetched by the engine), so Unit B stays pure/offline in tests.
- **Recommendation logic** (Unit D pure part): status transitions + predicted dry-date.
- **Repo/UI glue** stays thin; verified by the existing gate + a preview pass (add a plant with a pot, log a soil check, see the insight + gauge update).

## Resolved decisions

- **Ground-truth storage:** reuse the `measurements` table (`soil_state`, `estimate_feedback`, `predicted_moisture_percent` fields) — no new table.
- **Estimate feedback** (wetter/drier/spot-on on the recommendation) is a first-class calibration input, expected to be the most-used one.
