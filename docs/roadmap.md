# PlantDoc Feature Roadmap

## Phase 0: Product And Data Foundation

- Finalize the default stack decision in [architecture_decisions.md](architecture_decisions.md).
- Define privacy tiers and public export rules in [privacy.md](privacy.md).
- Create Appwrite database/table setup scripts for the core schema.
- Set up local development, linting, typechecking, and test commands.
- Create seed data for a few realistic plants, observations, and treatments.

## Phase 1: MVP Core

- Cloudflare Workers static-assets deployment with a PlantDoc subdomain on the user's existing Cloudflare-managed domain.
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
- Gemini 3.5 Flash AI preview for plant-detail insights is active now, using a sanitized text summary plus optional latest-photo context through the server-side `/api/gemini-insights` Worker proxy.
  - Production prerequisite is satisfied: `GEMINI_API_KEY` has been installed as a Cloudflare Worker secret. Local development can keep the same key in ignored `.env`, but the key must never use a `VITE_` prefix or be bundled into browser code.
  - Keep preview requests user-triggered, transient, and excluded from Appwrite persistence and public exports. The current output is display-only and must not become saved advice until a separate consent/deletion/provenance model exists.
  - Keep the prompt contract sanitized: no private notes, user IDs, row IDs, raw storage file IDs, exact coordinates, city/postal fields, or public-export data.
  - Keep image handling conservative: attach only the latest photo the user can already view, resize/compress before sending, enforce the 750 KB image cap and 1.2 MB Worker body cap, and skip the image rather than exceeding limits.
  - Keep usage controls explicit: 3 local previews per user/plant/day, 384 maximum output tokens, missing-key fail-closed behavior, and UI copy warning that Gemini 3.5 Flash preview quality and availability may vary based on provider load and rate limits.
  - Add a durable server-side rate limiter before public scale, anonymous access, or materially higher preview limits.
- Optional AI-assisted description drafts for plant logs, with user review before saving.
- Optional image-recognition labels for likely pests, stress signs, growth changes, and plant condition, with confidence/provenance shown clearly.
- Optional image embeddings for private photo similarity, growth comparison, clustering, and future model evaluation.
- Species and climate-specific recommendation experiments.
- Model evaluation datasets generated from public exports.
- Recommendation UI that clearly labels predictions as experimental.
- Feedback loop for users to confirm whether suggestions helped.
- Privacy controls for AI outputs and embeddings: opt-in, provenance-tracked, deleted with source photos, and excluded from public exports by default.

## Phase 4A: Open Plant Knowledge Layer

Use existing open plant data to make PlantDoc useful before its own community
dataset is large enough to support species-specific recommendations. Treat all
imported knowledge as sourced reference material or starter hypotheses, not as
unqualified care advice.

- Define a source acceptance policy before importing data:
  - allow CC0, public-domain, United States government public-domain, and CC BY
    sources when attribution can be preserved,
  - quarantine CC BY-NC, no-license, unclear-license, and scraped web content
    from app recommendations and public exports unless a later review accepts a
    specific use,
  - record source name, source URL, license, retrieval date, imported fields,
    and attribution text for every dataset.
- Add a source registry for imported reference data. Candidate future tables or
  bundled data files include `source_datasets`, `taxon_references`,
  `species_care_profiles`, `species_climate_envelopes`,
  `species_pest_associations`, and `care_tip_feedback`. Update
  `docs/schema.md` when any of these become real Appwrite tables.
- Use World Flora Online or Catalogue of Life style taxonomic backbones for
  accepted scientific names, synonyms, and external identifiers. Prefer stable
  IDs over free-text matching; keep aliases searchable for onboarding.
- Use Wikidata as a CC0 enrichment source for common names, selected external
  IDs, and cross-links. Do not use long-form article text as a care source.
- Use GBIF/iNaturalist occurrence data only for broad distribution and
  climate-envelope signals, filtered by license and with citations preserved.
  Do not infer indoor care rules directly from occurrence points.
- Use GloBI-style interaction data only for weak pest/pathogen association
  hints. Label these as "reported associations" until PlantDoc observations or
  reviewed sources confirm practical houseplant relevance.
- Create a small, human-reviewed starter care pack for the most common
  houseplants, targeting 30-50 species first. Each care profile should include
  structured ranges for light, water cadence, temperature, humidity, substrate
  tolerance, common stress signs, likely pests, and toxicity/safety flags where
  supported by acceptable sources.
- Require provenance for every care tip. A profile field without a source should
  be omitted rather than filled by guesswork or generated text.
- Surface starter care profiles in onboarding, species search, and the plant
  detail page. The UI should distinguish:
  - sourced reference facts,
  - PlantDoc deterministic insights from the user's own logs,
  - community baselines from anonymized cohorts,
  - experimental AI outputs if those ship later.
- Let user feedback correct the starter layer over time. Feedback should say
  whether a tip was useful, not replace the original source data.
- Add tests around importer allowlists, attribution metadata, deterministic
  matching, and the rule that imported reference data cannot leak private user
  fields into public exports.

Recommended first implementation slice:

1. Source registry and license policy.
2. Seeded starter care profiles for 10 common plants.
3. Species search using accepted names and synonyms.
4. Care-profile panel on the plant detail page with provenance.
5. Feedback capture for starter tips.

## Phase 4B: Recommendation Work That Can Start From The Current Build

These items still need public cohorts, durable controls, or a persistence model,
but the current build can already prepare them without weakening the privacy
model.

- AI advice expansion beyond preview:
  - keep the current Gemini route as the first adapter behind a provider-neutral
    advice interface,
  - write fixtures that exercise the sanitized prompt contract without calling a
    model provider,
  - define consent, deletion, provenance, prompt logging, image-retention, and
    provider-data-use requirements before saving AI outputs or expanding beyond
    preview,
  - build evaluation cases from synthetic timelines and the starter care pack,
  - keep generated advice review-only and excluded from public exports by
    default,
  - add durable server-side quotas before raising limits or enabling broader
    public access.
- Cross-user baselines:
  - implement cohort calculators over `public_observations` that return an
    explicit "not enough public data" state when k=5 suppression leaves no safe
    cell,
  - test with synthetic export rows so the UI and privacy logic are ready before
    real public volume exists,
  - keep baselines derived from public/export-safe rows, not private tables.
- Public dataset portal:
  - build a static portal or internal preview that reads existing manifests,
    data dictionaries, changelogs, and aggregate JSON from generated export
    artifacts,
  - keep it admin-only or local until the dataset license is finalized and
    `--publish` is intentionally run,
  - include empty-state copy for suppressed datasets so early releases are still
    understandable.
- Species and climate-specific experiments:
  - combine starter care profiles, climate zones, weather snapshots, and
    PlantDoc public cohorts only when each input has provenance,
  - show these as starter hypotheses until confirmed by the user's own logs or
    sufficient public cohorts.

## Phase 5: Community And Research

- Public dataset portal with versioned downloads.
- Community plant-care comparisons by species and climate.
- Research notebooks or examples using exported data.
- Optional public plant profiles with strong user consent and privacy review.

### Work That Can Start Before Public Launch

- Finalize the public dataset license decision before collecting or publishing
  public contributions. Update the opt-in copy, export manifest, and
  `docs/privacy.md` when the license is chosen.
- Build the dataset portal against local/generated export artifacts first:
  `manifest-vN.json`, `data-dictionary.md`, `changelog.md`,
  `plantdoc-observations-vN.csv`, `plantdoc-observations-vN.jsonl`, and
  `aggregates-vN.json`.
- Add a portal preview mode that shows admin-only artifacts without granting
  public file permissions. Publishing should remain an explicit `--publish`
  action.
- Add example notebooks or scripts that read exported CSV/JSONL files from disk
  and reproduce the aggregate calculations. Keep these independent of Appwrite
  credentials so researchers can reuse published releases.
- Prepare public comparison UI states now:
  - enough data,
  - not enough data because of k=5 suppression,
  - no consented observations yet,
  - species not recognized.
- Draft contribution guidelines for external researchers and plant-care
  reviewers who want to improve starter care profiles or data dictionaries.

## Phase 6: Connected Sensors

- Optional device registry for user-owned sensors, including device type, vendor/source, calibration context, and plant or location mapping.
- Sensor ingestion for temperature, humidity, light, soil moisture, water level, and other environmental readings.
- Store raw or normalized sensor readings separately from user-entered observations while linking useful summaries into plant timelines.
- Sensor-derived environment snapshots that preserve source/provenance and distinguish device data from manual entries, weather API data, and inferred values.
- Privacy controls for sensor data, especially location-like or occupancy-revealing patterns.

### Work That Can Start Without Hardware

- Define a sensor data contract before selecting devices:
  device type, metric type, unit, calibration context, recorded time,
  sampling interval, source, plant/location mapping, and owner permissions.
- Build a local CSV import or simulator for sensor readings. This allows
  timeline, charting, aggregation, and privacy tests without committing to a
  vendor.
- Extend environment snapshot provenance vocabulary in design docs before
  schema changes: `manual`, `weather_api`, `device_sensor`, and `inferred`
  already exist; add new source subtypes only when needed.
- Add privacy rules for sensor data before ingestion:
  occupancy-like patterns, room labels, exact timing, and location-derived
  signals must not enter public exports by default.
- Prototype sensor summary cards using synthetic data:
  daily min/max temperature, humidity range, light exposure hours, soil moisture
  trend, and stale-sensor warnings.

## Phase 7: Smart Irrigation And Automation

- Read-only irrigation insights first, such as low-moisture alerts and suggested watering windows.
- Optional user-confirmed irrigation actions before any fully automated watering.
- Device integration for pumps, valves, reservoirs, and smart plugs only after sensor ingestion and audit logging are reliable.
- Hard safety limits for automation: maximum runtime, cooldown windows, manual override, leak/failure detection, and action history.
- Deterministic control rules for actuators; AI may explain or recommend actions but must not directly trigger irrigation.

### Work That Can Start Before Actuators

- Model irrigation recommendations as read-only decisions first. Inputs should
  be explicit: plant profile, recent watering logs, soil moisture trend,
  weather snapshot, and user-configured risk tolerance.
- Design an audit log for future irrigation actions before integrating any
  device: proposed action, user confirmation, execution result, duration,
  manual override, failure reason, and linked sensor evidence.
- Write deterministic safety rules in tests before hardware support:
  maximum runtime, cooldown, no-repeat-after-failure, stale-sensor lockout, and
  manual confirmation required.
- Keep AI out of the control path. AI can explain a recommendation only after a
  deterministic rule engine has already produced a safe read-only result.

## Deployment And Owner-Gated Work

These tasks depend on owner accounts, DNS, billing, or provider credentials,
but the current build can still prepare most of the supporting work.

- Cloudflare production hosting:
  - keep using Workers static assets per ADR-009,
  - add a deployment checklist for `plantdoc.galvando.com`, Appwrite web
    platform origins, and rollback,
  - add a smoke-test script for the production URL once owner-run deployment is
    available.
- Appwrite custom API domain:
  - document the exact Appwrite and Cloudflare DNS steps for
    `api.galvando.com` or `appwrite.galvando.com`,
  - make environment handling accept either the current Appwrite Cloud endpoint
    or the future first-party endpoint,
  - verify auth/session behavior after the custom domain is live.
- Provider credentials:
  - Gemini preview is no longer blocked on credentials: `GEMINI_API_KEY` is now
    installed as a Cloudflare Worker secret for production,
  - keep future AI, paid weather, email, and analytics provider keys out of
    source,
  - add example `.env` entries and capability checks that fail closed when keys
    are absent,
  - document which features are disabled without each future credential.
- Appwrite plan readiness:
  - track database rows, storage, bandwidth, function executions, and active
    users before the student-pack/free-tier boundary matters,
  - add an operational checklist for Appwrite Pro, OSS credits, sponsorship, or
    self-hosting if usage outgrows the free tier.

## Analytics Migration Preparation

PostGIS and heavier analytics are still deferred, but the current export system
can be shaped so migration remains additive.

- Keep `public_observations` relationship-free and portable.
- Add export fixtures large enough to exercise k=5 cohorts, species/month
  aggregates, climate-zone filtering, and empty suppressed outputs.
- Build a local DuckDB or Postgres ingestion script from exported CSV/JSONL
  before introducing a hosted analytics database.
- Preserve dataset-version, schema-version, and manifest metadata in every
  downstream analytics example.
- Add geospatial analytics only against export-safe geography: country, region
  when cohort-safe, climate zone, and future coarse cells. Do not ingest private
  coordinates into the public analytics path.
