# Offline Log Drafts — Design

Date: 2026-06-10. Backfills the last open Phase 1 roadmap bullet: "Basic
offline-tolerant draft capture for logs when connectivity is poor."

## Problem

LogSheet state lives only in React. A failed save (offline, Appwrite error),
an accidental dismiss, or a page reload loses everything the user typed next
to the plant.

## Decisions

1. **localStorage drafts, one per (user, plant)** — key
   `plantdoc.logdraft.<userId>.<plantId>`. Drafts are device-local input
   text, never synced, never sent anywhere; nothing here changes the privacy
   model.

2. **Pure module** (`src/lib/drafts.ts`) with an injected `DraftStore`
   (`getItem/setItem/removeItem`, the localStorage subset) so tests use a
   Map-backed fake. Versioned payload (`v: 1`); unknown versions and corrupt
   JSON load as `null`. `setItem` failures (quota, private mode) warn and
   continue — a draft must never break typing.

3. **What persists**: mode, amount, method, care type, product, height, leaf
   count, soil moisture, health score, note, contribute. **`observedAt` does
   not persist** — restoring a stale timestamp would silently backdate the
   next entry; it always resets to now.

4. **Lifecycle**: LogSheet hydrates from the draft on open (showing a "Draft
   restored" hint), writes the draft on every change, clears it when the
   draft equals the pristine defaults (so open-and-close leaves nothing and
   the hint stays honest), and clears it after a successful save. Cancel
   keeps the draft — that is the point of a draft.

## Out of scope

Queued background retry/sync (a full offline outbox is a different feature),
drafts for the plant form or photo captions.
