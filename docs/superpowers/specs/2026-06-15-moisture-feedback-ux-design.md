# Moisture feedback & imperial UX fixes — design

**Date:** 2026-06-15
**Branch target:** fresh `master` (post #15/#16), one PR, no schema changes.

## Problem

Six UX defects in the indoor soil-moisture feature:

1. After a user rates the estimate, the recalculated moisture only appears on a full reload, not immediately.
2. Nothing throttles repeated feedback/measurements; rapid taps ratchet the estimate away ("ruins the calculation"). No rule hides the feedback control after rating.
3. The 1–5 magnitude buttons carry no context.
4. The low-confidence insight text nudges "Add your pot size…" even though that card only renders when pot size already exists.
5. Need to confirm both "edit plant" and "repotting" register pot dimensions.
6. Pot-dimension and water-amount inputs are metric-only; imperial users silently corrupt the capacity/water-balance calc.

## Root causes (verified in code)

- **#1** `PlantScreen` holds `now` in state, seeded once at mount and refreshed only hourly (`PlantScreen.tsx`). `refresh()` only bumps `reloadKey`. New feedback/soil-checks are timestamped at submit (`Date.now()`), which is *after* the stale `now`; `buildMoistureInputs` filters any correction with `observedAtMs > now`, so the fresh row is dropped until `now` ticks or the component remounts.
- **#2** `buildMoistureInputs` turns every feedback row into a correction that **sets** water content at its timestamp; each new feedback is based on the previous feedback's already-corrected prediction, so repeats compound. No eligibility gate on the prompt.
- **#3** `MoistureFeedbackPrompt` renders bare `1..5` buttons.
- **#4** `moistureInsight` appends `MOISTURE_ENRICHMENT_NUDGE = "Add your pot size and a soil check to sharpen this estimate."` whenever `confidence === 'low'`. The insight only renders when `moistureForPlant` returns non-null, which requires pot size present — so the pot-size half is always wrong here.
- **#5** Already correct: `PlantForm` save writes `pot_diameter_cm/height_cm`; repotting writes them via `buildRepotPlantUpdate` → `submitRepotPlantUpdate`. Needs regression coverage only.
- **#6** `PlantForm` pot inputs are hard-coded cm with no `units` prop. `LogSheet` has `imperial` but the repot pot inputs and `WaterAmountField` are not converted. Plant-*height* measurement already converts (×2.54) — the reference pattern.

## Design

### Unit A — Immediate recalculation (#1)

`PlantScreen.refresh()` additionally calls `setNow(Date.now())` so the re-fetch path recomputes against a current clock.

`handleMoistureFeedback` and `handleSoilCheck` each capture **one** `observedAt = new Date()` and use it for all three of:

1. `setNow(observedAt.getTime())`,
2. the **optimistic** local row appended to `plant` state, and
3. the persisted write payload.

The submit helpers stop generating their own timestamp — `observedAt` (ISO string) is passed in.

**Optimistic rows live in dedicated pending state** (`pendingFeedback: MoistureFeedback[]`, `pendingObservations: Observation[]`), each tagged with a temporary `$id`. They are **never** written into the canonical `plant` object, so a re-fetch cannot silently drop them. The estimate recomputes from `canonical ++ pending`, deduped by `$id` (canonical wins). Reconciliation:

1. On submit: build the optimistic row with a temp `$id`, add it to pending, `setNow(observedAt.getTime())`.
2. The write resolves to the persisted row — both `createMoistureFeedback` and `createLog` return it — so store the real `$id` back onto the pending row.
3. `refresh()` re-fetches; in its resolution, drop a pending row only once its `$id` appears in the fetched canonical rows. Rows not yet present (Appwrite read-after-write lag) stay in pending and keep showing until a later refresh includes them.
4. On write rejection: remove the pending row (rollback) and surface the error — the gauge never keeps a correction that never persisted.

This resolves the earlier contradiction: the re-fetch refreshes canonical data without dropping un-reconciled optimistic rows, and failures roll back instead of leaving phantom state.

### Unit B — Recency-weighted corrections (#2 part A)

Add `weight: number` (0–1) to `WaterContentCorrection`.

`buildMoistureInputs`: after collecting corrections from **all** sources (soil-state, meter %, and feedback) and sorting by time, assign each correction a weight from the gap to the **previous correction** in that sorted stream:

```
weight(Δt) = clamp((Δt − FLOOR) / (SATURATION − FLOOR), 0, 1)
FLOOR      = 20 min      // ≤ floor ⇒ weight 0 (spam ignored)
SATURATION = 6 h         // ≥ saturation ⇒ weight 1 (full trust)
```

The first correction (no predecessor) gets `weight = 1`.

`simulateWaterContent`: when applying a correction, blend instead of overwrite:

```
waterContentMl = clamp(weight·target + (1 − weight)·currentPrediction, residual, capacity)
```

where `currentPrediction` is the model's drift value immediately before the correction. `weight = 1` reproduces today's set-and-clamp behavior.

**Confidence counting:** `groundTruthCount` becomes the **sum of effective correction weights**, not `corrections.length`. Today's `corrections.length` ([moisture-inputs.ts](../../../src/lib/moisture-inputs.ts)) feeds `score` in `estimateMoisture`, so weight-0 spam would still raise confidence and suppress the low-confidence nudge while the water balance ignores it. Summing weights makes a within-floor spam correction contribute ~0; the existing 0–3 normalization (`normalizedGroundTruthCount`) still applies, so all-full-weight corrections match today's integer count.

### Unit C — Feedback eligibility / button visibility (#2 part B)

A pure helper decides whether the prompt is shown. Show when **any** of:

- (a) no prior feedback row exists, or
- (b) a new **correction event** — a watering, repot, or any ground-truth soil measurement (`soil_state` *or* meter `soil_moisture_percent`) — was logged with `observed_at` strictly after the latest feedback's `observed_at`, or
- (c) `|round(currentPercent) − effectiveAnchorPct| ≥ DRIFT_THRESHOLD_PCT` (8).

`effectiveAnchorPct` is the **post-blend** value of the latest feedback, not the raw `predicted_moisture_percent`:

```
dir = wetter ? +1 : drier ? −1 : 0          // 'correct' ⇒ 0
stepPct = FEEDBACK_STEP_FRACTION · 100       // = 14 per magnitude step
effectiveAnchorPct = clamp(predicted% + weight · dir · magnitude · stepPct, 0, 100)
```

`weight` is that correction's recency weight from Unit B. Anchoring to the blended value means a high-magnitude rating (weight ≈ 1) lands the live estimate on the anchor, so drift ≈ 0 and the prompt stays hidden until a real event or genuine drying moves it. `moistureForPlant` computes and returns `feedbackEligible` alongside the estimate; the helper is exported for direct unit tests.

### Unit D — 1–5 scale context (#3)

In `MoistureFeedbackPrompt`, add a caption ("How far off was it?") and end-anchor labels under the row — **"a little" (1) … "a lot" (5)** — plus per-button `aria-label` (`"a little ${drier|wetter}"` … `"much ${drier|wetter}"`). Presentation only.

### Unit E — Honest low-confidence nudge (#4)

`moistureForPlant` returns `{ needsSoilCheck, needsSubstrate }` (computed from the same observations/substrate it already inspects). `moistureInsight` accepts these and, on low confidence, composes the nudge from only what is missing (e.g. "Add a soil check" and/or "set your soil type") + "to sharpen this estimate." It never mentions pot size. The separate `PotSizeMoistureNudge` button and the home-card "Add pot size" chips (already gated on missing pot size) are unchanged — pot-size prompting stays separate from the insight text.

### Unit F — Repot ⇄ pot-dimension parity (#5)

No behavior change; lock current behavior with tests: repot with dimensions persists `pot_diameter_cm/height_cm` and clears `shouldPromptForPotSize`; the plant-edit form path does the same.

### Unit G — Imperial support via one conversion layer (#6)

Extend `units.ts` with a single shared conversion layer (complementing the existing `format*` display helpers); storage stays metric:

```
CM_PER_INCH = 2.54 ; ML_PER_FL_OZ = 29.5735
lengthInputToCm(value, units) / cmToLengthInput(cm, units)
volumeInputToMl(value, units) / mlToVolumeInput(ml, units)
```

- **PlantForm:** thread `units` (from `profile.preferred_units`) as a prop (available at both `<PlantForm>` sites in `App.tsx`). Prefill pot fields via `cmToLengthInput`; convert on save via `lengthInputToCm`; labels/placeholders and validation bounds follow units.
- **LogSheet repot:** convert `repotDiameter/Height` with the shared layer (pass `units` into `buildRepotPlantUpdate`, convert before range-validating); labels follow units.
- **WaterAmountField:** units-aware — display value, slider, and min/max labels in **fl oz** for imperial; canonical **ml** stays in component state, converted at the input boundary so `buildWateringTreatment` is untouched.

## Testing

Pure-engine and logic tests (extend existing `tests/lib/*`, `tests/app/*`):

- **Recency weight:** second correction within 20 min ⇒ weight 0; correction 6 h after the previous ⇒ weight 1; first correction ⇒ weight 1.
- **Blend:** `weight=1` reproduces set-and-clamp; partial weight blends toward target.
- **Confidence vs spam:** three corrections within 20 min (weights ≈ 0) do **not** raise `groundTruthCount` or suppress the nudge; spaced full-weight corrections do.
- **Stale-now regression (#1):** a feedback row timestamped after the original `now` is excluded at the stale `now` but included once `now` advances to `observedAt`, changing the estimate.
- **Optimistic reconciliation (#1):** write success drops the pending row only after canonical includes it (no double-count); a lagging re-fetch keeps the pending row visible; write failure rolls the pending row back.
- **Eligibility (#2B):** prompt hidden immediately after a high-magnitude rating; reappears after a new watering, after a new meter-% (`soil_moisture_percent`) measurement, or after drift ≥ 8 pts.
- **Nudge (#4):** low-confidence text lists only missing signals; never says "pot size"; high confidence has no nudge.
- **Repot parity (#5):** repot with dims persists pot fields and clears `shouldPromptForPotSize`.
- **Imperial (#6):** `lengthInputToCm`/`volumeInputToMl` round-trips; repot in imperial stores metric; PlantForm save converts; water amount converts fl oz↔ml.

Then: `npm run lint`, typecheck, full `npm test`, and a live visual check on the plant screen in both themes (feedback flow, hidden-after-rating, imperial form).

## Out of scope

Outdoor/balcony moisture (deferred to v1.1), schema changes, Gemini prompt changes.
