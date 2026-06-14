# Knowledge Mining — Slice 1: Relational Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the species care guide from a hand-written bundled constant to relational Appwrite tables (`source_datasets`, `taxon_references`, `care_facts`) with per-fact provenance, proving the spine end-to-end by migrating the editorial 10 into facts — with zero new external data.

**Architecture:** A normalized `care_facts` EAV table (one row per fact, each related to a `source_datasets` row) is composed at read time into the existing `SpeciesCareProfile` shape by a pure shaper. The editorial 10 become the first dataset: a pure adapter turns each bundled profile into `CareFact[]`, the same shaper renders them (offline, no backend), and a loader writes those facts to Appwrite so the panel reads them through the species relation. The synchronous name/search functions (`findCareProfile`, `searchCareProfiles`) stay bundled so onboarding autocomplete keeps its instant offline ranking.

**Tech Stack:** TypeScript, React 19, Appwrite (`node-appwrite` admin SDK in scripts, `appwrite` web SDK in app), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-06-13-knowledge-mining-pipeline-design.md` (decisions 1–6; tables; build order step 1).

**This slice is steps 1 of the spec's 5-step build order.** Slices 2–5 (cross-link extractors, permissive trait/care mining, quarantine sources, seed expansion + live mine) get their own plans.

---

### Task 1: Add the three knowledge tables + `species.slug` to the declarative schema

**Files:**
- Modify: `appwrite/schema.ts` (add tables to `TABLES`; add `slug` to `species`)
- Test: `tests/appwrite/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/appwrite/schema.test.ts`. First extend `REQUIRED_TABLES` (after `'insight_feedback'`, before `'public_observations'`):

```ts
const REQUIRED_TABLES = [
  'profiles',
  'user_locations',
  'species',
  'plants',
  'observations',
  'treatments',
  'measurements',
  'photos',
  'environment_snapshots',
  'insight_feedback',
  'source_datasets',
  'taxon_references',
  'care_facts',
  'public_observations',
];
```

Extend the `user_id` exemption (the new reference tables carry no user data):

```ts
  it('every table with user data has a required user_id varchar column', () => {
    const exempt = ['species', 'source_datasets', 'taxon_references', 'care_facts', 'public_observations'];
    for (const table of TABLES.filter((t) => !exempt.includes(t.id))) {
      const col = table.columns.find((c) => c.key === 'user_id');
      expect(col, `${table.id}.user_id`).toBeDefined();
      expect(col!.kind).toBe('varchar');
      expect(col!.required).toBe(true);
    }
  });
```

Add new cases at the end of the `describe` block:

```ts
  it('knowledge reference tables are admin-write, public-read with no user grants', () => {
    for (const id of ['source_datasets', 'taxon_references', 'care_facts']) {
      expect(TABLES.find((t) => t.id === id)!.permissions, id).toEqual(['read:users']);
      expect(TABLES.find((t) => t.id === id)!.rowSecurity, id).toBe(false);
    }
  });

  it('care_facts and taxon_references relate to species two-way with cascade', () => {
    for (const id of ['care_facts', 'taxon_references']) {
      const rel = TABLES.find((t) => t.id === id)!.columns.find((c) => c.key === 'species_id')!;
      expect(rel.kind, id).toBe('relationship');
      if (rel.kind === 'relationship') {
        expect(rel.relatedTableId, id).toBe('species');
        expect(rel.twoWay, id).toBe(true);
        expect(rel.twoWayKey, id).toBe(id);
        expect(rel.onDelete, id).toBe('cascade');
      }
    }
  });

  it('care_facts and taxon_references relate to source_datasets (restrict, one-way)', () => {
    for (const id of ['care_facts', 'taxon_references']) {
      const rel = TABLES.find((t) => t.id === id)!.columns.find((c) => c.key === 'source_id')!;
      expect(rel.kind, id).toBe('relationship');
      if (rel.kind === 'relationship') {
        expect(rel.relatedTableId, id).toBe('source_datasets');
        expect(rel.twoWay, id).toBe(false);
        expect(rel.onDelete, id).toBe('restrict');
      }
    }
  });

  it('source_datasets has a unique index on source_key', () => {
    const t = TABLES.find((t) => t.id === 'source_datasets')!;
    const idx = t.indexes.find((i) => i.key === 'idx_source_key');
    expect(idx).toBeDefined();
    expect(idx!.type).toBe('unique');
    expect(idx!.columns).toEqual(['source_key']);
  });

  it('species has a slug column with a unique index', () => {
    const t = TABLES.find((t) => t.id === 'species')!;
    expect(t.columns.find((c) => c.key === 'slug')?.kind).toBe('varchar');
    expect(t.indexes.find((i) => i.key === 'idx_slug')?.type).toBe('unique');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- schema`
Expected: FAIL — `defines all Phase 0 tables` mismatch + new cases failing (tables undefined).

- [ ] **Step 3: Implement the schema additions**

In `appwrite/schema.ts`, add a `slug` column to the `species` table (after `external_taxon_id`) and an index:

```ts
      { kind: 'varchar', key: 'external_taxon_id', size: 128 },
      { kind: 'varchar', key: 'slug', size: 128 },
    ],
    indexes: [{ key: 'idx_slug', type: 'unique', columns: ['slug'] }],
  },
```

Then insert these three table defs into `TABLES` immediately before the `public_observations` entry:

```ts
  {
    id: 'source_datasets',
    name: 'Source Datasets',
    permissions: ['read:users'],
    rowSecurity: false,
    columns: [
      { kind: 'varchar', key: 'source_key', size: 64, required: true },
      { kind: 'varchar', key: 'name', size: 128, required: true },
      { kind: 'varchar', key: 'url', size: 255 },
      {
        kind: 'enum',
        key: 'license',
        elements: ['editorial', 'CC0', 'CC-BY', 'CC-BY-SA', 'ODbL', 'public-domain'],
        required: true,
      },
      { kind: 'boolean', key: 'commercial_ok', default: true },
      { kind: 'boolean', key: 'quarantined', default: false },
      { kind: 'text', key: 'attribution' },
    ],
    indexes: [{ key: 'idx_source_key', type: 'unique', columns: ['source_key'] }],
  },
  {
    id: 'taxon_references',
    name: 'Taxon References',
    permissions: ['read:users'],
    rowSecurity: false,
    columns: [
      {
        kind: 'relationship',
        key: 'species_id',
        relatedTableId: 'species',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'taxon_references',
        onDelete: 'cascade',
      },
      {
        kind: 'relationship',
        key: 'source_id',
        relatedTableId: 'source_datasets',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'restrict',
      },
      { kind: 'varchar', key: 'external_id', size: 128, required: true },
      { kind: 'varchar', key: 'external_url', size: 512 },
    ],
    indexes: [],
  },
  {
    id: 'care_facts',
    name: 'Care Facts',
    permissions: ['read:users'],
    rowSecurity: false,
    columns: [
      {
        kind: 'relationship',
        key: 'species_id',
        relatedTableId: 'species',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'care_facts',
        onDelete: 'cascade',
      },
      {
        kind: 'relationship',
        key: 'source_id',
        relatedTableId: 'source_datasets',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'restrict',
      },
      { kind: 'varchar', key: 'attribute', size: 48, required: true },
      { kind: 'float', key: 'value_min' },
      { kind: 'float', key: 'value_max' },
      { kind: 'text', key: 'value_text' },
      { kind: 'varchar', key: 'value_unit', size: 24 },
      {
        kind: 'enum',
        key: 'trust',
        elements: ['sourced', 'editorial', 'community_unverified'],
        default: 'sourced',
      },
    ],
    indexes: [],
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- schema`
Expected: PASS (all schema-coverage cases green).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add appwrite/schema.ts tests/appwrite/schema.test.ts
git commit -m "feat(knowledge): add source_datasets, taxon_references, care_facts tables + species.slug"
```

---

### Task 2: Fact types, the pure shaper, and the editorial→facts adapter

**Files:**
- Create: `src/lib/knowledge/facts.ts`
- Test: `tests/lib/knowledge-facts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/knowledge-facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import {
  editorialProfileToFacts,
  composeCareProfile,
  type CareFact,
} from '../../src/lib/knowledge/facts';

const monstera = CARE_PROFILES.find((p) => p.slug === 'monstera-deliciosa')!;

describe('editorialProfileToFacts', () => {
  it('emits one fact per care field, each carrying the profile sourceId', () => {
    const facts = editorialProfileToFacts(monstera);
    const attrs = facts.map((f) => f.attribute);
    expect(attrs).toContain('light');
    expect(attrs).toContain('water_cadence_days');
    expect(attrs).toContain('temperature_c');
    expect(attrs).toContain('toxicity');
    // list fields explode to one row each
    expect(facts.filter((f) => f.attribute === 'pest').length).toBe(monstera.likelyPests.value.length);
    // every fact has a source
    expect(facts.every((f) => f.sourceId.length > 0)).toBe(true);
    // ranges land in value_min/value_max
    const water = facts.find((f) => f.attribute === 'water_cadence_days')!;
    expect(water.valueMin).toBe(7);
    expect(water.valueMax).toBe(10);
  });
});

describe('composeCareProfile', () => {
  it('round-trips editorial facts back into the SpeciesCareProfile shape', () => {
    const facts = editorialProfileToFacts(monstera);
    const profile = composeCareProfile(monstera.scientificName, facts, {
      slug: monstera.slug,
      commonNames: monstera.commonNames,
      synonyms: monstera.synonyms,
      nameSourceId: monstera.nameSourceId,
    });
    expect(profile).not.toBeNull();
    expect(profile!.light.value).toBe(monstera.light.value);
    expect(profile!.waterCadenceDays.value).toEqual(monstera.waterCadenceDays.value);
    expect(profile!.likelyPests.value).toEqual(monstera.likelyPests.value);
    expect(profile!.toxicity.sourceId).toBe(monstera.toxicity.sourceId);
  });

  it('prefers sourced > editorial > community_unverified on conflict', () => {
    const facts: CareFact[] = [
      { attribute: 'humidity', valueText: 'Editorial humidity', sourceId: 'plantdoc-editorial', trust: 'editorial' },
      { attribute: 'humidity', valueText: 'Verified humidity', sourceId: 'powo', trust: 'sourced' },
      { attribute: 'humidity', valueText: 'Crowd humidity', sourceId: 'openplantbook', trust: 'community_unverified' },
    ];
    const profile = composeCareProfile('Test sp.', facts, {
      slug: 'test', commonNames: [], synonyms: [], nameSourceId: 'powo',
    });
    expect(profile!.humidity.value).toBe('Verified humidity');
    expect(profile!.humidity.sourceId).toBe('powo');
  });

  it('returns null when there are no facts', () => {
    expect(
      composeCareProfile('Empty sp.', [], { slug: 'e', commonNames: [], synonyms: [], nameSourceId: 'powo' }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- knowledge-facts`
Expected: FAIL — cannot find module `facts.ts`.

- [ ] **Step 3: Implement `facts.ts`**

Create `src/lib/knowledge/facts.ts`:

```ts
/**
 * The relational care-fact model (roadmap Phase 4A, slice B). A care profile is
 * a set of `CareFact` rows, each bound to one source by `sourceId` — preserving
 * the per-field provenance the bundled `Sourced<T>` model expressed, now as
 * table rows. `composeCareProfile` shapes facts (from the bundle or Appwrite)
 * back into the `SpeciesCareProfile` the UI already consumes; precedence picks a
 * display value when sources disagree. `editorialProfileToFacts` is the adapter
 * that turns the bundled editorial 10 into the first fact dataset.
 */

import {
  type CareRange,
  type SpeciesCareProfile,
  type Sourced,
  CARE_PROFILES,
} from './care-profiles';

export type Trust = 'sourced' | 'editorial' | 'community_unverified';

/** One care fact. Numeric ranges use min/max; text/categorical use valueText. */
export interface CareFact {
  attribute: string;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
  valueUnit?: string;
  sourceId: string;
  trust: Trust;
}

/** Minimal identity a composed profile needs beyond its facts. */
export interface SpeciesIdentity {
  slug: string;
  commonNames: string[];
  synonyms: string[];
  nameSourceId: string;
}

const TRUST_RANK: Record<Trust, number> = { sourced: 0, editorial: 1, community_unverified: 2 };

/** Lowest TRUST_RANK wins; ties keep the first seen (stable import order). */
function pickBest(facts: CareFact[]): CareFact | null {
  return facts.reduce<CareFact | null>(
    (best, f) => (best === null || TRUST_RANK[f.trust] < TRUST_RANK[best.trust] ? f : best),
    null,
  );
}

function sourced<T>(value: T, fact: CareFact): Sourced<T> {
  return { value, sourceId: fact.sourceId };
}

/** Explodes an editorial profile into facts (one row per field; lists per item). */
export function editorialProfileToFacts(profile: SpeciesCareProfile): CareFact[] {
  const t: Trust = 'editorial';
  const facts: CareFact[] = [
    { attribute: 'family', valueText: profile.family.value, sourceId: profile.family.sourceId, trust: 'sourced' },
    { attribute: 'light', valueText: profile.light.value, sourceId: profile.light.sourceId, trust: t },
    {
      attribute: 'water_cadence_days',
      valueMin: profile.waterCadenceDays.value.min,
      valueMax: profile.waterCadenceDays.value.max,
      valueUnit: 'days',
      sourceId: profile.waterCadenceDays.sourceId,
      trust: t,
    },
    {
      attribute: 'temperature_c',
      valueMin: profile.comfortableTemperatureC.value.min,
      valueMax: profile.comfortableTemperatureC.value.max,
      valueUnit: 'C',
      sourceId: profile.comfortableTemperatureC.sourceId,
      trust: t,
    },
    { attribute: 'humidity', valueText: profile.humidity.value, sourceId: profile.humidity.sourceId, trust: t },
    { attribute: 'toxicity', valueText: profile.toxicity.value, sourceId: profile.toxicity.sourceId, trust: t },
    ...profile.commonStressSigns.value.map((s): CareFact => ({
      attribute: 'stress_sign', valueText: s, sourceId: profile.commonStressSigns.sourceId, trust: t,
    })),
    ...profile.likelyPests.value.map((p): CareFact => ({
      attribute: 'pest', valueText: p, sourceId: profile.likelyPests.sourceId, trust: t,
    })),
  ];
  return facts;
}

function rangeFact(facts: CareFact[], attribute: string): Sourced<CareRange> | null {
  const best = pickBest(facts.filter((f) => f.attribute === attribute));
  if (!best || best.valueMin === undefined || best.valueMax === undefined) return null;
  return sourced({ min: best.valueMin, max: best.valueMax }, best);
}

function textFact(facts: CareFact[], attribute: string): Sourced<string> | null {
  const best = pickBest(facts.filter((f) => f.attribute === attribute && f.valueText !== undefined));
  return best ? sourced(best.valueText!, best) : null;
}

function listFact(facts: CareFact[], attribute: string): Sourced<string[]> | null {
  const rows = facts.filter((f) => f.attribute === attribute && f.valueText !== undefined);
  if (rows.length === 0) return null;
  const seen = new Set<string>();
  const values: string[] = [];
  for (const r of rows) {
    const key = r.valueText!.toLowerCase();
    if (!seen.has(key)) { seen.add(key); values.push(r.valueText!); }
  }
  return { value: values, sourceId: pickBest(rows)!.sourceId };
}

/**
 * Shapes care facts into the SpeciesCareProfile the UI consumes. Returns null
 * when there are no facts. Required fields fall back to an empty sourced value
 * only when at least one fact exists, so the panel never renders an all-empty
 * card (callers gate on a non-null return plus the presence of real facts).
 */
export function composeCareProfile(
  scientificName: string,
  facts: CareFact[],
  identity: SpeciesIdentity,
): SpeciesCareProfile | null {
  if (facts.length === 0) return null;
  const empty: Sourced<string> = { value: '', sourceId: identity.nameSourceId };
  const emptyRange: Sourced<CareRange> = { value: { min: 0, max: 0 }, sourceId: identity.nameSourceId };
  return {
    slug: identity.slug,
    scientificName,
    nameSourceId: identity.nameSourceId,
    commonNames: identity.commonNames,
    synonyms: identity.synonyms,
    family: textFact(facts, 'family') ?? empty,
    light: textFact(facts, 'light') ?? empty,
    waterCadenceDays: rangeFact(facts, 'water_cadence_days') ?? emptyRange,
    comfortableTemperatureC: rangeFact(facts, 'temperature_c') ?? emptyRange,
    humidity: textFact(facts, 'humidity') ?? empty,
    toxicity: textFact(facts, 'toxicity') ?? empty,
    commonStressSigns: listFact(facts, 'stress_sign') ?? { value: [], sourceId: identity.nameSourceId },
    likelyPests: listFact(facts, 'pest') ?? { value: [], sourceId: identity.nameSourceId },
  };
}

/** All editorial profiles as facts, keyed by slug — the slice-1 dataset. */
export function editorialFactsBySlug(): Map<string, CareFact[]> {
  return new Map(CARE_PROFILES.map((p) => [p.slug, editorialProfileToFacts(p)]));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- knowledge-facts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/lib/knowledge/facts.ts tests/lib/knowledge-facts.test.ts
git commit -m "feat(knowledge): relational care-fact model + shaper + editorial adapter"
```

---

### Task 3: Loader — editorial profiles + source registry → upsert rows (pure builder + idempotency)

**Files:**
- Create: `src/lib/knowledge/load-rows.ts` (pure row builders, app-importable + testable)
- Create: `scripts/knowledge/load-knowledge.ts` (admin script, `knowledge:mine`)
- Modify: `package.json` (add `knowledge:mine` script)
- Test: `tests/lib/knowledge-load-rows.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/knowledge-load-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSourceRows, buildFactRows, factNaturalKey } from '../../src/lib/knowledge/load-rows';
import { KNOWLEDGE_SOURCES } from '../../src/lib/knowledge/sources';

describe('buildSourceRows', () => {
  it('maps every registry source to an upsertable row with a stable source_key', () => {
    const rows = buildSourceRows();
    expect(rows.length).toBe(KNOWLEDGE_SOURCES.length);
    const editorial = rows.find((r) => r.source_key === 'plantdoc-editorial')!;
    expect(editorial.license).toBe('editorial');
    expect(editorial.commercial_ok).toBe(true);
    expect(editorial.quarantined).toBe(false);
  });
});

describe('buildFactRows', () => {
  it('emits one row per editorial fact, all tied to a known source_key', () => {
    const rows = buildFactRows();
    expect(rows.length).toBeGreaterThan(50);
    const keys = new Set(KNOWLEDGE_SOURCES.map((s) => s.id));
    expect(rows.every((r) => keys.has(r.source_key))).toBe(true);
    expect(rows.every((r) => r.species_slug.length > 0 && r.attribute.length > 0)).toBe(true);
  });

  it('natural key is stable and unique per (species, source, attribute, value)', () => {
    const rows = buildFactRows();
    const keys = rows.map(factNaturalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- knowledge-load-rows`
Expected: FAIL — cannot find module `load-rows.ts`.

- [ ] **Step 3: Implement `load-rows.ts`**

Create `src/lib/knowledge/load-rows.ts`:

```ts
/**
 * Pure row builders for the knowledge loader (roadmap Phase 4A, slice B). Kept
 * SDK-free so they unit-test without Appwrite. The admin script
 * (scripts/knowledge/load-knowledge.ts) consumes these and upserts by natural
 * key, so re-running is idempotent.
 */

import { KNOWLEDGE_SOURCES } from './sources';
import { CARE_PROFILES } from './care-profiles';
import { editorialProfileToFacts, type CareFact } from './facts';

export interface SourceRow {
  source_key: string;
  name: string;
  url: string;
  license: string;
  commercial_ok: boolean;
  quarantined: boolean;
  attribution: string;
}

export interface FactRow {
  species_slug: string;
  source_key: string;
  attribute: string;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  value_unit: string | null;
  trust: CareFact['trust'];
}

const QUARANTINED = new Set(['CC-BY-SA', 'ODbL']);

export function buildSourceRows(): SourceRow[] {
  return KNOWLEDGE_SOURCES.map((s) => ({
    source_key: s.id,
    name: s.name,
    url: s.url,
    license: s.license,
    commercial_ok: s.commercialOk,
    quarantined: QUARANTINED.has(s.license),
    attribution: s.attribution,
  }));
}

export function buildFactRows(): FactRow[] {
  const rows: FactRow[] = [];
  for (const profile of CARE_PROFILES) {
    for (const fact of editorialProfileToFacts(profile)) {
      rows.push({
        species_slug: profile.slug,
        source_key: fact.sourceId,
        attribute: fact.attribute,
        value_min: fact.valueMin ?? null,
        value_max: fact.valueMax ?? null,
        value_text: fact.valueText ?? null,
        value_unit: fact.valueUnit ?? null,
        trust: fact.trust,
      });
    }
  }
  return rows;
}

/** Stable upsert key. Value is included so multi-value attributes (pests) dedupe per item. */
export function factNaturalKey(row: FactRow): string {
  return [row.species_slug, row.source_key, row.attribute, row.value_text ?? `${row.value_min}-${row.value_max}`].join('|');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- knowledge-load-rows`
Expected: PASS.

- [ ] **Step 5: Write the admin script (no test; thin SDK glue over tested builders)**

Create `scripts/knowledge/load-knowledge.ts`. Follow the existing admin-client pattern in `scripts/appwrite/setup.ts` (read `getAdminClient`/`DATABASE_ID` from `scripts/appwrite/client.ts` — confirm the exact export names there first and match them):

```ts
/**
 * knowledge:mine — upserts source_datasets + species + care_facts for the
 * editorial dataset (slice 1). Idempotent: upsert by source_key, species slug,
 * and care-fact natural key. Requires Appwrite admin credentials (.env).
 */
import { TablesDB, Query } from 'node-appwrite';
import { getAdminClient } from '../appwrite/client';
import { DATABASE_ID } from '../../appwrite/schema';
import { buildSourceRows, buildFactRows } from '../../src/lib/knowledge/load-rows';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';

async function main() {
  const db = new TablesDB(getAdminClient());

  // 1. source_datasets — upsert by source_key
  const sourceIdByKey = new Map<string, string>();
  for (const row of buildSourceRows()) {
    const existing = await db.listRows(DATABASE_ID, 'source_datasets', [
      Query.equal('source_key', row.source_key),
      Query.limit(1),
    ]);
    if (existing.rows[0]) {
      await db.updateRow(DATABASE_ID, 'source_datasets', existing.rows[0].$id, row);
      sourceIdByKey.set(row.source_key, existing.rows[0].$id);
    } else {
      const created = await db.createRow(DATABASE_ID, 'source_datasets', 'unique()', row);
      sourceIdByKey.set(row.source_key, created.$id);
    }
  }

  // 2. species — upsert by slug (editorial set only)
  const speciesIdBySlug = new Map<string, string>();
  for (const p of CARE_PROFILES) {
    const existing = await db.listRows(DATABASE_ID, 'species', [Query.equal('slug', p.slug), Query.limit(1)]);
    const data = {
      scientific_name: p.scientificName,
      common_names: p.commonNames,
      family: p.family.value,
      slug: p.slug,
    };
    if (existing.rows[0]) {
      await db.updateRow(DATABASE_ID, 'species', existing.rows[0].$id, data);
      speciesIdBySlug.set(p.slug, existing.rows[0].$id);
    } else {
      const created = await db.createRow(DATABASE_ID, 'species', 'unique()', data);
      speciesIdBySlug.set(p.slug, created.$id);
    }
  }

  // 3. care_facts — clear this dataset's facts per species, then insert (simplest
  //    idempotency for the editorial reload; multi-source slices switch to
  //    natural-key upsert).
  for (const p of CARE_PROFILES) {
    const speciesId = speciesIdBySlug.get(p.slug)!;
    const species = await db.getRow(DATABASE_ID, 'species', speciesId, [Query.select(['*', 'care_facts.*'])]);
    for (const existing of (species as unknown as { care_facts?: { $id: string }[] }).care_facts ?? []) {
      await db.deleteRow(DATABASE_ID, 'care_facts', existing.$id);
    }
  }
  for (const row of buildFactRows()) {
    await db.createRow(DATABASE_ID, 'care_facts', 'unique()', {
      species_id: speciesIdBySlug.get(row.species_slug)!,
      source_id: sourceIdByKey.get(row.source_key)!,
      attribute: row.attribute,
      value_min: row.value_min,
      value_max: row.value_max,
      value_text: row.value_text,
      value_unit: row.value_unit,
      trust: row.trust,
    });
  }

  console.log(`Loaded ${sourceIdByKey.size} sources, ${speciesIdBySlug.size} species, ${buildFactRows().length} care facts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` `scripts`:

```json
    "knowledge:mine": "tsx scripts/knowledge/load-knowledge.ts",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge/load-rows.ts scripts/knowledge/load-knowledge.ts tests/lib/knowledge-load-rows.test.ts package.json
git commit -m "feat(knowledge): editorial loader (pure row builders + knowledge:mine admin script)"
```

---

### Task 4: Read facts from Appwrite and wire the panel through the shaper

**Files:**
- Modify: `src/lib/repo.ts` (add `getCareProfile(speciesId, scientificName)`)
- Modify: `src/lib/knowledge/sources.ts` (add `sourceFromRow` mapper if reading source rows — optional; the bundled registry already has all slice-1 sources, so the panel keeps using `getSource`)
- Modify: `src/features/timeline/PlantScreen.tsx` (fetch + compose `careProfile` async)
- Test: `tests/lib/knowledge-facts.test.ts` (extend with a parse test for the repo shaper helper)

- [ ] **Step 1: Write the failing test (repo row → CareFact mapper)**

Add a pure mapper `careFactsFromSpeciesRow` to `facts.ts` and test it. Append to `tests/lib/knowledge-facts.test.ts`:

```ts
import { careFactsFromSpeciesRow } from '../../src/lib/knowledge/facts';

describe('careFactsFromSpeciesRow', () => {
  it('maps an Appwrite species row with hydrated care_facts into CareFact[]', () => {
    const row = {
      care_facts: [
        { attribute: 'light', value_text: 'Bright indirect', value_min: null, value_max: null, value_unit: null, trust: 'editorial', source_id: 's1' },
        { attribute: 'water_cadence_days', value_text: null, value_min: 7, value_max: 10, value_unit: 'days', trust: 'editorial', source_id: 's1' },
      ],
    };
    const facts = careFactsFromSpeciesRow(row, (id) => (id === 's1' ? 'plantdoc-editorial' : id));
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ attribute: 'light', valueText: 'Bright indirect', sourceId: 'plantdoc-editorial' });
    expect(facts[1]).toMatchObject({ attribute: 'water_cadence_days', valueMin: 7, valueMax: 10 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- knowledge-facts`
Expected: FAIL — `careFactsFromSpeciesRow` is not exported.

- [ ] **Step 3: Implement the mapper in `facts.ts`**

Append to `src/lib/knowledge/facts.ts`:

```ts
interface RawCareFactRow {
  attribute: string;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  value_unit: string | null;
  trust: Trust;
  source_id: unknown;
}

/**
 * Maps a hydrated Appwrite species row (`care_facts.*` selected) into CareFact[].
 * `resolveSourceKey` turns the relationship's related-row $id into the stable
 * source key the UI cache is keyed by (Appwrite returns relationship values as
 * the related id on a plain read).
 */
export function careFactsFromSpeciesRow(
  row: { care_facts?: RawCareFactRow[] },
  resolveSourceKey: (relatedId: string) => string,
): CareFact[] {
  return (row.care_facts ?? []).map((r) => ({
    attribute: r.attribute,
    valueMin: r.value_min ?? undefined,
    valueMax: r.value_max ?? undefined,
    valueText: r.value_text ?? undefined,
    valueUnit: r.value_unit ?? undefined,
    trust: r.trust,
    sourceId: resolveSourceKey(typeof r.source_id === 'string' ? r.source_id : String((r.source_id as { $id?: string })?.$id ?? '')),
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- knowledge-facts`
Expected: PASS.

- [ ] **Step 5: Add `getCareProfile` to `repo.ts`**

Read the existing `getPlantWithTimeline` in `src/lib/repo.ts` to match the SDK call style (TablesDB instance name, `Query.select` usage, `DATABASE_ID` import). Then add:

```ts
import { composeCareProfile, careFactsFromSpeciesRow, type CareFact } from './knowledge/facts';
import { getSource } from './knowledge/sources';

/**
 * Loads the table-backed care profile for a species, composed from its
 * care_facts. Reads facts through the species two-way relation (relationship
 * columns can't be filtered). Returns null when the species has no facts or the
 * read fails, so the panel degrades to hidden rather than erroring.
 */
export async function getCareProfile(speciesId: string) {
  try {
    const row = await tablesDB.getRow(DATABASE_ID, 'species', speciesId, [
      Query.select(['*', 'care_facts.*']),
    ]);
    const facts: CareFact[] = careFactsFromSpeciesRow(
      row as never,
      // slice 1: every source is already in the bundled registry; map the
      // related id straight through, and let getSource resolve by key once the
      // loader writes source_key-aligned rows. For slice 1 the editorial loader
      // creates source rows whose $id we don't have here, so fall back to the
      // editorial key when unresolved.
      (id) => (getSource(id) ? id : 'plantdoc-editorial'),
    );
    return composeCareProfile((row as { scientific_name: string }).scientific_name, facts, {
      slug: (row as { slug?: string }).slug ?? speciesId,
      commonNames: (row as { common_names?: string[] }).common_names ?? [],
      synonyms: [],
      nameSourceId: 'powo',
    });
  } catch {
    return null;
  }
}
```

> NOTE during execution: the source-id→key resolution above is a slice-1
> simplification. Slice 2 adds a cached `source_datasets` fetch (`getSourceIndex()`)
> that maps related `$id` → `source_key` properly; wire `getCareProfile` to it
> then. Do not over-build it here.

- [ ] **Step 6: Wire `PlantScreen.tsx` to fetch + compose**

In `src/features/timeline/PlantScreen.tsx`: replace the synchronous `careProfileForPlant` import/usage with an async fetch keyed on the resolved species id. Keep the bundled `careProfileForPlant` as the fallback when the plant has no canonical `species_id` row (free-text species). Change line 11 import and the `careProfile` derivation (around line 477):

```tsx
import { careProfileForPlant, type SpeciesCareProfile } from '../../lib/knowledge/care-profiles';
import { getCareProfile, getPlantWithTimeline, photoUrl, setInsightFeedback, uploadPhoto } from '../../lib/repo';
```

Add state near the other `useState` hooks:

```tsx
  const [careProfile, setCareProfile] = useState<SpeciesCareProfile | null>(null);
```

Add an effect after the plant loads (the plant's `species_id` is a hydrated object or string):

```tsx
  useEffect(() => {
    if (!plant) return;
    let cancelled = false;
    const speciesRowId =
      plant.species_id && typeof plant.species_id === 'object'
        ? (plant.species_id as { $id?: string }).$id
        : typeof plant.species_id === 'string'
          ? plant.species_id
          : undefined;
    if (speciesRowId) {
      getCareProfile(speciesRowId).then((p) => {
        if (!cancelled) setCareProfile(p ?? careProfileForPlant(plant));
      });
    } else {
      setCareProfile(careProfileForPlant(plant));
    }
    return () => { cancelled = true; };
  }, [plant]);
```

Delete the old `const careProfile = careProfileForPlant(plant);` line (~477). The two `<CareProfilePanel>` render sites (lines ~668 and ~937) stay unchanged — they already gate on `careProfile &&`.

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test`
Run: `npx tsc -b`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/repo.ts src/lib/knowledge/facts.ts src/features/timeline/PlantScreen.tsx tests/lib/knowledge-facts.test.ts
git commit -m "feat(knowledge): panel reads care facts from Appwrite via the shaper"
```

---

### Task 5: Docs + privacy test + slice closeout

**Files:**
- Modify: `docs/schema.md` (document the three new tables + `species.slug`)
- Modify: `docs/knowledge-layer.md` (note the bundle→table migration)
- Test: `tests/appwrite/public-export-privacy.test.ts` (assert knowledge tables never enter the export field set)

- [ ] **Step 1: Write the failing privacy test**

Read `tests/appwrite/public-export-privacy.test.ts` for its style, then add:

```ts
  it('knowledge reference tables are absent from the public export path', () => {
    const knowledge = ['source_datasets', 'taxon_references', 'care_facts'];
    for (const id of knowledge) {
      const table = TABLES.find((t) => t.id === id)!;
      expect(table.columns.some((c) => c.key === 'user_id'), id).toBe(false);
    }
    // the export projects only public_observations columns; knowledge tables
    // are not that table and carry no user data.
    expect(PUBLIC_EXPORT_FIELDS.every((f) => typeof f === 'string')).toBe(true);
  });
```

(Match the file's existing imports for `TABLES` / `PUBLIC_EXPORT_FIELDS`.)

- [ ] **Step 2: Run to verify it fails or passes meaningfully**

Run: `npm test -- public-export-privacy`
Expected: PASS once the import is correct (this is a guard test; it should pass and lock the invariant).

- [ ] **Step 3: Update `docs/schema.md`**

Add a `### source_datasets`, `### taxon_references`, `### care_facts` section under the knowledge area (mirror the existing table doc format with the column table), add `slug` to the `species` table doc, and add the new indexes to the Indexes section: `source_datasets.source_key (unique)`, `species.slug (unique)`. Note the read pattern (facts read through the species relation) and that these are public-read/admin-write reference tables with no `user_id`.

- [ ] **Step 4: Update `docs/knowledge-layer.md`**

Under "Pieces", note that care profiles now live in Appwrite (`care_facts` related to `species` + `source_datasets`), composed by `src/lib/knowledge/facts.ts`; the bundled `CARE_PROFILES` is retained as the editorial seed for the loader and as the name index for onboarding search. The three-care-layers section is unchanged.

- [ ] **Step 5: Run the full suite + lint + typecheck**

Run: `npm test`
Run: `npm run lint`
Run: `npx tsc -b`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docs/schema.md docs/knowledge-layer.md tests/appwrite/public-export-privacy.test.ts
git commit -m "docs(knowledge): document care-fact tables; lock knowledge tables out of public exports"
```

---

### Credential-gated apply (run once credentials are available)

These steps need the Appwrite admin key in `.env` and cannot be unit-verified offline:

- [ ] Run `npm run appwrite:check` to confirm credentials + connectivity.
- [ ] Run `npm run appwrite:setup` to create the three tables, the `species.slug` column, and the relationships/indexes. Watch for relationship-creation ordering (source_datasets must exist before care_facts/taxon_references — they're declared in that order in `TABLES`, which `setup.ts` applies sequentially).
- [ ] Run `npm run knowledge:mine` to upsert the editorial dataset.
- [ ] Verify in the app (preview): open a plant whose species is one of the editorial 10; the Species care guide renders identical facts, now table-backed; no console errors; a plant with a free-text species still falls back to the bundled profile.

---

## Self-Review

- **Spec coverage:** decisions 1 (tables not bundle — Tasks 1,4), 2 (relations, source resolved from cached registry — Task 4 + slice-2 note), 3 (normalized `care_facts` — Task 1,2), 4 (quarantine flag from license — Task 3 `buildSourceRows`), 5 (trust precedence — Task 2 `pickBest`), 6 (admin script — Task 3). Build-order step 1 fully covered. Steps 2–5 explicitly deferred to their own plans.
- **Placeholders:** none — every code step is complete. The two execution-time NOTEs (confirm `client.ts` export names; slice-2 source-index) are guidance, not missing code; the slice-1 code runs as written with the editorial-key fallback.
- **Type consistency:** `CareFact`, `Trust`, `SpeciesIdentity`, `FactRow`, `SourceRow` defined once and reused; `composeCareProfile`/`editorialProfileToFacts`/`careFactsFromSpeciesRow`/`getCareProfile` signatures consistent across tasks; `SpeciesCareProfile` reused unchanged from `care-profiles.ts`.
