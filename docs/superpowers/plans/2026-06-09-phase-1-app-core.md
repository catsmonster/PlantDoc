# Phase 1 App Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usable mobile-first PlantDoc app: email/password auth, onboarding profile, plant dashboard, per-plant timeline logging (treatments/measurements/notes/photos) against the Phase 0 Appwrite backend.

**Architecture:** `appwrite` web SDK behind `src/lib/repo.ts`; pure helpers (`owner.ts`, `units.ts`) unit-tested; screens in `src/features/*` with a state-machine `App.tsx` (no router). Spec: `docs/superpowers/specs/2026-06-09-phase-1-app-core-design.md`.

**Tech Stack:** React 19, `appwrite` web SDK, Tailwind v4 tokens from Phase 0, Vitest.

---

### Task 1: Create-permission grants + setup reconciliation

**Files:** Modify `appwrite/schema.ts`, `scripts/appwrite/setup.ts`, `tests/appwrite/schema.test.ts`.

- [x] **1.1** Test first: schema test asserting every private user table (`profiles`, `user_locations`, `plants`, `observations`, `treatments`, `measurements`, `photos`, `environment_snapshots`) has permissions exactly `['create:users']`, and `species`/`public_observations` remain user-unwritable (`species` = `['read:users']`, `public_observations` = `[]`). Bucket `plant-private-images` permissions = `['create:users']`; other buckets `[]`. Run: FAIL.
- [x] **1.2** Update `appwrite/schema.ts` accordingly. Run tests: PASS.
- [x] **1.3** Extend `setup.ts`: `ensureTable`/`ensureBucket` compare existing `$permissions` to `toPermissions(def.permissions)` as sets; on drift call `updateTable`/`updateBucket` with the defined permissions (log `updated`); still throw on any remote `any()` grant. Lint/build green.
- [x] **1.4** Run `npm run appwrite:setup` twice: first run logs `updated table ...` for the granted tables/bucket, second run all `exists`. Commit `feat: grant create:users for app writes; reconcile permissions in setup`.

### Task 2: Web SDK + pure helpers

**Files:** Create `src/lib/appwrite.ts`, `src/lib/types.ts`, `src/lib/owner.ts`, `src/lib/units.ts`. Tests: `tests/app/owner.test.ts`, `tests/app/units.test.ts`.

- [x] **2.1** `npm install appwrite`.
- [x] **2.2** Tests first: `ownerPermissions('u1')` → `['read("user:u1")','update("user:u1")','delete("user:u1")']`; units: `cmToDisplay(30,'imperial')` → `11.8 in`, `mlToDisplay(250,'metric')` → `250 ml`, round-trips stable. Run: FAIL.
- [x] **2.3** Implement: `appwrite.ts` (Client from VITE_ env, exports `account`, `tablesDB`, `storage`, `DATABASE_ID` re-export); `types.ts` row interfaces; `owner.ts` using SDK `Permission`/`Role`; `units.ts` pure. Run: PASS. Commit.

### Task 3: Data access layer

**Files:** Create `src/lib/repo.ts`.

- [x] **3.1** Functions (all stamp `user_id` + owner permissions, IDs via `ID.unique()`):
  - `getProfile(userId)` (list by `Query.equal('user_id', uid)`, limit 1), `createProfile(userId, prefs)`
  - `listSpecies()`
  - `listPlants(userId)` — `Query.equal('user_id')`, `Query.select` scalar columns only (avoid embedding observation trees), order by `$createdAt` desc
  - `getPlantWithTimeline(plantId)` — full row read; embedded `observations` sorted client-side desc by `observed_at`
  - `createPlant`, `updatePlant` (edit/archive)
  - `createLog(input)` — creates observation, then child treatment/measurement row when applicable
  - `uploadPhoto(plantObsInput, file)` — storage createFile (owner perms) then photos row
- [x] **3.2** Lint/build green. Commit (tested through Task 6 usage + live verification; pure payload assembly covered in 2.2-style tests where extractable).

### Task 4: Auth + onboarding

**Files:** Create `src/features/auth/AuthContext.tsx`, `src/features/auth/SignInScreen.tsx`, `src/features/onboarding/OnboardingScreen.tsx`, `src/ui/` primitives. Modify `src/App.tsx`.

- [x] **4.1** AuthContext: `account.get()` on mount; `signUp(email,pw,name)` (create → createEmailPasswordSession), `signIn`, `signOut`; loading state.
- [x] **4.2** SignInScreen: single form toggling sign-in/sign-up, inline errors, mobile-first.
- [x] **4.3** App gate: no session → SignInScreen; session without profile → OnboardingScreen (units + contribution default, explains open-data consent); profile → PlantsScreen.
- [x] **4.4** Gates green; commit.

### Task 5: Plant dashboard + form

**Files:** Create `src/features/plants/PlantsScreen.tsx`, `src/features/plants/PlantForm.tsx`.

- [x] **5.1** Dashboard: list cards (nickname, common/species name, placement chip, status), add button, archived toggle, empty/loading/error states.
- [x] **5.2** PlantForm (add/edit): nickname*, common_name, species select (seeded) + species_text, placement_type, acquired_on, status (edit only). Archive action on edit.
- [x] **5.3** Gates green; commit.

### Task 6: Timeline + logging + photo

**Files:** Create `src/features/timeline/PlantScreen.tsx`, `src/features/timeline/LogSheet.tsx`, `src/features/timeline/PhotoButton.tsx`.

- [ ] **6.1** PlantScreen: header (names, placement), timeline list grouped by day, icons per observation type, child detail line (e.g. "Watered · 250 ml · top water"), unit display via profile.
- [ ] **6.2** LogSheet bottom sheet: type picker; watering fast path (preset 250 ml); fields per type; consent checkbox defaulting from profile; creates rows via `repo.createLog`.
- [ ] **6.3** PhotoButton: capture/upload → `repo.uploadPhoto`; photo observations render a thumbnail via `storage.getFilePreview` (falls back to file icon on error).
- [ ] **6.4** Gates green; commit.

### Task 7: Live verification + docs + merge

- [ ] **7.1** `npm run dev`; verify in browser: sign up synthetic test user, onboarding, add plant, log watering + measurement + note, upload small photo, archive plant, sign out/in. Fix what breaks.
- [ ] **7.2** All gates: lint, build, test, appwrite:check.
- [ ] **7.3** Docs: schema.md permissions section (create:users), privacy note (photo originals private, EXIF not yet stripped on private originals — sanitization deferred to the image pipeline), roadmap tick-offs stay as-is (phase tracking lives in plan/spec docs).
- [ ] **7.4** Tick plan checkboxes, merge to master locally per finishing-a-development-branch, keep unpushed.

## Self-Review Notes

Spec coverage: decisions 1-10 map to Tasks 1 (perm grants), 2 (SDK/units), 3 (repo, timeline read strategy), 4 (auth/onboarding), 5 (dashboard/species), 6 (logging/photos), 7 (verification/docs). Type names shared via `src/lib/types.ts`. No placeholders: concrete field lists and behaviors named per task; visual detail is delegated to Tailwind tokens + guidelines (mobile-first, no decorative landing page).
