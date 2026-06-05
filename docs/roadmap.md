# PlantDoc Feature Roadmap

## Phase 0: Product And Data Foundation

- Finalize the default stack decision in [architecture_decisions.md](architecture_decisions.md).
- Define privacy tiers and public export rules in [privacy.md](privacy.md).
- Create Appwrite database/table setup scripts for the core schema.
- Set up local development, linting, typechecking, and test commands.
- Create seed data for a few realistic plants, observations, and treatments.

## Phase 1: MVP Core

- Cloudflare Pages project setup with a PlantDoc subdomain on the user's existing Cloudflare-managed domain.
- Appwrite Cloud project setup with Auth, Databases/TablesDB, Storage, Functions, and permissions.
- Appwrite custom API domain setup on a sibling subdomain under the same root domain as the app, if available.
- User onboarding with privacy defaults and unit preferences.
- Plant dashboard: add, edit, archive, and view plants.
- Plant timeline:
  - add watering, fertilizing, repotting, pruning, pest-control, and relocation logs,
  - add height, leaf count, soil moisture, health score, and notes,
  - upload plant photos from phone or desktop,
  - strip image metadata before any public derivative is created.
- Mobile-first logging flow optimized for quick use next to the plant.
- Basic offline-tolerant draft capture for logs when connectivity is poor.

## Phase 2: Privacy-Safe Open Data Pipeline

- Per-account and per-observation contribution controls.
- Derived `public_observations` table/collection or generated export dataset.
- Automated CSV and JSONL exports with dataset versioning.
- Public data dictionary and changelog.
- Deletion and opt-out workflow that removes records from future exports.
- Early aggregate dashboard with only privacy-safe metrics.

## Phase 3: Geo-Climate Enrichment

- Coarse climate-zone lookup from private location records.
- Weather API enrichment for historical and current environmental context.
- Environment snapshots attached to plant timelines.
- Appwrite geo-query-backed location features and climate-region analysis.
- Optional Postgres/PostGIS read model if open-data analytics outgrow Appwrite's query model.
- User controls for geographic precision in public exports.

## Phase 4: Recommendations And Modeling

- Baseline analytics for watering intervals, growth trends, and common stress indicators.
- Species and climate-specific recommendation experiments.
- Model evaluation datasets generated from public exports.
- Recommendation UI that clearly labels predictions as experimental.
- Feedback loop for users to confirm whether suggestions helped.

## Phase 5: Community And Research

- Public dataset portal with versioned downloads.
- Community plant-care comparisons by species and climate.
- Research notebooks or examples using exported data.
- Optional public plant profiles with strong user consent and privacy review.
