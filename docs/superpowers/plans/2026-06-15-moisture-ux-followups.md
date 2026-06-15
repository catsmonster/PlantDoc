# Moisture UX Follow-ups Implementation Plan

> **For agentic workers:** Executed inline (executing-plans) by the controller who already holds full repo context. TDD per task; run `npm test` after each; verify the two visual tasks (E1, E2) in the browser preview. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship three approved moisture UX enhancements — collapsible insight/care cards, an at-a-glance home-card moisture gauge, and Gemini AI-preview enrichment with PlantDoc's own moisture estimate + species care facts — on branch `feat/moisture-ux-followups`.

**Architecture:** A shared prerequisite extracts the status→color helper into the pure `moisture.ts` so the plant-detail hero and the new home-card chip read one scale. E3 extends the existing client-built Gemini payload (no worker change). E2 adds a moisture-capable dashboard read and computes `moistureForPlant` per card. E1 adds a reusable themed `Collapsible` and wraps three detail blocks.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest (`tests/` mirrors `src/`, components tested via `renderToStaticMarkup`, repo via mocked `tablesDB`, screen logic via pure helpers).

**Invariants that must hold (from the moisture v1 design):**
- Watering cadence / health symptoms NEVER calibrate the estimate.
- Species `band` colors wording/`speciesDailyFraction` only — NEVER moves the `ANCHORS` thresholds.
- `moisture_feedback` is private telemetry — NEVER exported or sent to Gemini; only the derived estimate may leave the device.

---

## Task 1: Extract `moistureStatusColor` into `src/lib/moisture.ts` (shared prereq)

**Files:**
- Modify: `src/lib/moisture.ts` (add exported helper near the `WateringStatus` consumers)
- Modify: `src/features/timeline/PlantScreen.tsx:84-98` (delete local copy, import shared)
- Test: `tests/lib/moisture.test.ts`

- [ ] **Step 1 — Failing test.** Append to `tests/lib/moisture.test.ts`:

```ts
import { moistureStatusColor } from '../../src/lib/moisture';

describe('moistureStatusColor', () => {
  it('returns the dark-theme accent per status', () => {
    expect(moistureStatusColor('comfortable', true)).toBe('#C7F24A');
    expect(moistureStatusColor('drying', true)).toBe('#E0C56B');
    expect(moistureStatusColor('water_now', true)).toBe('#E0A36B');
    expect(moistureStatusColor('overwatered', true)).toBe('#7FC8E0');
  });
  it('returns the light-theme accent per status', () => {
    expect(moistureStatusColor('comfortable', false)).toBe('#3C7140');
    expect(moistureStatusColor('drying', false)).toBe('#A88A3C');
    expect(moistureStatusColor('water_now', false)).toBe('#B07F57');
    expect(moistureStatusColor('overwatered', false)).toBe('#3F7E91');
  });
});
```

- [ ] **Step 2 — Run, expect fail** (`moistureStatusColor` not exported).
- [ ] **Step 3 — Implement.** Add to `src/lib/moisture.ts` (after the `WateringStatus` type / status maps):

```ts
/** Status→accent color for the moisture %, per theme. Shared by the plant-detail
 *  hero gauge and the home dashboard chip so both render on one scale. */
export function moistureStatusColor(status: WateringStatus, isDark: boolean): string {
  const dark: Record<WateringStatus, string> = {
    comfortable: '#C7F24A',
    drying: '#E0C56B',
    water_now: '#E0A36B',
    overwatered: '#7FC8E0',
  };
  const light: Record<WateringStatus, string> = {
    comfortable: '#3C7140',
    drying: '#A88A3C',
    water_now: '#B07F57',
    overwatered: '#3F7E91',
  };
  return (isDark ? dark : light)[status];
}
```

- [ ] **Step 4 — Update PlantScreen.tsx.** Delete the local `moistureStatusColor` (lines 84-98). Change the import on line 6 from
  `import { moistureInsight, type WateringStatus } from '../../lib/moisture';`
  to `import { moistureInsight, moistureStatusColor } from '../../lib/moisture';`
  (`WateringStatus` becomes unused once the local fn is gone — dropping it avoids the lint/tsc unused error).
- [ ] **Step 5 — Run `npm test` + `npx tsc -b`; commit.**

---

## Task 2: Feed Gemini our estimate + species care facts (E3)

**Files:**
- Modify: `src/lib/gemini-preview.ts` (extend `GeminiPlantSummary`, builder params, `buildPrompt`)
- Modify: `src/features/timeline/PlantScreen.tsx:772` (pass `moisture` + `careProfile` at call site)
- Test: `tests/lib/gemini-preview.test.ts`

No worker change: `isValidPreviewPayload` (`src/worker.ts:35`) only checks required `plantSummary`/`image` fields and accepts extra optional fields; the new data rides inside `plantSummary`.

- [ ] **Step 1 — Failing tests.** Extend `tests/lib/gemini-preview.test.ts`. Add a test that passes a derived estimate + a `SpeciesCareProfile` and asserts the serialized payload contains the estimate fields and care reference, and a privacy test asserting raw feedback never leaks:

```ts
const moistureArg = {
  moisturePercent: 18,
  confidence: 'medium' as const,
  recommendation: { status: 'water_now' as const, daysUntilDry: 0.4 },
  band: 'dry' as const,
};
const careArg = {
  scientificName: 'Monstera deliciosa', family: { value: 'Araceae', sourceId: 'powo' },
  light: { value: 'Bright indirect', sourceId: 'plantdoc-editorial' },
  waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: 'plantdoc-editorial' },
  comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: 'plantdoc-editorial' },
  humidity: { value: 'Average', sourceId: 'plantdoc-editorial' },
  toxicity: { value: 'Toxic to pets', sourceId: 'plantdoc-editorial' },
  commonStressSigns: { value: ['Yellowing'], sourceId: 'plantdoc-editorial' },
  likelyPests: { value: ['Thrips'], sourceId: 'plantdoc-editorial' },
} as unknown as import('../../src/lib/knowledge/care-profiles').SpeciesCareProfile;

it('includes the derived moisture estimate and species care reference, never raw feedback', () => {
  const payload = buildPlantGeminiPreviewPayload(plant(), 'metric', undefined, moistureArg, careArg);
  const s = JSON.stringify(payload);
  expect(s).toContain('moistureEstimate');
  expect(s).toContain('water_now');           // status surfaced
  expect(s).toContain('careReference');
  expect(s).toContain('Thrips');              // care fact surfaced
  expect(s).not.toContain('moisture_feedback');
  expect(s).not.toContain('estimate_feedback');
});

it('omits the estimate and reference cleanly when not supplied', () => {
  const payload = buildPlantGeminiPreviewPayload(plant(), 'metric');
  const s = JSON.stringify(payload);
  expect(s).not.toContain('moistureEstimate');
  expect(s).not.toContain('careReference');
});
```

- [ ] **Step 2 — Run, expect fail** (extra params/fields don't exist yet).
- [ ] **Step 3 — Implement types.** In `gemini-preview.ts` add interfaces and extend `GeminiPlantSummary`:

```ts
export interface GeminiMoistureEstimate {
  percent: number;
  confidence: Confidence;        // import type Confidence from './moisture'
  status: WateringStatus;        // import type WateringStatus from './moisture'
  band: MoistureBand;            // import type MoistureBand from './moisture'
  recommendation: string;        // human phrase, e.g. 'likely dry enough to water'
  daysUntilDry?: number;
}

export interface GeminiCareReference {
  scientificName?: string;
  family?: string;
  light?: string;
  waterCadenceDays?: { min: number; max: number };
  comfortableTemperatureC?: { min: number; max: number };
  humidity?: string;
  toxicity?: string;
  commonStressSigns?: string[];
  likelyPests?: string[];
  communityRanges?: { label: string; min: number; max: number; unit: string }[];
  cultivationFacts?: { label: string; value: string }[];
}
```
Add `moistureEstimate?: GeminiMoistureEstimate;` and `careReference?: GeminiCareReference;` to `GeminiPlantSummary`.

- [ ] **Step 4 — Implement builders.** Add two pure mappers (`PlantMoisture` from `./moisture-read`, `SpeciesCareProfile` from `./knowledge/care-profiles`) that derive ONLY from already-public data — never touch `moisture_feedback`. Drop empty editorial sentinels (`''` / `{0,0}`) so blanks don't surface:

```ts
function summarizeMoisture(m: PlantMoisture | null | undefined): GeminiMoistureEstimate | undefined {
  if (!m) return undefined;
  return compactObject({
    percent: Math.round(m.moisturePercent),
    confidence: m.confidence,
    status: m.recommendation.status,
    band: m.band,
    recommendation: MOISTURE_STATUS_PHRASE[m.recommendation.status],
    daysUntilDry: m.recommendation.daysUntilDry == null
      ? undefined
      : Math.round(m.recommendation.daysUntilDry * 10) / 10,
  });
}
function summarizeCareReference(p: SpeciesCareProfile | null | undefined): GeminiCareReference | undefined {
  if (!p) return undefined;
  const text = (f: { value: string }) => (f.value.trim() ? f.value : undefined);
  const range = (f: { value: { min: number; max: number } }) =>
    f.value.min === 0 && f.value.max === 0 ? undefined : f.value;
  const list = (f: { value: string[] }) => (f.value.length ? f.value : undefined);
  const ref = compactObject({
    scientificName: p.scientificName || undefined,
    family: text(p.family), light: text(p.light),
    waterCadenceDays: range(p.waterCadenceDays),
    comfortableTemperatureC: range(p.comfortableTemperatureC),
    humidity: text(p.humidity), toxicity: text(p.toxicity),
    commonStressSigns: list(p.commonStressSigns), likelyPests: list(p.likelyPests),
    communityRanges: p.communityRanges?.map((r) => ({ label: r.label, min: r.min, max: r.max, unit: r.unit })),
    cultivationFacts: p.cultivationFacts?.map((c) => ({ label: c.label, value: c.value })),
  });
  return Object.keys(ref).length ? ref : undefined;
}
```
Define `MOISTURE_STATUS_PHRASE: Record<WateringStatus, string>` reusing the same phrasing as `MOISTURE_INSIGHT_STATUS_PHRASE` in moisture.ts (export and import it, or duplicate the four-entry map — prefer exporting the existing one to stay DRY).

Extend the signature and `compactObject` summary:
```ts
export function buildPlantGeminiPreviewPayload(
  plant: Plant, units: Units, image?: GeminiPreviewImage,
  moisture?: PlantMoisture | null, careProfile?: SpeciesCareProfile | null,
): GeminiPreviewPayload {
  ...
  const summary = compactObject({
    ...existing fields...,
    moistureEstimate: summarizeMoisture(moisture),
    careReference: summarizeCareReference(careProfile),
  });
  ...
}
```

- [ ] **Step 5 — Render in `buildPrompt`.** Add two lines before the JSON dump so the model treats them as prior + reference, e.g.:
  `'The "moistureEstimate" field is PlantDoc\'s own physics-based soil-moisture model output — treat it as a prior, not ground truth.'` and
  `'The "careReference" field holds sourced species care facts — use them to ground advice; do not contradict them without explaining why.'`
  Keep the existing "Never mention private notes, hidden IDs, or exact location" line.

- [ ] **Step 6 — Call site.** `PlantScreen.tsx:772` — `moisture` and `careProfile` are already in scope (lines 723-724). Update to:
```ts
const payload = buildPlantGeminiPreviewPayload(
  plant, profile.preferred_units, imageResult.image, moisture, careProfile,
);
```

- [ ] **Step 7 — Run `npm test` + `npx tsc -b`; commit.**

---

## Task 3: Home-card moisture gauge (E2)

**Files:**
- Modify: `src/lib/repo.ts` (add `listPlantsForDashboard` hydrating moisture inputs + species care_facts)
- Modify: `src/features/plants/PlantsScreen.tsx` (compute per-card moisture, render chip)
- Test: `tests/lib/repo.test.ts` (query shape + care-profile composition)

`listPlants` stays scalar-only for other callers; the dashboard switches to the new read (user chose "recompute live, extend the query").

- [ ] **Step 1 — Failing repo test.** In `tests/lib/repo.test.ts` add a `describe('listPlantsForDashboard')` that mocks `listRows` to return one plant with `pot_diameter_cm`, `pot_height_cm`, `observations`, `moisture_feedback`, and a `species_id` object carrying `care_facts`. Assert: (a) the `select:` query string contains `observations.treatments.*`, `observations.measurements.*`, `moisture_feedback.*`, `species_id.*`, `species_id.care_facts.*`, and `location_id.*`; (b) the returned rows expose a composed `careProfile` (table-backed when care_facts present, else `null`). Mirror the `Query.select` serialization already used in this file.

- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement repo read.** Add to `repo.ts`:
```ts
export interface DashboardPlant {
  plant: Plant;
  /** Table-backed care profile (null when the species has no mined facts).
   *  The dashboard applies the bundled editorial fallback at compute time. */
  careProfile: SpeciesCareProfile | null;
}

/** Moisture-capable dashboard read: hydrates the relationship columns
 *  moistureForPlant needs (pot dims are scalar; observations/feedback/species
 *  facts are relational), so the home cards recompute the same % the detail
 *  screen shows. Heavier than listPlants by design (user-approved). */
export async function listPlantsForDashboard(userId: string): Promise<DashboardPlant[]> {
  const result = await tablesDB.listRows({
    databaseId: db, tableId: 'plants',
    queries: [
      Query.equal('user_id', userId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      Query.select([
        '*',
        'species_id.*', 'species_id.care_facts.*',
        'location_id.*',
        'observations.*', 'observations.treatments.*', 'observations.measurements.*',
        'moisture_feedback.*',
      ]),
    ],
  });
  const plants = result.rows as unknown as Plant[];
  return plants.map((plant) => {
    plant.observations = [...(plant.observations ?? [])].sort((a, b) =>
      b.observed_at.localeCompare(a.observed_at));
    return { plant, careProfile: careProfileFromHydratedSpecies(plant) };
  });
}

/** Compose the table-backed profile from an already-hydrated species relation,
 *  reusing the same path as getCareProfile. Returns null when no facts. */
function careProfileFromHydratedSpecies(plant: Plant): SpeciesCareProfile | null {
  const species = plant.species_id;
  if (!species || typeof species !== 'object') return null;
  const facts = careFactsFromSpeciesRow(species as never, (id) => (getSource(id) ? id : 'plantdoc-editorial'));
  const r = species as { scientific_name?: string; slug?: string; common_names?: string[]; $id?: string };
  return composeCareProfile(r.scientific_name ?? '', facts, {
    slug: r.slug ?? r.$id ?? '', commonNames: r.common_names ?? [], synonyms: [], nameSourceId: 'powo',
  });
}
```
(Confirm `careFactsFromSpeciesRow`, `composeCareProfile`, `getSource` are already imported in repo.ts from the `getCareProfile` work; add imports if missing.)

- [ ] **Step 4 — Wire PlantsScreen.** Switch the load to `listPlantsForDashboard`; keep state as the hydrated plants plus a per-id moisture map. For each visible card compute once:
```ts
import { moistureForPlant } from '../../lib/moisture-read';
import { moistureStatusColor } from '../../lib/moisture';
import { careProfileForPlant } from '../../lib/knowledge/care-profiles';
// per card (dp: DashboardPlant):
const m = moistureForPlant(dp.plant, dp.careProfile ?? careProfileForPlant(dp.plant), dp.plant.moisture_feedback ?? [], now.getTime());
```
`isPlantThirstyFromSummary` still works on the hydrated plant (scalar summary fields are present under `*`).

- [ ] **Step 5 — Render the chip.** When `m` is non-null render a compact status chip: droplet icon + `Math.round(m.moisturePercent)%`, tinted by `moistureStatusColor(m.recommendation.status, isDark)`.
  - Dark theme: add into the top overlay chip row (the `position:absolute; top:14` flex container at `PlantsScreen.tsx:250`), beside the existing Water chip, using the same `mono` pill styling but tinted background `rgba(...,.18)` / colored text.
  - Light theme: add into the metadata row (`PlantsScreen.tsx:503-509`) after the last-watered segment, with a `·` separator, droplet + `NN%` in the status color.
  - Null → render nothing. Keep the existing rules-based Water/Thirsty chip untouched (different signal).

- [ ] **Step 6 — Verify in preview** (run dev server, load home in both themes, confirm % chip appears for an indoor potted plant and is absent for an outdoor/no-pot plant). **Step 7 — `npm test` + `npx tsc -b`; commit.**

---

## Task 4: Collapsible insight / care cards (E1)

**Files:**
- Create: `src/ui/Collapsible.tsx`
- Modify: `src/features/timeline/PlantScreen.tsx` (wrap three blocks, both themes)
- Test: `tests/ui/Collapsible.test.tsx`

- [ ] **Step 1 — Failing test.** `tests/ui/Collapsible.test.tsx` (mirror `CareProfilePanel.test.ts`, SSR via `renderToStaticMarkup`):
```ts
const render = (isDark: boolean, defaultOpen: boolean) =>
  renderToStaticMarkup(createElement(Collapsible,
    { title: 'Species care guide', isDark, defaultOpen }, createElement('p', null, 'BODY')));

it.each([true, false])('renders the header title and keeps body mounted (isDark=%s)', (isDark) => {
  const html = render(isDark, false);
  expect(html).toContain('Species care guide');
  expect(html).toContain('BODY');               // children mounted even when collapsed (CSS-animated)
  expect(html).toContain('aria-expanded="false"');
});
it('reflects defaultOpen in aria-expanded', () => {
  expect(render(true, true)).toContain('aria-expanded="true"');
});
```
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement `Collapsible.tsx`.** Themed header `<button>` (title + `chevronDown` Icon rotated by open state) toggling ephemeral `useState(defaultOpen)`; body animated via the CSS grid-rows trick (`gridTemplateRows: open ? '1fr' : '0fr'`, inner `overflow:hidden`) so children stay mounted (SSR-testable) and height animates without measuring. Props: `{ title: string; isDark: boolean; defaultOpen?: boolean; children: ReactNode; badge?: ReactNode }`. Set `aria-expanded={open}` on the button. Dark text `#F2F6EF`/border `rgba(255,255,255,.09)`; light text `#23302A`/border `#E7E0D2`. Use existing `b-tap`/`a-tap` press classes.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Wire into PlantScreen (dark + light).** Three collapsibles per theme:
  1. **Moisture** — `defaultOpen` true. Wrap the moisture insight block (dark `PlantScreen.tsx:958-975`, light `1263-1280`) with title "Soil moisture" + an EXPERIMENTAL badge.
  2. **Care insights (generic list)** — `defaultOpen` false. Wrap the `insights.map(...)` list (dark `976+`, light `1281+`); keep the 👍/👎 feedback and `AiPreviewBlock` inside.
  3. **Species care guide** — `defaultOpen` false. Wrap `<CareProfilePanel .../>` (dark `943-945`, light `1248-1250`).
  Keep `TrendsCard` and the hero gauge as-is (not collapsed). Preserve the existing "Care insights / EXPERIMENTAL" section semantics — the moisture + generic-list collapsibles together replace that inner structure.
- [ ] **Step 6 — Verify in preview** (both themes: cards start collapsed except moisture; clicking a header animates open/closed; feedback buttons + AI preview still work inside the insights collapsible). **Step 7 — `npm test` + `npx tsc -b`; commit.**

---

## Final pass
- [ ] Full `npm test`, `npx tsc -b`, `npm run lint`.
- [ ] `superpowers:finishing-a-development-branch` to integrate (push + PR, squash-merge per repo convention).
