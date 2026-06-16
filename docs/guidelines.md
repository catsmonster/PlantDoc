# PlantDoc AI Agent & Developer Guidelines

## Start Here

- Read [AGENTS.md](../AGENTS.md) before making product, stack, schema, or privacy changes.
- Prefer the documented Cloudflare Workers static-assets + Appwrite architecture unless the user explicitly asks for another service.
- Keep documentation and implementation synchronized. Schema drift is a product bug for PlantDoc.

## Privacy And Safety

- Treat exact location, auth identity, email, room labels, private notes, original images, and EXIF metadata as private.
- Never expose private tables directly as the public dataset.
- Public records must come from consented source observations and a derived export table/collection or export job.
- Use coarse geographic fields for public exports, such as country, region, climate zone, or a deliberately imprecise geo cell.
- Add privacy review notes when introducing image, location, sharing, export, or recommendation features.

## Data Modeling

- Model observations as timeline events with structured child records.
- Store normalized metric values internally. Convert units in the UI.
- Use taxonomy fields where possible, but allow user-entered species text when the plant is unknown.
- Distinguish measured, user-entered, inferred, and external API data.
- Add indexes only for known query patterns.

## Frontend

- Design for phones first. A user should be able to log care with one hand.
- Favor clear controls, stable layouts, accessible contrast, and concise labels.
- Avoid decorative UI that competes with plant photos or timeline data.
- Include loading, empty, error, and offline/draft states for logging workflows.
- Do not build a marketing landing page when the task is to build the actual product surface.

## Backend

- Use Appwrite permissions so users can read and write only their own private rows/documents.
- Keep private image originals and public derivatives in separate storage buckets or clearly separated paths.
- Run public export generation, image processing, and persistent model jobs in Appwrite Functions or a trusted server job. Browser-direct weather enrichment and Open-Meteo geocoding are accepted by ADR-007 while the providers remain keyless and no secret is involved; Nominatim must stay behind PlantDoc's first-party geocode proxy and must not become autocomplete, bulk geocoding, or street-address collection. The transient Gemini preview is accepted by ADR-010 only through the Cloudflare Worker proxy because it needs a server-side API key.
- Do not put service-role keys, API secrets, or private storage paths in client code.

## Code Quality

- Prefer small, focused modules and explicit data types.
- Validate user input at the boundary with shared schemas where practical.
- Keep migrations reviewable and reversible where possible.
- Once code exists, run lint, typecheck, and targeted tests before handoff.
- Document any new table, field, relationship, export field, or privacy assumption in the docs.
