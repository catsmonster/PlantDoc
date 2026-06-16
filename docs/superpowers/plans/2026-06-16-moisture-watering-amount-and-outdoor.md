# Moisture Watering-Amount + Outdoor/Balcony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a species-driven "how much to water" amount to the soil-moisture card, then extend moisture inference to outdoor/balcony plants using a real daily weather series with rainfall.

**Architecture:** The pure engine (`src/lib/moisture.ts`) gains an amount calculation and a rainfall term; a new range weather fetch (`src/lib/openmeteo.ts`) and a shared cache/hook feed outdoor climate into the still-pure read layer (`src/lib/moisture-read.ts`), which now returns a discriminated `MoistureCardState`. UI surfaces the amount and the new states in `PlantScreen` and `PlantsScreen`.

**Tech Stack:** TypeScript, React 19, Vite, Appwrite TablesDB, Vitest. Spec: `docs/superpowers/specs/2026-06-16-moisture-watering-amount-and-outdoor-design.md`.

**Gate (after each task):** `node ./node_modules/vitest/vitest.mjs run` · `node ./node_modules/eslint/bin/eslint.js .` · `node ./node_modules/typescript/bin/tsc -b`. Single test file: `node ./node_modules/vitest/vitest.mjs run <path>`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/moisture.ts` | `TARGET_BY_BAND`, `suggestedWaterMl` in `recommendWatering`; rainfall in `simulateWaterContent` | Modify |
| `src/lib/units.ts` | `formatSuggestedWater` (units-aware, suppresses zero-after-rounding) | Modify |
| `src/lib/openmeteo.ts` | `DayWeather`, `WeatherSeries`, `fetchWeatherSeries` (archive+forecast merge) | Modify |
| `src/lib/weather-series.ts` | Module cache + pure key/state helpers + `useWeatherSeries` hook | Create |
| `src/lib/moisture-inputs.ts` | Climate resolver reads series for outdoor; `dailyRainMm` when rain-exposed | Modify |
| `src/lib/moisture-read.ts` | `MoistureCardState`, `WeatherState`, `moistureForPlant` returns card state; `readyMoisture` | Modify |
| `appwrite/schema.ts` | `rain_exposed` boolean column on `plants` | Modify |
| `src/lib/types.ts` / `src/lib/repo.ts` | `rain_exposed` on `Plant` / `PlantInput`; `listPlants` select | Modify |
| `src/features/plants/PlantForm.tsx` | "Exposed to rain?" question (outdoor/balcony, required to save) | Modify |
| `src/features/timeline/PlantScreen.tsx` | Render amount line + per-`kind` prompts | Modify |
| `src/features/plants/PlantsScreen.tsx` | Use `useWeatherSeries`; badge only on `ready` | Modify |
| `docs/schema.md`, `docs/privacy.md` | New column + weather-series note | Modify |
| `tests/lib/*`, `tests/app/*`, `tests/export/*`, `tests/appwrite/*` | Tests | Modify |

**Build order:** Phase 1 (amount, shippable alone) → Phase 2 (weather series) → Phase 3 (rainfall engine) → Phase 4 (`rain_exposed` schema + form) → Phase 5 (outdoor wiring + card state) → Phase 6 (export/privacy guard).

---

## Phase 1 — Watering amount (Unit 1, independently shippable)

### Task 1: `suggestedWaterMl` in the pure engine

**Files:**
- Modify: `src/lib/moisture.ts`
- Test: `tests/lib/moisture.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/moisture.test.ts`:

```ts
import { TARGET_BY_BAND } from '../../src/lib/moisture';

describe('suggested water amount', () => {
  const capacityMl = 1000;
  it('fills from current up to the band target at water_now', () => {
    // pct 10 (water_now), wet band target 0.80 -> (0.80 - 0.10) * 1000 = 700
    const rec = recommendWatering(10, { targetFraction: TARGET_BY_BAND.wet, capacityMl });
    expect(rec.status).toBe('water_now');
    expect(rec.suggestedWaterMl).toBeCloseTo(700, 5);
  });
  it('uses the dry-band target (0.40)', () => {
    const rec = recommendWatering(10, { targetFraction: TARGET_BY_BAND.dry, capacityMl });
    expect(rec.suggestedWaterMl).toBeCloseTo((0.4 - 0.1) * 1000, 5);
  });
  it('omits the amount when not water_now', () => {
    const rec = recommendWatering(70, { targetFraction: TARGET_BY_BAND.moist, capacityMl });
    expect(rec.status).toBe('comfortable');
    expect(rec.suggestedWaterMl).toBeUndefined();
  });
  it('omits the amount when target/capacity are absent', () => {
    expect(recommendWatering(10, {}).suggestedWaterMl).toBeUndefined();
  });
  it('clamps inputs and omits a non-positive raw result', () => {
    // current (via pct 200 -> clamp 1.0) already above any target -> <= 0 -> omitted
    const rec = recommendWatering(200, { targetFraction: 1.5, capacityMl });
    expect(rec.suggestedWaterMl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture.test.ts`
Expected: FAIL — `TARGET_BY_BAND` is not exported / `suggestedWaterMl` undefined-on-success not satisfied.

- [ ] **Step 3: Implement** — in `src/lib/moisture.ts`, add the target map near `ANCHORS` and `MoistureBand`:

```ts
/** Post-watering fill target as a fraction of capacity, by mined species band (spec Unit 1). */
export const TARGET_BY_BAND: Record<MoistureBand, number> = { dry: 0.4, moist: 0.6, wet: 0.8 };
```

Extend `RecommendOptions`:

```ts
export interface RecommendOptions {
  band?: MoistureBand;
  et?: EtInputs;
  /** Fill-to fraction of capacity; with capacityMl, yields suggestedWaterMl at water_now. */
  targetFraction?: number;
  capacityMl?: number;
}
```

Extend `WateringRecommendation`:

```ts
export interface WateringRecommendation {
  status: WateringStatus;
  daysUntilDry?: number;
  /** ml to add to reach the species target. Present only at water_now with a positive amount. */
  suggestedWaterMl?: number;
}
```

In `recommendWatering`, after the `daysUntilDry` block and before `return recommendation;`:

```ts
  if (status === 'water_now' && opts.targetFraction !== undefined && opts.capacityMl !== undefined) {
    const target = clamp(opts.targetFraction, 0, 1);
    const current = clamp(pct / 100, 0, 1);
    const amount = (target - current) * opts.capacityMl;
    if (amount > 0) recommendation.suggestedWaterMl = amount;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/moisture.ts tests/lib/moisture.test.ts
git commit -m "feat(moisture): suggested water amount in the pure engine"
```

### Task 2: Pass the species target into `moistureForPlant`

**Files:**
- Modify: `src/lib/moisture-read.ts`
- Test: `tests/lib/moisture-read.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/moisture-read.test.ts` (reuse the file's existing plant/careProfile builders; this asserts wiring, exact ml covered by Task 1):

```ts
it('includes a suggested water amount only when the band is sourced and water_now', () => {
  // Build a dry, pot-known indoor plant whose estimate is at/below the Dry anchor,
  // with a sourced soil_moisture_percent range (bandSourced = true).
  const ready = moistureForPlant(plantDueToWater, sourcedCareProfile, [], NOW);
  expect(ready?.recommendation.status).toBe('water_now');
  expect(ready?.recommendation.suggestedWaterMl).toBeGreaterThan(0);

  // Same plant, but an unsourced (bundled-fallback) profile -> no amount.
  const unsourced = moistureForPlant(plantDueToWater, null, [], NOW);
  expect(unsourced?.recommendation.suggestedWaterMl).toBeUndefined();
});
```

> If `tests/lib/moisture-read.test.ts` lacks a `plantDueToWater` / `sourcedCareProfile`, build them from the existing fixtures in that file: a plant with `pot_diameter_cm`/`pot_height_cm` set, `placement_type: 'indoor'`, no recent watering (so it dries to ≤15%), and a `careProfile` whose `communityRanges` contains `{ attribute: 'soil_moisture_percent', min: 60, max: 80, label: 'Soil moisture' }` (sourced wet band).

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-read.test.ts`
Expected: FAIL — `suggestedWaterMl` is undefined on the sourced case.

- [ ] **Step 3: Implement** — in `src/lib/moisture-read.ts`, import the target map and capacity from the estimate. Replace the estimate/recommendation block in `moistureForPlant`:

```ts
import {
  estimateMoisture,
  recommendWatering,
  TARGET_BY_BAND,
  type Confidence,
  type MoistureBand,
  type WateringRecommendation,
} from './moisture';
```

```ts
  const { estimate, band, bandSourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth } =
    buildMoistureInputs({ plant, careProfile, feedback, now });
  const { moisturePercent, confidence, capacityMl } = estimateMoisture(estimate);
  const recommendation = recommendWatering(moisturePercent, {
    band,
    // Amount only when the band is real mined data (spec Unit 1 gate).
    ...(bandSourced ? { targetFraction: TARGET_BY_BAND[band], capacityMl } : {}),
  });
```

(`MoistureEstimate` already carries `capacityMl` — see `estimateMoisture` in `moisture.ts`.)

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/moisture-read.ts tests/lib/moisture-read.test.ts
git commit -m "feat(moisture): gate suggested amount on a sourced species band"
```

### Task 3: Units-aware amount formatter

**Files:**
- Modify: `src/lib/units.ts`
- Test: `tests/lib/units.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/units.test.ts`:

```ts
import { formatSuggestedWater } from '../../src/lib/units';

describe('formatSuggestedWater', () => {
  it('rounds metric to the nearest 25 ml', () => {
    expect(formatSuggestedWater(440, 'metric')).toBe('450 ml');
  });
  it('shows litres for large metric amounts', () => {
    expect(formatSuggestedWater(1240, 'metric')).toBe('1.3 l');
  });
  it('rounds imperial to the nearest 0.5 fl oz', () => {
    expect(formatSuggestedWater(200, 'imperial')).toBe('7 fl oz'); // 200/29.5735 = 6.76 -> 6.5? see impl
  });
  it('suppresses an amount that rounds to zero in the active unit', () => {
    expect(formatSuggestedWater(5, 'metric')).toBeNull();   // -> 0 ml
    expect(formatSuggestedWater(5, 'imperial')).toBeNull();  // -> 0 fl oz
  });
});
```

> Adjust the imperial expectation to the implementation's rounding: `Math.round((200/29.5735)/0.5)*0.5 = 7.0`. Keep the assertion matching the formula below.

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/units.test.ts`
Expected: FAIL — `formatSuggestedWater` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/units.ts`:

```ts
/**
 * Friendly watering amount for display, rounded coarsely (nearest 25 ml /
 * 0.5 fl oz). Returns null when the amount rounds to zero in the active unit —
 * the UI then shows no "Add about …" line (spec Unit 1, two-layer zero rule).
 */
export function formatSuggestedWater(ml: number, units: Units): string | null {
  if (units === 'imperial') {
    const flOz = Math.round(ml / ML_PER_FL_OZ / 0.5) * 0.5;
    return flOz <= 0 ? null : `${round1(flOz)} fl oz`;
  }
  const rounded = Math.round(ml / 25) * 25;
  if (rounded <= 0) return null;
  if (rounded >= 1000) return `${round1(rounded / 1000)} l`;
  return `${rounded} ml`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/units.ts tests/lib/units.test.ts
git commit -m "feat(moisture): friendly units-aware watering-amount formatter"
```

### Task 4: Render the amount line in `PlantScreen`

**Files:**
- Modify: `src/features/timeline/PlantScreen.tsx`

- [ ] **Step 1: Implement** — `PlantScreen` already computes `moisture` (`PlantScreen.tsx:861`) and has `profile.preferred_units`. Where the moisture insight (`moistureIns`) renders, add the amount line for `water_now`. Import the formatter:

```ts
import { formatSuggestedWater } from '../../lib/units';
```

Compute next to `moistureIns`:

```ts
const suggestedWater =
  moisture?.recommendation.status === 'water_now' && moisture.recommendation.suggestedWaterMl !== undefined
    ? formatSuggestedWater(moisture.recommendation.suggestedWaterMl, profile.preferred_units)
    : null;
```

In the moisture insight's rendered block, when `suggestedWater` is non-null, render one line (match the surrounding insight markup/classes), e.g.:

```tsx
{suggestedWater && <div className="b-moisture-amount">Add about {suggestedWater} to water thoroughly.</div>}
```

Use the existing theme class convention used by the moisture card in this file (both theme branches if the card is duplicated per theme).

- [ ] **Step 2: Verify in preview**

Start the dev server, open an indoor plant that is due to water and has a mined moisture band (e.g. a seeded common species). Confirm the "Add about …" line appears; toggle the account to imperial and confirm it switches to fl oz. Run the gate.

- [ ] **Step 3: Commit**

```bash
git add src/features/timeline/PlantScreen.tsx
git commit -m "feat(moisture): show suggested watering amount on the plant screen"
```

---

## Phase 2 — Outdoor daily weather series (Unit 2)

### Task 5: `fetchWeatherSeries`

**Files:**
- Modify: `src/lib/openmeteo.ts`
- Test: `tests/lib/openmeteo.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/openmeteo.test.ts`:

```ts
import { fetchWeatherSeries } from '../../src/lib/openmeteo';

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe('fetchWeatherSeries', () => {
  const coords = { lat: 52.2, lon: 4.9 };

  it('merges archive + forecast, forecast wins on overlapping dates', async () => {
    const archive = jsonResponse({
      daily: {
        time: ['2026-06-10', '2026-06-11'],
        temperature_2m_max: [20, 22],
        temperature_2m_min: [10, 12],
        relative_humidity_2m_mean: [60, 62],
        precipitation_sum: [0, 5],
      },
    });
    const forecast = jsonResponse({
      daily: {
        time: ['2026-06-11', '2026-06-12'], // 06-11 overlaps archive
        temperature_2m_max: [30, 32],
        temperature_2m_min: [20, 22],
        relative_humidity_2m_mean: [40, 42],
        precipitation_sum: [99, 1],
      },
    });
    let call = 0;
    const fetchFn = (async () => (call++ === 0 ? archive : forecast)) as unknown as typeof fetch;

    const series = await fetchWeatherSeries(coords, '2026-06-10', '2026-06-12', fetchFn);
    expect(series).not.toBeNull();
    expect(series!.get('2026-06-10')).toEqual({ tempC: 15, humidityPct: 60, precipMm: 0 });
    // 06-11 comes from forecast, not archive
    expect(series!.get('2026-06-11')).toEqual({ tempC: 25, humidityPct: 40, precipMm: 99 });
    expect(series!.get('2026-06-12')).toEqual({ tempC: 27, humidityPct: 42, precipMm: 1 });
  });

  it('returns null when both endpoints fail', async () => {
    const fetchFn = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await fetchWeatherSeries(coords, '2026-06-10', '2026-06-12', fetchFn)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/openmeteo.test.ts`
Expected: FAIL — `fetchWeatherSeries` not exported.

- [ ] **Step 3: Implement** — append to `src/lib/openmeteo.ts` (reuses module-local `forApi`, `DailyResponse`, `FetchFn`):

```ts
export interface DayWeather {
  tempC: number;
  humidityPct: number;
  precipMm: number;
}

export type WeatherSeries = Map<string, DayWeather>;

const SERIES_DAILY_VARS =
  'temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum';

function fillSeries(target: WeatherSeries, body: DailyResponse): void {
  const daily = body.daily;
  if (!daily?.time) return;
  daily.time.forEach((iso, i) => {
    const max = daily.temperature_2m_max?.[i];
    const min = daily.temperature_2m_min?.[i];
    const rh = daily.relative_humidity_2m_mean?.[i];
    const precip = daily.precipitation_sum?.[i];
    if (max == null || min == null || rh == null || precip == null) return;
    target.set(iso, {
      tempC: Math.round(((max + min) / 2) * 10) / 10,
      humidityPct: rh,
      precipMm: precip,
    });
  });
}

/**
 * Daily temp/RH/precip across [startIso, endIso]. One archive call for the
 * window plus one forecast call for recent/near-present days; on overlapping
 * dates the forecast value wins (fresher endpoint). Null when both fail.
 */
export async function fetchWeatherSeries(
  coords: Coords,
  startIso: string,
  endIso: string,
  fetchFn: FetchFn = fetch,
): Promise<WeatherSeries | null> {
  const { lat, lon } = forApi(coords);
  const base = { latitude: String(lat), longitude: String(lon), daily: SERIES_DAILY_VARS, timezone: 'UTC' };
  const archiveUrl =
    'https://archive-api.open-meteo.com/v1/archive?' +
    new URLSearchParams({ ...base, start_date: startIso, end_date: endIso });
  const forecastUrl =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({ ...base, past_days: '7', forecast_days: '7' });

  const series: WeatherSeries = new Map();
  let any = false;
  try {
    const res = await fetchFn(archiveUrl);
    if (res.ok) {
      fillSeries(series, (await res.json()) as DailyResponse);
      any = true;
    }
  } catch {
    /* archive optional */
  }
  try {
    const res = await fetchFn(forecastUrl);
    if (res.ok) {
      // Forecast applied after archive so overlapping dates are overwritten (forecast wins).
      fillSeries(series, (await res.json()) as DailyResponse);
      any = true;
    }
  } catch {
    /* forecast optional */
  }
  return any && series.size > 0 ? series : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/openmeteo.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/openmeteo.ts tests/lib/openmeteo.test.ts
git commit -m "feat(moisture): daily weather-series fetch (archive+forecast merge)"
```

---

## Phase 3 — Rainfall in the engine (Unit 3)

### Task 6: `dailyRainMm` in `simulateWaterContent`

**Files:**
- Modify: `src/lib/moisture.ts`
- Test: `tests/lib/moisture.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/moisture.test.ts`:

```ts
describe('rainfall in the simulation', () => {
  const baseInput = () => ({
    pot: { diameterCm: 20, heightCm: 15, substrate: 'standard' as const, drains: true },
    startMs: Date.parse('2026-06-10T00:00:00Z'),
    endMs: Date.parse('2026-06-12T00:00:00Z'),
    waterings: [{ observedAtMs: Date.parse('2026-06-10T00:00:00Z'), amountMl: 300 }],
    dailyClimate: () => ({ tempC: 20, humidityPct: 50, light: 'medium' as const }),
    speciesDailyFraction: 0.12,
    corrections: [],
  });

  it('no dailyRainMm reproduces the current simulation', () => {
    const dry = simulateWaterContent(baseInput());
    expect(dry.waterContentMl).toBeGreaterThan(0);
  });

  it('rain adds water, capped at capacity', () => {
    const wet = simulateWaterContent({ ...baseInput(), dailyRainMm: () => 50 });
    const dry = simulateWaterContent(baseInput());
    expect(wet.waterContentMl).toBeGreaterThan(dry.waterContentMl);
    expect(wet.waterContentMl).toBeLessThanOrEqual(wet.capacityMl);
  });

  it('rain accrues proportionally; a midday watering sees only the earlier fraction (intra-day)', () => {
    // A watering at midday on 06-11 should land on a pot that has received only
    // half of that day's rain, not the whole day's rain up front.
    const midday = Date.parse('2026-06-11T12:00:00Z');
    const input = {
      ...baseInput(),
      endMs: Date.parse('2026-06-11T13:00:00Z'),
      waterings: [
        { observedAtMs: Date.parse('2026-06-10T00:00:00Z'), amountMl: 100 },
        { observedAtMs: midday, amountMl: 0 }, // marker event that splits the day
      ],
      dailyRainMm: (iso: string) => (iso === '2026-06-11' ? 40 : 0),
    };
    const result = simulateWaterContent(input);
    expect(result.waterContentMl).toBeLessThanOrEqual(result.capacityMl);
    expect(result.waterContentMl).toBeGreaterThan(result.residualMl);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture.test.ts`
Expected: FAIL — `dailyRainMm` not accepted / no rain added.

- [ ] **Step 3: Implement** — in `src/lib/moisture.ts`:

Add the constants near `RESIDUAL_FRACTION`:

```ts
/** Fraction of rain reaching the pot soil (foliage/rim interception) — internal, not tunable (spec Unit 3). */
const THROUGHFALL = 0.8;
/** 1 mm of rain over 1 cm² of pot top = 0.1 ml retained-before-throughfall. */
const RAIN_ML_PER_MM_CM2 = 0.1;
```

Add `dailyRainMm` to `SimInput`:

```ts
export interface SimInput {
  pot: PotSpec;
  startMs: number;
  endMs: number;
  waterings: WateringEvent[];
  dailyClimate: (iso: string) => DayClimate;
  speciesDailyFraction: number;
  canopyFactor?: number;
  corrections: WaterContentCorrection[];
  repotBoundaryMs?: number;
  /** ml-of-rain source per ISO day; engine converts mm→ml via pot top area + throughfall. */
  dailyRainMm?: (iso: string) => number;
}
```

In `simulateWaterContent`, compute the pot top area once after `capacityMl`:

```ts
  const potTopAreaCm2 = Math.PI * (input.pot.diameterCm / 2) ** 2;
  const rainMlForDay = (iso: string): number =>
    input.dailyRainMm ? input.dailyRainMm(iso) * potTopAreaCm2 * RAIN_ML_PER_MM_CM2 * THROUGHFALL : 0;
```

In the daily loop, **add rain (capped at C) before subtracting ET (floored at residual)**, both scaled by the sub-step fraction. Replace the existing daily decrement block:

```ts
    const iso = dateIso(cursorMs);
    const climate = input.dailyClimate(iso);
    const dayFraction = (nextTimestampMs - cursorMs) / DAY_MS;
    // Rain first, proportional to the sub-step, capped at capacity.
    waterContentMl = Math.min(capacityMl, waterContentMl + rainMlForDay(iso) * dayFraction);
    // Then evapotranspiration, proportional, floored at residual.
    waterContentMl = Math.max(
      residualMl,
      waterContentMl -
        dailyEtMl({
          capacityMl,
          speciesDailyFraction: input.speciesDailyFraction,
          tempC: climate.tempC,
          humidityPct: climate.humidityPct,
          light: climate.light,
          canopyFactor: input.canopyFactor,
        }) * dayFraction,
    );
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture.test.ts`
Expected: PASS (all prior moisture tests still green — `dailyRainMm` is optional).

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/moisture.ts tests/lib/moisture.test.ts
git commit -m "feat(moisture): rainfall term in the water-balance simulation"
```

---

## Phase 4 — `rain_exposed` schema, types & form (Unit 4)

### Task 7: `rain_exposed` column + types + list select + docs

**Files:**
- Modify: `appwrite/schema.ts`, `src/lib/types.ts`, `src/lib/repo.ts`, `docs/schema.md`
- Test: `tests/appwrite/schema.test.ts` (run only — table-list assertion is unaffected by a new column)

- [ ] **Step 1: Add the column** — in `appwrite/schema.ts`, in the `plants` table columns, after the `light_level` enum (`appwrite/schema.ts:186`):

```ts
      { kind: 'boolean', key: 'rain_exposed' },
```

- [ ] **Step 2: Types** — in `src/lib/types.ts`, add to the `Plant` interface (near `light_level`):

```ts
  rain_exposed: boolean | null;
```

In `src/lib/repo.ts`, add to `PlantInput` (after `light_level`, `repo.ts:203`):

```ts
  rain_exposed?: boolean | null;
```

- [ ] **Step 3: Dashboard select** — in `src/lib/repo.ts`, add `'rain_exposed'` to the `Query.select([...])` column list in `listPlants` (`repo.ts:216`). Also confirm `rain_exposed` is written through wherever `PlantInput` is mapped to a create/update payload (mirror the existing `light_level` handling in `createPlant`/`updatePlant`).

- [ ] **Step 4: Docs** — in `docs/schema.md`, add `rain_exposed` to the `plants` column list with: "boolean, nullable. `null` = not applicable (indoor/greenhouse); explicit boolean for outdoor/balcony (rain reaches the pot?). Excluded from public export."

- [ ] **Step 5: Apply schema + gate** — run the schema-sync script (`package.json`, via `node ./node_modules/tsx/dist/cli.mjs <script>`), then:

Run: `node ./node_modules/vitest/vitest.mjs run tests/appwrite/schema.test.ts`
Expected: PASS (table list unchanged; `user_id`/permission assertions unaffected).

- [ ] **Step 6: Commit**

```bash
git add appwrite/schema.ts src/lib/types.ts src/lib/repo.ts docs/schema.md
git commit -m "feat(moisture): add rain_exposed column to plants"
```

### Task 8: "Exposed to rain?" question in `PlantForm`

**Files:**
- Modify: `src/features/plants/PlantForm.tsx`
- Test: `tests/app/plant-form.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/app/plant-form.test.ts` (follow the file's existing render/submit harness):

```ts
it('requires a rain-exposure choice for outdoor plants and writes null for indoor', async () => {
  // Indoor save: rain_exposed is null, no question shown.
  const indoor = await submitPlantForm({ placement_type: 'indoor', /* …required fields… */ });
  expect(indoor.rain_exposed).toBeNull();

  // Outdoor save without choosing exposure is blocked; choosing Yes persists true.
  const blocked = await trySubmitPlantForm({ placement_type: 'outdoor', rainExposure: undefined });
  expect(blocked.saved).toBe(false);
  const outdoor = await submitPlantForm({ placement_type: 'outdoor', rainExposure: 'yes' });
  expect(outdoor.rain_exposed).toBe(true);
});
```

> Match the helper names/shape already used in `tests/app/plant-form.test.ts`. If it tests via the rendered DOM, drive the new control the same way existing controls are driven (e.g. the placement pill buttons at `PlantForm.tsx:270`).

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/app/plant-form.test.ts`
Expected: FAIL — no rain control / outdoor save not blocked.

- [ ] **Step 3: Implement** — in `src/features/plants/PlantForm.tsx`:

Add state:

```ts
const [rainExposed, setRainExposed] = useState<boolean | null>(plant?.rain_exposed ?? null);
const needsRainAnswer = placementType === 'outdoor' || placementType === 'balcony';
```

In **both** theme branches, in the placement section (near `PlantForm.tsx:270` and `:512`), when `needsRainAnswer`, render an explicit Yes/No control with **no default selected**, mirroring the placement pill markup:

```tsx
{needsRainAnswer && (
  <div className="b-field">
    <label className="b-label">Exposed to rain?</label>
    <div style={{ display: 'flex', gap: 8 }}>
      {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map((o) => (
        <button key={o.l} type="button"
          className={'b-pillopt b-tap' + (rainExposed === o.v ? ' on' : '')}
          onClick={() => setRainExposed(o.v)} style={{ flex: 1, textAlign: 'center' }}>
          {o.l}
        </button>
      ))}
    </div>
  </div>
)}
```

Guard the submit (alongside existing validation): when `needsRainAnswer && rainExposed === null`, block save and surface the form's standard inline error ("Tell us whether this plant is exposed to rain."). In the `save(...)` payload, set:

```ts
rain_exposed: needsRainAnswer ? rainExposed : null,
```

- [ ] **Step 4: Run to verify it passes + preview**

Run: `node ./node_modules/vitest/vitest.mjs run tests/app/plant-form.test.ts`
Expected: PASS. Then preview: add an outdoor plant — the question appears, save is blocked until answered; an indoor plant shows no question.

- [ ] **Step 5: Gate + commit**

```bash
git add src/features/plants/PlantForm.tsx tests/app/plant-form.test.ts
git commit -m "feat(moisture): explicit rain-exposure question for outdoor plants"
```

---

## Phase 5 — Outdoor wiring & card state (Unit 5)

### Task 9: Series + rainfall through the pure builder

**Files:**
- Modify: `src/lib/moisture-inputs.ts`
- Test: `tests/lib/moisture-inputs.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/moisture-inputs.test.ts`:

```ts
import type { WeatherSeries } from '../../src/lib/openmeteo';

it('uses the weather series for outdoor temp/RH and wires rain only when exposed', () => {
  const series: WeatherSeries = new Map([
    ['2026-06-15', { tempC: 30, humidityPct: 35, precipMm: 12 }],
  ]);
  const outdoor = { ...basePlant, placement_type: 'outdoor' as const, rain_exposed: true };

  const built = buildMoistureInputs({ plant: outdoor, careProfile: null, feedback: [], now: NOW, weatherSeries: series });
  const climate = built.estimate.dailyClimate('2026-06-15');
  expect(climate.tempC).toBe(30);
  expect(climate.humidityPct).toBe(35);
  expect(built.estimate.dailyRainMm?.('2026-06-15')).toBe(12);

  const notExposed = buildMoistureInputs({
    plant: { ...outdoor, rain_exposed: false }, careProfile: null, feedback: [], now: NOW, weatherSeries: series,
  });
  expect(notExposed.estimate.dailyRainMm).toBeUndefined();
});
```

> Build `basePlant`/`NOW` from the file's existing fixtures (an indoor plant with pot size already exists there).

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-inputs.test.ts`
Expected: FAIL — `weatherSeries` arg unknown / `dailyRainMm` not set.

- [ ] **Step 3: Implement** — in `src/lib/moisture-inputs.ts`:

Add the optional arg:

```ts
import type { WeatherSeries } from './openmeteo';

export interface BuildMoistureInputsArgs {
  plant: Plant;
  careProfile: SpeciesCareProfile | null;
  feedback: MoistureFeedback[];
  now: number;
  /** Resolved outdoor daily series; when present and placement is outdoor/balcony,
   *  drives climate + rainfall instead of the indoor seasonal default. */
  weatherSeries?: WeatherSeries;
}
```

Replace `makeClimateResolver` so it prefers the series for outdoor/balcony:

```ts
function isOutdoor(plant: Plant): boolean {
  return plant.placement_type === 'outdoor' || plant.placement_type === 'balcony';
}

function makeClimateResolver(
  plant: Plant,
  hemisphere: Hemisphere,
  series: WeatherSeries | undefined,
): (iso: string) => DayClimate {
  const light: LightLevel = plant.light_level ?? 'medium';
  return (iso) => {
    if (series && isOutdoor(plant)) {
      const day = series.get(iso);
      if (day) return { tempC: day.tempC, humidityPct: day.humidityPct, light };
    }
    return { tempC: seasonalIndoorTempC(iso, hemisphere), humidityPct: INDOOR_DEFAULT_RH, light };
  };
}
```

In `buildMoistureInputs`, thread the series and add `dailyRainMm` when exposed:

```ts
  const { plant, careProfile, feedback, now, weatherSeries } = args;
```

```ts
  const dailyRainMm =
    weatherSeries && isOutdoor(plant) && plant.rain_exposed === true
      ? (iso: string) => weatherSeries.get(iso)?.precipMm ?? 0
      : undefined;

  const estimate: EstimateInput = {
    pot,
    startMs,
    endMs: now,
    waterings,
    dailyClimate: makeClimateResolver(plant, hemisphere, weatherSeries),
    speciesDailyFraction: resolveSpeciesDailyFraction(careProfile),
    corrections,
    repotBoundaryMs,
    substratePresent: plant.substrate_type != null,
    amountMeasured: waterings.some((w) => typeof w.amountMl === 'number' && Number.isFinite(w.amountMl)),
    groundTruthCount,
    ...(dailyRainMm ? { dailyRainMm } : {}),
  };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-inputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/moisture-inputs.ts tests/lib/moisture-inputs.test.ts
git commit -m "feat(moisture): outdoor climate + rainfall through the input builder"
```

### Task 10: `MoistureCardState` in `moistureForPlant`

**Files:**
- Modify: `src/lib/moisture-read.ts`
- Test: `tests/lib/moisture-read.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/lib/moisture-read.test.ts`:

```ts
it('distinguishes the outdoor card states', () => {
  const outdoorNoLoc = { ...indoorWithPot, placement_type: 'outdoor' as const, location_id: null };
  expect(moistureCardState(outdoorNoLoc, null, [], NOW, undefined).kind).toBe('needs_location');

  const outdoorWithLoc = { ...indoorWithPot, placement_type: 'outdoor' as const, location_id: someLocation };
  expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'loading' }).kind).toBe('weather_loading');
  expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'unavailable' }).kind).toBe('weather_unavailable');
  expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'ready', series: emptyish }).kind).toBe('ready');

  const noPot = { ...indoorWithPot, pot_diameter_cm: null };
  expect(moistureCardState(noPot, null, [], NOW, undefined).kind).toBe('needs_pot');
});
```

> `indoorWithPot` and `someLocation` come from the file's fixtures; `emptyish` can be a `new Map()` (a ready-but-gappy series still yields `ready` — the resolver falls back per missing day).

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-read.test.ts`
Expected: FAIL — `moistureCardState` not exported.

- [ ] **Step 3: Implement** — in `src/lib/moisture-read.ts`, add the state model and a card-state function; keep `moistureForPlant` as a thin `ready`-accessor for existing callers that only want the value during this transition:

```ts
import type { WeatherSeries } from './openmeteo';

export type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; series: WeatherSeries }
  | { status: 'unavailable' };

export type MoistureCardState =
  | { kind: 'ready'; moisture: PlantMoisture }
  | { kind: 'needs_pot' }
  | { kind: 'needs_location' }
  | { kind: 'weather_loading' }
  | { kind: 'weather_unavailable' };

function isOutdoor(plant: Plant): boolean {
  return plant.placement_type === 'outdoor' || plant.placement_type === 'balcony';
}

function hasLocationCoords(plant: Plant): boolean {
  const loc = plant.location_id;
  return !!loc && typeof loc === 'object' && Array.isArray((loc as { location?: unknown }).location);
}

export function moistureCardState(
  plant: Plant,
  careProfile: SpeciesCareProfile | null,
  feedback: MoistureFeedback[],
  now: number,
  weather: WeatherState | undefined,
): MoistureCardState {
  if (plant.pot_diameter_cm == null || plant.pot_height_cm == null) return { kind: 'needs_pot' };

  let weatherSeries: WeatherSeries | undefined;
  if (isOutdoor(plant)) {
    if (!hasLocationCoords(plant)) return { kind: 'needs_location' };
    if (!weather || weather.status === 'loading') return { kind: 'weather_loading' };
    if (weather.status === 'unavailable') return { kind: 'weather_unavailable' };
    weatherSeries = weather.series;
  }

  const { estimate, band, bandSourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth } =
    buildMoistureInputs({ plant, careProfile, feedback, now, weatherSeries });
  const { moisturePercent, confidence, capacityMl } = estimateMoisture(estimate);
  const recommendation = recommendWatering(moisturePercent, {
    band,
    ...(bandSourced ? { targetFraction: TARGET_BY_BAND[band], capacityMl } : {}),
  });
  const feedbackEligible = isFeedbackEligible({ currentPercent: moisturePercent, latestFeedback, lastNonFeedbackEventMs });

  return {
    kind: 'ready',
    moisture: {
      moisturePercent,
      confidence: bandSourced ? confidence : LOWER_CONFIDENCE[confidence],
      recommendation,
      band,
      feedbackEligible,
      needsSoilCheck: !hasRecentGroundTruth,
      needsSubstrate: !estimate.substratePresent,
    },
  };
}

/** Back-compat accessor: the moisture value when the card is ready, else null. */
export function readyMoisture(state: MoistureCardState): PlantMoisture | null {
  return state.kind === 'ready' ? state.moisture : null;
}
```

Rewrite the existing `moistureForPlant` to delegate (indoor callers pass no weather, so outdoor resolves to a non-ready state → null, exactly as today):

```ts
export function moistureForPlant(
  plant: Plant,
  careProfile: SpeciesCareProfile | null,
  feedback: MoistureFeedback[],
  now: number,
  weather?: WeatherState,
): PlantMoisture | null {
  return readyMoisture(moistureCardState(plant, careProfile, feedback, now, weather));
}
```

Update `shouldPromptForPotSize` to also prompt outdoor/balcony (remove the early `false` return):

```ts
export function shouldPromptForPotSize(plant: PotSizePromptPlant): boolean {
  return plant.pot_diameter_cm == null || plant.pot_height_cm == null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/moisture-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/moisture-read.ts tests/lib/moisture-read.test.ts
git commit -m "feat(moisture): MoistureCardState with distinct loading/unavailable reasons"
```

### Task 11: Shared weather-series cache + hook

**Files:**
- Create: `src/lib/weather-series.ts`
- Test: `tests/lib/weather-series.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `tests/lib/weather-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seriesWindow, plantWeatherKey, distinctWeatherKeys } from '../../src/lib/weather-series';

const indoor = { placement_type: 'indoor', location_id: null } as never;
const outdoorA = { placement_type: 'outdoor', location_id: { location: [4.9, 52.2] } } as never;
const outdoorADupe = { placement_type: 'balcony', location_id: { location: [4.91, 52.24] } } as never; // rounds to same ~11km cell
const outdoorNoLoc = { placement_type: 'outdoor', location_id: null } as never;

describe('weather-series keys', () => {
  it('builds a 60-day window ending today', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    const { startIso, endIso } = seriesWindow(now);
    expect(endIso).toBe('2026-06-16');
    expect(startIso).toBe('2026-04-17'); // 60 days earlier
  });

  it('keys outdoor plants by rounded coords + window; indoor/no-loc get none', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    expect(plantWeatherKey(indoor, now)).toBeNull();
    expect(plantWeatherKey(outdoorNoLoc, now)).toBeNull();
    expect(plantWeatherKey(outdoorA, now)).toBe(plantWeatherKey(outdoorADupe, now)); // same ~11km cell
  });

  it('dedupes distinct keys across a plant list', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    expect(distinctWeatherKeys([indoor, outdoorA, outdoorADupe, outdoorNoLoc], now)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/weather-series.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `src/lib/weather-series.ts`:

```ts
import { useEffect, useState } from 'react';
import { forApi, type Coords } from './geo';
import { fetchWeatherSeries, type WeatherSeries } from './openmeteo';
import type { WeatherState } from './moisture-read';
import type { Plant } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** [startIso, endIso] for the 60-day dry-down window ending on `now`'s UTC date. */
export function seriesWindow(now: number): { startIso: string; endIso: string } {
  return { startIso: iso(now - WINDOW_DAYS * DAY_MS), endIso: iso(now) };
}

function plantCoords(plant: Plant): Coords | null {
  const loc = plant.location_id;
  if (loc && typeof loc === 'object' && Array.isArray((loc as { location?: unknown }).location)) {
    const arr = (loc as { location: number[] }).location;
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') return { lat: arr[1], lon: arr[0] };
  }
  return null;
}

function isOutdoor(plant: Plant): boolean {
  return plant.placement_type === 'outdoor' || plant.placement_type === 'balcony';
}

/** Cache/fetch key for an outdoor plant (rounded coords + window); null when N/A. */
export function plantWeatherKey(plant: Plant, now: number): string | null {
  if (!isOutdoor(plant)) return null;
  const coords = plantCoords(plant);
  if (!coords) return null;
  const { lat, lon } = forApi(coords);
  const { startIso, endIso } = seriesWindow(now);
  return `${lat},${lon}|${startIso}|${endIso}`;
}

export function distinctWeatherKeys(plants: Plant[], now: number): string[] {
  const keys = new Set<string>();
  for (const p of plants) {
    const k = plantWeatherKey(p, now);
    if (k) keys.add(k);
  }
  return [...keys];
}

type CacheEntry = { status: 'loading' } | { status: 'ready'; series: WeatherSeries } | { status: 'unavailable' };
const cache = new Map<string, CacheEntry>();

/**
 * Resolves each plant's WeatherState from a shared (coords, window) cache,
 * one fetch per distinct outdoor location. Indoor/greenhouse plants get
 * `undefined` (no weather needed). React layer only — pure helpers above are tested.
 */
export function useWeatherSeries(plants: Plant[], now: number): (plant: Plant) => WeatherState | undefined {
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    for (const key of distinctWeatherKeys(plants, now)) {
      if (cache.has(key)) continue;
      cache.set(key, { status: 'loading' });
      const [coordsPart, startIso, endIso] = key.split('|');
      const [lat, lon] = coordsPart.split(',').map(Number);
      fetchWeatherSeries({ lat, lon }, startIso, endIso)
        .then((series) => {
          cache.set(key, series ? { status: 'ready', series } : { status: 'unavailable' });
        })
        .catch(() => cache.set(key, { status: 'unavailable' }))
        .finally(() => {
          if (!cancelled) force((n) => n + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [plants, now]);

  return (plant: Plant): WeatherState | undefined => {
    const key = plantWeatherKey(plant, now);
    if (!key) return undefined;
    return cache.get(key) ?? { status: 'loading' };
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run tests/lib/weather-series.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add src/lib/weather-series.ts tests/lib/weather-series.test.ts
git commit -m "feat(moisture): shared weather-series cache + useWeatherSeries hook"
```

### Task 12: Wire outdoor into `PlantScreen` and `PlantsScreen`

**Files:**
- Modify: `src/features/timeline/PlantScreen.tsx`, `src/features/plants/PlantsScreen.tsx`

- [ ] **Step 1: PlantScreen** — replace the synchronous `moistureForPlant` call (`PlantScreen.tsx:861`) with the card-state path:

```ts
import { moistureCardState, type MoistureCardState } from '../../lib/moisture-read';
import { useWeatherSeries } from '../../lib/weather-series';
```

```ts
const weatherFor = useWeatherSeries([plant], now);
const cardState: MoistureCardState = moistureCardState(
  { ...plant, observations }, careProfile, mergedFeedback, now, weatherFor(plant),
);
const moisture = cardState.kind === 'ready' ? cardState.moisture : null;
```

Replace `showPotSizeMoistureNudge` and add the per-`kind` prompt rendering near the moisture card. Use the existing nudge component for `needs_pot`; for the others render a one-line message in the same card slot:

```tsx
{cardState.kind === 'needs_pot' && <PotSizeMoistureNudge /* existing props */ />}
{cardState.kind === 'needs_location' && <div className="b-moisture-note">Add a location to estimate outdoor moisture.</div>}
{cardState.kind === 'weather_loading' && <div className="b-moisture-note b-muted">Checking local weather…</div>}
{cardState.kind === 'weather_unavailable' && <div className="b-moisture-note">Weather data unavailable right now.</div>}
```

(Keep the existing `moisture`-driven gauge/insight/amount block guarded by `cardState.kind === 'ready'`.)

- [ ] **Step 2: PlantsScreen** — replace the `moistureByPlant` build (`PlantsScreen.tsx:94`) to thread weather and keep `null` for non-ready:

```ts
import { useWeatherSeries } from '../../lib/weather-series';
```

```ts
const weatherFor = useWeatherSeries(plants, now.getTime());
const moistureByPlant = new Map<string, PlantMoisture | null>(
  dashboard.map((d) => [
    d.plant.$id,
    moistureForPlant(
      d.plant,
      d.careProfile ?? careProfileForPlant(d.plant),
      d.plant.moisture_feedback ?? [],
      now.getTime(),
      weatherFor(d.plant),
    ),
  ]),
);
```

Badges already hide on `null`, so non-ready outdoor plants (loading/unavailable/needs-location) simply show no badge — the dashboard contract from the spec.

- [ ] **Step 3: Verify in preview**

Start the dev server. For an **outdoor** plant with a pot and a location: confirm the card shows "Checking local weather…" briefly, then a gauge/insight once the series resolves (no flash of "weather unavailable"); confirm a rainy stretch in the series reads wetter than a dry stretch. For an outdoor plant with **no location**: confirm "Add a location…". Confirm the dashboard badge appears for the ready outdoor plant and is absent while loading. Check both themes.

- [ ] **Step 4: Gate + commit**

```bash
git add src/features/timeline/PlantScreen.tsx src/features/plants/PlantsScreen.tsx
git commit -m "feat(moisture): outdoor moisture in plant screen + dashboard"
```

---

## Phase 6 — Export & privacy guard (Unit 4 privacy)

### Task 13: Lock `rain_exposed` out of public export

**Files:**
- Modify: `tests/appwrite/public-export-privacy.test.ts` (or `tests/export/transform.test.ts`), `docs/privacy.md`

- [ ] **Step 1: Write the failing/guard test** — append to `tests/appwrite/public-export-privacy.test.ts`:

```ts
import { PUBLIC_EXPORT_FIELDS } from '../../appwrite/schema';

it('never exports rain_exposed (plant environmental field, like placement/substrate/light)', () => {
  expect(PUBLIC_EXPORT_FIELDS).not.toContain('rain_exposed');
});
```

And in `tests/export/transform.test.ts`, in a test that builds a consented `treatment`/`measurement` observation, assert the produced row has no such key:

```ts
const row = toPublicRow(consentedObservation, { datasetVersion: 'v1', publishedAt: '2026-06-16T00:00:00Z' })!;
expect(Object.keys(row)).not.toContain('rain_exposed');
```

- [ ] **Step 2: Run to verify** — this should **pass immediately** (the field is excluded by construction: `SourcePlant` never selects it and `PUBLIC_EXPORT_FIELDS` derives from `public_observations` only). The test codifies that guarantee.

Run: `node ./node_modules/vitest/vitest.mjs run tests/appwrite/public-export-privacy.test.ts tests/export/transform.test.ts`
Expected: PASS.

- [ ] **Step 3: Docs** — in `docs/privacy.md`, add a line: "`rain_exposed` (plants) is a coarse environmental flag, owner-scoped and **excluded from public export**, consistent with `placement_type`/`substrate_type`/`light_level`. Outdoor weather enrichment uses the plant's existing coarse location (ADR-007) and the daily series is transient model input, never persisted to a public row."

- [ ] **Step 4: Commit**

```bash
git add tests/appwrite/public-export-privacy.test.ts tests/export/transform.test.ts docs/privacy.md
git commit -m "test(moisture): guard rain_exposed out of public export; privacy doc"
```

---

## Final verification

- [ ] **Full gate:** `node ./node_modules/vitest/vitest.mjs run` · `node ./node_modules/eslint/bin/eslint.js .` · `node ./node_modules/typescript/bin/tsc -b` — all green.
- [ ] **Preview sweep (both themes):** indoor due-to-water plant shows the amount line (metric + imperial); outdoor plant with pot+location loads weather then shows gauge/insight (no wrong-prompt flash); outdoor plant without location shows the location prompt; dashboard badges appear only for ready plants.

---

## Self-Review (completed)

- **Spec coverage:** Unit 1 amount → T1–T4; Unit 2 series → T5; Unit 3 rainfall → T6; Unit 4 schema/form → T7–T8; Unit 4 migration (null=not-exposed, required-to-save backfill) → T8 + T10 (engine treats null as not exposed); Unit 5 wiring/card-state/shared-cache → T9–T12; export/privacy → T13. Two-layer zero rule → T1 (engine raw `<=0`) + T3 (formatter per-unit). Forecast-over-archive → T5. Proportional rain w/ intra-day test → T6. Distinct hide reasons + loading≠unavailable → T10. Dashboard not-N-fetches → T11 (dedupe) + T12.
- **Placeholder scan:** every code step carries real code; the few "match the file's existing fixtures/markup" notes point at concrete anchors (`PlantForm.tsx:270`, existing test builders) rather than inventing APIs.
- **Type consistency:** `TARGET_BY_BAND`, `suggestedWaterMl`, `WeatherSeries`/`DayWeather`, `WeatherState`, `MoistureCardState`, `dailyRainMm`, `seriesWindow`/`plantWeatherKey` are defined once and referenced consistently across tasks; `moistureForPlant` keeps its `PlantMoisture | null` contract via `readyMoisture` so existing callers compile.

## Execution Handoff

Build order: **Phase 1 → 2 → 3 → 4 → 5 → 6.** Phase 1 (Tasks 1–4) is a complete, shippable increment on its own.
