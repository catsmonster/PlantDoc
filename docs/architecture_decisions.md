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
