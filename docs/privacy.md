# PlantDoc Privacy & Open Data Policy

PlantDoc's public value depends on trust. The project should collect useful plant-care data while giving users clear control over what becomes public.

## Data Classes

### Private

Private data must never appear in public exports.

- user ID and auth identity,
- email address,
- exact latitude/longitude,
- full postal code or street-level address,
- plant nickname,
- room or placement label,
- private notes,
- original image files,
- image EXIF metadata,
- raw storage paths for private files,
- plant summary fields (last_watered_at, watering_count, watering_cadence_days, latest_photo_file_id, latest_photo_observed_at).

### App-Internal Derived Data

This data can be used inside PlantDoc for user features and enrichment, but should not be published without additional transformation.

- climate-zone lookup results,
- weather API enrichment,
- geocoded administrative regions,
- sensor-derived environmental readings,
- plant health trend summaries,
- moisture-model telemetry (`moisture_feedback`): per-plant verdicts on the
  water-balance moisture estimator (`estimate_feedback`, `magnitude`,
  `predicted_moisture_percent`), stored as owner-only rows related to `plants`
  (not `observations`). Never reachable by the export pipeline and never in
  `PUBLIC_EXPORT_FIELDS`. Contrast with `measurements.soil_state` — a
  qualitative dry/moist/wet check that IS an exportable observation when the
  user consents.

### Public Export Data

Public data must be generated from consented source observations and a derived export table/collection or export job.

Allowed public fields include:

- scientific name or user-entered species text,
- observation month or coarse date bucket,
- treatment type and normalized non-identifying amount,
- measurement values,
- broad country/region when privacy thresholds are met,
- climate zone,
- coarse geo cell,
- sanitized public image derivative when explicitly allowed,
- dataset version and publication timestamp.

## Consent Model

- Default account setting: private contribution disabled.
- Users can opt in at the account level and override per observation.
- A private observation must remain private even if the account default later changes.
- Users can revoke contribution for future exports.
- The app must clearly explain that public exports are open data and may be copied after release.

## Location Sharing Tiers

The current UI exposes public sharing tiers, not a stored coordinate precision control:

1. **Regional**: country, region/state/province, and climate zone may export when cohort size is safe.
2. **Climate**: country and climate zone may export; this is the default.
3. **Country only**: only country may export.

Legacy/import values `exact` and `local` may still exist in stored rows, but `exportGeo` caps both at regional geography. Exact GPS never persists, and these legacy values do not allow public city, postal prefix, or coordinates.

Public exports should prefer climate zone and coarse region over finer geography. City and postal prefix never appear in public exports. Add k-anonymity or minimum cohort checks before publishing small geographic/species groups.

### As Implemented (Phase 3)

- Coordinates are rounded to **2 decimal places (~1.1 km) before storage** in `user_locations`; the exact device/geocoder value is discarded and never persists anywhere.
- Weather and climate API calls round coordinates further to **1 decimal place (~11 km)**, so those third parties never receive finer than ~11 km.
- Location search sends the user's typed place text to geocoding providers, not device coordinates. The form asks for a city, neighborhood, or municipality and warns users not to enter a street address.
- Geography reaches the public export only through the sharing-tier projection in docs/open-data.md (country/region/climate zone at most); city, postal prefix, coordinates, and location labels never export.

## Third-Party Services

Geocoding (location setup) calls **Open-Meteo** first from the browser. If that city gazetteer has no match, the app calls PlantDoc's first-party `/api/geocode-location` Worker route, which rejects likely street-address queries before proxying to **OpenStreetMap Nominatim**, filters out street/building/amenity/highway results, adds identifying headers, caches successful responses, and applies a small per-isolate throttle. These requests are keyless, carry no PlantDoc account identity to Nominatim, and send typed place text rather than device coordinates. PlantDoc must not use Nominatim for autocomplete, bulk/systematic geocoding, or street-address collection; if public traffic grows, move this behind a durable cache/rate limiter, switch providers, or self-host before relying on the public endpoint.

Weather enrichment (log entries) calls **Open-Meteo** directly from the browser with coordinates rounded to 1 decimal place (~11 km) plus dates. The location form discloses third-party location search and coordinate rounding in-app at the point of entry.

The optional **Gemini AI preview** calls Google Gemini 3.5 Flash through PlantDoc's `/api/gemini-insights` Worker route. The API key is server-side only and must never use a `VITE_` prefix. The preview is user-triggered from the plant detail screen and sends:

- a sanitized structured summary of the plant and recent timeline entries,
- no private notes, user IDs, row IDs, raw storage file IDs, exact coordinates, city/postal fields, or public-export data,
- an optional resized latest photo payload when the user asks for the preview and the image fits the aggressive preview cap.

Gemini preview outputs are displayed transiently in the browser. They are not stored in Appwrite, not synced, not used in public exports, and not treated as deterministic care recommendations. The UI must warn that Gemini 3.5 Flash preview quality and availability may vary based on provider load and rate limits. If this provider is replaced, expanded, or made persistent, this section and the in-app disclosure must be updated first.

## Device-Local Data

Unsaved log-entry drafts are kept in browser `localStorage` (keyed per user and plant) so a failed save or reload does not lose typed input. Drafts never sync, never reach Appwrite or any third party, and are deleted on successful save or when the form returns to its pristine state. The Gemini preview also keeps a small per-user, per-plant, per-day local counter in `localStorage` to reduce accidental free-tier usage. Insight feedback (thumbs up/down on care insights) is stored server-side as owner-only rows and is excluded from public exports.

## Image Policy

- Strip or ignore EXIF metadata on upload.
- Keep originals private.
- Generate sanitized derivatives for any public image use.
- Require explicit consent for public image publication.
- Avoid publishing images that include people, addresses, mail, documents, or other identifying background details.
- For Gemini AI preview, send only a transient resized latest-photo payload after the user explicitly requests a preview; do not store AI image payloads or outputs.

## Deletion And Revocation

- Users must be able to delete private observations.
- Deleted private observations must be removed from future public export builds.
- If a dataset version has already been published, record the removal in the next dataset changelog rather than promising impossible retroactive deletion from third-party copies.
- Revocation should remove records from future exports and from the live public API or dashboard.

## Dataset Licensing

Recommended default:

- Derived tabular public observations: CC0 or CC BY 4.0, to be finalized before public launch.
- Public image derivatives: separate license and explicit user consent.
- Code: use the repository's selected open-source software license.

Do not collect public contributions until the dataset license is visible during opt-in.

## Public Export Checklist

Before publishing a dataset version:

- Confirm every row comes from consented observations.
- Confirm private fields are absent.
- Confirm timestamps are bucketed where appropriate.
- Confirm exact location is absent.
- Confirm public image derivatives are sanitized and consented.
- Confirm small cohorts are suppressed or coarsened.
- Record the schema version, dataset version, generation time, and changelog.
