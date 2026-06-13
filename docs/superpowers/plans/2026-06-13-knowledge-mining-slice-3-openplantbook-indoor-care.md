# Knowledge Mining — Slice 3: OpenPlantbook Indoor Care Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the houseplant-care gap with real indoor ranges (temperature, humidity, light in lux, soil moisture, soil EC) mined from OpenPlantbook, stored as `community_unverified` care facts and surfaced in the plant-detail panel under a clearly-distinct "community-sourced · unverified" block, kept visibly separate from the sourced/editorial facts.

**Architecture:** A new `openplantbook.ts` extractor (OAuth token → fuzzy search → exact-match pick → detail → pure parser producing `CareFact[]` at `community_unverified` trust). `composeCareProfile` gains a `communityRanges` projection that pulls those numeric indoor facts out for display without disturbing the sourced/editorial fields (which still win precedence). The panel renders them in a separate labeled block. A new `knowledge:mine-openplantbook` loader does the live keyed pull; loader clearing becomes **source-scoped** so editorial + OpenPlantbook loaders compose regardless of run order.

**Tech Stack:** TypeScript, Vitest (node + SSR `renderToStaticMarkup`), node-appwrite admin client, OpenPlantbook REST API (OAuth2 client-credentials).

**License note:** OpenPlantbook states "Anyone can use information from the database for any purpose without limitations" (verified 2026-06-13, open.plantbook.io). Modeled as `license: public-domain`, `commercial_ok: true`, `quarantined: false`, with the exact terms + the crowd-sourced caveat in the attribution string; data quality is conveyed by the `community_unverified` trust on every fact. No schema change.

---

## File structure

- `src/lib/knowledge/sources.ts` (modify) — register the `openplantbook` source.
- `src/lib/knowledge/openplantbook.ts` (create) — token + search + detail + `pickOpenPlantbookMatch` + `parseOpenPlantbookCareFacts` + `fetchOpenPlantbookFacts`.
- `src/lib/knowledge/facts.ts` (modify) — `CommunityRange`, `INDOOR_RANGE_LABELS`, `extractCommunityRanges`; attach `communityRanges` in `composeCareProfile`.
- `src/lib/knowledge/care-profiles.ts` (modify) — add optional `communityRanges?: CommunityRange[]` to `SpeciesCareProfile`.
- `src/features/knowledge/CareProfilePanel.tsx` (modify) — render the community block (both themes) + include OpenPlantbook in the sources footer.
- `scripts/knowledge/load-knowledge.ts` (modify) — source-scoped clearing.
- `scripts/knowledge/load-openplantbook.ts` (create) — `knowledge:mine-openplantbook`.
- `package.json` (modify) — add the script.
- Tests: `tests/lib/knowledge-openplantbook.test.ts`, `tests/lib/knowledge-facts.test.ts` (extend), `tests/ui/CareProfilePanel.test.ts` (create).

---

### Task 1: Register the OpenPlantbook source

**Files:** Modify `src/lib/knowledge/sources.ts`; extend `tests/lib/knowledge-load-rows.test.ts`.

- [ ] **Step 1: Failing test** (add):

```ts
it('registers openplantbook as a non-quarantined community source', () => {
  const row = buildSourceRows().find((r) => r.source_key === 'openplantbook');
  expect(row).toBeDefined();
  expect(row!.quarantined).toBe(false);
  expect(row!.commercial_ok).toBe(true);
  expect(row!.license).toBe('public-domain');
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-load-rows`.

- [ ] **Step 3: Implement** — append to `KNOWLEDGE_SOURCES`:

```ts
  {
    id: 'openplantbook',
    name: 'OpenPlantbook',
    url: 'https://open.plantbook.io',
    license: 'public-domain',
    commercialOk: true,
    attribution:
      'OpenPlantbook — community-contributed plant database, free for any purpose without limitations (open.plantbook.io); values are crowd-sourced and unverified',
  },
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-load-rows`.
- [ ] **Step 5: Commit** — `feat(knowledge): register OpenPlantbook community source`.

---

### Task 2: OpenPlantbook extractor

**Files:** Create `src/lib/knowledge/openplantbook.ts`; test `tests/lib/knowledge-openplantbook.test.ts`.

The detail endpoint returns (confirmed live): `min_temp/max_temp` (°C), `min_env_humid/max_env_humid` (%), `min_light_lux/max_light_lux`, `min_light_mmol/max_light_mmol`, `min_soil_moist/max_soil_moist` (%), `min_soil_ec/max_soil_ec`, plus `pid`/`display_pid`. Search is fuzzy → must exact-match the queried name or attach nothing.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import {
  pickOpenPlantbookMatch,
  parseOpenPlantbookCareFacts,
} from '../../src/lib/knowledge/openplantbook';

describe('pickOpenPlantbookMatch', () => {
  it('returns the pid whose display_pid matches the scientific name (case-insensitive)', () => {
    const results = [
      { pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' },
      { pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa' },
    ];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBe('monstera deliciosa');
  });
  it('returns null when no result matches exactly (no fuzzy guess)', () => {
    const results = [{ pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' }];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBeNull();
  });
});

describe('parseOpenPlantbookCareFacts', () => {
  const DETAIL = {
    pid: 'monstera deliciosa',
    min_temp: 12, max_temp: 32,
    min_env_humid: 30, max_env_humid: 85,
    min_light_lux: 800, max_light_lux: 15000,
    min_soil_moist: 15, max_soil_moist: 60,
    min_soil_ec: 350, max_soil_ec: 2000,
  };
  it('emits community_unverified ranges for each present indoor metric, sourced to openplantbook', () => {
    const facts = parseOpenPlantbookCareFacts(DETAIL);
    const byAttr = new Map(facts.map((f) => [f.attribute, f]));
    expect(facts.every((f) => f.trust === 'community_unverified' && f.sourceId === 'openplantbook')).toBe(true);
    expect(byAttr.get('temperature_c')).toMatchObject({ valueMin: 12, valueMax: 32, valueUnit: 'C' });
    expect(byAttr.get('humidity_percent')).toMatchObject({ valueMin: 30, valueMax: 85, valueUnit: '%' });
    expect(byAttr.get('light_lux')).toMatchObject({ valueMin: 800, valueMax: 15000, valueUnit: 'lux' });
    expect(byAttr.get('soil_moisture_percent')).toMatchObject({ valueMin: 15, valueMax: 60 });
    expect(byAttr.get('soil_ec')).toMatchObject({ valueMin: 350, valueMax: 2000 });
  });
  it('skips a metric when either bound is missing or non-numeric', () => {
    const facts = parseOpenPlantbookCareFacts({ pid: 'x', min_temp: 12, max_temp: null });
    expect(facts.find((f) => f.attribute === 'temperature_c')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-openplantbook`.

- [ ] **Step 3: Implement** `src/lib/knowledge/openplantbook.ts`:

```ts
/**
 * OpenPlantbook indoor-care extractor (roadmap Phase 4A, slice 3). Resolves a
 * scientific name to OpenPlantbook's crowd-sourced indoor ranges (temperature,
 * humidity, light lux, soil moisture, soil EC). Search is fuzzy, so we attach
 * data only on an exact name match — never a near miss. Every fact is
 * `community_unverified` trust and sourced to `openplantbook`, kept visibly
 * separate in the UI. Pure parser + match picker (unit tested) plus a
 * non-throwing fetch orchestration. Admin-script use only (needs OAuth creds).
 */

import type { CareFact } from './facts';

export const OPENPLANTBOOK_BASE = 'https://open.plantbook.io/api/v1';

interface SearchResult {
  pid?: unknown;
  display_pid?: unknown;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The pid of the result whose pid/display_pid equals the queried name, else null. */
export function pickOpenPlantbookMatch(results: SearchResult[], scientificName: string): string | null {
  const want = normalize(scientificName);
  for (const r of results) {
    const pid = typeof r.pid === 'string' ? r.pid : '';
    const display = typeof r.display_pid === 'string' ? r.display_pid : '';
    if (normalize(display) === want || normalize(pid) === want) return pid || null;
  }
  return null;
}

const RANGE_FIELDS: readonly { attribute: string; min: string; max: string; unit: string }[] = [
  { attribute: 'temperature_c', min: 'min_temp', max: 'max_temp', unit: 'C' },
  { attribute: 'humidity_percent', min: 'min_env_humid', max: 'max_env_humid', unit: '%' },
  { attribute: 'light_lux', min: 'min_light_lux', max: 'max_light_lux', unit: 'lux' },
  { attribute: 'soil_moisture_percent', min: 'min_soil_moist', max: 'max_soil_moist', unit: '%' },
  { attribute: 'soil_ec', min: 'min_soil_ec', max: 'max_soil_ec', unit: 'uS/cm' },
];

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseOpenPlantbookCareFacts(detail: unknown): CareFact[] {
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as Record<string, unknown>;
  const facts: CareFact[] = [];
  for (const f of RANGE_FIELDS) {
    const min = num(d[f.min]);
    const max = num(d[f.max]);
    if (min === null || max === null) continue;
    facts.push({
      attribute: f.attribute,
      valueMin: min,
      valueMax: max,
      valueUnit: f.unit,
      sourceId: 'openplantbook',
      trust: 'community_unverified',
    });
  }
  return facts;
}

interface OpenPlantbookCreds {
  clientId: string;
  secret: string;
}

async function fetchToken(creds: OpenPlantbookCreds, fetcher: typeof fetch): Promise<string | null> {
  try {
    const res = await fetcher(`${OPENPLANTBOOK_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.secret,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: unknown };
    return typeof json.access_token === 'string' ? json.access_token : null;
  } catch {
    return null;
  }
}

/** Resolves a species to OpenPlantbook care facts, or [] on any failure / no exact match. */
export async function fetchOpenPlantbookFacts(
  scientificName: string,
  creds: OpenPlantbookCreds,
  fetcher: typeof fetch = fetch,
): Promise<CareFact[]> {
  const token = await fetchToken(creds, fetcher);
  if (!token) return [];
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const searchRes = await fetcher(
      `${OPENPLANTBOOK_BASE}/plant/search?alias=${encodeURIComponent(scientificName)}`,
      { headers: auth },
    );
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as { results?: SearchResult[] };
    const pid = pickOpenPlantbookMatch(searchJson.results ?? [], scientificName);
    if (!pid) return [];
    const detailRes = await fetcher(
      `${OPENPLANTBOOK_BASE}/plant/detail/${encodeURIComponent(pid)}/`,
      { headers: auth },
    );
    if (!detailRes.ok) return [];
    return parseOpenPlantbookCareFacts(await detailRes.json());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-openplantbook`.
- [ ] **Step 5: Commit** — `feat(knowledge): OpenPlantbook indoor-care extractor (exact-match, community_unverified)`.

---

### Task 3: `communityRanges` projection in the shaper

**Files:** Modify `src/lib/knowledge/care-profiles.ts` (type) + `src/lib/knowledge/facts.ts`; extend `tests/lib/knowledge-facts.test.ts`.

- [ ] **Step 1: Failing test** (add to `knowledge-facts.test.ts`):

```ts
it('exposes community_unverified indoor ranges as communityRanges, separate from sourced fields', () => {
  const facts: CareFact[] = [
    { attribute: 'family', valueText: 'Araceae', sourceId: 'powo', trust: 'sourced' },
    { attribute: 'temperature_c', valueMin: 18, valueMax: 27, valueUnit: 'C', sourceId: 'plantdoc-editorial', trust: 'editorial' },
    { attribute: 'temperature_c', valueMin: 12, valueMax: 32, valueUnit: 'C', sourceId: 'openplantbook', trust: 'community_unverified' },
    { attribute: 'light_lux', valueMin: 800, valueMax: 15000, valueUnit: 'lux', sourceId: 'openplantbook', trust: 'community_unverified' },
  ];
  const profile = composeCareProfile('Monstera deliciosa', facts, {
    slug: 'monstera-deliciosa', commonNames: [], synonyms: [], nameSourceId: 'powo',
  })!;
  // Sourced/editorial precedence is unchanged: editorial temp still wins the primary field.
  expect(profile.comfortableTemperatureC.value).toEqual({ min: 18, max: 27 });
  const ranges = profile.communityRanges ?? [];
  const byAttr = new Map(ranges.map((r) => [r.attribute, r]));
  expect(byAttr.get('light_lux')).toMatchObject({ label: 'Light', min: 800, max: 15000, sourceId: 'openplantbook' });
  expect(byAttr.get('temperature_c')).toMatchObject({ min: 12, max: 32 });
  expect(ranges.every((r) => r.sourceId === 'openplantbook')).toBe(true);
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-facts`.

- [ ] **Step 3a: Implement** — in `care-profiles.ts`, add the type + field:

```ts
export interface CommunityRange {
  attribute: string;
  label: string;
  min: number;
  max: number;
  unit: string;
  sourceId: string;
}
```

Add to `SpeciesCareProfile` (after `likelyPests`):

```ts
  /** Crowd-sourced, unverified indoor ranges (e.g. OpenPlantbook), shown apart. */
  communityRanges?: CommunityRange[];
```

- [ ] **Step 3b: Implement** — in `facts.ts`, import `CommunityRange`, add the label map + extractor, and attach it:

```ts
const INDOOR_RANGE_LABELS: { attribute: string; label: string }[] = [
  { attribute: 'temperature_c', label: 'Temperature' },
  { attribute: 'humidity_percent', label: 'Humidity' },
  { attribute: 'light_lux', label: 'Light' },
  { attribute: 'soil_moisture_percent', label: 'Soil moisture' },
  { attribute: 'soil_ec', label: 'Soil fertility (EC)' },
];

function extractCommunityRanges(facts: CareFact[]): CommunityRange[] {
  const ranges: CommunityRange[] = [];
  for (const { attribute, label } of INDOOR_RANGE_LABELS) {
    const f = facts.find(
      (x) =>
        x.attribute === attribute &&
        x.trust === 'community_unverified' &&
        x.valueMin !== undefined &&
        x.valueMax !== undefined,
    );
    if (f) {
      ranges.push({
        attribute,
        label,
        min: f.valueMin!,
        max: f.valueMax!,
        unit: f.valueUnit ?? '',
        sourceId: f.sourceId,
      });
    }
  }
  return ranges;
}
```

In `composeCareProfile`, before `return {`, compute `const communityRanges = extractCommunityRanges(facts);` and add to the returned object: `communityRanges: communityRanges.length ? communityRanges : undefined,`. Import `CommunityRange` from `./care-profiles`.

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-facts`. Also `npm test -- knowledge` (no regressions).
- [ ] **Step 5: Commit** — `feat(knowledge): expose OpenPlantbook indoor ranges as communityRanges in the shaper`.

---

### Task 4: Panel renders the community block

**Files:** Modify `src/features/knowledge/CareProfilePanel.tsx`; create `tests/ui/CareProfilePanel.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CareProfilePanel } from '../../src/features/knowledge/CareProfilePanel';
import type { SpeciesCareProfile } from '../../src/lib/knowledge/care-profiles';

const base: SpeciesCareProfile = {
  slug: 'monstera-deliciosa', scientificName: 'Monstera deliciosa', nameSourceId: 'powo',
  commonNames: [], synonyms: [],
  family: { value: 'Araceae', sourceId: 'powo' },
  light: { value: 'Bright indirect', sourceId: 'plantdoc-editorial' },
  waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: 'plantdoc-editorial' },
  comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: 'plantdoc-editorial' },
  humidity: { value: 'Average', sourceId: 'plantdoc-editorial' },
  toxicity: { value: 'Toxic to pets', sourceId: 'plantdoc-editorial' },
  commonStressSigns: { value: [], sourceId: 'plantdoc-editorial' },
  likelyPests: { value: [], sourceId: 'plantdoc-editorial' },
  communityRanges: [
    { attribute: 'light_lux', label: 'Light', min: 800, max: 15000, unit: 'lux', sourceId: 'openplantbook' },
    { attribute: 'humidity_percent', label: 'Humidity', min: 30, max: 85, unit: '%', sourceId: 'openplantbook' },
  ],
};

const render = (isDark: boolean) =>
  renderToStaticMarkup(createElement(CareProfilePanel, { profile: base, units: 'metric', isDark }));

describe('CareProfilePanel community ranges', () => {
  it.each([true, false])('renders the unverified community block with OpenPlantbook (isDark=%s)', (isDark) => {
    const html = render(isDark);
    expect(html.toLowerCase()).toContain('unverified');
    expect(html).toContain('800');
    expect(html).toContain('15000');
    expect(html).toContain('OpenPlantbook');
  });
  it('does not render the block when there are no community ranges', () => {
    const html = renderToStaticMarkup(
      createElement(CareProfilePanel, { profile: { ...base, communityRanges: undefined }, units: 'metric', isDark: true }),
    );
    expect(html.toLowerCase()).not.toContain('unverified');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- CareProfilePanel`.

- [ ] **Step 3: Implement** — add a shared renderer for community ranges and call it in both theme branches before the sources footer. Add near the top of the component module:

```tsx
function formatRange(r: { attribute: string; min: number; max: number; unit: string }, units: Units): string {
  if (r.attribute === 'temperature_c') {
    return `${formatTemperature(r.min, units)} - ${formatTemperature(r.max, units)}`;
  }
  const unit = r.unit ? ` ${r.unit}` : '';
  return `${r.min} - ${r.max}${unit}`;
}
```

In `usedSources`, also include community-range source ids:

```ts
  const ids = new Set<string>([
    profile.nameSourceId,
    ...fields.map((f) => f.sourceId),
    ...(profile.communityRanges ?? []).map((r) => r.sourceId),
  ]);
```

Add the block markup. **Dark theme** — insert after the `facts.map(...)` block, before the sources `<p>`:

```tsx
        {profile.communityRanges && profile.communityRanges.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#67766A' }}>Community indoor ranges</span>
              <span className="mono" style={{ fontSize: 9, letterSpacing: '.08em', color: '#0E140F', background: '#E7C24A', padding: '3px 6px', borderRadius: 5 }}>UNVERIFIED</span>
            </div>
            {profile.communityRanges.map((r) => (
              <div key={r.attribute} style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
                <span className="mono" style={{ width: 120, flexShrink: 0, fontSize: 11, color: '#67766A' }}>{r.label}</span>
                <span style={{ fontSize: 13.5, color: '#CBD8C6' }}>{formatRange(r, units)}</span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#67766A' }}>Source: OpenPlantbook (community-sourced, unverified)</p>
          </div>
        )}
```

**Light theme** — insert the analogous block (light palette) before the light-theme sources `<p>`:

```tsx
        {profile.communityRanges && profile.communityRanges.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: '#9AA294' }}>Community indoor ranges</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7A5B12', background: '#F4E6B8', padding: '2px 7px', borderRadius: 999 }}>Unverified</span>
            </div>
            {profile.communityRanges.map((r) => (
              <div key={r.attribute} style={{ display: 'flex', gap: 12, padding: '7px 0' }}>
                <span style={{ width: 116, flexShrink: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', color: '#9AA294' }}>{r.label}</span>
                <span style={{ fontSize: 14, color: '#23302A' }}>{formatRange(r, units)}</span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9AA294' }}>Source: OpenPlantbook (community-sourced, unverified)</p>
          </div>
        )}
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- CareProfilePanel`.
- [ ] **Step 5: Commit** — `feat(knowledge): plant panel shows OpenPlantbook indoor ranges as unverified community block`.

---

### Task 5: Source-scoped clearing + OpenPlantbook loader

**Files:** Modify `scripts/knowledge/load-knowledge.ts`; create `scripts/knowledge/load-openplantbook.ts`; modify `package.json`.

- [ ] **Step 1:** Make `load-knowledge.ts` clear only the facts it owns. Replace the clear loop: read each species with `Query.select(['*', 'care_facts.*'])`, build the editorial rows for that species (`buildFactRows()` grouped by slug), compute `owned = new Set(rowsForSpecies.map((r) => r.source_key))`, and delete only existing facts whose resolved `source_id` ∈ `owned` (resolve via `f.source_id.$id ?? f.source_id`). Then insert that species' editorial rows. This makes editorial + OpenPlantbook loaders order-independent.

- [ ] **Step 2:** Create `scripts/knowledge/load-openplantbook.ts` (`knowledge:mine-openplantbook`):

```ts
/**
 * knowledge:mine-openplantbook — pulls OpenPlantbook indoor ranges for the
 * catalogued species and writes them as community_unverified care_facts.
 * Source-scoped + idempotent: only this source's facts are cleared per species,
 * so it composes with knowledge:mine in any order. Needs OpenPlantbook OAuth
 * creds (OPEN_PLANTBOOK_CLIENT_ID / OPEN_PLANTBOOK_SECRET in .env) + Appwrite
 * admin creds. Never prints secret values.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { fetchOpenPlantbookFacts } from '../../src/lib/knowledge/openplantbook';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveCreds(): { clientId: string; secret: string } {
  const clientId = process.env.OPEN_PLANTBOOK_CLIENT_ID?.trim();
  const secret = process.env.OPEN_PLANTBOOK_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error(
      'Missing OpenPlantbook credentials: set OPEN_PLANTBOOK_CLIENT_ID and ' +
        'OPEN_PLANTBOOK_SECRET in .env (server secrets — no VITE_ prefix).',
    );
  }
  return { clientId, secret };
}

async function main(): Promise<void> {
  const ctx = await createAdminContext(); // also loads .env into process.env
  const creds = resolveCreds();
  const db = DATABASE_ID;

  const opbRow = buildSourceRows().find((r) => r.source_key === 'openplantbook')!;
  await ctx.tablesDB.upsertRow({ databaseId: db, tableId: 'source_datasets', rowId: 'openplantbook', data: opbRow });

  let total = 0;
  for (const p of CARE_PROFILES) {
    const facts = await fetchOpenPlantbookFacts(p.scientificName, creds);
    const species = await ctx.tablesDB.getRow({
      databaseId: db, tableId: 'species', rowId: p.slug,
      queries: [Query.select(['*', 'care_facts.*'])],
    });
    const existing = (species as unknown as { care_facts?: { $id: string; source_id?: unknown }[] }).care_facts ?? [];
    for (const f of existing) {
      const src = typeof f.source_id === 'string' ? f.source_id : String((f.source_id as { $id?: string })?.$id ?? '');
      if (src === 'openplantbook') {
        await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'care_facts', rowId: f.$id });
      }
    }
    for (const fact of facts) {
      await ctx.tablesDB.createRow({
        databaseId: db, tableId: 'care_facts', rowId: ID.unique(),
        data: {
          species_id: p.slug, source_id: 'openplantbook', attribute: fact.attribute,
          value_min: fact.valueMin ?? null, value_max: fact.valueMax ?? null,
          value_text: fact.valueText ?? null, value_unit: fact.valueUnit ?? null, trust: fact.trust,
        },
      });
    }
    total += facts.length;
    console.log(`${p.slug}: ${facts.length} openplantbook facts`);
    await sleep(200);
  }
  console.log(`loaded ${total} OpenPlantbook care_facts`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 3:** Add to `package.json`: `"knowledge:mine-openplantbook": "tsx scripts/knowledge/load-openplantbook.ts"`.
- [ ] **Step 4: Typecheck** — `node ./node_modules/typescript/bin/tsc -b` → exit 0.
- [ ] **Step 5: Commit** — `feat(knowledge): source-scoped clearing + knowledge:mine-openplantbook loader`.

---

### Task 6: Live populate + verify + gate

- [ ] **Step 1:** Re-run editorial loader (now source-scoped): `./node_modules/.bin/tsx scripts/knowledge/load-knowledge.ts`.
- [ ] **Step 2:** Run OpenPlantbook loader: `./node_modules/.bin/tsx scripts/knowledge/load-openplantbook.ts`. Expect per-species fact counts; total > 10.
- [ ] **Step 3:** Verify a species hydrates both editorial and `openplantbook` facts, and `getCareProfile`-equivalent compose yields `communityRanges` (one-off tsx read using `composeCareProfile`).
- [ ] **Step 4:** Full gate — `npm test` (all green), `npm run lint` (clean), `node ./node_modules/typescript/bin/tsc -b` (exit 0).

---

### Task 7: Docs

- [ ] Update `docs/knowledge-layer.md`: add the source-policy row for OpenPlantbook (community-sourced · unverified), a Pieces row for `openplantbook.ts` + the loader, and a note that `community_unverified` indoor ranges render in a distinct panel block. Commit — `docs(knowledge): document OpenPlantbook indoor-care mining (slice 3)`.

---

## Self-review

- **Spec coverage:** build-order step 3's OpenPlantbook indoor care + the unverified label — Tasks 2–6. Trefle coarse traits (ODbL multi-GB dump) and Wikidata toxicity are **deferred**: Trefle's unique value (cross-link IDs) is already captured permissively in slice 2, its traits skew outdoor, and the dump is impractical to stage here; toxicity is low-value-per-effort (user: "nice to have"). Both noted for a later optional task.
- **Type consistency:** `CareFact` (facts.ts) is the extractor output and the loader input; `CommunityRange` defined in care-profiles.ts, produced by facts.ts, consumed by the panel. Attribute keys (`temperature_c`, `humidity_percent`, `light_lux`, `soil_moisture_percent`, `soil_ec`) match across extractor, shaper label map, and loader.
- **Licensing/trust:** OpenPlantbook = `public-domain` + `community_unverified`; rendered with a visible "Unverified" label, separate from sourced/editorial facts; precedence keeps editorial as the primary displayed value.
- **Idempotency:** source-scoped clearing makes the two care-fact loaders order-independent and re-runnable.
