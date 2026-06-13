# Knowledge Mining — Slice 5: Seed Expansion + Live Mine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the mined catalog beyond the 10 editorial species by seeding the `species` table from the editorial pack **+** the ~105-entry common-plants seed, and make the mining loaders **catalog-driven** (mine whatever species exist in the table), then run the live mine across the whole catalog.

**Architecture:** A pure `catalog.ts` (`slugify` + `buildSpeciesCatalog`) unions the editorial profiles and `COMMON_PLANT_SEED` into a deduped `{slug, scientificName, commonNames}` catalog. A `knowledge:seed-species` loader upserts those rows. The three extractor loaders (cross-links, OpenPlantbook, Permapeople) stop hardcoding `CARE_PROFILES` and instead **list species from the table** via a shared `listAllSpecies` helper — so they mine the whole catalog and scale automatically as the seed grows. OpenPlantbook gains a fetch-token-once path so a many-species run doesn't re-auth per species.

**Tech Stack:** TypeScript, Vitest (node), node-appwrite admin client (cursor pagination), the slice 2–4 keyless + keyed extractors.

---

## File structure

- `src/lib/knowledge/catalog.ts` (create) — `slugify`, `CatalogSpecies`, `buildSpeciesCatalog`.
- `src/lib/knowledge/openplantbook.ts` (modify) — export `fetchOpenPlantbookToken`; let `fetchOpenPlantbookFacts` accept a pre-fetched token.
- `scripts/knowledge/species-list.ts` (create) — `listAllSpecies(tablesDB, db)` cursor pagination.
- `scripts/knowledge/seed-species.ts` (create) — `knowledge:seed-species` loader.
- `scripts/knowledge/load-cross-links.ts`, `load-openplantbook.ts`, `load-permapeople.ts` (modify) — iterate `listAllSpecies` instead of `CARE_PROFILES`.
- `package.json` (modify) — add `knowledge:seed-species`.
- Tests: `tests/lib/knowledge-catalog.test.ts`, `tests/lib/knowledge-openplantbook.test.ts` (extend for the token path).

---

### Task 1: Species catalog (pure)

**Files:** Create `src/lib/knowledge/catalog.ts`; test `tests/lib/knowledge-catalog.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { slugify, buildSpeciesCatalog } from '../../src/lib/knowledge/catalog';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';

describe('slugify', () => {
  it('lowercases and hyphenates a scientific name', () => {
    expect(slugify('Monstera deliciosa')).toBe('monstera-deliciosa');
    expect(slugify('Mentha x piperita')).toBe('mentha-x-piperita');
    expect(slugify('Hibiscus rosa-sinensis')).toBe('hibiscus-rosa-sinensis');
  });
});

describe('buildSpeciesCatalog', () => {
  const catalog = buildSpeciesCatalog();
  it('includes every editorial species by its own slug', () => {
    for (const p of CARE_PROFILES) {
      expect(catalog.find((c) => c.slug === p.slug), p.slug).toBeDefined();
    }
  });
  it('is much larger than the editorial pack and has unique slugs', () => {
    expect(catalog.length).toBeGreaterThan(CARE_PROFILES.length + 50);
    const slugs = catalog.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('every entry has a slug, scientific name, and common names array', () => {
    expect(catalog.every((c) => c.slug.length > 0 && c.scientificName.length > 0 && Array.isArray(c.commonNames))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-catalog`.

- [ ] **Step 3: Implement** `src/lib/knowledge/catalog.ts`:

```ts
/**
 * The species catalog to mine (roadmap Phase 4A, slice 5). Unions the editorial
 * care pack (rich, hand-authored) with the common-plants onboarding seed
 * (name-only) into one deduped list keyed by a stable slug. The mining loaders
 * read the live `species` table, which this catalog seeds — so growing coverage
 * is just growing the seed. Pure + SDK-free so it unit-tests without Appwrite.
 */

import { CARE_PROFILES } from './care-profiles';
import { COMMON_PLANT_SEED } from '../../../scripts/knowledge/common-plants.seed';

export interface CatalogSpecies {
  slug: string;
  scientificName: string;
  commonNames: string[];
}

/** Stable slug from a scientific name: lowercased, non-alphanumerics → single hyphens. */
export function slugify(scientificName: string): string {
  return scientificName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Editorial species (own slug + names) unioned with the common-plants seed,
 *  deduped by slug with editorial taking precedence. */
export function buildSpeciesCatalog(): CatalogSpecies[] {
  const bySlug = new Map<string, CatalogSpecies>();
  for (const p of CARE_PROFILES) {
    bySlug.set(p.slug, { slug: p.slug, scientificName: p.scientificName, commonNames: [...p.commonNames] });
  }
  for (const seed of COMMON_PLANT_SEED) {
    const slug = slugify(seed.scientific);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, scientificName: seed.scientific, commonNames: [seed.common] });
    }
  }
  return [...bySlug.values()];
}
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-catalog`.
- [ ] **Step 5: Commit** — `feat(knowledge): species catalog (editorial + common-plants seed, deduped)`.

---

### Task 2: OpenPlantbook fetch-token-once

**Files:** Modify `src/lib/knowledge/openplantbook.ts`; extend `tests/lib/knowledge-openplantbook.test.ts`.

- [ ] **Step 1: Failing test** (add): the parser/picker tests stay; add a check that `fetchOpenPlantbookToken` is exported and returns the access token from a fake fetcher.

```ts
import { fetchOpenPlantbookToken } from '../../src/lib/knowledge/openplantbook';
// ...
it('fetchOpenPlantbookToken returns the access_token', async () => {
  const fake = (async () =>
    new Response(JSON.stringify({ access_token: 'tok123' }), { status: 200 })) as unknown as typeof fetch;
  const token = await fetchOpenPlantbookToken({ clientId: 'a', secret: 'b' }, fake);
  expect(token).toBe('tok123');
});
```

- [ ] **Step 2: Run, expect FAIL** (not exported). `npm test -- knowledge-openplantbook`.

- [ ] **Step 3: Implement** — rename the private `fetchToken` to an exported `fetchOpenPlantbookToken(creds, fetcher = fetch)`, and give `fetchOpenPlantbookFacts` an optional `token` param so a batch loader fetches once:

```ts
export async function fetchOpenPlantbookFacts(
  scientificName: string,
  creds: { clientId: string; secret: string },
  fetcher: typeof fetch = fetch,
  token?: string,
): Promise<CareFact[]> {
  const access = token ?? (await fetchOpenPlantbookToken(creds, fetcher));
  if (!access) return [];
  const auth = { Authorization: `Bearer ${access}` };
  // ...rest unchanged (search → pick → detail → parse)...
}
```

(The existing single-species call still works — `token` defaults to undefined and it auths itself.)

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-openplantbook`.
- [ ] **Step 5: Commit** — `feat(knowledge): export OpenPlantbook token fetch; allow reuse across a batch`.

---

### Task 3: Shared species-list helper + seed-species loader

**Files:** Create `scripts/knowledge/species-list.ts` + `scripts/knowledge/seed-species.ts`; modify `package.json`.

- [ ] **Step 1:** Create `scripts/knowledge/species-list.ts`:

```ts
/**
 * Lists every species in the catalogue (cursor-paginated) for the mining
 * loaders, so they mine whatever knowledge:seed-species has populated rather
 * than a hardcoded list.
 */
import { Query, type TablesDB } from 'node-appwrite';

export interface CatalogedSpecies {
  slug: string;
  scientificName: string;
}

export async function listAllSpecies(tablesDB: TablesDB, db: string): Promise<CatalogedSpecies[]> {
  const out: CatalogedSpecies[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await tablesDB.listRows({ databaseId: db, tableId: 'species', queries });
    const rows = (res.rows ?? []) as unknown as { $id: string; slug?: string; scientific_name?: string }[];
    for (const r of rows) {
      if (r.scientific_name) out.push({ slug: r.slug ?? r.$id, scientificName: r.scientific_name });
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].$id;
  }
  return out;
}
```

- [ ] **Step 2:** Create `scripts/knowledge/seed-species.ts` (`knowledge:seed-species`): upsert `buildSourceRows()` then every `buildSpeciesCatalog()` species by slug (data: scientific_name, common_names, slug). Idempotent.

```ts
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { buildSpeciesCatalog } from '../../src/lib/knowledge/catalog';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const db = DATABASE_ID;
  for (const row of buildSourceRows()) {
    await ctx.tablesDB.upsertRow({ databaseId: db, tableId: 'source_datasets', rowId: row.source_key, data: row });
  }
  const catalog = buildSpeciesCatalog();
  for (const s of catalog) {
    await ctx.tablesDB.upsertRow({
      databaseId: db, tableId: 'species', rowId: s.slug,
      data: { scientific_name: s.scientificName, common_names: s.commonNames, slug: s.slug },
    });
  }
  console.log(`seeded ${catalog.length} species`);
}
void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 3:** Add to `package.json`: `"knowledge:seed-species": "tsx scripts/knowledge/seed-species.ts"`.
- [ ] **Step 4: Typecheck** — `node ./node_modules/typescript/bin/tsc -b` → exit 0.
- [ ] **Step 5: Commit** — `feat(knowledge): knowledge:seed-species loader + shared species lister`.

---

### Task 4: Make the extractor loaders catalog-driven

**Files:** Modify `scripts/knowledge/load-cross-links.ts`, `load-openplantbook.ts`, `load-permapeople.ts`.

- [ ] **Step 1:** In each loader, replace `for (const p of CARE_PROFILES)` with iterating `await listAllSpecies(ctx.tablesDB, db)`, using `s.slug` / `s.scientificName`. Drop the `CARE_PROFILES` import; import `listAllSpecies`. The per-species body (read with select → source-scoped clear → insert) is unchanged.
- [ ] **Step 2:** In `load-openplantbook.ts`, fetch the token once before the loop (`const token = await fetchOpenPlantbookToken(creds);` — bail with a clear message if null) and pass it into `fetchOpenPlantbookFacts(s.scientificName, creds, fetch, token)`.
- [ ] **Step 3:** Keep the upsert of each loader's own source row at the top (idempotent).
- [ ] **Step 4: Typecheck + lint** — `node ./node_modules/typescript/bin/tsc -b`; `node ./node_modules/.bin/eslint scripts/knowledge`.
- [ ] **Step 5: Commit** — `feat(knowledge): mine the whole species catalog (loaders read the species table)`.

---

### Task 5: Live mine + verify + gate

- [ ] **Step 1:** `./node_modules/.bin/tsx scripts/knowledge/seed-species.ts` → expect "seeded ~110 species".
- [ ] **Step 2:** Run the editorial loader (`load-knowledge.ts`) to (re)write editorial facts for the 10, then the three catalog-driven loaders:
  - `load-cross-links.ts`, `load-openplantbook.ts`, `load-permapeople.ts` (each may take a few minutes across the full catalog; background if needed).
- [ ] **Step 3:** Print coverage: count of species, of `taxon_references`, of `care_facts` by source (one-off tsx read). Confirm coverage is much higher than the 10-species baseline.
- [ ] **Step 4:** Full gate — `npm test`, `npm run lint`, `node ./node_modules/typescript/bin/tsc -b`.

---

### Task 6: Docs + memory

- [ ] Update `docs/knowledge-layer.md` (catalog + seed-species; loaders now table-driven) and `docs/schema.md` if needed (no schema change). Update the project memory. Commit — `docs(knowledge): document the catalog-driven mine + seed expansion (slice 5)`.

---

## Self-review

- **Spec coverage:** build-order step 5 (seed expansion + live mine). Reaching the full 300–500 is now just growing `COMMON_PLANT_SEED` (its doc says it "is meant to grow"); the pipeline scales to whatever the table holds. The current expansion (~110) is the editorial 10 + the curated common-plants seed.
- **Type consistency:** `CatalogSpecies` (catalog.ts) and `CatalogedSpecies` (species-list.ts) both carry `slug` + `scientificName`; loaders use those. `slugify` matches the editorial slugs for the overlap species (verified by the catalog test: editorial slugs present and unique).
- **Idempotency:** seed-species upserts by slug; the source-scoped care-fact loaders + cross-link clear-by-species keep re-runs convergent.
- **Coverage honesty:** OpenPlantbook/Permapeople exact-match means many expansion species get few or no mined facts (these catalogs skew indoor-sparse / edible). That is correct conservative behaviour — no wrong-species data — and cross-links (Wikidata/GBIF) cover far more broadly.
