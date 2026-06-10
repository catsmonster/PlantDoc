# Phase 2 Open Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Versioned, privacy-safe public dataset pipeline: consented observations → `public_observations` rows → CSV/JSONL/aggregate artifacts in the `open-data-exports` bucket, with revocation honored on every build.

**Architecture:** Pure transform module (unit-tested) + two admin scripts (build = table reconciliation, publish = artifact generation/upload), mirroring the setup/seed script pattern. Spec: `docs/superpowers/specs/2026-06-10-phase-2-open-data-design.md`.

**Tech Stack:** node-appwrite server SDK, tsx, Vitest.

---

### Task 1: Source index for upserts

**Files:** Modify `appwrite/schema.ts`, `tests/appwrite/schema.test.ts`.

- [x] **1.1** Test: `public_observations` has a unique index on `['source_observation_id']`. FAIL.
- [x] **1.2** Add `{ key: 'idx_source_observation', type: 'unique', columns: ['source_observation_id'] }`. PASS.
- [x] **1.3** `npm run appwrite:setup` (live): index created; re-run idempotent. Commit.

### Task 2: Pure transform module (TDD)

**Files:** Create `scripts/export/transform.ts`, `tests/export/transform.test.ts`.

- [x] **2.1** Tests first: consent rejection (throws on `contribute_to_public_dataset !== true`), note/photo types skipped (`toPublicRow` returns null), produced keys ⊆ `PUBLIC_EXPORT_FIELDS ∪ {source_observation_id}`, month bucketing, `plant_age_days`, species fallback to `species_text`, `public_file_id` always null, geo cohort coarsening (k=5: region→country→null), aggregate cells n<5 suppressed, CSV escaping (quotes/commas/newlines), serialized CSV/JSONL of a synthetic fixture contains no private markers (user id, nickname, note text). FAIL.
- [x] **2.2** Implement `toPublicRow(obs, opts)`, `coarsenGeoCohorts(rows)`, `buildAggregates(rows)`, `toCsv(rows, fields)`, `toJsonl(rows, fields)`, `nextVersion(existing)`. PASS. Commit.

### Task 3: Builder script (live reconciliation)

**Files:** Create `scripts/export/build.ts`; modify `package.json` (`export:build`).

- [x] **3.1** Paginated fetch of consented observations (nested select incl. `plant_id.*`, `plant_id.species_id.*`, `treatments.*`, `measurements.*`, `photos.*`), paginated fetch of existing `public_observations`; transform; diff by `source_observation_id`; createRow/updateRow/deleteRow accordingly; summary counts; non-zero exit on error.
- [x] **3.2** Run live: seed-consented observations + Phase 1 test watering row reconciled (seed-0 rows updated in place, revoked/absent sources deleted). Re-run: 0 changes. Commit.

### Task 4: Publisher script (artifacts)

**Files:** Create `scripts/export/publish.ts`; modify `package.json` (`export:publish`), `.gitignore` (`exports/`).

- [x] **4.1** Read all `public_observations`, project `PUBLIC_EXPORT_FIELDS`, compute `vN` from existing `manifest-*` files in bucket, write `exports/` artifacts (csv, jsonl, aggregates, manifest, data-dictionary.md, changelog.md with build/revocation counts), upload via InputFile (no public grant unless `--publish`).
- [x] **4.2** Run live (without `--publish`); list bucket files via admin SDK to verify presence + no `any` grants (`scripts/export/verify-bucket.ts`: 6 v1 files, 0 public grants). Commit.

### Task 5: Consent copy, docs, gates, merge

**Files:** Modify `src/features/onboarding/OnboardingScreen.tsx`, `src/features/timeline/LogSheet.tsx`; create `docs/open-data.md`; modify `docs/schema.md`.

- [ ] **5.1** Consent hints mention "open data (CC BY 4.0, draft)". Lint/build/test green.
- [ ] **5.2** `docs/open-data.md`: how to run build/publish, versioning, revocation behavior, publish flag. schema.md: index + pipeline note.
- [ ] **5.3** All gates (lint, build, test, appwrite:check). Tick checkboxes, merge to master locally, keep unpushed.

## Self-Review Notes

Spec decisions 1-11 map to Tasks 1 (decision 6), 2 (4,5,7,8), 3 (1,2,3,6), 4 (7,8,9,11), 5 (10 + docs). No placeholders; exact files and behaviors named. Type names come from `appwrite/schema.ts` exports and `src/lib/types.ts`.
