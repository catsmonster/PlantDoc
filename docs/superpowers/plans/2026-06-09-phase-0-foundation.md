# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 0 foundation: Vite/React/TS baseline, declarative Appwrite schema (TablesDB + native relationships), idempotent setup/seed scripts, and privacy-boundary tests.

**Architecture:** A declarative schema module (`appwrite/schema.ts`) is the single source of truth; setup/seed scripts in `scripts/appwrite/` apply it idempotently via the node-appwrite TablesDB API; Vitest tests pin privacy boundaries and schema coverage locally without network access.

**Tech Stack:** Vite 7 + React 19 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), ESLint 9 flat config, Vitest, `node-appwrite` (TablesDB API), `tsx` for running TS scripts, `dotenv`.

---

## Locked-In Decisions (deviations from spec, all improvements)

1. **Env contract matches the real `.env`.** Actual `.env` has `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_PROJECT_NAME`, `VITE_APPWRITE_ENDPOINT`, `APPWRITE_API_KEY`. Scripts read `APPWRITE_PROJECT_ID ?? VITE_APPWRITE_PROJECT_ID` (same for endpoint/name). The secret `APPWRITE_API_KEY` has no `VITE_` fallback and no `VITE_` variant may exist — checked at runtime.
2. **Native relationships (GA) instead of string FKs** for entity links: `plants→species`, `plants→user_locations`, `observations→plants`, `treatments→observations`, `measurements→observations`, `photos→observations`, `environment_snapshots→plants`, `environment_snapshots→observations`. `user_id` stays a plain string everywhere (Auth users are not TablesDB rows). `public_observations` keeps plain string columns only (export independence; no linkage surface).
3. **Built-in `$createdAt`/`$updatedAt`** replace custom `created_at`/`updated_at` columns (Appwrite maintains them server-side; custom ones would drift).
4. **Required+default conflict resolution** (Appwrite forbids defaults on required columns): columns the docs mark "required with default" become optional-with-default (`preferred_units`, `public_contribution_default`, `contribute_to_public_dataset`, `exif_stripped`, `allow_public_image`, `status`). True requireds keep `required: true` and no default. Relationship columns cannot be `required` in Appwrite — `observations.plant_id` requiredness is an app-layer rule.
5. **String types:** `varchar` for short indexable strings, `text` for private notes/summaries (off-page, keeps rows under the 64 KB limit). Legacy `string` type is deprecated per the official Appwrite TypeScript agent skill.
6. **No spatial index in Phase 0** (geo queries are Phase 3; guidelines say add indexes only for real query patterns). `user_locations.location` is still created as a `point` column. No indexes on relationship columns (not supported).
7. **Docs updated in-plan:** `docs/schema.md` (relationships, timestamps, required/default notes) and a new ADR-006.

## File Structure

```text
appwrite/schema.ts          # declarative DB/tables/columns/indexes/buckets + PUBLIC_EXPORT_FIELDS
appwrite/seed-data.ts       # deterministic synthetic fixtures
scripts/appwrite/env.ts     # env loading + validation (no SDK import)
scripts/appwrite/client.ts  # admin Client/TablesDB/Storage factories
scripts/appwrite/check.ts   # local-only validation entrypoint
scripts/appwrite/setup.ts   # idempotent remote resource creation
scripts/appwrite/seed.ts    # deterministic seed upserts
src/App.tsx, src/main.tsx, src/index.css   # minimal Tailwind app shell
tests/appwrite/schema.test.ts
tests/appwrite/public-export-privacy.test.ts
tests/appwrite/env-contract.test.ts
.env.example
```

---

### Task 1: Project baseline (Vite + Tailwind + ESLint + Vitest)

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.env.example`; modify `.gitignore`.

- [x] **Step 1.1:** Scaffold into the existing repo: `npm create vite@latest . -- --template react-ts` (files land alongside docs; do not overwrite `.gitignore` blindly — keep the existing one, ensure it still ignores `.env`, `.env.*` except `.env.example`, `node_modules/`, `dist/`, `coverage/`).
- [x] **Step 1.2:** `npm install`, then `npm install tailwindcss @tailwindcss/vite` and `npm install -D vitest node-appwrite tsx dotenv`.
- [x] **Step 1.3:** Wire Tailwind v4: add `tailwindcss()` to `vite.config.ts` plugins; `src/index.css` starts with `@import "tailwindcss";` plus a small `@theme` block with PlantDoc tokens (botanical green `--color-leaf-*`, slate, clay). No tailwind.config file needed in v4.
- [x] **Step 1.4:** Replace scaffold `App.tsx` with a minimal mobile-first shell: PlantDoc title, one-line mission, and a "Phase 0 foundation" status card using the tokens. Delete unused scaffold assets (`App.css`, logos).
- [x] **Step 1.5:** Add `vitest` config inside `vite.config.ts` (`test: { environment: 'node', include: ['tests/**/*.test.ts'] }`) using `defineConfig` from `vitest/config`.
- [x] **Step 1.6:** Create `.env.example` documenting `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_PROJECT_NAME`, `VITE_APPWRITE_ENDPOINT`, `APPWRITE_API_KEY` (placeholder values, comment that the API key must never get a `VITE_` prefix).
- [x] **Step 1.7:** Add package scripts:

```json
"dev": "vite",
"build": "tsc -b && vite build",
"lint": "eslint .",
"test": "vitest run",
"appwrite:check": "tsx scripts/appwrite/check.ts",
"appwrite:setup": "tsx scripts/appwrite/setup.ts",
"appwrite:seed": "tsx scripts/appwrite/seed.ts"
```

- [x] **Step 1.8:** Verify: `npm run lint`, `npm run build` both pass. Commit `feat: project baseline (vite react ts, tailwind v4, vitest)`.

### Task 2: Declarative schema module

**Files:** Create `appwrite/schema.ts`. Test: `tests/appwrite/schema.test.ts`.

- [x] **Step 2.1:** Write failing test `tests/appwrite/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUCKETS, DATABASE_ID, TABLES } from '../../appwrite/schema';

const REQUIRED_TABLES = ['profiles','user_locations','species','plants','observations','treatments','measurements','photos','environment_snapshots','public_observations'];
const REQUIRED_BUCKETS = ['plant-private-images','plant-public-images','open-data-exports'];

describe('schema coverage', () => {
  it('defines the primary database', () => expect(DATABASE_ID).toBe('plantdoc_main'));
  it('defines all Phase 0 tables', () => {
    expect(TABLES.map((t) => t.id).sort()).toEqual([...REQUIRED_TABLES].sort());
  });
  it('defines all Phase 0 buckets', () => {
    expect(BUCKETS.map((b) => b.id).sort()).toEqual([...REQUIRED_BUCKETS].sort());
  });
  it('every table with user data has a user_id varchar column', () => {
    for (const t of TABLES.filter((t) => !['species','public_observations'].includes(t.id))) {
      const col = t.columns.find((c) => c.key === 'user_id');
      expect(col, `${t.id}.user_id`).toBeDefined();
      expect(col!.kind).toBe('varchar');
      expect(col!.required).toBe(true);
    }
  });
  it('no table or bucket grants Role.any()', () => {
    for (const t of TABLES) expect(t.permissions.join()).not.toMatch(/any\(/);
    for (const b of BUCKETS) expect(b.permissions.join()).not.toMatch(/any\(/);
  });
  it('relationship columns only point at existing tables', () => {
    const ids = new Set(TABLES.map((t) => t.id));
    for (const t of TABLES) for (const c of t.columns) {
      if (c.kind === 'relationship') expect(ids.has(c.relatedTableId), `${t.id}.${c.key}`).toBe(true);
    }
  });
  it('public_observations has no relationship columns and no private fields', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    expect(pub.columns.some((c) => c.kind === 'relationship')).toBe(false);
    const keys = pub.columns.map((c) => c.key);
    for (const banned of ['user_id','email','nickname','placement_label','notes_private','private_file_id','location']) {
      expect(keys).not.toContain(banned);
    }
  });
});
```

- [x] **Step 2.2:** Run `npm run test` — expect FAIL (module missing).
- [x] **Step 2.3:** Implement `appwrite/schema.ts` as a pure-data module (discriminated-union `ColumnDef`: `varchar|text|integer|float|boolean|datetime|enum|point|relationship`; `IndexDef`; `TableDef` with `id,name,permissions,rowSecurity,columns,indexes`; `BucketDef`). Tables/columns/enums exactly per `docs/schema.md` minus `created_at`/`updated_at`, with the required/default resolution from Locked-In Decision 4 and relationships from Decision 2 (`twoWay: true` + `twoWayKey` for observation/plant children with `onDelete: 'cascade'`; `twoWay: false`, `onDelete: 'setNull'` for `species_id`/`location_id` and env-snapshot links). Permissions: tables `rowSecurity: true` with `permissions: []` except `species` (`rowSecurity: false`, `permissions: [Permission.read(Role.users())]` expressed as data, not SDK calls — use a tiny `perm` string DSL like `'read:users'` so the module stays SDK-free and testable). Buckets: `plant-private-images` (`fileSecurity: true`, 15 MB, jpg/jpeg/png/webp/heic, encryption+antivirus), `plant-public-images` (same minus encryption, `fileSecurity: false`), `open-data-exports` (50 MB, csv/jsonl/json/txt/md/zip). Also export `PUBLIC_EXPORT_FIELDS` (the exact exportable field list from `docs/schema.md` public export section, *excluding* `source_observation_id`) and `INTERNAL_ONLY_FIELDS = ['source_observation_id']`.
- [x] **Step 2.4:** Indexes per `docs/schema.md` recommended list, scalar columns only: `profiles.user_id` (unique), `plants.user_id`, `plants.status`, `observations.user_id`, `observations.observed_at`, `observations.observation_type`, `treatments.user_id`, `treatments.treatment_type`, `public_observations.scientific_name`, `public_observations.observed_month`, `public_observations.climate_zone`, `user_locations.user_id`. (No `species_id`/`plant_id`/`observation_id` indexes — relationship columns are not indexable.)
- [x] **Step 2.5:** `npm run test` — expect PASS. `npm run lint` clean. Commit `feat: declarative appwrite schema definitions`.

### Task 3: Public-export privacy boundary tests

**Files:** Create `tests/appwrite/public-export-privacy.test.ts`.

- [x] **Step 3.1:** Write the test (this is a pure local test against schema data):

```ts
import { describe, expect, it } from 'vitest';
import { BUCKETS, INTERNAL_ONLY_FIELDS, PUBLIC_EXPORT_FIELDS, TABLES } from '../../appwrite/schema';

const PRIVATE_FIELDS = ['user_id','email','latitude','longitude','location','postal_code','postal_code_prefix','nickname','placement_label','room','notes_private','caption_private','private_file_id','file_path','exif','captured_at','observed_at','label','city'];

describe('public export privacy', () => {
  it('public export fields contain no private fields', () => {
    for (const banned of PRIVATE_FIELDS) expect(PUBLIC_EXPORT_FIELDS).not.toContain(banned);
  });
  it('source_observation_id is internal-only and not exportable', () => {
    expect(INTERNAL_ONLY_FIELDS).toContain('source_observation_id');
    expect(PUBLIC_EXPORT_FIELDS).not.toContain('source_observation_id');
  });
  it('every public export field exists on public_observations', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    const keys = new Set(pub.columns.map((c) => c.key));
    for (const f of PUBLIC_EXPORT_FIELDS) expect(keys.has(f), f).toBe(true);
  });
  it('public_observations uses month bucket, not exact timestamps', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    expect(pub.columns.find((c) => c.key === 'observed_month')).toBeDefined();
    expect(pub.columns.map((c) => c.key)).not.toContain('observed_at');
  });
  it('no public-read grants on export surfaces in Phase 0', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    expect(pub.permissions).toEqual([]);
    for (const id of ['plant-public-images','open-data-exports']) {
      expect(BUCKETS.find((b) => b.id === id)!.permissions).toEqual([]);
    }
  });
});
```

- [x] **Step 3.2:** Run — if anything fails, fix `appwrite/schema.ts` (the schema is wrong, not the test). All green → commit `test: public export privacy boundaries`.

### Task 4: Env contract, admin client, and `appwrite:check`

**Files:** Create `scripts/appwrite/env.ts`, `scripts/appwrite/client.ts`, `scripts/appwrite/check.ts`. Test: `tests/appwrite/env-contract.test.ts`.

- [x] **Step 4.1:** Failing test first:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppwriteEnv } from '../../scripts/appwrite/env';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('appwrite env contract', () => {
  it('resolves VITE_-prefixed public vars with non-VITE precedence', () => {
    const env = resolveAppwriteEnv({
      VITE_APPWRITE_PROJECT_ID: 'p1', VITE_APPWRITE_ENDPOINT: 'https://x/v1',
      APPWRITE_API_KEY: 'k', APPWRITE_PROJECT_ID: 'override',
    });
    expect(env.projectId).toBe('override');
    expect(env.endpoint).toBe('https://x/v1');
    expect(env.apiKey).toBe('k');
  });
  it('rejects a VITE_-prefixed API key', () => {
    expect(() => resolveAppwriteEnv({
      VITE_APPWRITE_PROJECT_ID: 'p', VITE_APPWRITE_ENDPOINT: 'https://x/v1',
      APPWRITE_API_KEY: 'k', VITE_APPWRITE_API_KEY: 'leaked',
    })).toThrow(/VITE_APPWRITE_API_KEY/);
  });
  it('throws a clear error listing missing variables', () => {
    expect(() => resolveAppwriteEnv({})).toThrow(/APPWRITE_PROJECT_ID/);
  });
  it('no src/ file references APPWRITE_API_KEY', () => {
    for (const f of walk('src')) expect(readFileSync(f, 'utf8')).not.toMatch(/APPWRITE_API_KEY/);
  });
  it('.env.example documents the contract without secrets', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const k of ['VITE_APPWRITE_PROJECT_ID','VITE_APPWRITE_ENDPOINT','APPWRITE_API_KEY']) {
      expect(example).toContain(k);
    }
    expect(example).not.toMatch(/VITE_APPWRITE_API_KEY/);
  });
});
```

- [x] **Step 4.2:** Run — FAIL (`env.ts` missing). Implement `scripts/appwrite/env.ts`: `resolveAppwriteEnv(source: Record<string,string|undefined>)` returns `{ projectId, projectName, endpoint, apiKey }`; never logs values; error messages name variables only. Export `loadEnvFile()` that calls `dotenv.config()` and returns `resolveAppwriteEnv(process.env)`.
- [x] **Step 4.3:** `scripts/appwrite/client.ts`: `createAdminContext()` → `{ tablesDB: new TablesDB(client), storage: new Storage(client), env }` from `node-appwrite` using `loadEnvFile()`.
- [x] **Step 4.4:** `scripts/appwrite/check.ts`: no remote writes. Validates env resolution (prints variable names found/missing, never values), prints schema summary (table count, column counts, bucket count), asserts schema tests' invariants by importing the schema module (re-run cheap checks: all tables present, no `any()` grants). Exit 0/1.
- [x] **Step 4.5:** `npm run test` PASS, `npm run appwrite:check` prints summary and exits 0. Commit `feat: appwrite env contract, admin client, check script`.

### Task 5: Idempotent setup script

**Files:** Create `scripts/appwrite/setup.ts` (plus small helpers in the same file or `scripts/appwrite/apply.ts` if it grows past ~250 lines).

- [x] **Step 5.1:** Implement with this exact algorithm (get-then-create, never delete):
  - `ensureDatabase`: `tablesDB.get({databaseId})`; on 404 `tablesDB.create({databaseId, name})`.
  - `ensureTable`: `getTable`; on 404 `createTable({databaseId, tableId, name, permissions, rowSecurity})`.
  - `ensureColumn`: `getColumn`; on 404 dispatch by `kind` to `createVarcharColumn`/`createTextColumn`/`createIntegerColumn`/`createFloatColumn`/`createBooleanColumn`/`createDatetimeColumn`/`createEnumColumn`/`createPointColumn`/`createRelationshipColumn` (map permission/relationship enums via `RelationshipType.ManyToOne`, `RelationMutate.Cascade|SetNull`). If the column exists, compare `type`/`required`/`array` (and enum `elements`, varchar `size`, relationship `relatedTable`+`relationType`); on mismatch throw `ManualMigrationRequired` with table.column and both shapes.
  - Relationship columns are created **only from the child side**; the `twoWayKey` appears on the parent automatically — `ensureColumn` for relationship kind must also treat "already exists on parent via twoWay" as satisfied.
  - `waitForColumns`: poll `listColumns` every 2 s (max 60 s) until every defined column status is `available`; fail listing any stuck/failed columns.
  - `ensureIndex`: `getIndex`; on 404 `createIndex({type: IndexType.Key|Unique, columns, ...})`; mismatch → `ManualMigrationRequired`. Then poll `listIndexes` until `available`.
  - `ensureBucket`: `getBucket`; on 404 `createBucket({...})` from `BucketDef`; if exists, warn-and-continue on cosmetic drift, throw only on permission grants broader than defined (i.e., any unexpected `any()` grant).
  - Order: database → all tables → scalar columns (all tables) → wait → relationship columns (children after parents exist) → wait → indexes → wait → buckets.
  - 404 detection: `AppwriteException` with `code === 404`; helper `isNotFound(e)`.
  - Log resource IDs and actions (`created`/`exists`/`skipped`) only — never env values.
- [x] **Step 5.2:** `npm run lint && npm run build && npm run test` still pass (setup script compiles; no unit tests hit the network). Commit `feat: idempotent appwrite setup script`.

### Task 6: Deterministic synthetic seed data + seed script

**Files:** Create `appwrite/seed-data.ts`, `scripts/appwrite/seed.ts`. Test: extend `tests/appwrite/schema.test.ts` or new `tests/appwrite/seed-data.test.ts`.

- [x] **Step 6.1:** Failing test `tests/appwrite/seed-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SEED_ROWS, SEED_USER_IDS } from '../../appwrite/seed-data';

describe('seed data', () => {
  it('uses only synthetic seed user ids', () => {
    expect(SEED_USER_IDS).toEqual(['seed_user_alex', 'seed_user_mina']);
    for (const row of SEED_ROWS) {
      const uid = (row.data as Record<string, unknown>).user_id;
      if (uid !== undefined) expect(SEED_USER_IDS).toContain(uid);
    }
  });
  it('all row ids are deterministic seed_ ids', () => {
    for (const row of SEED_ROWS) expect(row.rowId).toMatch(/^seed_[a-z0-9_]+$/);
  });
  it('contains no real-looking PII', () => {
    const blob = JSON.stringify(SEED_ROWS);
    expect(blob).not.toMatch(/@gmail|@outlook|@yahoo/i);
    expect(blob).not.toMatch(/galvando/i);
  });
  it('uses coarse geography only (no exact coordinates beyond 1 decimal)', () => {
    for (const row of SEED_ROWS.filter((r) => r.tableId === 'user_locations')) {
      const loc = (row.data as { location?: [number, number] }).location;
      if (loc) for (const coord of loc) expect(Number.isInteger(coord * 10)).toBe(true);
    }
  });
  it('is deterministic across imports (no Date.now / Math.random)', async () => {
    const again = await import('../../appwrite/seed-data');
    expect(JSON.stringify(again.SEED_ROWS)).toBe(JSON.stringify(SEED_ROWS));
  });
});
```

- [x] **Step 6.2:** Run — FAIL. Implement `appwrite/seed-data.ts`: export `SEED_USER_IDS` and `SEED_ROWS: SeedRow[]` (`{ tableId, rowId, data, permissions }`), in dependency order:
  - 2 profiles (`seed_profile_alex` metric/false, `seed_profile_mina` imperial/false).
  - 2 user_locations (coarse: country `Netherlands` region `Utrecht` climate `Cfb` point `[5.1, 52.1]`; country `Israel` region `HaMerkaz` climate `Csa` point `[34.9, 32.1]`; `location_precision: 'regional'`).
  - 3 species (Monstera deliciosa, Epipremnum aureum, Coffea arabica — family/genus filled).
  - 4 plants (2 per user; relationship fields set to seed row IDs: `species_id: 'seed_species_monstera'`, `location_id: 'seed_loc_alex_home'`, …).
  - ~10 observations across types (`treatment`, `measurement`, `photo`, `note`, `health_check`) with fixed ISO timestamps in May 2026, `contribute_to_public_dataset` mixed true/false.
  - Child rows: 4 treatments (watering 250 ml top-water, fertilizing 5 ml, repotting, pest_control neem), 3 measurements (height/leaf_count/health_score), 1 photo metadata row (`private_file_id: 'seed_file_placeholder_001'`, `exif_stripped: true`, `allow_public_image: false` — no real upload), 2 environment_snapshots (`source: 'manual'` / `'weather_api'`, temps/humidity).
  - 2 public_observations rows derived **only** from `contribute_to_public_dataset: true` observations, with `observed_month: '2026-05'`, `dataset_version: 'seed-0'`, `geo_precision: 'climate'`, `published_at` fixed ISO; `source_observation_id` set (internal traceability).
  - Permissions per row: `read/update/delete` for `Role.user(<seed user id>)` expressed in the same string DSL as schema permissions; `species` and `public_observations` rows get `[]` (table/server-level only).
- [x] **Step 6.3:** Implement `scripts/appwrite/seed.ts`: for each `SEED_ROWS` entry in order, `tablesDB.upsertRow({databaseId, tableId, rowId, data, permissions})`. Upsert = repeat-safe. Log `tableId/rowId upserted` only.
- [x] **Step 6.4:** `npm run test` PASS. Commit `feat: deterministic synthetic seed data and seed script`.

### Task 7: Apply to Appwrite Cloud and verify remotely

**Files:** none (remote execution).

- [x] **Step 7.1:** `npm run appwrite:check` → exit 0.
- [x] **Step 7.2:** `npm run appwrite:setup` → database, 10 tables, columns, indexes, 3 buckets created. Re-run immediately → all `exists`, zero creates, exit 0 (idempotency proof).
- [x] **Step 7.3:** `npm run appwrite:seed` → all rows upserted. Re-run → still succeeds, no duplicates (verify by listing row counts).
- [x] **Step 7.4:** Verify via Appwrite MCP (read-only): list tables in `plantdoc_main`, list a few rows of `plants` and `public_observations`, confirm relationship columns resolved (plant rows reference seed species), confirm no `any()` permission grants on tables/buckets.
- [x] **Step 7.5:** Commit any fixes discovered (`fix: ...`).

### Task 8: Documentation sync

**Files:** Modify `docs/schema.md`, `docs/architecture_decisions.md`.

- [x] **Step 8.1:** `docs/schema.md`: note that `created_at`/`updated_at` map to built-in `$createdAt`/`$updatedAt`; mark relationship columns as native Appwrite relationships (child-side ManyToOne, twoWay where defined) and that `required` on relationship columns is app-layer; note required+default resolution; note spatial index deferred to Phase 3; record string-type choices (varchar/text).
- [x] **Step 8.2:** `docs/architecture_decisions.md`: add **ADR-006: Use native TablesDB relationships and built-in timestamps** (status accepted, date 2026-06-09, context = relationships GA'd; decision = relationships for entity links, plain string `user_id`, derived `public_observations` stays relationship-free; consequences = onDelete cascade semantics, relationship columns not indexable, export jobs must project plain values).
- [x] **Step 8.3:** Commit `docs: sync schema and ADR-006 with phase 0 implementation`.

### Task 9: Final verification

- [x] **Step 9.1:** Run all gates: `npm run lint`, `npm run build`, `npm run test`, `npm run appwrite:check` — all green, paste outputs into the session.
- [x] **Step 9.2:** `git status` clean working tree after final commit.

## Self-Review Notes

- Spec coverage: baseline (T1), schema defs (T2), validation tests (T2/T3/T4/T6), setup automation (T5), seed automation (T6), remote verification spec section (T7), docs-update requirements (T8), verification commands (T9). Credential contract adapted to the real `.env` (Locked-In Decision 1) — intentional spec deviation, documented.
- Type consistency: `TableDef.columns[].kind` discriminator used by schema tests (T2) and setup dispatch (T5); `SeedRow {tableId,rowId,data,permissions}` used by T6 tests and seed script.
- No placeholder steps remain; representative data values are spelled out in T6.
