# Knowledge Mining — Slice 2: Cross-link ID Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the existing `taxon_references` table with each species' stable IDs in external catalogs (GBIF, Wikidata, POWO, USDA, IPNI, EOL), mined keylessly from Wikidata SPARQL (CC0) + the GBIF match API (CC-BY).

**Architecture:** A pure Wikidata extractor (SPARQL URL builder + response parser + non-throwing fetch wrapper, mirroring `gbif.ts`) feeds a pure row builder (`taxon-refs.ts`) that dedupes by `(species, source)`. A thin admin script (`knowledge:cross-links`) does the live network pull + idempotent upsert into `taxon_references`, reusing the slice-1 loader patterns. The cross-link *target* catalogs become `source_datasets` rows so every reference cites the catalog its ID indexes; all targets here are permissive (CC0 / CC-BY / public-domain) so no quarantine obligation is inherited.

**Tech Stack:** TypeScript, Vitest (node), node-appwrite admin client, Wikidata Query Service, GBIF v1 match API.

---

## File structure

- `src/lib/knowledge/sources.ts` (modify) — extend `SourceLicense` with `public-domain`; add `usda`, `ipni`, `eol` cross-link target sources.
- `src/lib/knowledge/wikidata.ts` (create) — `CROSS_LINK_PROPERTIES`, `buildWikidataSparqlUrl`, `parseWikidataCrossLinks`, `fetchWikidataCrossLinks`.
- `src/lib/knowledge/taxon-refs.ts` (create) — `TaxonRefRow`, `buildTaxonRefRows`, `taxonRefNaturalKey`.
- `scripts/knowledge/load-cross-links.ts` (create) — `knowledge:cross-links` live pull + upsert.
- `package.json` (modify) — add the `knowledge:cross-links` script.
- `tests/lib/knowledge-wikidata.test.ts` (create) — parser + URL builder + dedup-via-builder.
- `tests/lib/knowledge-taxon-refs.test.ts` (create) — row builder + natural key.
- `docs/knowledge-layer.md` (modify) — Pieces table rows for the two new modules + the script.

The `taxon_references` table, its relations, permissions, and the schema/privacy tests already exist from slice 1 — no schema change.

---

### Task 1: Cross-link target sources in the registry

**Files:**
- Modify: `src/lib/knowledge/sources.ts`
- Test: `tests/lib/knowledge-load-rows.test.ts` (existing `buildSourceRows` cases already assert the invariants; extend lightly)

- [ ] **Step 1: Write the failing test** (add to `tests/lib/knowledge-load-rows.test.ts`)

```ts
it('registers permissive cross-link target catalogs (gbif, wikidata, powo, usda, ipni, eol), none quarantined', () => {
  const rows = buildSourceRows();
  const byKey = new Map(rows.map((r) => [r.source_key, r]));
  for (const key of ['gbif', 'wikidata', 'powo', 'usda', 'ipni', 'eol']) {
    const row = byKey.get(key);
    expect(row, key).toBeDefined();
    expect(row!.quarantined, key).toBe(false);
    expect(row!.commercial_ok, key).toBe(true);
  }
  expect(byKey.get('usda')!.license).toBe('public-domain');
});
```

- [ ] **Step 2: Run it, expect FAIL** (`usda`/`ipni`/`eol` missing).

Run: `npm test -- knowledge-load-rows`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `sources.ts` extend the union and append three sources:

```ts
export type SourceLicense = 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'ODbL' | 'public-domain' | 'editorial';
```

Append to `KNOWLEDGE_SOURCES` (before the closing `] as const`):

```ts
  {
    id: 'usda',
    name: 'USDA PLANTS Database',
    url: 'https://plants.usda.gov',
    license: 'public-domain',
    commercialOk: true,
    attribution: 'USDA, NRCS PLANTS Database (public domain)',
  },
  {
    id: 'ipni',
    name: 'International Plant Names Index',
    url: 'https://www.ipni.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'International Plant Names Index (CC BY)',
  },
  {
    id: 'eol',
    name: 'Encyclopedia of Life',
    url: 'https://eol.org',
    license: 'CC-BY',
    commercialOk: true,
    attribution: 'Encyclopedia of Life (CC BY)',
  },
```

- [ ] **Step 4: Run, expect PASS** (`npm test -- knowledge-load-rows`).
- [ ] **Step 5: Commit** — `feat(knowledge): register cross-link target catalogs (usda, ipni, eol)`.

---

### Task 2: Wikidata cross-link extractor

**Files:**
- Create: `src/lib/knowledge/wikidata.ts`
- Test: `tests/lib/knowledge-wikidata.test.ts`

- [ ] **Step 1: Write the failing test** — fixture SPARQL JSON → parsed cross-links; URL builder includes P225 + the OPTIONALs.

```ts
import { describe, expect, it } from 'vitest';
import {
  buildWikidataSparqlUrl,
  parseWikidataCrossLinks,
} from '../../src/lib/knowledge/wikidata';

const FIXTURE = {
  results: {
    bindings: [
      {
        item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q161205' },
        gbif: { type: 'literal', value: '2872152' },
        usda: { type: 'literal', value: 'MODE5' },
        powo: { type: 'literal', value: '85648-1' },
      },
    ],
  },
};

describe('buildWikidataSparqlUrl', () => {
  it('matches the taxon name (P225) and requests JSON', () => {
    const url = buildWikidataSparqlUrl('Monstera deliciosa');
    expect(url).toContain('query.wikidata.org/sparql');
    expect(url).toContain('format=json');
    expect(decodeURIComponent(url)).toContain('wdt:P225 "Monstera deliciosa"');
    expect(decodeURIComponent(url)).toContain('wdt:P846'); // GBIF id optional
  });
});

describe('parseWikidataCrossLinks', () => {
  it('extracts the QID, entity URL, and each present external id with a resolved URL', () => {
    const links = parseWikidataCrossLinks(FIXTURE);
    expect(links.qid).toBe('Q161205');
    expect(links.entityUrl).toBe('https://www.wikidata.org/wiki/Q161205');
    const byKey = new Map(links.ids.map((i) => [i.sourceKey, i]));
    expect(byKey.get('gbif')!.externalId).toBe('2872152');
    expect(byKey.get('gbif')!.externalUrl).toBe('https://www.gbif.org/species/2872152');
    expect(byKey.get('usda')!.externalUrl).toBe('https://plants.usda.gov/plant-profile/MODE5');
    expect(byKey.get('powo')!.externalUrl).toBe('https://powo.science.kew.org/taxon/85648-1');
    expect(byKey.has('ipni')).toBe(false); // absent in fixture → no row
  });

  it('returns empty links for an empty result set', () => {
    const links = parseWikidataCrossLinks({ results: { bindings: [] } });
    expect(links.qid).toBeNull();
    expect(links.ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing). `npm test -- knowledge-wikidata`.

- [ ] **Step 3: Implement** `src/lib/knowledge/wikidata.ts`:

```ts
/**
 * Wikidata cross-link extractor (roadmap Phase 4A, slice 2). Resolves a taxon
 * name (P225) to its QID and its stable IDs in other catalogs (GBIF, USDA,
 * POWO, IPNI, EOL). Wikidata is CC0, so cross-links cited from here carry no
 * share-alike obligation. Pure SPARQL-URL builder + response parser (unit
 * tested) plus a non-throwing fetch wrapper, mirroring gbif.ts. Admin-script
 * use only (sets a User-Agent), never called from the browser.
 */

export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';

/** Each Wikidata external-id property we map to a cross-link source catalog. */
export const CROSS_LINK_PROPERTIES: readonly {
  sourceKey: string;
  property: string;
  url: (id: string) => string;
}[] = [
  { sourceKey: 'gbif', property: 'P846', url: (id) => `https://www.gbif.org/species/${id}` },
  { sourceKey: 'usda', property: 'P1772', url: (id) => `https://plants.usda.gov/plant-profile/${id}` },
  { sourceKey: 'powo', property: 'P5037', url: (id) => `https://powo.science.kew.org/taxon/${id}` },
  { sourceKey: 'ipni', property: 'P961', url: (id) => `https://www.ipni.org/n/${id}` },
  { sourceKey: 'eol', property: 'P830', url: (id) => `https://eol.org/pages/${id}` },
];

export interface CrossLinkId {
  sourceKey: string;
  externalId: string;
  externalUrl: string;
}

export interface WikidataCrossLinks {
  qid: string | null;
  entityUrl: string | null;
  ids: CrossLinkId[];
}

function escapeSparqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildWikidataSparqlUrl(scientificName: string): string {
  const optionals = CROSS_LINK_PROPERTIES.map(
    (p) => `OPTIONAL { ?item wdt:${p.property} ?${p.sourceKey}. }`,
  ).join(' ');
  const vars = CROSS_LINK_PROPERTIES.map((p) => `?${p.sourceKey}`).join(' ');
  const query =
    `SELECT ?item ${vars} WHERE { ` +
    `?item wdt:P225 "${escapeSparqlString(scientificName.trim())}". ${optionals} } LIMIT 1`;
  return `${WIKIDATA_SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
}

function literal(binding: Record<string, unknown>, key: string): string | null {
  const cell = binding[key];
  if (cell && typeof cell === 'object' && typeof (cell as { value?: unknown }).value === 'string') {
    const v = (cell as { value: string }).value.trim();
    return v || null;
  }
  return null;
}

export function parseWikidataCrossLinks(response: unknown): WikidataCrossLinks {
  const empty: WikidataCrossLinks = { qid: null, entityUrl: null, ids: [] };
  if (!response || typeof response !== 'object') return empty;
  const bindings = (response as { results?: { bindings?: unknown } }).results?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) return empty;
  const binding = bindings[0] as Record<string, unknown>;
  const itemUri = literal(binding, 'item');
  const qid = itemUri ? (itemUri.split('/').pop() ?? null) : null;
  const ids: CrossLinkId[] = [];
  for (const p of CROSS_LINK_PROPERTIES) {
    const value = literal(binding, p.sourceKey);
    if (value) ids.push({ sourceKey: p.sourceKey, externalId: value, externalUrl: p.url(value) });
  }
  return {
    qid,
    entityUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
    ids,
  };
}

/** Non-throwing live lookup. Returns empty links on network error or no match. */
export async function fetchWikidataCrossLinks(
  scientificName: string,
  fetcher: typeof fetch = fetch,
): Promise<WikidataCrossLinks> {
  if (!scientificName.trim()) return { qid: null, entityUrl: null, ids: [] };
  try {
    const response = await fetcher(buildWikidataSparqlUrl(scientificName), {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'PlantDoc/1.0 (open knowledge mining; +https://plantdoc.galvando.com)',
      },
    });
    if (!response.ok) return { qid: null, entityUrl: null, ids: [] };
    const json: unknown = await response.json();
    return parseWikidataCrossLinks(json);
  } catch {
    return { qid: null, entityUrl: null, ids: [] };
  }
}
```

- [ ] **Step 4: Run, expect PASS** (`npm test -- knowledge-wikidata`).
- [ ] **Step 5: Commit** — `feat(knowledge): Wikidata cross-link extractor (SPARQL → external ids)`.

---

### Task 3: Taxon-reference row builder

**Files:**
- Create: `src/lib/knowledge/taxon-refs.ts`
- Test: `tests/lib/knowledge-taxon-refs.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { buildTaxonRefRows, taxonRefNaturalKey } from '../../src/lib/knowledge/taxon-refs';
import type { WikidataCrossLinks } from '../../src/lib/knowledge/wikidata';

const WD: WikidataCrossLinks = {
  qid: 'Q161205',
  entityUrl: 'https://www.wikidata.org/wiki/Q161205',
  ids: [
    { sourceKey: 'gbif', externalId: '2872152', externalUrl: 'https://www.gbif.org/species/2872152' },
    { sourceKey: 'usda', externalId: 'MODE5', externalUrl: 'https://plants.usda.gov/plant-profile/MODE5' },
  ],
};

describe('buildTaxonRefRows', () => {
  it('emits a wikidata QID row plus each cross-link, all tied to the slug', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, null);
    const byKey = new Map(rows.map((r) => [r.source_key, r]));
    expect(byKey.get('wikidata')!.external_id).toBe('Q161205');
    expect(byKey.get('wikidata')!.external_url).toBe('https://www.wikidata.org/wiki/Q161205');
    expect(byKey.get('gbif')!.external_id).toBe('2872152');
    expect(byKey.get('usda')!.external_id).toBe('MODE5');
    expect(rows.every((r) => r.species_slug === 'monstera-deliciosa')).toBe(true);
  });

  it('prefers the authoritative GBIF match usageKey over Wikidata P846 (deduped by source)', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, 5407241);
    const gbif = rows.filter((r) => r.source_key === 'gbif');
    expect(gbif.length).toBe(1);
    expect(gbif[0].external_id).toBe('5407241');
  });

  it('natural key is unique per (species, source)', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, 5407241);
    const keys = rows.map(taxonRefNaturalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-taxon-refs`.

- [ ] **Step 3: Implement** `src/lib/knowledge/taxon-refs.ts`:

```ts
/**
 * Pure builder for taxon_references rows (roadmap Phase 4A, slice 2). Turns a
 * species' resolved cross-links (Wikidata QID + external catalog IDs, plus the
 * authoritative GBIF match usageKey) into upsertable rows, deduped by
 * (species, source) since a species has one ID per catalog. SDK-free so it unit
 * tests without Appwrite; the admin script is thin glue over this.
 */

import type { WikidataCrossLinks } from './wikidata';

export interface TaxonRefRow {
  species_slug: string;
  source_key: string;
  external_id: string;
  external_url: string;
}

/** GBIF match usageKey takes precedence over Wikidata's P846, so it is added first. */
export function buildTaxonRefRows(
  speciesSlug: string,
  wikidata: WikidataCrossLinks,
  gbifUsageKey?: number | null,
): TaxonRefRow[] {
  const candidates: TaxonRefRow[] = [];
  if (typeof gbifUsageKey === 'number') {
    candidates.push({
      species_slug: speciesSlug,
      source_key: 'gbif',
      external_id: String(gbifUsageKey),
      external_url: `https://www.gbif.org/species/${gbifUsageKey}`,
    });
  }
  if (wikidata.qid && wikidata.entityUrl) {
    candidates.push({
      species_slug: speciesSlug,
      source_key: 'wikidata',
      external_id: wikidata.qid,
      external_url: wikidata.entityUrl,
    });
  }
  for (const id of wikidata.ids) {
    candidates.push({
      species_slug: speciesSlug,
      source_key: id.sourceKey,
      external_id: id.externalId,
      external_url: id.externalUrl,
    });
  }
  const seen = new Set<string>();
  const rows: TaxonRefRow[] = [];
  for (const row of candidates) {
    const key = taxonRefNaturalKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

/** A species has at most one ID per catalog, so (species, source) is the key. */
export function taxonRefNaturalKey(row: TaxonRefRow): string {
  return `${row.species_slug}|${row.source_key}`;
}
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-taxon-refs`.
- [ ] **Step 5: Commit** — `feat(knowledge): taxon-reference row builder (dedupe by species+source)`.

---

### Task 4: Live cross-link loader script

**Files:**
- Create: `scripts/knowledge/load-cross-links.ts`
- Modify: `package.json` (add `knowledge:cross-links`)

- [ ] **Step 1: Implement** `scripts/knowledge/load-cross-links.ts` (network glue, no new pure logic — verified by running it live, mirroring `load-knowledge.ts`):

```ts
/**
 * knowledge:cross-links — populates taxon_references for the catalogued species
 * by resolving each species' cross-links from Wikidata (CC0) + the GBIF match
 * API (CC-BY). Idempotent: source_datasets upsert by source_key; each species'
 * taxon_references are cleared and re-inserted, so a re-run converges.
 * Relationship columns take the related row id (species slug / source key, both
 * deterministic). Keyless network; requires only Appwrite admin creds (.env).
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { fetchWikidataCrossLinks } from '../../src/lib/knowledge/wikidata';
import { matchGbifSpecies } from '../../src/lib/knowledge/gbif';
import { buildTaxonRefRows } from '../../src/lib/knowledge/taxon-refs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const db = DATABASE_ID;

  // Ensure the cross-link target catalogs exist as source rows.
  for (const row of buildSourceRows()) {
    await ctx.tablesDB.upsertRow({ databaseId: db, tableId: 'source_datasets', rowId: row.source_key, data: row });
  }

  let total = 0;
  for (const p of CARE_PROFILES) {
    const [wikidata, gbif] = await Promise.all([
      fetchWikidataCrossLinks(p.scientificName),
      matchGbifSpecies(p.scientificName),
    ]);
    const rows = buildTaxonRefRows(p.slug, wikidata, gbif?.usageKey ?? null);

    const species = await ctx.tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      queries: [Query.select(['*', 'taxon_references.*'])],
    });
    const existing = (species as unknown as { taxon_references?: { $id: string }[] }).taxon_references ?? [];
    for (const ref of existing) {
      await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'taxon_references', rowId: ref.$id });
    }
    for (const row of rows) {
      await ctx.tablesDB.createRow({
        databaseId: db,
        tableId: 'taxon_references',
        rowId: ID.unique(),
        data: {
          species_id: row.species_slug,
          source_id: row.source_key,
          external_id: row.external_id,
          external_url: row.external_url,
        },
      });
    }
    total += rows.length;
    console.log(`${p.slug}: ${rows.length} refs`);
    await sleep(300); // be polite to the Wikidata Query Service
  }
  console.log(`loaded ${total} taxon_references across ${CARE_PROFILES.length} species`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2:** Add to `package.json` scripts: `"knowledge:cross-links": "tsx scripts/knowledge/load-cross-links.ts"`.
- [ ] **Step 3: Typecheck** — `node ./node_modules/typescript/bin/tsc -b`. Expected: exit 0.
- [ ] **Step 4: Commit** — `feat(knowledge): knowledge:cross-links loader (Wikidata + GBIF → taxon_references)`.

---

### Task 5: Live populate + verify

- [ ] **Step 1:** Ensure source rows exist, then run the loader:
  `./node_modules/.bin/tsx scripts/knowledge/load-cross-links.ts`
  Expected: per-species ref counts, total > 30.
- [ ] **Step 2:** Verify via a read that `monstera-deliciosa` hydrates `taxon_references` with `gbif` + `wikidata` keys and resolved URLs (Appwrite MCP or a one-off tsx read with `Query.select(['*','taxon_references.*'])`).
- [ ] **Step 3:** Full gate — `npm test` (all green), `npm run lint` (clean), `node ./node_modules/typescript/bin/tsc -b` (exit 0).

---

### Task 6: Docs

**Files:** Modify `docs/knowledge-layer.md`.

- [ ] Add Pieces-table rows for `src/lib/knowledge/wikidata.ts`, `src/lib/knowledge/taxon-refs.ts`, and the `knowledge:cross-links` script; note `taxon_references` is now populated from permissive cross-links. Commit — `docs(knowledge): document the cross-link ID map (slice 2)`.

---

## Self-review

- **Spec coverage:** build-order step 2 ("`taxon_references` + the cross-link ID map (Wikidata + GBIF permissive)") — covered by Tasks 2–5. Trefle-quarantined cross-links deferred to slice 3 (they arrive with the Trefle dump extractor); all slice-2 targets are permissive.
- **Type consistency:** `WikidataCrossLinks`/`CrossLinkId` produced by `wikidata.ts` consumed unchanged by `taxon-refs.ts`; `TaxonRefRow` field names match the loader's `data` keys and the `taxon_references` columns (`external_id`, `external_url`).
- **No placeholders:** every code step is complete.
- **Privacy/licensing:** all six target catalogs are CC0 / CC-BY / public-domain → `quarantined: false`; no `user_id`; `taxon_references` already excluded from exports by the slice-1 privacy test.
