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

- `VITE_APPWRITE_PROJECT_ID`
- `VITE_APPWRITE_PROJECT_NAME`
- `VITE_APPWRITE_ENDPOINT`
- `APPWRITE_API_KEY`

Security requirements:

- `APPWRITE_API_KEY` must never be prefixed with `VITE_`.
- Setup scripts may read `APPWRITE_API_KEY`; browser code must not.
- `.env` must remain ignored by Git.
- `.env.example` must document variable names without secret values.
- Commands must never print API keys or full secret-bearing environment dumps.

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

Seed data must be synthetic. It must not use the project owner's real email, exact home location, real private notes, or real image metadata.

## Permissions

Private source tables should be designed for owner-only user access plus trusted server/admin access. Phase 0 setup may create table-level defaults and constants for row-level permissions even if seed fixtures use server-owned synthetic IDs.

`species` should be readable by app users and writable only by trusted admin/server automation.

`public_observations` and public export files should be service-written and public-readable only after explicit publication workflow decisions. Phase 0 may create the resources but should keep seed exports clearly synthetic.

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

## Verification

Automated checks must cover:

- `.env` contains required variable names when Appwrite scripts run.
- No secret variable required by setup scripts starts with `VITE_`.
- Schema definitions include all required Phase 0 tables and buckets.
- Public export definitions exclude private fields.
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
