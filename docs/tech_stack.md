# PlantDoc Tech Stack & Architecture

## Recommended Production Stack

PlantDoc should start with a stack that is open-source friendly, low-cost while usage is small, and able to scale without a rewrite once the user base grows. Given the current project constraints, the default is:

- **Frontend hosting and DNS**: Cloudflare Workers static assets with a subdomain on the user's Cloudflare-managed domain, plus narrow Worker API routes only where server-side secrets are required. The apex/root domain is already in use and must not be repointed for PlantDoc.
- **Backend platform**: Appwrite Cloud while the student pack/free tier is available.
- **App backend**: Appwrite Auth, Databases/TablesDB, Storage, Functions, Realtime, and Sites where useful.
- **Future analytics path**: Supabase/Postgres/PostGIS or another analytical store only if the public dataset outgrows Appwrite's query/export model.

This keeps the launch architecture inexpensive and simple while avoiding a dead end.

## Frontend

- **Framework**: React + TypeScript + Vite.
- **App shape**: PWA-style responsive web app with mobile-first logging flows.
- **Hosting**: Cloudflare Workers static assets, per ADR-009, with the Gemini preview Worker route from ADR-010.
- **Domain**: use a Cloudflare-managed subdomain for production, preferably `plantdoc.galvando.com`. Other acceptable options are `plants.galvando.com` or `app.galvando.com`.
- **Styling**: Tailwind CSS with project design tokens.
- **Data fetching**: Appwrite Web SDK plus TanStack Query once async workflows become non-trivial.
- **Forms and validation**: React Hook Form and Zod are preferred once forms grow beyond simple fields.
- **Charts and timelines**: use a proven charting library for growth and health trends rather than hand-rolling chart behavior.

## Backend

- **Primary backend**: Appwrite Cloud.
- **Auth**: Appwrite Auth for email/password, OAuth, and optional anonymous-to-registered upgrade flows.
- **Database**: Appwrite Databases/TablesDB for plant profiles, observations, treatments, measurements, environment snapshots, and public export records.
- **Geo features**: Appwrite spatial columns and geo queries for location-aware functionality.
- **Storage**: Appwrite Storage for plant images and public export files.
- **Functions**: Appwrite Functions for climate enrichment, image sanitization, export generation, and future recommendation jobs.
- **Realtime**: use Appwrite Realtime sparingly for timelines or dashboards that benefit from live updates.

## Domain Layout

Recommended starting layout:

- `plantdoc.galvando.com`: preferred Cloudflare Workers static-assets frontend.
- `api.galvando.com` or `appwrite.galvando.com`: Appwrite custom API domain for first-party Appwrite sessions.
- `assets.galvando.com` or Appwrite Storage URLs: public derivatives and open-data export files if needed.

Use subdomains only. Do not change existing apex/root-domain DNS records unless the user explicitly asks. Using an Appwrite API custom domain under the same registrable domain as the app avoids third-party cookie problems and improves session security.

## Appwrite Plan Strategy

- Keep the MVP within one Appwrite project and one primary database so it can survive a downgrade to the Free plan if needed.
- Keep Functions consolidated and small at first: one API/export function, one image-processing function, and one climate-enrichment function if plan limits allow.
- Track the student-pack expiration date before public launch planning.
- Add usage monitoring for storage, bandwidth, executions, database reads/writes, and monthly active users.
- Prepare an upgrade path to Appwrite Pro or the Appwrite OSS program if traffic grows before sponsorship/grants are available.

## Cloudflare Strategy

- Use Cloudflare Workers static assets for the frontend. Keep preview or staging deployments on separate subdomains/routes if needed.
- Keep Worker compute narrow and secret-backed. The current Worker API surface is limited to the Gemini AI preview proxy; Appwrite remains the primary backend for product data.
- Use Cloudflare DNS for all Appwrite and app subdomains.
- Leave existing apex/root-domain and `www` records untouched unless the user explicitly approves changing them.
- Use Cloudflare redirects for canonical domain handling.
- Consider Cloudflare Turnstile later for abuse protection on signup, uploads, and public forms.
- Do not add D1, KV, R2, or broader Worker APIs until the app has a concrete need. If the AI preview becomes public or high-traffic, add durable rate limiting before raising access.

## Alternatives

### Appwrite Sites

Appwrite Sites can host the frontend too. Prefer Cloudflare Workers static assets initially because the user already owns a Cloudflare domain and ADR-009 selected that path for new static deployments. Use Appwrite Sites if keeping hosting and backend in one dashboard becomes more valuable than Cloudflare's deployment/DNS workflow.

### Supabase/Postgres/PostGIS

Supabase remains the best future option if PlantDoc needs heavier SQL analytics, geospatial aggregation, public dataset research workflows, or model-training pipelines. Treat it as a read model or analytics warehouse before replacing the primary app backend.

### Firebase

Firebase is not the default recommendation. It is excellent for fast realtime apps, but PlantDoc's current constraints favor Appwrite's open-source BaaS model and Cloudflare's free/scalable frontend hosting.

### Codex Sites

Codex Sites is appropriate for prototypes, demos, and internal dashboards. Do not make it the canonical public production deployment unless the project explicitly chooses that path after a separate architecture decision.

## Design Direction

- Prioritize compact, high-signal mobile flows over decorative landing-page design.
- Avoid a one-note green theme. Pair botanical greens with slate, white, soft clay, and neutral UI colors.
- Favor clear controls, accessible contrast, and fast photo capture.
- Avoid glassmorphism as a default style. It can reduce readability in field-like mobile use.
- Every primary workflow should work comfortably on a phone: add plant, add log, upload photo, review timeline, and adjust privacy settings.
