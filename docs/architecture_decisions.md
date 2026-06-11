# PlantDoc Architecture Decisions

This file records major technical decisions. Add a new entry whenever the stack, persistence model, deployment model, privacy model, or public export shape changes materially.

## ADR-001: Use Cloudflare Pages And Appwrite As The Default Launch Stack

- **Status**: Accepted.
- **Date**: 2026-06-04

### Context

PlantDoc is an open-source project that should remain free or very low cost until the user base grows. The project owner already has a Cloudflare-managed domain and an Appwrite student pack through the end of 2026. The root/apex domain is already in use, so PlantDoc must use subdomains only. The launch stack should use those advantages before introducing a more expensive or operationally heavy backend.

### Decision

Use:

- Cloudflare Pages for the public frontend.
- Cloudflare DNS for PlantDoc subdomains while leaving the existing root-domain setup intact.
- Appwrite Cloud for Auth, Databases/TablesDB, Storage, Functions, and Realtime.
- Appwrite custom API domain on a sibling subdomain under the same root domain as the frontend when possible.

Recommended domain layout:

- `plantdoc.galvando.com` for the web app.
- `api.galvando.com` or `appwrite.galvando.com` for the Appwrite API endpoint.

### Consequences

- The MVP can launch without paying for a separate frontend host, database provider, auth provider, object store, and function runner.
- Appwrite's open-source platform aligns well with the project's open-source goals.
- The schema should fit in one primary Appwrite database while the project is small.
- Function count, storage, bandwidth, reads/writes, executions, and active users need monitoring before the student pack expires.
- Some future analytics workflows may require exporting to a more analytical store.

### References

- [Appwrite pricing](https://appwrite.io/pricing)
- [Appwrite Free plan docs](https://appwrite.io/docs/advanced/platform/free)
- [Appwrite custom domains](https://appwrite.io/docs/advanced/platform/custom-domains)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## ADR-002: Use An Appwrite Custom API Domain For First-Party Sessions

- **Status**: Accepted.
- **Date**: 2026-06-04

### Context

Modern browsers increasingly restrict third-party cookies. Appwrite documents that using a third-party domain such as `cloud.appwrite.io` can cause browsers to treat sessions as third-party and fall back to localStorage.

### Decision

Use an Appwrite custom domain on a sibling subdomain under the same root domain as the frontend, such as `api.galvando.com`, before public launch.

### Consequences

- Appwrite sessions can be handled as first-party cookies.
- Cloudflare DNS must include the CNAME/CAA records Appwrite requires for the selected API subdomain.
- Environment variables should point the frontend SDK at the custom API endpoint, not the default cloud endpoint, once configured.

### References

- [Appwrite custom domains](https://appwrite.io/docs/advanced/platform/custom-domains)

## ADR-003: Keep Supabase/Postgres/PostGIS As The Analytics Migration Path

- **Status**: Accepted as future option.
- **Date**: 2026-06-04

### Context

PlantDoc's long-term open dataset may eventually need heavier SQL analytics, geospatial aggregation, public research queries, or machine-learning data pipelines. Appwrite is the better launch choice under current constraints, but Postgres/PostGIS remains a strong analytical fit.

### Decision

Do not use Supabase as the default app backend at launch. If needed later, introduce Supabase/Postgres/PostGIS as a read model, analytics warehouse, or public research database fed by privacy-safe exports.

### Consequences

- The product backend stays simple and low-cost now.
- Public export fields must stay stable enough to support later ingestion into SQL analytics.
- A future migration can be additive instead of a full backend replacement.

### References

- [Supabase PostGIS docs](https://supabase.com/docs/guides/database/extensions/postgis)

## ADR-004: Do Not Use Firebase As The Default Initial Backend

- **Status**: Accepted as a non-default choice.
- **Date**: 2026-06-04

### Context

Firebase is fast for realtime application development, but PlantDoc's current constraints favor Appwrite's open-source BaaS model and the owner's existing student-pack access.

### Decision

Do not default to Firebase/Firestore for the initial architecture. Firebase can still be chosen later if realtime mobile convenience becomes more important than open-source alignment and the Appwrite/Cloudflare cost profile.

### Consequences

- The docs should not describe Firestore as the primary schema.
- Firebase-specific guidance should be removed or clearly marked as an alternative.
- If Firebase is adopted later, geospatial and export limitations need a separate ADR.

### References

- [Firestore geoqueries](https://firebase.google.com/docs/firestore/solutions/geoqueries)
- [Firestore indexes](https://firebase.google.com/docs/firestore/query-data/indexing)

## ADR-005: Use Codex Sites For Prototypes And Internal Tools

- **Status**: Accepted as a scoped use case.
- **Date**: 2026-06-04

### Context

Codex Sites can quickly build and deploy hosted websites, dashboards, internal tools, and apps. It can also attach durable structured storage and file storage.

### Decision

Use Codex Sites for demos, temporary dashboards, internal review apps, and data exploration tools. Do not treat it as the canonical public production deployment for PlantDoc unless the project explicitly revisits that decision.

### Consequences

- Codex Sites is useful for quickly validating product flows.
- Production architecture remains portable and repo-centric.
- Public launch, dataset publishing, and external user auth should stay on Cloudflare/Appwrite unless a future ADR changes this.

### References

- [Codex Sites docs](https://developers.openai.com/codex/sites)

## ADR-006: Use Native TablesDB Relationships And Built-In Timestamps

- **Status**: Accepted.
- **Date**: 2026-06-09

### Context

Appwrite TablesDB relationships are no longer beta, and Phase 0 implements the documented schema as code (`appwrite/schema.ts` + idempotent setup scripts). The documented schema modeled entity links as `relationship/string` columns and included custom `created_at`/`updated_at` columns described as "server generated", which Appwrite does not populate for custom columns.

### Decision

- Model entity links (`plants→species`, `plants→user_locations`, `observations→plants`, `treatments/measurements/photos→observations`, `environment_snapshots→plants/observations`) as native TablesDB relationship columns, created from the child side as `manyToOne`. Timeline children are two-way with cascade delete; optional links are one-way with set-null.
- Keep `user_id` a plain string column everywhere: Appwrite Auth users are not TablesDB rows, and row-level permissions (`Role.user(...)`) carry ownership.
- Keep `public_observations` relationship-free: export rows must stand alone so deletion/revocation of source rows cannot mutate published datasets, and plain values keep exports portable to future analytics stores.
- Rely on built-in `$createdAt`/`$updatedAt` instead of custom timestamp columns.

### Consequences

- Deleting a plant cascades to its observations and their child rows; deleting species/locations nulls the references instead.
- Relationship columns cannot be indexed or marked required; `observations.plant_id` requiredness is an app-layer rule.
- Export jobs must project plain values (IDs, names) rather than relationship objects.
- Setup automation serializes relationship-column creation and recovers `failed` async creates, because Appwrite builds relationship indexes asynchronously server-side.

### References

- [Appwrite relationships docs](https://appwrite.io/docs/products/databases/relationships)

## ADR-007: Browser-Direct Open-Meteo Enrichment With Coordinate Rounding Tiers

- **Status**: Accepted.
- **Date**: 2026-06-10

### Context

Phase 3 needs geocoding (location setup), a climate zone per location, and per-observation weather context. The roadmap sketched a `climate-enrich` Appwrite Function, but Open-Meteo's geocoding, forecast, and archive APIs are keyless and CORS-enabled, so a server-side Function would add deploy surface and latency without protecting any secret. Exact coordinates are private data (docs/privacy.md tier 1) and should neither persist nor leave the device at full precision.

### Decision

- Call Open-Meteo directly from the browser at log time; no Appwrite Function, no API key, no backend transit of coordinates.
- Round coordinates in two tiers: **2 decimal places (~1.1 km) for storage** in `user_locations`, **1 decimal place (~11 km) for every outbound API call**. Exact device/geocoder coordinates are discarded after rounding.
- Compute the Köppen-Geiger climate zone in-app from 5-year Open-Meteo archive monthly normals instead of bundling a raster dataset or calling a zone-lookup service.
- Store weather context as `environment_snapshots` rows linked to observations via a two-way cascade relationship (consistent with ADR-006 timeline children); enrichment is best-effort and never blocks saving a log entry.

### Consequences

- No server secret exists for weather/geocoding, and `APPWRITE_API_KEY` stays out of every enrichment path.
- Published or stored geography can never be finer than ~1.1 km, and third parties (Open-Meteo) never see better than ~11 km.
- Offline or failed enrichment degrades to a log entry without weather context — acceptable by design.
- If Open-Meteo changes terms or rate limits, enrichment switches providers or moves server-side under a new ADR; rows already written are unaffected.

### References

- [Open-Meteo docs](https://open-meteo.com/en/docs)
- docs/schema.md (`environment_snapshots`, `user_locations` as-implemented notes)

## ADR-008: Deterministic Care Insights Recomputed At Render, Feedback As The Only Stored Artifact

- **Status**: Accepted.
- **Date**: 2026-06-10

### Context

Phase 4 calls for care recommendations. AI-generated advice requires a provider key (absent from the environment), plus opt-in consent, provenance labeling, and deletion-coupling guarantees. The user's own timeline already supports useful deterministic signals: watering cadence, growth trends, and stress indicators.

### Decision

- Implement insights as a pure function (`src/lib/insights.ts`) over the already-hydrated plant timeline: median watering interval (median, not mean, to resist vacation gaps), least-squares growth slope per 30 days with a dead-band, and rule-based stress signals. Insights are **recomputed on every render and never stored** — no staleness, nothing to migrate, deleting an observation instantly changes the advice.
- Store only user feedback: an `insight_feedback` table (one verdict per user/plant/insight kind), owner-only rows, two-way cascade from `plants` so feedback never outlives its plant. Feedback is private and excluded from public export fields.
- Label the panel "Experimental" with a provenance line ("computed from your logs, not a prediction").
- Defer the AI track until a provider key exists, and defer cross-user baselines until public-dataset cohorts pass the k=5 suppression threshold.

### Consequences

- Insights cost zero storage and zero backend executions; correctness is unit-testable as pure functions.
- Feedback data accumulates as ground truth for evaluating any future AI track before it ships.
- Thresholds (3 waterings minimum, 1.5× overdue factor, ±0.5 trend dead-band) are code constants; tuning them is a code change, not a migration.

### References

- docs/superpowers/specs/2026-06-10-phase-4-recommendations-design.md
- docs/schema.md (`insight_feedback`)

## ADR-009: Serve The Frontend Via Workers Static Assets At plantdoc.galvando.com

- **Status**: Accepted. Amends the "Cloudflare Pages" choice in ADR-001.
- **Date**: 2026-06-11

### Context

ADR-001 chose Cloudflare Pages for the frontend. Since then Cloudflare has put Pages into maintenance mode and recommends Workers static assets for new projects (it even ships a Pages-to-Workers migration guide). The owner's `galvando.com` zone is active on Cloudflare with the root domain already in use, so PlantDoc must claim only a subdomain and must not modify any existing DNS records.

### Decision

- Deploy the built Vite SPA as an assets-only Worker named `plantdoc` (`wrangler.jsonc`: `assets.directory: ./dist`, `not_found_handling: single-page-application`).
- Attach the Workers custom domain `plantdoc.galvando.com`. The custom-domain route creates exactly one DNS record and fails rather than overwriting an existing one; nothing else on the zone is touched.
- Disable the `workers.dev` origin: it would not be registered as an Appwrite web platform and would fail CORS anyway, so the custom domain is the only serving origin.
- Deploy with `npx wrangler deploy` under the operator's wrangler OAuth login (no API token stored in the repo or `.env`).

### Consequences

- Static asset requests are free and unmetered on the Workers free plan; there is no worker script to bill or cold-start.
- Every serving origin must be registered as a web platform on the Appwrite project; `plantdoc.galvando.com` was registered on 2026-06-11 (without it, browser requests fail with 403 invalid-origin).
- ADR-002 (custom Appwrite API domain, e.g. `api.galvando.com`) remains open; until then sessions ride on `sfo.cloud.appwrite.io` as a third-party domain.
- Unattended CI deploys would need a scoped Cloudflare API token or Workers Builds; out of scope while deploys are operator-run.

### References

- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
