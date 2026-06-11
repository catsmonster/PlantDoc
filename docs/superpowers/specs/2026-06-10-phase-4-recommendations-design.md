# Phase 4: Recommendations and Modeling — Design

Date: 2026-06-10. Roadmap phase 4 (`docs/roadmap.md`). Builds on the Phase 3
timeline (treatments, measurements, environment snapshots already hydrated by
`getPlantWithTimeline`).

## Scope decision

Phase 4 in the roadmap mixes two kinds of work: deterministic baseline
analytics with a clearly-labeled recommendation UI and feedback loop, and
*optional* AI features (photo insights, image-recognition labels, image
embeddings). This phase implements the deterministic core. The AI items are
deferred — they are explicitly optional in the roadmap, require an AI
provider account/key that does not exist in this project's environment, and
need their own opt-in consent design (the roadmap itself demands provenance
tracking, deletion coupling, and export exclusion for AI outputs). Deferring
them keeps the recommendation surface fully explainable: every insight shown
to a user is a number computed from their own data.

## Decisions

1. **Pure insights module** (`src/lib/insights.ts`): `plantInsights(plant,
   now)` → `Insight[]`. Computed entirely from the already-loaded timeline —
   no new reads, no network. Each insight carries `kind`, `severity`
   (`info | suggestion | warning`), `title`, `detail`, and the evidence count
   it was computed from, so the UI can show provenance ("based on 6
   waterings").

2. **Watering cadence**: median interval between `watering` treatments.
   Requires ≥ 3 waterings; below that, an `info` insight reports there is not
   enough data yet. Status: `due` when days-since-last ≥ median, `overdue` at
   ≥ 1.5 × median (warning severity). Median (not mean) so one vacation gap
   does not skew the baseline.

3. **Growth trend**: least-squares slope of `height_cm` (and `leaf_count`)
   over time, reported per 30 days. Requires ≥ 3 points spanning ≥ 14 days.
   Classified growing / stable / declining with a small dead-band so noise
   reads as stable. Heights format through the user's preferred units.

4. **Stress signals** (warnings): latest health score ≤ 2 on the 1–5 scale
   the UI captures; health score dropped vs the previous reading;
   `pest_severity_score` ≥ 5; ≥ 2 `pest_control` treatments in the last 30
   days; latest `soil_moisture_percent` < 10 alongside a due/overdue watering.

5. **Recommendation UI**: `InsightsPanel` on `PlantScreen` above the
   timeline, visibly tagged "Experimental" (roadmap requirement). Insights
   are framed as observations with suggested checks, never as instructions —
   e.g. "Watering is typically every 5 days; it has been 9. Worth checking
   the soil."

6. **Feedback loop**: new `insight_feedback` table — `user_id`, `plant_id`
   (two-way cascade relationship; relationship columns cannot be filtered, so
   feedback is read through the plant like every other child), `insight_kind`
   (varchar), `helpful` (boolean). Owner-only row permissions, `create:users`
   table grant, row security on — identical posture to other private tables.
   UI: 👍/👎 on each insight; one verdict per (plant, kind), latest wins;
   re-tapping updates the existing row. Feedback stays private; it is not in
   `PUBLIC_EXPORT_FIELDS` and never enters exports.

7. **Species/climate-specific baselines: deferred.** Cross-user comparisons
   ("Monstera owners in Csa water every N days") need the public dataset's
   species×month cohorts to pass the k = 5 suppression threshold; with seed
   data nothing passes. The aggregates artifact (`aggregates-vN.json`) is
   already the model-evaluation dataset the roadmap names; when real cohorts
   exist, the insights module gains a comparison source without UI changes.

8. **Deferred AI track** (photo insights, recognition labels, embeddings,
   AI privacy controls): blocked on an AI provider decision by the project
   owner. The consent/provenance/deletion requirements from the roadmap are
   recorded here so the future design starts from them: AI outputs must be
   opt-in, labeled with model+date provenance, deleted with their source
   photos, and excluded from public exports by default.

## Out of scope

AI features (above), cross-user baselines (above), notifications/reminders
(insights render in-app only), changes to the export pipeline.
