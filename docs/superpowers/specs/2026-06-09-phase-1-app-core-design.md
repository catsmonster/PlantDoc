# Phase 1 App Core Design

## Purpose

Build the first usable PlantDoc product surface: a mobile-first React app where a user signs in, sets privacy/unit preferences, manages plants, and logs care on a per-plant timeline against the Phase 0 Appwrite backend.

## Approval Context

Produced under an autonomous `/goal` run ("Create this app according to the roadmap; you are allowed to make decisions that improve on the product"). Decisions below were made autonomously from the documented product principles instead of interactive brainstorming. Infrastructure items that require the owner's accounts or DNS were explicitly deferred.

## Scope

Phase 1 roadmap items decomposed into three sub-projects:

- **A. App core (this spec):** auth, onboarding, plant dashboard, timeline logging, photo capture to the private bucket, mobile-first UI.
- **B. Hosting/domains (deferred, needs owner):** Cloudflare Pages project, `plantdoc.galvando.com`, Appwrite custom API domain, OAuth providers.
- **C. Hardening (deferred):** offline draft capture, realtime, image-sanitize Function, public derivatives.

## Decisions

1. **Client SDK**: `appwrite` web SDK using `VITE_APPWRITE_PROJECT_ID` / `VITE_APPWRITE_ENDPOINT`. Verified `http://localhost:5173` passes the project's CORS preflight, so no console work is needed for local dev. The API key is never referenced from `src/` (existing test enforces this).
2. **Auth**: email/password sign-up and sign-in via `Account`. No OAuth in this slice (needs console/provider setup). Session handling through a React `AuthContext` (`useAuth`).
3. **Create permissions**: Phase 0 created private tables with row security and no table-level grants, which blocks authenticated users from *creating* rows (create cannot be granted per-row). Add `create:users` table-level grants to `profiles`, `user_locations`, `plants`, `observations`, `treatments`, `measurements`, `photos`, `environment_snapshots`, and to the `plant-private-images` bucket. Read/update/delete stay per-row owner-only. `species`, `public_observations`, `plant-public-images`, `open-data-exports` stay user-unwritable. The setup script learns to reconcile table/bucket permission drift via `updateTable`/`updateBucket` (it still refuses to introduce or tolerate `any()` grants).
4. **Row ownership**: every created row carries `read/update/delete` permissions for `Role.user(userId)`, plus a `user_id` column value. Mirrors the seed data shape.
5. **Timeline reads**: Appwrite cannot query on relationship columns, so the per-plant timeline loads the plant row and renders its embedded two-way `observations` (sorted client-side by `observed_at` descending). The plants dashboard list uses `Query.select(['$id', 'nickname', ...scalar fields])` to avoid loading every plant's full observation tree. Child detail rows (treatment/measurement/photo) arrive embedded on the observation via their two-way keys.
6. **Logging flow**: a bottom-sheet form on the plant screen. Treatment types (watering, fertilizing, repotting, pruning, misting, pest_control, cleaning, relocation) create `observations` + `treatments` rows; measurement creates `observations` + `measurements`; note creates `observations` only. `contribute_to_public_dataset` defaults from the profile and is editable per log. Watering is the one-tap fast path (preset 250 ml, editable).
7. **Photos**: file input with `capture="environment"` uploads the original to `plant-private-images` with owner-only file permissions, then creates a `photos` row (`exif_stripped: false`, `allow_public_image: false`). Originals stay private per docs/privacy.md; sanitized public derivatives are sub-project C.
8. **Species**: plant form offers the seeded species in a select (readable by all users) plus free-text `species_text`. No species admin UI.
9. **No new heavy dependencies**: no router (state-based view switching), no TanStack Query, no React Hook Form/Zod yet — per docs/tech_stack.md these arrive "once forms/async grow beyond simple", which a 3-screen app has not reached. Tailwind v4 tokens from Phase 0 carry the design direction (botanical green + slate + clay, no glassmorphism).
10. **Units**: store metric (cm, ml, °C); display converts via profile `preferred_units` with small pure helpers.

## Architecture

```text
src/
  lib/appwrite.ts        # web SDK singletons: client, account, tablesDB, storage
  lib/types.ts           # Row shapes (Profile, Plant, Observation, Treatment, ...)
  lib/owner.ts           # owner permission builder + user_id stamping (pure)
  lib/units.ts           # metric<->imperial display conversions (pure)
  lib/repo.ts            # data access: profiles, species, plants, observations
  ui/                    # small shared presentational pieces (Button, Sheet, Field)
  features/auth/         # AuthContext, SignInScreen
  features/onboarding/   # OnboardingScreen (creates profile)
  features/plants/       # PlantsScreen (dashboard), PlantForm
  features/timeline/     # PlantScreen (timeline), LogSheet, PhotoButton
  App.tsx                # auth gate + view state machine
```

Data flow: components call `repo.ts` functions; `repo.ts` is the only module touching `tablesDB`/`storage`; `lib/owner.ts` and `lib/units.ts` are pure and unit-tested. Views: `plants` (dashboard) → `plant:<rowId>` (timeline + logging) → `settings` (profile prefs, sign out).

## Error/State Handling

Every screen renders loading, empty, and error states. AppwriteExceptions surface as inline, human-readable error text (no toast library). Failed mutations keep the form open with values intact.

## Testing

- Pure logic (owner permissions, unit conversion, observation grouping/sorting, log-form payload assembly) gets Vitest coverage in `tests/app/`.
- Schema tests gain the new expectation: private tables carry exactly `create:users` and never `any()`.
- Manual verification via `npm run dev` against the live project (sign up test user, add plant, log watering/measurement/note/photo, archive plant, sign out/in).

## Non-Goals

Cloudflare/DNS, OAuth, offline drafts, realtime, public exports, image sanitization, species moderation tooling, charts.
