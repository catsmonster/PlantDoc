/**
 * Offline-tolerant log drafts (Phase 1 backfill). Device-local input text in
 * localStorage so a failed save, accidental dismiss, or reload never loses
 * what was typed next to the plant. Drafts never sync and never leave the
 * device. observedAt deliberately does not persist: restoring a stale
 * timestamp would silently backdate the next entry.
 */

export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LogDraft {
  v: 1;
  mode: 'water' | 'care' | 'measure' | 'note';
  amount: string;
  method: string;
  careType: string;
  productName: string;
  height: string;
  leafCount: string;
  soilMoisture: string;
  healthScore: string;
  note: string;
  contribute: boolean;
}

export function logDraftKey(userId: string, plantId: string): string {
  return `plantdoc.logdraft.${userId}.${plantId}`;
}

export function saveLogDraft(store: DraftStore, key: string, draft: LogDraft): void {
  try {
    store.setItem(key, JSON.stringify(draft));
  } catch (e) {
    // Quota or private-mode failure: losing the draft beats breaking input.
    console.warn('log draft save failed', e);
  }
}

export function loadLogDraft(store: DraftStore, key: string): LogDraft | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { v?: unknown }).v === 1 &&
      typeof (parsed as { mode?: unknown }).mode === 'string'
    ) {
      return parsed as LogDraft;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLogDraft(store: DraftStore, key: string): void {
  store.removeItem(key);
}

/** Pristine LogSheet state: an untouched sheet should leave no draft behind. */
export function isDefaultLogDraft(draft: LogDraft, contributeDefault: boolean): boolean {
  return (
    draft.mode === 'water' &&
    draft.amount === '' &&
    draft.method === 'top water' &&
    draft.careType === 'fertilizing' &&
    draft.productName === '' &&
    draft.height === '' &&
    draft.leafCount === '' &&
    draft.soilMoisture === '' &&
    draft.healthScore === '' &&
    draft.note === '' &&
    draft.contribute === contributeDefault
  );
}
