# Phase 4 Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministic per-plant care insights (watering cadence, growth trend, stress signals) rendered in an experimental-labeled panel with a helpful/not-helpful feedback loop.

**Architecture:** One pure module (`src/lib/insights.ts`) computed from the already-hydrated timeline + one new private table (`insight_feedback`, read through the plant relationship) + an `InsightsPanel` on PlantScreen. Spec: `docs/superpowers/specs/2026-06-10-phase-4-recommendations-design.md`.

**Tech Stack:** Vitest, Appwrite TablesDB, React.

---

### Task 1: Pure insights module (TDD)

**Files:** Create `src/lib/insights.ts`, `tests/lib/insights.test.ts`.

- [ ] **1.1** Tests first: `Insight { kind, severity: 'info'|'suggestion'|'warning', title, detail, evidenceCount }`; `plantInsights(plant, now, units)` —
  watering: <3 waterings → single info "not enough data"; ≥3 → median interval, days-since-last; `due` (suggestion) at ≥ median; `overdue` (warning) at ≥ 1.5×median; recently watered → info with cadence.
  growth: ≥3 height points spanning ≥14 days → slope per 30 days, growing/stable/declining (dead-band ±0.5 cm/30d); same for leaf_count (dead-band ±0.5 leaves/30d); fewer points → no growth insight.
  stress: latest health ≤2 → warning; health dropped vs previous → warning; pest_severity_score ≥5 latest → warning; ≥2 pest_control in last 30 days → warning; latest soil_moisture <10 with watering due → warning.
  Sorted warnings → suggestions → info. FAIL.
- [ ] **1.2** Implement; helpers `medianDays`, `slopePer30Days` (least squares on observed_at ms). PASS. Commit.

### Task 2: insight_feedback schema + live migration

**Files:** Modify `appwrite/schema.ts`, `tests/appwrite/schema.test.ts`.

- [ ] **2.1** Add table: id `insight_feedback`, `create:users`, rowSecurity true, columns user_id, plant_id (relationship → plants, manyToOne, twoWay true, twoWayKey `insight_feedback`, onDelete cascade), `insight_kind` varchar 32 required, `helpful` boolean required; index `idx_user_id`. Schema test asserts table shape + no `any` grants (existing invariant test covers new table automatically). Test PASS.
- [ ] **2.2** Live: `npm run appwrite:setup` then `npm run appwrite:check` green. Commit.

### Task 3: Repo + types wiring

**Files:** Modify `src/lib/types.ts`, `src/lib/repo.ts`.

- [ ] **3.1** `InsightFeedback extends RowMeta { user_id; insight_kind; helpful }`; `Plant.insight_feedback?: InsightFeedback[]`. Repo: `setInsightFeedback(userId, plantId, kind, helpful, existing?)` — update row when an existing verdict for the kind is passed, else create with owner perms; `getPlantWithTimeline` select gains `'insight_feedback.*'`. Lint/build/test green. Commit.

### Task 4: InsightsPanel UI

**Files:** Create `src/features/insights/InsightsPanel.tsx`; modify `src/features/timeline/PlantScreen.tsx`.

- [ ] **4.1** Panel: "Care insights" + "Experimental" badge; renders `plantInsights(plant, new Date(), units)`; severity-tinted cards (warning amber, suggestion leaf, info slate); each card shows detail + "based on N entries" + 👍/👎 reflecting stored verdict, calling `setInsightFeedback` and updating local state. Hidden when plant has no observations.
- [ ] **4.2** Mount in PlantScreen between action buttons and timeline. Lint/build/test green. Commit.

### Task 5: Docs, gates, live verification, merge

**Files:** Modify `docs/schema.md`, `docs/roadmap-status` notes if any.

- [ ] **5.1** Live browser verification (preview MCP): Valencia Pothos shows watering insight (1 watering → not-enough-data info); add waterings via UI to cross 3, panel shows cadence; tap 👍 → row created owner-only; re-tap 👎 → same row updated (network body check).
- [ ] **5.2** schema.md: insight_feedback table section + "As implemented (Phase 4)" note (deterministic insights, feedback loop, AI track deferred).
- [ ] **5.3** All gates (lint, build, test, appwrite:check). Tick checkboxes, merge to master locally, keep unpushed.

## Self-Review Notes

Spec decisions 1–8 map to Tasks 1 (1–4), 4 (5), 2+3 (6), deferred notes (7–8). Feedback reads come through the plant select (relationship columns cannot be filtered) — same pattern as every timeline child. `plantInsights` takes `now` and `units` as parameters so tests are deterministic and unit formatting stays in one place.
