# Moisture Feedback & Imperial UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six moisture-feature UX defects: instant recalculation after feedback, anti-spam + recency-weighted corrections, context for the 1–5 scale, an honest low-confidence nudge, repot/pot-dimension parity, and imperial input support.

**Architecture:** The moisture engine stays a pure pipeline (`moisture.ts` → `moisture-inputs.ts` → `moisture-read.ts`). Corrections gain a recency `weight` blended in the simulation; confidence counts effective weight. The read layer exposes `feedbackEligible` + enrichment flags. `PlantScreen` adds optimistic pending-row state with reconciliation. A shared conversion layer in `units.ts` makes pot-dimension and water-amount inputs imperial-aware; storage stays metric.

**Tech Stack:** TypeScript, React, Vite, Vitest. No schema changes.

Reference spec: `docs/superpowers/specs/2026-06-15-moisture-feedback-ux-design.md`.

**Branch:** `moisture-feedback-ux` (already created off fresh `master`; spec committed).

---

## File Structure

- `src/lib/moisture.ts` — engine. Add `recencyWeight` + weight constants, `WaterContentCorrection.weight`, blended correction in `simulateWaterContent`; rework `moistureInsight` nudge.
- `src/lib/moisture-inputs.ts` — input builder. Weight corrections, weighted `groundTruthCount`, eligibility data, `isFeedbackEligible`.
- `src/lib/moisture-read.ts` — read entry point. Return `feedbackEligible`, `needsSoilCheck`, `needsSubstrate`.
- `src/lib/units.ts` — shared length/volume conversion helpers.
- `src/features/timeline/logsheet-logic.ts` — repot update with units.
- `src/features/timeline/LogSheet.tsx` — repot + water-amount imperial UI.
- `src/features/timeline/plant-screen-logic.ts` — submit helpers (single `observedAt`, return row), `mergeById`/`dropReconciledRows`.
- `src/features/timeline/PlantScreen.tsx` — optimistic state + reconciliation, eligibility gating, 1–5 context, enrichment args.
- `src/features/plants/PlantForm.tsx` + `src/App.tsx` — thread `units`, convert pot inputs.
- Tests under `tests/lib/`, `tests/app/`.

---

## Task 1: Recency weight + blended corrections (engine)

**Files:**
- Modify: `src/lib/moisture.ts`
- Test: `tests/lib/moisture.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/lib/moisture.test.ts`. First extend the import block (lines 1–14) to add the three new symbols:

```ts
import {
  ANCHORS,
  CORRECTION_WEIGHT_FLOOR_MS,
  CORRECTION_WEIGHT_SATURATION_MS,
  dailyEtMl,
  estimateMoisture,
  INDOOR_DEFAULT_RH,
  moistureInsight,
  moistureStatusColor,
  potSoilVolumeMl,
  recencyWeight,
  recommendWatering,
  seasonalIndoorTempC,
  simulateWaterContent,
  waterCapacityMl,
} from '../../src/lib/moisture';
```

Then append two `describe` blocks at the end of the file:

```ts
describe('recencyWeight', () => {
  it('is full at or beyond saturation', () => {
    expect(recencyWeight(CORRECTION_WEIGHT_SATURATION_MS)).toBe(1);
    expect(recencyWeight(CORRECTION_WEIGHT_SATURATION_MS * 2)).toBe(1);
  });
  it('is zero at or below the floor', () => {
    expect(recencyWeight(0)).toBe(0);
    expect(recencyWeight(CORRECTION_WEIGHT_FLOOR_MS)).toBe(0);
    expect(recencyWeight(CORRECTION_WEIGHT_FLOOR_MS / 2)).toBe(0);
  });
  it('ramps linearly between floor and saturation', () => {
    const mid = (CORRECTION_WEIGHT_FLOOR_MS + CORRECTION_WEIGHT_SATURATION_MS) / 2;
    expect(recencyWeight(mid)).toBeCloseTo(0.5);
  });
});

describe('weighted corrections', () => {
  const pot = { diameterCm: 12, heightCm: 10, substrate: 'standard', drains: true } as const;
  const capacityMl = waterCapacityMl(pot);
  const dailyClimate = () => ({ tempC: 20, humidityPct: 50, light: 'medium' }) as const;
  const t = Date.UTC(2026, 0, 1, 12);
  const target = capacityMl * 0.6;
  const run = (weight: number) =>
    simulateWaterContent({
      pot,
      startMs: t,
      endMs: t,
      waterings: [{ observedAtMs: t, amountMl: capacityMl }],
      dailyClimate,
      speciesDailyFraction: 0,
      corrections: [{ observedAtMs: t, waterContentMl: target, weight }],
    }).waterContentMl;

  it('weight 1 fully applies the correction', () => {
    expect(run(1)).toBeCloseTo(target);
  });
  it('weight 0 ignores the correction (keeps the model prediction)', () => {
    expect(run(0)).toBeCloseTo(capacityMl);
  });
  it('partial weight blends target and model prediction', () => {
    expect(run(0.5)).toBeCloseTo(0.5 * target + 0.5 * capacityMl);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/moisture.test.ts -t "recencyWeight"`
Expected: FAIL — `recencyWeight`/constants not exported.

- [ ] **Step 3: Add weight type, constants, and `recencyWeight`**

In `src/lib/moisture.ts`, change the `WaterContentCorrection` interface (currently lines 77–80):

```ts
export interface WaterContentCorrection {
  observedAtMs: number;
  waterContentMl: number;
  /** Recency weight 0..1; omitted ⇒ 1 (full correction). Blended in simulateWaterContent. */
  weight?: number;
}
```

Add constants + helper just below `ANCHORS` (after line 34):

```ts
/** Correction recency weighting (spec Unit B): a correction's influence ramps
 *  from 0 at/below FLOOR to 1 at/above SATURATION, by the gap to the previous
 *  correction. Spam (sub-floor) is ignored; well-spaced ground truth is trusted. */
export const CORRECTION_WEIGHT_FLOOR_MS = 20 * 60 * 1000;
export const CORRECTION_WEIGHT_SATURATION_MS = 6 * 60 * 60 * 1000;

export function recencyWeight(gapMs: number): number {
  if (gapMs >= CORRECTION_WEIGHT_SATURATION_MS) return 1;
  const span = CORRECTION_WEIGHT_SATURATION_MS - CORRECTION_WEIGHT_FLOOR_MS;
  return clamp((gapMs - CORRECTION_WEIGHT_FLOOR_MS) / span, 0, 1);
}
```

(`clamp` is already defined at line 58.)

- [ ] **Step 4: Add `weight` to the timeline event and blend it**

In the `TimelineEvent` union (lines 115–125), add `weight` to the correction variant:

```ts
  | {
      kind: 'correction';
      observedAtMs: number;
      waterContentMl: number;
      weight: number;
    };
```

In the `input.corrections.map(...)` inside `simulateWaterContent` (lines 173–179), carry the weight:

```ts
    ...input.corrections.map(
      (correction): TimelineEvent => ({
        kind: 'correction',
        observedAtMs: correction.observedAtMs,
        waterContentMl: correction.waterContentMl,
        weight: correction.weight ?? 1,
      }),
    ),
```

In `applyEventsAt` (the `else` correction branch, currently line 202–203), replace the set with a blend:

```ts
      } else {
        const blended = event.weight * event.waterContentMl + (1 - event.weight) * waterContentMl;
        waterContentMl = clamp(blended, residualMl, capacityMl);
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/moisture.test.ts`
Expected: PASS, including the pre-existing `applies corrections forward` / `clamps corrections` tests (they omit `weight`, exercising the `?? 1` default = old set behavior).

- [ ] **Step 6: Commit**

```bash
git add src/lib/moisture.ts tests/lib/moisture.test.ts
git commit -m "feat(moisture): recency-weighted, blended water-content corrections"
```

---

## Task 2: Weighted corrections, confidence, and eligibility data in the input builder

**Files:**
- Modify: `src/lib/moisture-inputs.ts`
- Test: `tests/lib/moisture-inputs.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/lib/moisture-inputs.test.ts` (its imports already include `buildMoistureInputs`, fixtures, `ANCHORS`, `waterCapacityMl`). Add `isFeedbackEligible` and `FEEDBACK_DRIFT_THRESHOLD_PCT` to the first import line:

```ts
import { buildMoistureInputs, isFeedbackEligible, FEEDBACK_DRIFT_THRESHOLD_PCT } from '../../src/lib/moisture-inputs';
```

Then add:

```ts
describe('weighted confidence and eligibility data', () => {
  it('counts effective correction weight, not raw count, so spam cannot inflate confidence', () => {
    const base = Date.parse(daysAgo(1));
    const minute = 60 * 1000;
    const plant = makePlant({
      observations: [
        observation(new Date(base).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + 5 * minute).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + 10 * minute).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
      ],
    });
    const { estimate } = buildMoistureInputs({ plant, careProfile: null, feedback: [], now: NOW });
    // First correction weight 1; the next two are <20 min later ⇒ weight 0.
    expect(estimate.groundTruthCount).toBeCloseTo(1);
    expect(estimate.corrections).toHaveLength(3);
  });

  it('gives a correction 6h after the previous one full weight', () => {
    const base = Date.parse(daysAgo(2));
    const sixHours = 6 * 60 * 60 * 1000;
    const plant = makePlant({
      observations: [
        observation(new Date(base).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })],
        }),
        observation(new Date(base + sixHours).toISOString(), {
          observation_type: 'measurement', measurements: [measurement({ soil_state: 'wet' })],
        }),
      ],
    });
    const { estimate } = buildMoistureInputs({ plant, careProfile: null, feedback: [], now: NOW });
    expect(estimate.groundTruthCount).toBeCloseTo(2);
  });
});

describe('isFeedbackEligible', () => {
  const stepPct = ((ANCHORS.wet - ANCHORS.dry) / 5) * 100; // 14

  it('is eligible when there is no prior feedback', () => {
    expect(isFeedbackEligible({ currentPercent: 50, latestFeedback: null, lastNonFeedbackEventMs: null })).toBe(true);
  });

  it('hides immediately after a high-magnitude rating (anchor matches post-blend value)', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: -1 as const, magnitude: 4, weight: 1 };
    const currentPercent = 60 - 4 * stepPct; // post-blend value the engine now holds
    expect(isFeedbackEligible({ currentPercent, latestFeedback, lastNonFeedbackEventMs: null })).toBe(false);
  });

  it('re-shows after a new correction event logged later than the feedback', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: 0 as const, magnitude: 0, weight: 1 };
    expect(isFeedbackEligible({ currentPercent: 60, latestFeedback, lastNonFeedbackEventMs: NOW + 1000 })).toBe(true);
  });

  it('re-shows once the estimate drifts past the threshold from the anchor', () => {
    const latestFeedback = { observedAtMs: NOW, predictedPercent: 60, dir: 0 as const, magnitude: 0, weight: 1 };
    const drifted = 60 - FEEDBACK_DRIFT_THRESHOLD_PCT;
    expect(isFeedbackEligible({ currentPercent: drifted, latestFeedback, lastNonFeedbackEventMs: null })).toBe(true);
    expect(isFeedbackEligible({ currentPercent: 60 - (FEEDBACK_DRIFT_THRESHOLD_PCT - 1), latestFeedback, lastNonFeedbackEventMs: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/moisture-inputs.test.ts -t "eligibility"`
Expected: FAIL — `isFeedbackEligible` not exported.

- [ ] **Step 3: Rewrite the correction assembly in `buildMoistureInputs`**

In `src/lib/moisture-inputs.ts`, add imports for the new engine symbols (extend the existing import from `./moisture`):

```ts
import {
  ANCHORS,
  INDOOR_DEFAULT_RH,
  recencyWeight,
  seasonalIndoorTempC,
  waterCapacityMl,
  type DayClimate,
  type EstimateInput,
  type Hemisphere,
  type MoistureBand,
  type PotSpec,
  type WaterContentCorrection,
  type WateringEvent,
} from './moisture';
```

Add types, constant, and helper near the top (after `FEEDBACK_STEP_FRACTION`, line 31):

```ts
export const FEEDBACK_DRIFT_THRESHOLD_PCT = 8;

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface LatestFeedbackAnchor {
  observedAtMs: number;
  predictedPercent: number;
  dir: -1 | 0 | 1;
  magnitude: number;
  weight: number;
}

type TaggedCorrection = WaterContentCorrection & {
  weight: number;
  source: 'measurement' | 'feedback';
  feedback?: { predictedPercent: number; dir: -1 | 0 | 1; magnitude: number };
};
```

Extend the `MoistureInputs` interface (lines 77–82):

```ts
export interface MoistureInputs {
  estimate: EstimateInput;
  band: MoistureBand;
  /** False when the band fell back to the default (no mined range) — caller lowers confidence. */
  bandSourced: boolean;
  /** Latest in-window feedback as a post-blend anchor (Unit C); null when none. */
  latestFeedback: LatestFeedbackAnchor | null;
  /** Latest watering/repot/ground-truth measurement time, for the "new event" eligibility check. */
  lastNonFeedbackEventMs: number | null;
  /** True when at least one ground-truth soil measurement exists in-window. */
  hasRecentGroundTruth: boolean;
}
```

Replace the body of `buildMoistureInputs` from the `const waterings` block through the `return` (lines 98–158). Replace the loops that push into `corrections` and the `for (const entry of feedback)` block and the final assembly with:

```ts
  const waterings: WateringEvent[] = [];
  const tagged: TaggedCorrection[] = [];
  let repotBoundaryMs: number | undefined;
  let lastNonFeedbackEventMs: number | null = null;
  const noteEvent = (ms: number) => {
    lastNonFeedbackEventMs = lastNonFeedbackEventMs === null ? ms : Math.max(lastNonFeedbackEventMs, ms);
  };

  for (const observation of observations) {
    const observedAtMs = Date.parse(observation.observed_at);
    if (!Number.isFinite(observedAtMs)) continue;
    const withinWindow = observedAtMs >= startMs && observedAtMs <= now;

    for (const treatment of observation.treatments ?? []) {
      if (treatment.treatment_type === 'watering') {
        waterings.push({ observedAtMs, amountMl: treatment.amount_value });
        noteEvent(observedAtMs);
      } else if (treatment.treatment_type === 'repotting') {
        repotBoundaryMs =
          repotBoundaryMs === undefined ? observedAtMs : Math.max(repotBoundaryMs, observedAtMs);
        noteEvent(observedAtMs);
      }
    }

    if (!withinWindow) continue;
    for (const measurement of observation.measurements ?? []) {
      if (measurement.soil_state) {
        tagged.push({ observedAtMs, waterContentMl: ANCHORS[measurement.soil_state] * capacityMl, weight: 1, source: 'measurement' });
        noteEvent(observedAtMs);
      } else if (typeof measurement.soil_moisture_percent === 'number') {
        tagged.push({
          observedAtMs,
          waterContentMl: ANCHORS[percentToBand(measurement.soil_moisture_percent)] * capacityMl,
          weight: 1,
          source: 'measurement',
        });
        noteEvent(observedAtMs);
      }
    }
  }

  const stepMl = FEEDBACK_STEP_FRACTION * capacityMl;
  for (const entry of feedback) {
    const observedAtMs = Date.parse(entry.observed_at);
    if (!Number.isFinite(observedAtMs) || observedAtMs < startMs || observedAtMs > now) continue;
    if (entry.predicted_moisture_percent === null) continue;
    const predictedMl = (entry.predicted_moisture_percent / 100) * capacityMl;
    const dir: -1 | 0 | 1 = entry.estimate_feedback === 'wetter' ? 1 : entry.estimate_feedback === 'drier' ? -1 : 0;
    const magnitude = entry.magnitude ?? 0;
    tagged.push({
      observedAtMs,
      waterContentMl: predictedMl + dir * magnitude * stepMl,
      weight: 1,
      source: 'feedback',
      feedback: { predictedPercent: entry.predicted_moisture_percent, dir, magnitude },
    });
  }

  // Recency-weight every correction by the gap to the previous one (spec Unit B).
  tagged.sort((a, b) => a.observedAtMs - b.observedAtMs);
  let prevMs: number | null = null;
  for (const c of tagged) {
    c.weight = prevMs === null ? 1 : recencyWeight(c.observedAtMs - prevMs);
    prevMs = c.observedAtMs;
  }

  const corrections: WaterContentCorrection[] = tagged.map((c) => ({
    observedAtMs: c.observedAtMs,
    waterContentMl: c.waterContentMl,
    weight: c.weight,
  }));
  const groundTruthCount = tagged.reduce((sum, c) => sum + c.weight, 0);
  const hasRecentGroundTruth = tagged.some((c) => c.source === 'measurement');

  let latestFeedback: LatestFeedbackAnchor | null = null;
  for (const c of tagged) {
    if (c.source === 'feedback' && c.feedback && (!latestFeedback || c.observedAtMs >= latestFeedback.observedAtMs)) {
      latestFeedback = {
        observedAtMs: c.observedAtMs,
        predictedPercent: c.feedback.predictedPercent,
        dir: c.feedback.dir,
        magnitude: c.feedback.magnitude,
        weight: c.weight,
      };
    }
  }

  const { band, sourced } = resolveSpeciesBand(careProfile);

  const estimate: EstimateInput = {
    pot,
    startMs,
    endMs: now,
    waterings,
    dailyClimate: makeClimateResolver(plant, hemisphere),
    speciesDailyFraction: resolveSpeciesDailyFraction(careProfile),
    corrections,
    repotBoundaryMs,
    substratePresent: plant.substrate_type != null,
    amountMeasured: waterings.some((w) => typeof w.amountMl === 'number' && Number.isFinite(w.amountMl)),
    groundTruthCount,
  };

  return { estimate, band, bandSourced: sourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth };
```

Add the `isFeedbackEligible` export at the end of the file:

```ts
/**
 * Whether the feedback prompt should be offered (spec Unit C). Eligible when there
 * is no prior feedback, a new correction event happened after the last rating, or
 * the live estimate has drifted past the threshold from the rating's post-blend anchor.
 */
export function isFeedbackEligible(args: {
  currentPercent: number;
  latestFeedback: LatestFeedbackAnchor | null;
  lastNonFeedbackEventMs: number | null;
}): boolean {
  const { currentPercent, latestFeedback, lastNonFeedbackEventMs } = args;
  if (!latestFeedback) return true;
  if (lastNonFeedbackEventMs !== null && lastNonFeedbackEventMs > latestFeedback.observedAtMs) return true;
  const stepPct = FEEDBACK_STEP_FRACTION * 100;
  const anchorPct = clampPct(
    latestFeedback.predictedPercent + latestFeedback.weight * latestFeedback.dir * latestFeedback.magnitude * stepPct,
  );
  return Math.abs(Math.round(currentPercent) - anchorPct) >= FEEDBACK_DRIFT_THRESHOLD_PCT;
}
```

- [ ] **Step 4: Update the pre-existing `groundTruthCount` assertion**

In `tests/lib/moisture-inputs.test.ts`, the first test (`maps waterings, ground-truth anchors, feedback…`) has `soil_state` and a feedback row both at `daysAgo(2)`; the second one sorted there gets weight 0. Change line 50:

```ts
    expect(estimate.groundTruthCount).toBeCloseTo(2); // soil_state(1) + meter@-1d(1) + feedback@same-as-soil_state(0)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/moisture-inputs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/moisture-inputs.ts tests/lib/moisture-inputs.test.ts
git commit -m "feat(moisture): weighted confidence + feedback eligibility inputs"
```

---

## Task 3: Expose `feedbackEligible` and enrichment flags from the read layer

**Files:**
- Modify: `src/lib/moisture-read.ts`
- Test: `tests/lib/moisture-read.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/lib/moisture-read.test.ts`:

```ts
describe('moistureForPlant eligibility and enrichment', () => {
  it('flags feedback eligible and both enrichment needs for a bare plant', () => {
    const result = moistureForPlant(makePlant({ substrate_type: null }), null, [], NOW);
    if (result === null) throw new Error('expected an estimate');
    expect(result.feedbackEligible).toBe(true);
    expect(result.needsSubstrate).toBe(true);
    expect(result.needsSoilCheck).toBe(true);
  });

  it('clears needsSoilCheck once a soil check exists in-window', () => {
    const plant = makePlant({
      observations: [
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
      ],
    });
    const result = moistureForPlant(plant, null, [], NOW);
    if (result === null) throw new Error('expected an estimate');
    expect(result.needsSoilCheck).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/moisture-read.test.ts -t "eligibility and enrichment"`
Expected: FAIL — `feedbackEligible`/`needsSoilCheck`/`needsSubstrate` undefined.

- [ ] **Step 3: Extend `PlantMoisture` and `moistureForPlant`**

In `src/lib/moisture-read.ts`, update the import to pull in `isFeedbackEligible`:

```ts
import { buildMoistureInputs, isFeedbackEligible } from './moisture-inputs';
```

Extend the `PlantMoisture` interface (lines 24–29):

```ts
export interface PlantMoisture {
  moisturePercent: number;
  confidence: Confidence;
  recommendation: WateringRecommendation;
  band: MoistureBand;
  /** Whether the feedback prompt should be shown (spec Unit C). */
  feedbackEligible: boolean;
  /** No in-window soil check — used by the honest low-confidence nudge (spec Unit E). */
  needsSoilCheck: boolean;
  /** Substrate unset — used by the honest low-confidence nudge. */
  needsSubstrate: boolean;
}
```

Replace the body after the guards (lines 50–59):

```ts
  const { estimate, band, bandSourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth } =
    buildMoistureInputs({ plant, careProfile, feedback, now });
  const { moisturePercent, confidence } = estimateMoisture(estimate);
  const recommendation = recommendWatering(moisturePercent, { band });
  const feedbackEligible = isFeedbackEligible({ currentPercent: moisturePercent, latestFeedback, lastNonFeedbackEventMs });

  return {
    moisturePercent,
    confidence: bandSourced ? confidence : LOWER_CONFIDENCE[confidence],
    recommendation,
    band,
    feedbackEligible,
    needsSoilCheck: !hasRecentGroundTruth,
    needsSubstrate: !estimate.substratePresent,
  };
```

- [ ] **Step 4: Re-space the existing confidence-downgrade test**

In `tests/lib/moisture-read.test.ts`, the `lowers confidence one tier…` test has two corrections both at `daysAgo(1)` (so the second now gets weight 0, dropping the score below `high`). Re-space them so both get full weight. Change the two measurement observations (lines 36–37) to:

```ts
        observation(daysAgo(2), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_moisture_percent: 55 })] }),
```

(The watering stays at `daysAgo(2)`; corrections at `daysAgo(2)` and `daysAgo(1)` are >6 h apart ⇒ weights 1 + 1 ⇒ `groundTruthCount` 2 ⇒ score 4 ⇒ `high`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/moisture-read.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/moisture-read.ts tests/lib/moisture-read.test.ts
git commit -m "feat(moisture): surface feedbackEligible + enrichment needs from read layer"
```

---

## Task 4: Honest low-confidence nudge

**Files:**
- Modify: `src/lib/moisture.ts`
- Test: `tests/lib/moisture.test.ts`

- [ ] **Step 1: Rewrite the failing nudge test**

In `tests/lib/moisture.test.ts`, replace the `appends an enrichment nudge only at low confidence` test (lines 570–593) with:

```ts
  it('builds the low-confidence nudge from only what is missing, never pot size', () => {
    const soilOnly = moistureInsight(
      { moisturePercent: 50, confidence: 'low' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
      { needsSoilCheck: true, needsSubstrate: false },
    );
    const both = moistureInsight(
      { moisturePercent: 50, confidence: 'low' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
      { needsSoilCheck: true, needsSubstrate: true },
    );
    const nothingMissing = moistureInsight(
      { moisturePercent: 50, confidence: 'low' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
      { needsSoilCheck: false, needsSubstrate: false },
    );
    const mediumConfidence = moistureInsight(
      { moisturePercent: 50, confidence: 'medium' },
      { status: 'comfortable' },
      'Monstera deliciosa',
      null,
      { needsSoilCheck: true, needsSubstrate: true },
    );

    expect(soilOnly.detail.endsWith('Log a soil check to sharpen this estimate.')).toBe(true);
    expect(both.detail.endsWith('Log a soil check and set your soil type to sharpen this estimate.')).toBe(true);
    expect(soilOnly.detail).not.toContain('pot size');
    expect(nothingMissing.detail).not.toContain('sharpen');
    expect(mediumConfidence.detail).not.toContain('sharpen');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/moisture.test.ts -t "what is missing"`
Expected: FAIL — `moistureInsight` ignores the 5th arg / old text.

- [ ] **Step 3: Replace the nudge constant and wire enrichment into `moistureInsight`**

In `src/lib/moisture.ts`, delete the `MOISTURE_ENRICHMENT_NUDGE` constant (line 364) and add a builder above `moistureInsight`:

```ts
/** Low-confidence nudge built from only the missing signals (spec Unit E) — never
 *  mentions pot size, which is always present when this card renders. */
function enrichmentNudge(needsSoilCheck: boolean, needsSubstrate: boolean): string | null {
  const actions: string[] = [];
  if (needsSoilCheck) actions.push('log a soil check');
  if (needsSubstrate) actions.push('set your soil type');
  if (actions.length === 0) return null;
  const joined = actions.length === 2 ? `${actions[0]} and ${actions[1]}` : actions[0];
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} to sharpen this estimate.`;
}
```

Change the `moistureInsight` signature (lines 373–378) to take a 5th param:

```ts
export function moistureInsight(
  estimate: { moisturePercent: number; confidence: Confidence },
  recommendation: WateringRecommendation,
  speciesName: string | null,
  band: MoistureBand | null,
  enrichment: { needsSoilCheck: boolean; needsSubstrate: boolean } = { needsSoilCheck: false, needsSubstrate: false },
): Insight {
```

Replace the low-confidence block (lines 388–390):

```ts
  if (estimate.confidence === 'low') {
    const nudge = enrichmentNudge(enrichment.needsSoilCheck, enrichment.needsSubstrate);
    if (nudge) detail += ` ${nudge}`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/moisture.test.ts`
Expected: PASS (the other `moistureInsight` tests use the default 5th arg ⇒ no nudge, matching their `not.toContain('sharpen')`/non-low-confidence assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/moisture.ts tests/lib/moisture.test.ts
git commit -m "feat(moisture): tailor low-confidence nudge to missing signals only"
```

---

## Task 5: Shared imperial conversion layer

**Files:**
- Modify: `src/lib/units.ts`
- Test: `tests/lib/units.test.ts` (create)

- [ ] **Step 1: Write failing tests**

Create `tests/lib/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cmToLengthInput, lengthInputToCm, mlToVolumeInput, volumeInputToMl } from '../../src/lib/units';

describe('length conversion', () => {
  it('passes through metric and converts imperial inches to cm', () => {
    expect(lengthInputToCm(12, 'metric')).toBeCloseTo(12);
    expect(lengthInputToCm(10, 'imperial')).toBeCloseTo(25.4);
  });
  it('round-trips cm back to the input unit', () => {
    expect(cmToLengthInput(25.4, 'imperial')).toBeCloseTo(10);
    expect(cmToLengthInput(12, 'metric')).toBeCloseTo(12);
  });
});

describe('volume conversion', () => {
  it('passes through metric and converts imperial fl oz to ml', () => {
    expect(volumeInputToMl(250, 'metric')).toBeCloseTo(250);
    expect(volumeInputToMl(10, 'imperial')).toBeCloseTo(295.735);
  });
  it('round-trips ml back to the input unit', () => {
    expect(mlToVolumeInput(295.735, 'imperial')).toBeCloseTo(10);
    expect(mlToVolumeInput(250, 'metric')).toBeCloseTo(250);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add the conversion helpers**

Append to `src/lib/units.ts`:

```ts
export const CM_PER_INCH = 2.54;
export const ML_PER_FL_OZ = 29.5735;

/** Convert a user-entered length (cm or in) to stored cm. */
export function lengthInputToCm(value: number, units: Units): number {
  return units === 'imperial' ? value * CM_PER_INCH : value;
}

/** Convert stored cm to the display/input unit (rounded for editing). */
export function cmToLengthInput(cm: number, units: Units): number {
  return units === 'imperial' ? round1(cm / CM_PER_INCH) : round1(cm);
}

/** Convert a user-entered volume (ml or fl oz) to stored ml. */
export function volumeInputToMl(value: number, units: Units): number {
  return units === 'imperial' ? value * ML_PER_FL_OZ : value;
}

/** Convert stored ml to the display/input unit (rounded for editing). */
export function mlToVolumeInput(ml: number, units: Units): number {
  return units === 'imperial' ? round1(ml / ML_PER_FL_OZ) : round1(ml);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts tests/lib/units.test.ts
git commit -m "feat(units): shared length/volume input conversion helpers"
```

---

## Task 6: Imperial-aware repotting + repot/pot-dimension parity

**Files:**
- Modify: `src/features/timeline/logsheet-logic.ts`, `src/features/timeline/LogSheet.tsx`
- Test: `tests/app/logsheet.test.ts`

- [ ] **Step 1: Write failing tests**

In `tests/app/logsheet.test.ts`, add a `units` import is not needed (string literal used). Add:

```ts
  it('converts imperial repot dimensions to stored centimetres', () => {
    expect(buildRepotPlantUpdate('10', '8', '', 'imperial')).toEqual({
      pot_diameter_cm: 25.4,
      pot_height_cm: 20.32,
    });
  });

  it('treats omitted units as metric (back-compat)', () => {
    expect(buildRepotPlantUpdate('14', '', 'chunky_aroid')).toEqual({
      pot_diameter_cm: 14,
      substrate_type: 'chunky_aroid',
    });
  });

  it('repotting with dimensions persists pot fields so pot-size prompting clears', async () => {
    const updatePlant = vi.fn().mockResolvedValue({});
    await submitRepotPlantUpdate('plant-1', '13', '12', '', updatePlant, 'metric');
    expect(updatePlant).toHaveBeenCalledWith('plant-1', { pot_diameter_cm: 13, pot_height_cm: 12 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/logsheet.test.ts -t "imperial repot"`
Expected: FAIL — `buildRepotPlantUpdate` takes 3 args.

- [ ] **Step 3: Add a `units` parameter and convert before validating**

In `src/features/timeline/logsheet-logic.ts`, add the import and update both functions:

```ts
import type { SubstrateType, Units } from '../../lib/types';
import { lengthInputToCm } from '../../lib/units';
```

Change `parseValidPotDimension` to convert first:

```ts
function parseValidPotDimension(value: string, units: Units): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = lengthInputToCm(Number(value), units);
  if (!Number.isFinite(parsed) || parsed < POT_DIMENSION_MIN_CM || parsed > POT_DIMENSION_MAX_CM) {
    return undefined;
  }
  return Math.round(parsed * 100) / 100;
}
```

Update `buildRepotPlantUpdate` and `submitRepotPlantUpdate` signatures (units optional, default metric):

```ts
export function buildRepotPlantUpdate(
  repotDiameter: string,
  repotHeight: string,
  repotSubstrate: SubstrateType | '',
  units: Units = 'metric',
): Partial<PlantInput> {
  const potUpdate: Partial<PlantInput> = {};
  const diameter = parseValidPotDimension(repotDiameter, units);
  const height = parseValidPotDimension(repotHeight, units);
  if (diameter !== undefined) potUpdate.pot_diameter_cm = diameter;
  if (height !== undefined) potUpdate.pot_height_cm = height;
  if (repotSubstrate) potUpdate.substrate_type = repotSubstrate;
  return potUpdate;
}

export async function submitRepotPlantUpdate(
  plantId: string,
  repotDiameter: string,
  repotHeight: string,
  repotSubstrate: SubstrateType | '',
  updatePlantFn: (plantId: string, input: Partial<PlantInput>) => Promise<unknown>,
  units: Units = 'metric',
): Promise<void> {
  const potUpdate = buildRepotPlantUpdate(repotDiameter, repotHeight, repotSubstrate, units);
  if (Object.keys(potUpdate).length > 0) await updatePlantFn(plantId, potUpdate);
}
```

> Note: `parseValidPotDimension('0', units)` and out-of-range values still return `undefined`, so the existing range tests (lines 56–62) pass unchanged for metric.

- [ ] **Step 4: Pass `units` and localize labels in `LogSheet.tsx`**

In the `handleSubmit` repot branch (lines 240–248), pass `profile.preferred_units`:

```ts
        if (careType === 'repotting') {
          await submitRepotPlantUpdate(
            plantId,
            repotDiameter,
            repotHeight,
            repotSubstrate,
            updatePlant,
            profile.preferred_units,
          );
        }
```

Update the two repot input pairs to reflect units. Dark theme (lines 360–363):

```tsx
                        <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>New pot size ({imperial ? 'in' : 'cm'}, optional)</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <input className="b-input" type="number" inputMode="decimal" min={0} max={imperial ? 80 : 200} step="any" value={repotDiameter} onChange={(e) => setRepotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`New pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
                          <input className="b-input" type="number" inputMode="decimal" min={0} max={imperial ? 80 : 200} step="any" value={repotHeight} onChange={(e) => setRepotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`New pot height in ${imperial ? 'inches' : 'centimetres'}`} />
                        </div>
```

Light theme (lines 565–567) — apply the same change with `a-input` class and the light-theme `span` wrapper:

```tsx
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>New pot size ({imperial ? 'in' : 'cm'}, optional)</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input className="a-input" type="number" inputMode="decimal" min={0} max={imperial ? 80 : 200} step="any" value={repotDiameter} onChange={(e) => setRepotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`New pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
                        <input className="a-input" type="number" inputMode="decimal" min={0} max={imperial ? 80 : 200} step="any" value={repotHeight} onChange={(e) => setRepotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`New pot height in ${imperial ? 'inches' : 'centimetres'}`} />
                      </div>
```

> Verify the exact existing light-theme repot markup around lines 561–567 before editing; match its wrapper element/labels.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/app/logsheet.test.ts` → PASS.
Run: `npm run typecheck` (or `npx tsc --noEmit`) → no errors in `LogSheet.tsx`/`logsheet-logic.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/features/timeline/logsheet-logic.ts src/features/timeline/LogSheet.tsx tests/app/logsheet.test.ts
git commit -m "feat(logsheet): imperial-aware repot pot dimensions; lock repot→pot-size parity"
```

---

## Task 7: Imperial-aware water amount field

**Files:**
- Modify: `src/features/timeline/LogSheet.tsx`
- Test: `tests/lib/units.test.ts` (covered by Task 5; no new logic module)

The canonical `amount` state stays in **ml**; the field renders fl oz for imperial users and converts at the input boundary. `buildWateringTreatment(amount, ...)` is unchanged (still ml).

- [ ] **Step 1: Make `WaterAmountField` units-aware**

Change the component signature and body in `src/features/timeline/LogSheet.tsx` (lines 49–131). Add a `units` prop and convert display/slider/labels:

```tsx
function WaterAmountField({
  amount,
  setAmount,
  busy,
  tone,
  units,
}: {
  amount: string;
  setAmount: (value: string) => void;
  busy: boolean;
  tone: 'light' | 'dark';
  units: Units;
}) {
  const dark = tone === 'dark';
  const imperial = units === 'imperial';
  const unitLabel = imperial ? 'fl oz' : 'ml';
  // Display value: canonical ml string -> shown unit.
  const displayValue = amount.trim() === '' ? '' : String(mlToVolumeInput(Number(amount), units));
  const minDisplay = mlToVolumeInput(WATER_AMOUNT_MIN_ML, units);
  const maxDisplay = mlToVolumeInput(WATER_AMOUNT_MAX_ML, units);
  const onDisplayChange = (raw: string) => {
    if (raw.trim() === '') { setAmount(''); return; }
    const ml = imperial ? volumeInputToMl(Number(raw), units) : Number(raw);
    setAmount(Number.isFinite(ml) ? String(ml) : raw);
  };
  const labelStyle = dark
    ? { display: 'block', marginBottom: 8 }
    : { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 };
  const hintColor = dark ? '#67766A' : '#6B7568';
  const unitColor = dark ? '#9BAA98' : '#6B7568';

  return (
    <label style={{ display: 'block' }}>
      <span className={dark ? 'b-kicker' : undefined} style={labelStyle}>
        Amount
      </span>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            aria-label={`Water amount in ${imperial ? 'fluid ounces' : 'milliliters'}`}
            className={dark ? 'b-input' : 'a-input'}
            value={displayValue}
            onChange={(e) => onDisplayChange(e.currentTarget.value)}
            onBlur={() => setAmount(normalizeWaterAmountText(amount))}
            type="number"
            inputMode="decimal"
            min={minDisplay}
            max={maxDisplay}
            step="any"
            placeholder={imperial ? '8' : '250'}
            disabled={busy}
            style={{ paddingRight: 52 }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 15,
              top: '50%',
              transform: 'translateY(-50%)',
              color: unitColor,
              fontSize: 13,
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            {unitLabel}
          </span>
        </div>
        <input
          aria-label="Water amount slider"
          type="range"
          value={waterAmountSliderValue(amount)}
          min={WATER_AMOUNT_MIN_ML}
          max={WATER_AMOUNT_MAX_ML}
          step={WATER_AMOUNT_STEP_ML}
          onChange={(e) => setAmount(e.currentTarget.value)}
          disabled={busy}
          style={{ width: '100%', accentColor: dark ? '#C7F24A' : '#3C7140' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: hintColor,
            fontSize: 11.5,
            fontWeight: dark ? 700 : 600,
          }}
        >
          <span>{minDisplay} {unitLabel}</span>
          <span>{maxDisplay} {unitLabel}</span>
        </div>
      </div>
    </label>
  );
}
```

> The slider stays in ml (its canonical domain); `setAmount(e.currentTarget.value)` from the range writes ml directly, which the number field re-renders as fl oz. This keeps one canonical value.

- [ ] **Step 2: Add the `Units` import and pass `units` at both call sites**

In the top imports of `src/features/timeline/LogSheet.tsx`, add `Units` to the types import and the volume helpers:

```ts
import type { Profile, SubstrateType, TreatmentType, Units, UserLocation } from '../../lib/types';
import { mlToVolumeInput, volumeInputToMl } from '../../lib/units';
```

Update both `<WaterAmountField ... />` usages (lines 327 and 531) to pass `units={profile.preferred_units}`:

```tsx
                  <WaterAmountField amount={amount} setAmount={setAmount} busy={busy} tone="dark" units={profile.preferred_units} />
```
```tsx
                <WaterAmountField amount={amount} setAmount={setAmount} busy={busy} tone="light" units={profile.preferred_units} />
```

- [ ] **Step 3: Run typecheck + existing water tests**

Run: `npm run typecheck` → no errors.
Run: `npx vitest run tests/app/logsheet.test.ts` → PASS (`buildWateringTreatment` unchanged; still ml).

- [ ] **Step 4: Commit**

```bash
git add src/features/timeline/LogSheet.tsx
git commit -m "feat(logsheet): imperial fl oz display for the water-amount field (ml canonical)"
```

---

## Task 8: Thread units into PlantForm and convert pot dimensions

**Files:**
- Modify: `src/features/plants/PlantForm.tsx`, `src/App.tsx`

- [ ] **Step 1: Accept `units` and convert prefill/save**

In `src/features/plants/PlantForm.tsx`, add the import:

```ts
import type { LightLevel, PlacementType, Plant, PlantStatus, Species, SubstrateType, Units, UserLocation } from '../../lib/types';
import { cmToLengthInput, lengthInputToCm } from '../../lib/units';
```

Add `units` to the component props (after `onCancel`, around line 33–38):

```ts
export function PlantForm({
  userId,
  plant,
  units,
  onSaved,
  onCancel,
}: {
  userId: string;
  plant?: Plant;
  units: Units;
  onSaved: (plant: Plant) => void;
  onCancel: () => void;
}) {
```

Change the pot-dimension prefill (lines 58–63) to display the user's unit:

```ts
  const [potDiameter, setPotDiameter] = useState(
    plant?.pot_diameter_cm != null ? String(cmToLengthInput(plant.pot_diameter_cm, units)) : '',
  );
  const [potHeight, setPotHeight] = useState(
    plant?.pot_height_cm != null ? String(cmToLengthInput(plant.pot_height_cm, units)) : '',
  );
```

Change the save conversion (lines 151–152):

```ts
      pot_diameter_cm: potDiameter.trim() && Number.isFinite(Number(potDiameter)) ? lengthInputToCm(Number(potDiameter), units) : null,
      pot_height_cm: potHeight.trim() && Number.isFinite(Number(potHeight)) ? lengthInputToCm(Number(potHeight), units) : null,
```

- [ ] **Step 2: Localize the pot-size input labels (both themes)**

Add `const imperial = units === 'imperial';` next to `const isDark = theme === 'dark';` (line 71).

Dark theme pot inputs (lines 294–295):

```tsx
                <input className="b-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potDiameter} onChange={(e) => setPotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`Pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
                <input className="b-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potHeight} onChange={(e) => setPotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`Pot height in ${imperial ? 'inches' : 'centimetres'}`} />
```

Light theme pot inputs (lines 535–536): same change with `a-input`:

```tsx
              <input className="a-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potDiameter} onChange={(e) => setPotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`Pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
              <input className="a-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potHeight} onChange={(e) => setPotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`Pot height in ${imperial ? 'inches' : 'centimetres'}`} />
```

Optionally update the "Pot size" `b-kicker`/label spans (lines 292 dark / its light twin) to read `Pot size ({imperial ? 'in' : 'cm'})`.

- [ ] **Step 3: Pass `units` from `App.tsx`**

In `src/App.tsx`, both `<PlantForm>` blocks (lines 70–84) gain `units={profile.preferred_units}`:

```tsx
        {route.name === 'add-plant' && (
          <PlantForm
            userId={user.$id}
            units={profile.preferred_units}
            onSaved={() => navigate({ name: 'plants' })}
            onCancel={() => navigate({ name: 'plants' })}
          />
        )}
        {route.name === 'edit-plant' && editReady && editPlant && (
          <PlantForm
            userId={user.$id}
            plant={editPlant}
            units={profile.preferred_units}
            onSaved={(plant) => navigate({ name: 'plant', plantId: plant.$id })}
            onCancel={() => navigate({ name: 'plant', plantId: editPlant.$id })}
          />
        )}
```

Confirm `profile` is in scope in `App.tsx` (it is — used at lines 64 and 92).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (a missing `units` prop on `PlantForm` would surface here).

- [ ] **Step 5: Commit**

```bash
git add src/features/plants/PlantForm.tsx src/App.tsx
git commit -m "feat(plant-form): imperial-aware pot dimensions (metric storage)"
```

---

## Task 9: Submit helpers (single observedAt, return row) + reconciliation utilities

**Files:**
- Modify: `src/features/timeline/plant-screen-logic.ts`
- Test: `tests/app/plant-screen-moisture-feedback.test.ts`, `tests/app/plant-screen-soil-check.test.ts`

- [ ] **Step 1: Update the failing tests**

In `tests/app/plant-screen-moisture-feedback.test.ts`, replace the `submits exact createMoistureFeedback payload…` test (lines 62–85) with an `observedAt`-driven version that also checks the returned row:

```ts
  it('submits with the caller-supplied observedAt and returns the created row', async () => {
    const created = { $id: 'fb-99' };
    const createMoistureFeedback = vi.fn().mockResolvedValue(created);
    const refresh = vi.fn();

    const result = await submitMoistureFeedback({
      userId: 'user-1',
      plantId: 'plant-1',
      estimateFeedback: 'wetter',
      magnitude: 2,
      predictedMoisturePercent: 37,
      observedAt: '2026-06-15T11:00:00.000Z',
      createMoistureFeedback,
      refresh,
    });

    expect(createMoistureFeedback).toHaveBeenCalledWith('user-1', {
      plantId: 'plant-1',
      observedAt: '2026-06-15T11:00:00.000Z',
      estimate_feedback: 'wetter',
      magnitude: 2,
      predicted_moisture_percent: 37,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(created);
  });

  it('mergeById appends pending rows the canonical set lacks; dropReconciledRows prunes the rest', () => {
    const canonical = [{ $id: 'a' }];
    const pending = [{ $id: 'a' }, { $id: 'temp-1' }];
    expect(mergeById(canonical, pending)).toEqual([{ $id: 'a' }, { $id: 'temp-1' }]);
    expect(dropReconciledRows(pending, canonical)).toEqual([{ $id: 'temp-1' }]);
  });
```

Add `mergeById, dropReconciledRows` to the import at the top of that test file:

```ts
import {
  buildMoistureFeedbackInput,
  dropReconciledRows,
  mergeById,
  submitMoistureFeedback,
} from '../../src/features/timeline/plant-screen-logic';
```

In `tests/app/plant-screen-soil-check.test.ts`, change the `submits exact createLog payload…` test (lines 84–101) to pass `observedAt` instead of `now`:

```ts
    await submitSoilCheck({
      userId: 'user-1',
      plantId: 'plant-1',
      soilState: 'wet',
      contribute: false,
      observedAt: '2026-06-15T11:00:00.000Z',
      createLog,
      refresh,
    });
```

(The `expect(createLog)` payload already uses `observedAt: '2026-06-15T11:00:00.000Z'`, so it stays.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/plant-screen-moisture-feedback.test.ts tests/app/plant-screen-soil-check.test.ts`
Expected: FAIL — helpers take `now`, not `observedAt`; `mergeById`/`dropReconciledRows` missing.

- [ ] **Step 3: Change helper signatures and add utilities**

In `src/features/timeline/plant-screen-logic.ts`:

Change `submitSoilCheck` (lines 41–68) to take `observedAt` and return the observation:

```ts
export async function submitSoilCheck({
  userId,
  plantId,
  soilState,
  contribute,
  observedAt,
  createLog,
  refresh,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  observedAt: string;
  createLog: (input: LogInput) => Promise<Observation>;
  refresh: () => void;
}): Promise<Observation> {
  const observation = await createLog(
    buildSoilCheckLogInput({ userId, plantId, soilState, contribute, observedAt }),
  );
  refresh();
  return observation;
}
```

Change `submitMoistureFeedback` (lines 92–122) to take `observedAt` and return the created row:

```ts
export async function submitMoistureFeedback({
  userId,
  plantId,
  estimateFeedback,
  magnitude,
  predictedMoisturePercent,
  observedAt,
  createMoistureFeedback,
  refresh,
}: {
  userId: string;
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  observedAt: string;
  createMoistureFeedback: (userId: string, input: MoistureFeedbackInput) => Promise<MoistureFeedback>;
  refresh: () => void;
}): Promise<MoistureFeedback> {
  const created = await createMoistureFeedback(
    userId,
    buildMoistureFeedbackInput({ plantId, estimateFeedback, magnitude, predictedMoisturePercent, observedAt }),
  );
  refresh();
  return created;
}
```

Add `MoistureFeedback` to the `types` import at the top of the file:

```ts
import type { EstimateFeedback, MoistureFeedback, Observation, SoilState, TreatmentType, Units } from '../../lib/types';
```

Add the reconciliation utilities at the end of the file:

```ts
/** Merge canonical rows with optimistic pending rows, deduped by `$id` (canonical wins). */
export function mergeById<T extends { $id: string }>(canonical: T[], pending: T[]): T[] {
  const ids = new Set(canonical.map((r) => r.$id));
  return [...canonical, ...pending.filter((p) => !ids.has(p.$id))];
}

/** Drop pending rows that the canonical re-fetch now includes (reconciled). */
export function dropReconciledRows<T extends { $id: string }>(pending: T[], canonical: T[]): T[] {
  const ids = new Set(canonical.map((r) => r.$id));
  return pending.filter((p) => !ids.has(p.$id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/plant-screen-moisture-feedback.test.ts tests/app/plant-screen-soil-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/timeline/plant-screen-logic.ts tests/app/plant-screen-moisture-feedback.test.ts tests/app/plant-screen-soil-check.test.ts
git commit -m "refactor(plant-screen): observedAt-driven submit helpers + pending-row reconciliation utils"
```

---

## Task 10: PlantScreen wiring — optimistic recompute, eligibility, 1–5 context, enrichment

**Files:**
- Modify: `src/features/timeline/PlantScreen.tsx`
- Test: `tests/app/plant-screen-soil-check.test.ts` (source-string assertions)

This task is React wiring; verify it via typecheck, the source-string test, the full suite, and the live visual check in Task 12.

- [ ] **Step 1: Add pending state and `Units`/helper imports**

Update the logic import (lines 28–33) to add the two new utilities. The current block is exactly:

```ts
import {
  detailLine,
  shouldPromptForPotSize,
  submitMoistureFeedback,
  submitSoilCheck,
} from './plant-screen-logic';
```

Replace it with:

```ts
import {
  detailLine,
  dropReconciledRows,
  mergeById,
  shouldPromptForPotSize,
  submitMoistureFeedback,
  submitSoilCheck,
} from './plant-screen-logic';
```

Add pending state next to the other `useState`s (after line 623):

```ts
  const [pendingFeedback, setPendingFeedback] = useState<MoistureFeedback[]>([]);
  const [pendingObservations, setPendingObservations] = useState<Observation[]>([]);
```

Add `MoistureFeedback` to the `types` import on line 4.

- [ ] **Step 2: Reconcile pending rows after each fetch**

In the fetch effect (lines 638–653), prune reconciled pending rows after `setPlant`:

```ts
  useEffect(() => {
    let cancelled = false;
    getPlantWithTimeline(plantId)
      .then((row) => {
        if (cancelled) return;
        setPlant(row);
        setVerdicts(new Map((row.insight_feedback ?? []).map((f) => [f.insight_kind, f])));
        setPendingFeedback((prev) => dropReconciledRows(prev, row.moisture_feedback ?? []));
        setPendingObservations((prev) => dropReconciledRows(prev, row.observations ?? []));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [plantId, reloadKey]);
```

- [ ] **Step 3: Bump `now` on refresh**

Update `refresh` (lines 676–680):

```ts
  const refresh = () => {
    setLogOpen(false);
    setSoilCheckOpen(false);
    setNow(Date.now());
    setReloadKey((k) => k + 1);
  };
```

- [ ] **Step 4: Optimistic feedback handler (single observedAt, rollback)**

Replace `handleMoistureFeedback` (lines 701–719):

```ts
  const handleMoistureFeedback = async (estimateFeedback: EstimateFeedback, magnitude: number | null) => {
    if (!plant || !moisture || moistureFeedbackBusy) return;
    setMoistureFeedbackBusy(true);
    const observedAt = new Date();
    const tempId = `pending-${observedAt.getTime()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: MoistureFeedback = {
      $id: tempId,
      $createdAt: observedAt.toISOString(),
      $updatedAt: observedAt.toISOString(),
      user_id: userId,
      observed_at: observedAt.toISOString(),
      estimate_feedback: estimateFeedback,
      magnitude: estimateFeedback === 'correct' ? null : magnitude,
      predicted_moisture_percent: Math.round(moisture.moisturePercent),
    };
    setPendingFeedback((prev) => [...prev, optimistic]);
    setNow(observedAt.getTime());
    try {
      const created = await submitMoistureFeedback({
        userId,
        plantId: plant.$id,
        estimateFeedback,
        magnitude,
        predictedMoisturePercent: Math.round(moisture.moisturePercent),
        observedAt: observedAt.toISOString(),
        createMoistureFeedback,
        refresh,
      });
      // Swap the temp id for the real one so the next refresh reconciles it.
      setPendingFeedback((prev) => prev.map((r) => (r.$id === tempId ? { ...r, $id: created.$id } : r)));
    } catch (e) {
      setPendingFeedback((prev) => prev.filter((r) => r.$id !== tempId)); // rollback
      setError(errorMessage(e));
    } finally {
      setMoistureFeedbackBusy(false);
    }
  };
```

- [ ] **Step 5: Optimistic soil-check handler**

Replace `handleSoilCheck` (lines 682–699):

```ts
  const handleSoilCheck = async (soilState: SoilState) => {
    if (!plant || soilCheckBusy) return;
    setSoilCheckBusy(true);
    const observedAt = new Date();
    const tempId = `pending-${observedAt.getTime()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Observation = {
      $id: tempId,
      $createdAt: observedAt.toISOString(),
      $updatedAt: observedAt.toISOString(),
      user_id: userId,
      observed_at: observedAt.toISOString(),
      observation_type: 'measurement',
      notes_private: null,
      contribute_to_public_dataset: profile.public_contribution_default,
      measurements: [
        {
          $id: `${tempId}-m`,
          $createdAt: observedAt.toISOString(),
          $updatedAt: observedAt.toISOString(),
          user_id: userId,
          height_cm: null,
          leaf_count: null,
          soil_moisture_percent: null,
          health_score: null,
          pest_severity_score: null,
          bloom_count: null,
          soil_state: soilState,
          notes_private: null,
        },
      ],
    };
    setPendingObservations((prev) => [...prev, optimistic]);
    setNow(observedAt.getTime());
    try {
      const created = await submitSoilCheck({
        userId,
        plantId: plant.$id,
        soilState,
        contribute: profile.public_contribution_default,
        observedAt: observedAt.toISOString(),
        createLog,
        refresh,
      });
      setPendingObservations((prev) => prev.map((r) => (r.$id === tempId ? { ...r, $id: created.$id } : r)));
    } catch (e) {
      setPendingObservations((prev) => prev.filter((r) => r.$id !== tempId)); // rollback
      setError(errorMessage(e));
    } finally {
      setSoilCheckBusy(false);
    }
  };
```

- [ ] **Step 6: Merge pending rows into the moisture computation**

Replace the `observations` derivation (line 752) and the `moisture` line (line 784) so both include pending optimistic rows:

```ts
  const observations = mergeById(plant.observations ?? [], pendingObservations).sort(
    (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at),
  );
```

```ts
  const mergedFeedback = mergeById(plant.moisture_feedback ?? [], pendingFeedback);
  const moisture = moistureForPlant({ ...plant, observations }, careProfile, mergedFeedback, now);
```

(The existing `const observations = plant.observations ?? [];` at line 752 is replaced by the merged version above; all later uses of `observations` then include the optimistic soil check.)

- [ ] **Step 7: Pass enrichment into `moistureInsight`**

Update the `moistureIns` call (lines 788–795):

```ts
  const moistureIns = moisture
    ? moistureInsight(
        { moisturePercent: moisture.moisturePercent, confidence: moisture.confidence },
        moisture.recommendation,
        moistureSpeciesName,
        moisture.band,
        { needsSoilCheck: moisture.needsSoilCheck, needsSubstrate: moisture.needsSubstrate },
      )
    : null;
```

- [ ] **Step 8: Gate the feedback prompt on eligibility (both themes)**

Wrap each `<MoistureFeedbackPrompt ... />` (dark ~1042, light ~1363) with the eligibility flag. Dark:

```tsx
                      {moisture.feedbackEligible && (
                        <MoistureFeedbackPrompt
                          isDark
                          predictedMoisturePercent={moisture.moisturePercent}
                          busy={moistureFeedbackBusy}
                          onSubmit={(f, m) => void handleMoistureFeedback(f, m)}
                        />
                      )}
```

Light:

```tsx
                      {moisture.feedbackEligible && (
                        <MoistureFeedbackPrompt
                          isDark={false}
                          predictedMoisturePercent={moisture.moisturePercent}
                          busy={moistureFeedbackBusy}
                          onSubmit={(f, m) => void handleMoistureFeedback(f, m)}
                        />
                      )}
```

- [ ] **Step 9: Add 1–5 context (Unit D) in `MoistureFeedbackPrompt`**

In `MoistureFeedbackPrompt` (lines 326–358), add a caption and end-anchor labels around the magnitude row, and per-button `aria-label`. Replace the `{selected && (...)}` block:

```tsx
      {selected && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 700, color: muted }}>
            How far off was it?
          </p>
          <div
            role="group"
            aria-label={`How much ${selected}?`}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={isDark ? 'b-tap' : 'a-tap'}
                disabled={busy}
                aria-label={n === 1 ? `a little ${selected}` : n === 5 ? `much ${selected}` : `${n} of 5 ${selected}`}
                onClick={() => {
                  onSubmit(selected, n);
                  setSelected(null);
                }}
                style={{
                  minHeight: 36,
                  border,
                  borderRadius: 10,
                  background: activeBackground,
                  color: accent,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10.5, color: muted }}>
            <span>a little</span>
            <span>a lot</span>
          </div>
        </div>
      )}
```

- [ ] **Step 10: Update the soil-check source-string test for the new signature**

The `submits exact createLog payload` soil-check test was already moved to `observedAt` in Task 9. No further change. Verify the `wires the chosen add-pot-size CTA` source-string test still matches (the strings `Add pot size to track soil moisture` and `onClick={() => onEdit(plant)}` are unchanged).

- [ ] **Step 11: Typecheck + run full suite**

Run: `npm run typecheck` → no errors.
Run: `npx vitest run` → all PASS.

- [ ] **Step 12: Commit**

```bash
git add src/features/timeline/PlantScreen.tsx
git commit -m "feat(plant-screen): instant optimistic recompute, eligibility-gated prompt, 1-5 context, honest nudge"
```

---

## Task 11: Full verification + live visual check

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: clean (fix any new issues in touched files).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all PASS, including the four spec-mandated cases (recency floor⇒0, saturation⇒1, weighted confidence vs spam, hidden-after-high-magnitude rating) and the optimistic reconciliation utils.

- [ ] **Step 4: Live visual check (preview tools)**

Start the dev server and verify on the plant detail screen in **both** themes:
- Give "drier" feedback → estimate updates immediately and the feedback prompt disappears (no reload).
- The 1–5 row shows "a little … a lot" anchors.
- With pot size set but low confidence, the insight nudge mentions a soil check / soil type — never "pot size".
- Switch a test profile to imperial: pot-size and water-amount fields show in/fl oz; saving a pot size yields a sensible estimate (no 2.54× error).

- [ ] **Step 5: Final commit (if any visual fixes)**

```bash
git add -A
git commit -m "fix(moisture): visual-check follow-ups"
```

---

## Self-Review

**Spec coverage:**
- #1 immediate recalc → Tasks 9–10 (single `observedAt`, `setNow`, optimistic pending rows, reconciliation).
- #2A recency weight + confidence → Tasks 1–2. #2B eligibility → Tasks 2–3, gated in Task 10.
- #3 1–5 context → Task 10 Step 9.
- #4 honest nudge → Tasks 3–4 + Task 10 Step 7.
- #5 repot/pot parity → Task 6 (regression test) + storage stays metric.
- #6 imperial → Tasks 5 (layer), 6 (repot), 7 (water), 8 (form).
- Optimistic reconciliation (P1) → Task 9 utils + Task 10 reconcile/rollback.
- Weighted confidence (P1) → Task 2 `groundTruthCount = Σ weight`.
- Meter-% eligibility (P2) → Task 2 (`source: 'measurement'` covers `soil_moisture_percent`; `lastNonFeedbackEventMs` notes it).

**Type consistency:** `WaterContentCorrection.weight?`, `LatestFeedbackAnchor`, `isFeedbackEligible`, `MoistureInputs` extra fields, `PlantMoisture` extra fields, `mergeById`/`dropReconciledRows`, and the `units`/`observedAt` parameter changes are defined once and used consistently across tasks.

**Placeholder scan:** none — every code step shows complete code.
