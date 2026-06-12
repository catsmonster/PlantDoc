# PlantDoc - Project Agent Guide

PlantDoc is an open-source, community-driven web application for tracking houseplant care, health, and environmental outcomes across different homes and climates.

## Mission

Houseplant care advice is often generic and brittle. PlantDoc helps users record what they actually did, what changed, and which local/environmental conditions surrounded those outcomes. The long-term goal is a privacy-safe open dataset that can support better recommendations by species, climate, and care context.

## Product Principles

1. Mobile-first logging: users should be able to add a watering, treatment, measurement, note, or photo while standing next to the plant.
2. Privacy-first open data: public data must be derived from consented, anonymized records. Exact location, email, private notes, and image metadata must never be exposed in public exports.
3. Structured observations: treatments, measurements, photos, environment snapshots, and outcomes should be modeled in a way that supports future analysis.
4. Scientific humility: distinguish user-entered observations from inferred climate data, model predictions, and care recommendations.
5. Open-source portability: prefer documented schemas, migrations, and export formats over vendor-specific behavior that would make the dataset hard to reuse.

## Default Architecture

Use the recommendations in [docs/tech_stack.md](docs/tech_stack.md) unless the user explicitly asks for another stack.

- Frontend: React, TypeScript, and Vite for a lightweight PWA-style web app.
- Hosting and DNS: Cloudflare Workers static assets plus subdomains on the user's Cloudflare-managed domain. The apex/root domain is already in use and must not be repointed for PlantDoc.
- Backend: Appwrite Cloud as the default backend-as-a-service while the student pack/free tier is available.
- Database: Appwrite Databases/TablesDB for product data.
- Auth/storage: Appwrite Auth and Appwrite Storage.
- Server work: Appwrite Functions or trusted server jobs for anonymized exports, image processing, and future recommendation jobs. Climate enrichment is browser-direct Open-Meteo per ADR-007 while no server secret is involved.
- API domain: use an Appwrite custom API endpoint on a sibling subdomain, such as `api.galvando.com`, to keep auth cookies first-party.
- Analytics migration path: if PlantDoc outgrows Appwrite's database model for research/geo analytics, add a Supabase/Postgres/PostGIS read model or warehouse without replacing the app backend immediately.
- Codex Sites: appropriate for prototypes, demos, and internal dashboards, not as the canonical public production home unless the user explicitly chooses it.

## Documentation Map

- [Tech Stack & Architecture](docs/tech_stack.md)
- [Database Schema](docs/schema.md)
- [Feature Roadmap](docs/roadmap.md)
- [Privacy & Open Data](docs/privacy.md)
- [Architecture Decisions](docs/architecture_decisions.md)
- [AI Agent & Developer Guidelines](docs/guidelines.md)

## Working Rules

- Update [docs/schema.md](docs/schema.md) whenever collections, tables, fields, relationships, indexes, or public export shapes change.
- Update [docs/privacy.md](docs/privacy.md) when adding any feature that captures location, images, user identity, health notes, or public data.
- Add an entry to [docs/architecture_decisions.md](docs/architecture_decisions.md) for major stack or data-model changes.
- Keep UI work mobile-first, touch-friendly, accessible, and fast on average phones.
- Strip or ignore EXIF metadata from uploaded public-facing images.
- Store exact location only when needed for private user features; publish only coarse derived geography.
- Once code exists, run the relevant lint, typecheck, and tests before closing implementation tasks.
