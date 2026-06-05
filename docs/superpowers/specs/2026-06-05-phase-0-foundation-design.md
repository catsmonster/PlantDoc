# Phase 0 Foundation Design

## Purpose

Build the Phase 0 product and data foundation for PlantDoc: a React/Vite/TypeScript project baseline, Appwrite setup automation for the documented schema, verification commands, and deterministic synthetic seed data. The work should make Appwrite resources reproducible from the repository instead of relying on one-off console changes.

## Current Context

The repository currently contains project documentation only:

- `AGENTS.md`
- `docs/tech_stack.md`
- `docs/schema.md`
- `docs/roadmap.md`
- `docs/privacy.md`
- `docs/architecture_decisions.md`
- `docs/guidelines.md`

Phase 0 roadmap items already partly documented:

- Default stack decision is recorded in `docs/architecture_decisions.md`.
- Privacy tiers and public export rules are documented in `docs/privacy.md`.
- The Appwrite-oriented domain schema is documented in `docs/schema.md`.

Phase 0 implementation still needs:

- Appwrite database/table/storage setup scripts.
- Local development, linting, typechecking, and test commands.
- Seed data for realistic plants, observations, and treatments.
- Verification that schema automation preserves privacy boundaries.

## Approved Approach

Use local TypeScript setup scripts backed by the Appwrite Node SDK. This keeps infrastructure behavior reviewable in the repository, works without a separate IaC platform, and can express both schema setup and synthetic seed data.

Rejected alternatives:

- Appwrite CLI-only setup: good for direct platform workflow, weaker for deterministic seed data and custom privacy validation.
- Terraform: strong for infrastructure discipline, heavier than Phase 0 needs and awkward for fixture data.

## Credential Contract

The local `.env` file supplies real Appwrite project credentials for setup automation. The implementation must read:

- `APPWRITE_PROJECT_ID`
- `APPWRITE_PROJECT_NAME`
- `APPWRITE_ENDPOINT`
- `APPWRITE_API_KEY`

Security requirements:

- `APPWRITE_API_KEY` must never be prefixed with `VITE_`.
- Setup scripts must use the non-`VITE_` Appwrite variables above.
- Browser code may use `VITE_APPWRITE_PROJECT_ID` and `VITE_APPWRITE_ENDPOINT` later, but those public client variables are not the setup script contract.
- Browser code must never reference `APPWRITE_API_KEY`.
- `.env` must remain ignored by Git.
- `.env.example` must document variable names without secret values.
- Commands must never print API keys or full secret-bearing environment dumps.

## Appwrite Prerequisites

Phase 0 assumes an Appwrite Cloud project already exists. The setup automation does not create:

- the Appwrite project itself,
- Auth providers or email templates,
- Functions,
- custom Appwrite API domains,
- Cloudflare Pages projects,
- Cloudflare DNS records.

The API key used for setup must be scoped for the resources Phase 0 manages. Required scopes:

- `databases.read`
- `databases.write`
- `tables.read`
- `tables.write`
- `columns.read`
- `columns.write`
- `indexes.read`
- `indexes.write`
- `rows.read`
- `rows.write`
- `buckets.read`
- `buckets.write`

Optional scopes:

- `files.read`
- `files.write`

Only add `files.read` and `files.write` if Phase 0 seed automation creates fixture files in storage. The default seed strategy should use synthetic photo metadata rows and avoid real file uploads.

## MCP Tooling

Appwrite MCP tooling is useful for inspection and docs lookup, but the Phase 0 implementation must not depend on MCP being available at runtime. The setup scripts should run as normal package scripts.

Recommended user-side MCP setup:

```powershell
codex mcp add appwrite-docs --url https://mcp-for-docs.appwrite.io

codex mcp add appwrite-api `
  --env APPWRITE_PROJECT_ID=your-project-id `
  --env APPWRITE_API_KEY=your-api-key `
  --env APPWRITE_ENDPOINT=https://<REGION>.cloud.appwrite.io/v1 `
  -- uvx mcp-server-appwrite
```

Cloudflare MCP is not required for Phase 0. It becomes relevant during Phase 1 when creating Pages projects, custom domains, and DNS records.

## Architecture

The repository should become a conventional TypeScript workspace with a small React app and separate Appwrite admin scripts.

Planned structure:

```text
appwrite/
  schema.ts
  seed-data.ts
scripts/
  appwrite/
    check.ts
    client.ts
    setup.ts
    seed.ts
src/
  App.tsx
  main.tsx
  styles.css
tests/
  appwrite/
    schema.test.ts
    public-export-privacy.test.ts
```

Responsibilities:

- `appwrite/schema.ts`: declarative definitions for databases, tables, columns, indexes, storage buckets, and public export fields.
- `appwrite/seed-data.ts`: deterministic synthetic fixture data.
- `scripts/appwrite/client.ts`: Appwrite admin client initialization and environment validation.
- `scripts/appwrite/check.ts`: local-only validation of credentials shape and schema definitions.
- `scripts/appwrite/setup.ts`: idempotent remote resource creation/update.
- `scripts/appwrite/seed.ts`: deterministic fixture insertion/update.
- `tests/appwrite/schema.test.ts`: confirms required documented fields exist in schema definitions.
- `tests/appwrite/public-export-privacy.test.ts`: confirms public export definitions exclude private fields.

## Appwrite Resources

Create one primary database:

- `plantdoc_main`

Create these tables:

- `profiles`
- `user_locations`
- `species`
- `plants`
- `observations`
- `treatments`
- `measurements`
- `photos`
- `environment_snapshots`
- `public_observations`

Create these storage buckets:

- `plant-private-images`
- `plant-public-images`
- `open-data-exports`

The schema implementation should follow `docs/schema.md`. If Appwrite SDK naming differs from the documentation language, preserve the PlantDoc domain names in constants and wrap SDK-specific calls in helper functions.

## Setup Algorithm

The setup script must be idempotent and conservative:

- Use stable IDs for databases, tables, columns, indexes, and buckets.
- Get each resource first; create it only when it is missing.
- Compare existing resources to schema definitions before attempting changes.
- Wait for asynchronous column and index creation to become ready before creating dependent resources or seed rows.
- Never delete tables, columns, indexes, buckets, files, or rows automatically.
- Fail with a clear "manual migration required" message when an existing resource has an incompatible type, required flag, relationship shape, or index definition.
- Treat relationship and spatial column support as Appwrite-version-sensitive; isolate those calls behind helper functions so SDK/API differences are localized.

## Privacy Boundaries

Private data must never appear in public export definitions or seed export records:

- user IDs
- email addresses
- exact coordinates
- full postal codes
- plant nicknames
- room or placement labels
- private notes
- private file IDs
- original image paths
- image EXIF metadata

Public export definitions may include only derived or consent-safe fields documented in `docs/schema.md` and `docs/privacy.md`, including:

- scientific name or user-entered species text
- month-level date bucket
- treatment type and normalized amount
- measurement values
- broad country or region when privacy thresholds are met
- climate zone
- coarse geo cell
- sanitized public image derivative reference when explicitly allowed
- dataset version
- publication timestamp

`public_observations` is an internal derived/staging table in Phase 0, not a direct public API surface. It may contain internal traceability fields such as `source_observation_id` for export jobs, but those fields must never appear in public-readable files, public APIs, or dashboard projections.

Seed data must be synthetic. It must not use the project owner's real email, exact home location, real private notes, or real image metadata.

## Permissions

Private source tables should be designed for owner-only user access plus trusted server/admin access. No private source table should receive broad `Role.any()` read or write grants.

`species` should be readable by app users and writable only by trusted admin/server automation.

`public_observations`, `plant-public-images`, and `open-data-exports` should be created without public read grants in Phase 0. Later public release work must add a separate publication workflow that projects export-safe fields, suppresses or coarsens risky cohorts, and grants public read only to approved derived files or API views.

## Seed Strategy

Seed data should exercise the schema without creating real personal data or depending on real Appwrite users.

Seed rules:

- Use fixed deterministic IDs and timestamps.
- Use fixed synthetic user IDs such as `seed_user_alex` and `seed_user_mina`.
- Write seed rows through the server API key.
- Apply row permissions that match the intended owner-only shape where Appwrite allows fixed user permission labels without creating users.
- If Appwrite requires real users for realistic user permissions, defer user-readable seed validation to a later onboarding/auth task instead of creating real or throwaway Auth users in Phase 0.
- Use coarse synthetic geography only, such as country, region, climate zone, and deliberately imprecise geo cells.
- Do not upload real images, real EXIF metadata, or owner-provided files.
- Upsert by stable IDs; repeated seed runs must update or skip existing seed rows rather than creating duplicates.

## Local Tooling

Add package scripts:

- `npm run dev`: run local Vite app.
- `npm run build`: run TypeScript build and Vite production build.
- `npm run lint`: run ESLint.
- `npm run test`: run Vitest.
- `npm run appwrite:check`: validate environment and schema locally without remote writes.
- `npm run appwrite:setup`: create or update Appwrite resources.
- `npm run appwrite:seed`: insert or update synthetic seed data.

The Vite app shell can be minimal in Phase 0. It exists to prove the React/TypeScript project baseline and prepare for Phase 1 MVP work.

Tailwind CSS should be included in the project baseline because `docs/tech_stack.md` names it as the frontend styling default. Phase 0 only needs base configuration and starter design-token files; polished application styling belongs to Phase 1.

## Verification

Automated checks must cover:

- `.env` contains required variable names when Appwrite scripts run.
- No secret variable required by setup scripts starts with `VITE_`.
- No source file under `src/` references `APPWRITE_API_KEY`.
- Schema definitions include all required Phase 0 tables and buckets.
- Public export definitions exclude private fields.
- Public export tests prove `source_observation_id` is internal-only and absent from any public projection/export shape.
- Public export tests prove exact timestamps, exact coordinates, private notes, private file IDs, original image paths, and EXIF fields are absent from public projections.
- Permission tests prove Phase 0 creates no public-read grants for `public_observations`, `plant-public-images`, or `open-data-exports`.
- Seed records are deterministic and synthetic.
- Appwrite setup scripts can be run repeatedly without intentionally creating duplicate resources.

Relevant final verification commands:

```powershell
npm run lint
npm run build
npm run test
npm run appwrite:check
```

Remote setup verification:

```powershell
npm run appwrite:setup
npm run appwrite:seed
```

## Implementation Slices

1. Project baseline: initialize Vite React TypeScript, linting, Vitest, `.gitignore`, `.env.example`, and minimal app shell.
2. Schema definitions: add typed Appwrite database, table, column, index, bucket, and permission definitions.
3. Validation tests: verify schema coverage and public export privacy boundaries.
4. Appwrite setup automation: implement idempotent setup scripts using the Appwrite Node SDK.
5. Seed automation: add deterministic synthetic seed records for species, plants, observations, treatments, measurements, photo metadata, and environment snapshots.

## Non-Goals

- No Cloudflare Pages or DNS setup in Phase 0.
- No production public dataset release in Phase 0.
- No recommendation engine or climate enrichment job in Phase 0.
- No real user onboarding flow in Phase 0 beyond the project baseline needed for future work.
- No private image upload pipeline in Phase 0 beyond bucket setup and synthetic metadata.

## Documentation Updates Required During Implementation

- Update `docs/schema.md` if Appwrite resource definitions diverge from the current documented schema.
- Update `docs/privacy.md` if implementation introduces new image, location, identity, health-note, or public export behavior.
- Update `docs/architecture_decisions.md` only if implementation changes the accepted stack, persistence model, deployment model, privacy model, or public export shape.

## Approval

This design was approved interactively before being written:

- Scope: all remaining Phase 0 foundation work.
- Frontend baseline: React, TypeScript, and Vite.
- Backend setup approach: local TypeScript scripts using the Appwrite Node SDK.
- Credentials: real Appwrite project values are available in `.env`; `APPWRITE_API_KEY` is intentionally not exposed through `VITE_`.
- Git: initialize a new repository and commit the design.
