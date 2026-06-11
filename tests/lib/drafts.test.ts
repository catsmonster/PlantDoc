import { describe, expect, it, vi } from 'vitest';
import {
  clearLogDraft,
  isDefaultLogDraft,
  loadLogDraft,
  logDraftKey,
  saveLogDraft,
  type DraftStore,
  type LogDraft,
} from '../../src/lib/drafts';

function fakeStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function draft(overrides: Partial<LogDraft> = {}): LogDraft {
  return {
    v: 1,
    mode: 'water',
    amount: '250',
    method: 'top water',
    careType: 'fertilizing',
    productName: '',
    height: '',
    leafCount: '',
    soilMoisture: '',
    healthScore: '',
    note: '',
    contribute: false,
    ...overrides,
  };
}

describe('logDraftKey', () => {
  it('scopes the key to user and plant', () => {
    expect(logDraftKey('u1', 'p1')).toBe('plantdoc.logdraft.u1.p1');
    expect(logDraftKey('u1', 'p2')).not.toBe(logDraftKey('u1', 'p1'));
  });
});

describe('save/load roundtrip', () => {
  it('restores every field', () => {
    const store = fakeStore();
    const original = draft({
      mode: 'measure',
      height: '42.5',
      leafCount: '7',
      soilMoisture: '55',
      healthScore: '4',
      note: 'new leaf unfurling',
      contribute: true,
    });
    saveLogDraft(store, 'k', original);
    expect(loadLogDraft(store, 'k')).toEqual(original);
  });

  it('returns null when nothing is stored', () => {
    expect(loadLogDraft(fakeStore(), 'k')).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    const store = fakeStore();
    store.map.set('k', '{not json');
    expect(loadLogDraft(store, 'k')).toBeNull();
  });

  it('returns null on unknown version', () => {
    const store = fakeStore();
    store.map.set('k', JSON.stringify({ ...draft(), v: 99 }));
    expect(loadLogDraft(store, 'k')).toBeNull();
  });

  it('clearLogDraft removes the entry', () => {
    const store = fakeStore();
    saveLogDraft(store, 'k', draft());
    clearLogDraft(store, 'k');
    expect(loadLogDraft(store, 'k')).toBeNull();
  });

  it('swallows setItem failures with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store: DraftStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(() => saveLogDraft(store, 'k', draft())).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('isDefaultLogDraft', () => {
  it('is true for pristine values with matching contribute default', () => {
    expect(isDefaultLogDraft(draft(), false)).toBe(true);
    expect(isDefaultLogDraft(draft({ contribute: true }), true)).toBe(true);
  });

  it('is false when contribute differs from the profile default', () => {
    expect(isDefaultLogDraft(draft({ contribute: true }), false)).toBe(false);
  });

  it('is false when any field was edited', () => {
    expect(isDefaultLogDraft(draft({ mode: 'note' }), false)).toBe(false);
    expect(isDefaultLogDraft(draft({ amount: '300' }), false)).toBe(false);
    expect(isDefaultLogDraft(draft({ note: 'hi' }), false)).toBe(false);
    expect(isDefaultLogDraft(draft({ healthScore: '3' }), false)).toBe(false);
  });
});
