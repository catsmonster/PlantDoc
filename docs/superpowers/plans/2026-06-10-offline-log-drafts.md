# Offline Log Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LogSheet input survives failed saves, accidental dismissal, and reloads via per-(user, plant) localStorage drafts.

**Architecture:** Pure storage-injected module + LogSheet lifecycle wiring. Spec: `docs/superpowers/specs/2026-06-10-offline-log-drafts-design.md`.

**Tech Stack:** Vitest, React, localStorage.

---

### Task 1: Pure drafts module (TDD)

**Files:** Create `src/lib/drafts.ts`, `tests/lib/drafts.test.ts`.

- [x] **1.1** Tests first (Map-backed fake store): `logDraftKey(userId, plantId)` format; save/load roundtrip of all fields; corrupt JSON → null; wrong version → null; `clearLogDraft` removes; `isDefaultLogDraft(draft, contributeDefault)` true for pristine values (mode water, amount '250', method 'top water', careType 'fertilizing', empty strings, contribute = default) and false when any field differs; `saveLogDraft` swallows setItem throw with a warning. FAIL.
- [x] **1.2** Implement (`DraftStore` interface, `LogDraft` with `v: 1`). PASS. Commit.

### Task 2: LogSheet wiring

**Files:** Modify `src/features/timeline/LogSheet.tsx`.

- [x] **2.1** Hydrate initial state from `loadLogDraft` (lazy, once); track `restored`; render "Draft restored" hint when true. Effect on draft fields: `isDefaultLogDraft` → clear, else save. Successful submit → `clearLogDraft` before `onLogged`. Lint/build/test green. Commit.

### Task 3: Verification + merge

- [x] **3.1** Live (preview MCP): typed note + amount, full page reload, reopened sheet → both fields restored with "Draft restored" hint; saved entry → draft key removed from localStorage; reopened untouched → defaults, no hint, no key after Cancel.
- [x] **3.2** Gates green (lint, build, test 121/121). Ticked checkboxes, merged to master locally, kept unpushed.
