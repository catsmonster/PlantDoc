# Common-name species onboarding + offline index + GBIF fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let novices find plants by common name ("basil"): a common-name-led typeahead that fills the species for them, backed by a bundled offline name index for common plants and a live GBIF vernacular fallback for the rare ones.

**Architecture:** Three-layer resolution in the existing pure `suggestSpecies` (curated care pack → bundled common-plants index → user catalog), with a debounced, abortable GBIF `/species/search?qField=VERNACULAR` fallback fired only on a local miss. The plant form's Common-name field becomes the hero input; Species becomes a derived, editable result chip (mockup Option A). All async lives in one hook; everything else is pure and unit-tested. Spec: `docs/superpowers/specs/2026-06-13-common-name-species-autocomplete-design.md`.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest (node env — no jsdom; components tested via `react-dom/server` `renderToStaticMarkup`), GBIF v1 REST (keyless, CORS, CC BY), tsx for scripts.

**Two independently-shippable parts:** Part 1 (Tasks 1–10) delivers the full feature using the live fallback. Part 2 (Tasks 11–15) adds the offline index so common plants resolve without network. Each part ends green (tests + lint + build) and is committable on its own.

---

## File structure

**Part 1**
- Modify `src/lib/knowledge/species-suggest.ts` — add `via?: 'gbif'` to `SpeciesSuggestion`; add pure helpers `mergeSuggestions`, `shouldQueryRemote`, `suggestionRowView`, `speciesSelectionFromSuggestion`.
- Modify `src/lib/knowledge/gbif.ts` — add `buildGbifVernacularSearchUrl`, `parseGbifVernacularResults`, `searchGbifVernacular`.
- Create `src/features/knowledge/useSpeciesSuggestions.ts` — the only async unit (debounce + AbortController + merge).
- Create `src/features/knowledge/SpeciesSuggestionRow.tsx` — presentational row (common-name-led).
- Modify `src/features/knowledge/SpeciesAutocomplete.tsx` — use the hook + row + loading + GBIF attribution.
- Modify `src/features/plants/PlantForm.tsx` — Common-name autocomplete fills species; Species derived chip.
- Tests: `tests/lib/species-suggest.test.ts`, `tests/lib/gbif-vernacular.test.ts`, `tests/ui/SpeciesSuggestionRow.test.ts`.

**Part 2**
- Create `scripts/knowledge/common-plants.seed.ts` — hand-maintained seed names.
- Create `scripts/knowledge/common-plants-transform.ts` — pure GBIF→row transforms.
- Create `scripts/knowledge/build-common-plants.ts` — generator (network), writes the module.
- Create (generated) `src/lib/knowledge/common-plants.ts` — `COMMON_PLANTS` snapshot.
- Modify `src/lib/knowledge/species-suggest.ts` — merge `COMMON_PLANTS` into the corpus.
- Modify `package.json` — `knowledge:build-common-plants` script.
- Tests: `tests/scripts/common-plants-transform.test.ts`, plus a case in `tests/lib/species-suggest.test.ts`.

Note `tests/` is compiled by `tsconfig.node.json`, which already has `DOM` lib + `jsx` for `react-dom/server` component tests.

---

## PART 1 — Common-name onboarding + GBIF vernacular fallback

### Task 1: Suggestion-shape field + pure merge/gate helpers

**Files:**
- Modify: `src/lib/knowledge/species-suggest.ts`
- Test: `tests/lib/species-suggest.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/species-suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mergeSuggestions,
  shouldQueryRemote,
  type SpeciesSuggestion,
} from '../../src/lib/knowledge/species-suggest';

const local: SpeciesSuggestion = { scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' };
const remoteHit: SpeciesSuggestion = { scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' };
const dupeOfLocal: SpeciesSuggestion = { scientificName: 'monstera deliciosa', commonName: 'X', speciesId: null, slug: null, via: 'gbif' };

describe('mergeSuggestions', () => {
  it('keeps local first, then remote, capped', () => {
    const out = mergeSuggestions([local], [remoteHit], 6);
    expect(out.map((s) => s.scientificName)).toEqual(['Monstera deliciosa', 'Ocimum basilicum']);
  });
  it('dedupes remote that repeats a local name (case-insensitive)', () => {
    const out = mergeSuggestions([local], [dupeOfLocal, remoteHit], 6);
    expect(out.map((s) => s.scientificName)).toEqual(['Monstera deliciosa', 'Ocimum basilicum']);
  });
  it('respects the limit', () => {
    expect(mergeSuggestions([local], [remoteHit], 1)).toHaveLength(1);
  });
});

describe('shouldQueryRemote', () => {
  it('true only when local is empty and query is >= 3 chars', () => {
    expect(shouldQueryRemote('basil', [])).toBe(true);
    expect(shouldQueryRemote('ba', [])).toBe(false);
    expect(shouldQueryRemote('basil', [local])).toBe(false);
    expect(shouldQueryRemote('   ', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- species-suggest`
Expected: FAIL — `mergeSuggestions` / `shouldQueryRemote` are not exported.

- [ ] **Step 3: Implement**

In `src/lib/knowledge/species-suggest.ts`, add `via` to the interface:

```ts
export interface SpeciesSuggestion {
  scientificName: string;
  /** Best common name to display (the one that matched, else the first known). */
  commonName: string | null;
  /** Appwrite species catalog id when catalog-backed; lets the form set species_id. */
  speciesId: string | null;
  /** Care-pack slug when a curated care profile backs this suggestion. */
  slug: string | null;
  /** Present only on live GBIF vernacular-fallback results, for the "via GBIF" tag. */
  via?: 'gbif';
}
```

Append at the end of the file:

```ts
/** Local hits first, then remote, deduped by scientific name, capped at `limit`. */
export function mergeSuggestions(
  local: SpeciesSuggestion[],
  remote: SpeciesSuggestion[],
  limit: number,
): SpeciesSuggestion[] {
  const seen = new Set(local.map((s) => s.scientificName.trim().toLowerCase()));
  const merged = [...local];
  for (const r of remote) {
    const key = r.scientificName.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  return merged.slice(0, limit);
}

/** Whether to reach out to the live GBIF fallback: only on a local miss for a real query. */
export function shouldQueryRemote(query: string, local: SpeciesSuggestion[]): boolean {
  return local.length === 0 && query.trim().length >= 3;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- species-suggest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/species-suggest.ts tests/lib/species-suggest.test.ts
git commit -m "feat: add via tag + mergeSuggestions/shouldQueryRemote to species-suggest"
```

---

### Task 2: GBIF vernacular search URL builder

**Files:**
- Modify: `src/lib/knowledge/gbif.ts`
- Test: `tests/lib/gbif-vernacular.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gbif-vernacular.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGbifVernacularSearchUrl } from '../../src/lib/knowledge/gbif';

describe('buildGbifVernacularSearchUrl', () => {
  it('queries the vernacular index filtered to accepted Plantae species', () => {
    const url = new URL(buildGbifVernacularSearchUrl('  basil '));
    expect(url.origin + url.pathname).toBe('https://api.gbif.org/v1/species/search');
    expect(url.searchParams.get('q')).toBe('basil');
    expect(url.searchParams.get('qField')).toBe('VERNACULAR');
    expect(url.searchParams.get('rank')).toBe('SPECIES');
    expect(url.searchParams.get('status')).toBe('ACCEPTED');
    expect(url.searchParams.get('highertaxonKey')).toBe('6');
    expect(url.searchParams.get('limit')).toBe('8');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- gbif-vernacular`
Expected: FAIL — `buildGbifVernacularSearchUrl` not exported.

- [ ] **Step 3: Implement**

In `src/lib/knowledge/gbif.ts`, add near the top (after `GBIF_SPECIES_MATCH_URL`):

```ts
export const GBIF_SPECIES_SEARCH_URL = 'https://api.gbif.org/v1/species/search';

/** Vernacular (common-name) search, filtered to accepted Plantae species
 *  (`highertaxonKey=6` is the GBIF backbone key for kingdom Plantae). */
export function buildGbifVernacularSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query.trim(),
    qField: 'VERNACULAR',
    rank: 'SPECIES',
    status: 'ACCEPTED',
    highertaxonKey: '6',
    limit: '8',
  });
  return `${GBIF_SPECIES_SEARCH_URL}?${params.toString()}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- gbif-vernacular`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/gbif.ts tests/lib/gbif-vernacular.test.ts
git commit -m "feat: add GBIF vernacular search URL builder"
```

---

### Task 3: Parse GBIF vernacular results → suggestions

**Files:**
- Modify: `src/lib/knowledge/gbif.ts`
- Test: `tests/lib/gbif-vernacular.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/gbif-vernacular.test.ts`:

```ts
import { parseGbifVernacularResults } from '../../src/lib/knowledge/gbif';

const BASIL_RESPONSE = {
  results: [
    {
      kingdom: 'Plantae',
      rank: 'SPECIES',
      canonicalName: 'Ocimum basilicum',
      scientificName: 'Ocimum basilicum L.',
      nubKey: 2927096,
      vernacularNames: [
        { vernacularName: 'Basilikum', language: 'deu' },
        { vernacularName: 'sweet basil', language: 'eng' },
        { vernacularName: 'basil', language: 'eng' },
      ],
    },
    { kingdom: 'Plantae', rank: 'SPECIES', canonicalName: 'Ocimum basilicum', vernacularNames: [] },
    { kingdom: 'Animalia', rank: 'SPECIES', canonicalName: 'Basilosaurus cetoides', vernacularNames: [] },
    { kingdom: 'Plantae', rank: 'GENUS', canonicalName: 'Ocimum', vernacularNames: [] },
  ],
};

describe('parseGbifVernacularResults', () => {
  it('maps plant species to suggestions, picks the closest English name, dedupes, tags via gbif', () => {
    const out = parseGbifVernacularResults(BASIL_RESPONSE, 'basil');
    expect(out).toEqual([
      { scientificName: 'Ocimum basilicum', commonName: 'basil', speciesId: null, slug: null, via: 'gbif' },
    ]);
  });
  it('drops non-Plantae and non-species rows', () => {
    const names = parseGbifVernacularResults(BASIL_RESPONSE, 'basil').map((s) => s.scientificName);
    expect(names).not.toContain('Basilosaurus cetoides');
    expect(names).not.toContain('Ocimum');
  });
  it('returns [] for junk input', () => {
    expect(parseGbifVernacularResults(null)).toEqual([]);
    expect(parseGbifVernacularResults({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- gbif-vernacular`
Expected: FAIL — `parseGbifVernacularResults` not exported.

- [ ] **Step 3: Implement**

In `src/lib/knowledge/gbif.ts`, add an import at the top:

```ts
import type { SpeciesSuggestion } from './species-suggest';
```

Add:

```ts
interface GbifVernacularName {
  vernacularName?: unknown;
  language?: unknown;
}

/** Pick the English vernacular nearest the query: exact, then prefix, then
 *  substring, then the first English name; null when there is no English name. */
function pickEnglishCommonName(names: unknown, query: string): string | null {
  if (!Array.isArray(names)) return null;
  const eng = names
    .filter((n): n is GbifVernacularName => !!n && typeof n === 'object')
    .filter((n) => n.language === 'eng' && typeof n.vernacularName === 'string')
    .map((n) => n.vernacularName as string);
  if (eng.length === 0) return null;
  const q = query.trim().toLowerCase();
  return (
    eng.find((n) => n.toLowerCase() === q) ??
    eng.find((n) => n.toLowerCase().startsWith(q)) ??
    eng.find((n) => n.toLowerCase().includes(q)) ??
    eng[0]
  );
}

/** Shapes a GBIF vernacular-search response into typeahead suggestions: accepted
 *  plant species only, deduped by canonical name, tagged `via: 'gbif'`. Taxonomy
 *  only — no care guide (`slug: null`) and not catalog-backed (`speciesId: null`). */
export function parseGbifVernacularResults(response: unknown, query = ''): SpeciesSuggestion[] {
  if (!response || typeof response !== 'object') return [];
  const results = (response as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: SpeciesSuggestion[] = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    if (rec.kingdom !== 'Plantae' || rec.rank !== 'SPECIES') continue;
    const canonical = typeof rec.canonicalName === 'string' ? rec.canonicalName.trim() : '';
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      scientificName: canonical,
      commonName: pickEnglishCommonName(rec.vernacularNames, query),
      speciesId: null,
      slug: null,
      via: 'gbif',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- gbif-vernacular`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/gbif.ts tests/lib/gbif-vernacular.test.ts
git commit -m "feat: parse GBIF vernacular search results into suggestions"
```

---

### Task 4: Non-throwing async vernacular fetch wrapper

**Files:**
- Modify: `src/lib/knowledge/gbif.ts`
- Test: `tests/lib/gbif-vernacular.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/gbif-vernacular.test.ts`:

```ts
import { searchGbifVernacular } from '../../src/lib/knowledge/gbif';

const okFetch = (json: unknown): typeof fetch =>
  (async () => ({ ok: true, json: async () => json }) as Response) as unknown as typeof fetch;

describe('searchGbifVernacular', () => {
  it('returns parsed suggestions on success', async () => {
    const out = await searchGbifVernacular('basil', okFetch(BASIL_RESPONSE));
    expect(out[0].scientificName).toBe('Ocimum basilicum');
    expect(out[0].via).toBe('gbif');
  });
  it('returns [] on a non-ok response', async () => {
    const fetcher = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await searchGbifVernacular('basil', fetcher)).toEqual([]);
  });
  it('returns [] when the fetch throws', async () => {
    const fetcher = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await searchGbifVernacular('basil', fetcher)).toEqual([]);
  });
  it('skips the call for short queries', async () => {
    let called = false;
    const fetcher = (async () => { called = true; return { ok: true, json: async () => ({}) } as Response; }) as unknown as typeof fetch;
    expect(await searchGbifVernacular('ba', fetcher)).toEqual([]);
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- gbif-vernacular`
Expected: FAIL — `searchGbifVernacular` not exported.

- [ ] **Step 3: Implement**

In `src/lib/knowledge/gbif.ts`, add:

```ts
/** Resolves a free-text query to plant suggestions via GBIF's vernacular index.
 *  Returns [] on short query, network error, or no match; never throws. */
export async function searchGbifVernacular(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<SpeciesSuggestion[]> {
  if (query.trim().length < 3) return [];
  try {
    const response = await fetcher(buildGbifVernacularSearchUrl(query));
    if (!response.ok) return [];
    const json: unknown = await response.json();
    return parseGbifVernacularResults(json, query);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- gbif-vernacular`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/gbif.ts tests/lib/gbif-vernacular.test.ts
git commit -m "feat: add non-throwing GBIF vernacular fetch wrapper"
```

---

### Task 5: `useSpeciesSuggestions` hook (debounce + abort)

**Files:**
- Create: `src/features/knowledge/useSpeciesSuggestions.ts`

No unit test: the test env is node (no jsdom), so effects/timers/AbortController are not exercised here — the testable logic (`suggestSpecies`, `shouldQueryRemote`, `searchGbifVernacular`, `mergeSuggestions`) is already covered by Tasks 1–4, and the wiring is verified live in Task 10.

- [ ] **Step 1: Create the hook**

```ts
/**
 * Species suggestions for the typeahead: instant local results from the curated
 * pack + bundled index + catalog, plus a debounced, abortable GBIF vernacular
 * fallback fired only on a local miss. All async lives here; the rest is pure.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  mergeSuggestions,
  shouldQueryRemote,
  suggestSpecies,
  type CatalogSpeciesLike,
  type SpeciesSuggestion,
} from '../../lib/knowledge/species-suggest';
import { searchGbifVernacular } from '../../lib/knowledge/gbif';

const DEBOUNCE_MS = 300;
const LIMIT = 6;

export function useSpeciesSuggestions(
  query: string,
  catalog: CatalogSpeciesLike[],
): { suggestions: SpeciesSuggestion[]; loading: boolean } {
  const local = useMemo(() => suggestSpecies(query, catalog), [query, catalog]);
  const [remote, setRemote] = useState<SpeciesSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldQueryRemote(query, local)) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void searchGbifVernacular(query, (input, init) =>
        fetch(input, { ...init, signal: controller.signal }),
      ).then((results) => {
        if (!controller.signal.aborted) {
          setRemote(results);
          setLoading(false);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, local]);

  const suggestions = useMemo(() => mergeSuggestions(local, remote, LIMIT), [local, remote]);
  return { suggestions, loading };
}
```

> Note: `catalog` must be a stable reference across renders (in `PlantForm` it is the `species` state array, set once after load) so the effect does not re-fire each render.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: PASS (compiles; no test yet).

- [ ] **Step 3: Commit**

```bash
git add src/features/knowledge/useSpeciesSuggestions.ts
git commit -m "feat: add useSpeciesSuggestions hook with debounced GBIF fallback"
```

---

### Task 6: `suggestionRowView` + `SpeciesSuggestionRow`

**Files:**
- Modify: `src/lib/knowledge/species-suggest.ts`
- Create: `src/features/knowledge/SpeciesSuggestionRow.tsx`
- Test: `tests/lib/species-suggest.test.ts`, `tests/ui/SpeciesSuggestionRow.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/species-suggest.test.ts`:

```ts
import { suggestionRowView } from '../../src/lib/knowledge/species-suggest';

describe('suggestionRowView', () => {
  it('leads with the common name, scientific name as sub, care tag for curated', () => {
    expect(suggestionRowView({ scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' }))
      .toEqual({ lead: 'Swiss cheese plant', sub: 'Monstera deliciosa', tag: 'care' });
  });
  it('tags gbif rows and shows no tag for plain local/catalog rows', () => {
    expect(suggestionRowView({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' }).tag).toBe('gbif');
    expect(suggestionRowView({ scientificName: 'Ficus elastica', commonName: 'Rubber plant', speciesId: 'abc', slug: null }).tag).toBeNull();
  });
  it('falls back to scientific name as the lead when there is no common name', () => {
    expect(suggestionRowView({ scientificName: 'Ocimum basilicum', commonName: null, speciesId: null, slug: null }))
      .toEqual({ lead: 'Ocimum basilicum', sub: null, tag: null });
  });
});
```

Create `tests/ui/SpeciesSuggestionRow.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpeciesSuggestionRow } from '../../src/features/knowledge/SpeciesSuggestionRow';

const render = (suggestion: Parameters<typeof SpeciesSuggestionRow>[0]['suggestion']) =>
  renderToStaticMarkup(createElement(SpeciesSuggestionRow, { suggestion, isDark: true, onPick: () => {} }));

describe('SpeciesSuggestionRow', () => {
  it('renders the common name ahead of the italic scientific name, with the GBIF tag', () => {
    const html = render({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' });
    expect(html.indexOf('Basil')).toBeLessThan(html.indexOf('Ocimum basilicum'));
    expect(html).toContain('italic');
    expect(html).toContain('via GBIF');
  });
  it('shows the care-guide tag for curated rows', () => {
    const html = render({ scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' });
    expect(html).toContain('Care guide');
    expect(html).not.toContain('via GBIF');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- SpeciesSuggestionRow species-suggest`
Expected: FAIL — `suggestionRowView` / `SpeciesSuggestionRow` not found.

- [ ] **Step 3: Implement the pure view helper**

Append to `src/lib/knowledge/species-suggest.ts`:

```ts
export interface SuggestionRowView {
  /** The prominent line: the common name when known, else the scientific name. */
  lead: string;
  /** The secondary italic line (scientific name) when the lead is a common name. */
  sub: string | null;
  /** 'care' for a curated care-guide row, 'gbif' for a live fallback row, else none. */
  tag: 'care' | 'gbif' | null;
}

/** Maps a suggestion to its novice-friendly display: common name leads. */
export function suggestionRowView(s: SpeciesSuggestion): SuggestionRowView {
  return {
    lead: s.commonName ?? s.scientificName,
    sub: s.commonName ? s.scientificName : null,
    tag: s.slug ? 'care' : s.via === 'gbif' ? 'gbif' : null,
  };
}
```

- [ ] **Step 4: Implement the row component**

Create `src/features/knowledge/SpeciesSuggestionRow.tsx`:

```tsx
/**
 * One row in the species typeahead. Common name leads; scientific name is the
 * secondary italic line; a tag marks curated care guides ("Care guide") and
 * live GBIF fallback rows ("via GBIF"). Presentation only — pure logic in
 * suggestionRowView.
 */
import { suggestionRowView, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';

export function SpeciesSuggestionRow({
  suggestion,
  isDark,
  onPick,
}: {
  suggestion: SpeciesSuggestion;
  isDark: boolean;
  onPick: () => void;
}) {
  const view = suggestionRowView(suggestion);
  const palette = isDark
    ? { text: '#F2F6EF', sub: '#9BAA98', hover: '#22301F', care: '#C7F24A', careText: '#0E140F', gbifBorder: 'rgba(255,255,255,.16)', gbif: '#9BAA98' }
    : { text: '#23302A', sub: '#6B7568', hover: '#F1F5EC', care: '#3C7140', careText: '#FFFFFF', gbifBorder: '#D9D2C3', gbif: '#6B7568' };
  return (
    <li role="option" aria-selected={false}>
      <button
        type="button"
        className={isDark ? 'b-tap' : 'a-tap'}
        onClick={onPick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 9, padding: '9px 10px', cursor: 'pointer', color: palette.text, fontFamily: 'inherit' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = palette.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view.lead}
          </span>
          {view.sub && (
            <span style={{ display: 'block', fontSize: 12, fontStyle: 'italic', color: palette.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {view.sub}
            </span>
          )}
        </span>
        {view.tag === 'care' && (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', background: palette.care, color: palette.careText, padding: '3px 6px', borderRadius: 5 }}>
            Care guide
          </span>
        )}
        {view.tag === 'gbif' && (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', border: `1px solid ${palette.gbifBorder}`, color: palette.gbif, padding: '3px 6px', borderRadius: 5 }}>
            via GBIF
          </span>
        )}
      </button>
    </li>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- SpeciesSuggestionRow species-suggest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge/species-suggest.ts src/features/knowledge/SpeciesSuggestionRow.tsx tests/lib/species-suggest.test.ts tests/ui/SpeciesSuggestionRow.test.ts
git commit -m "feat: common-name-led suggestion row + view helper"
```

---

### Task 7: Wire the hook + row + attribution into `SpeciesAutocomplete`

**Files:**
- Modify: `src/features/knowledge/SpeciesAutocomplete.tsx`

Verified live in Task 10 (the open/blur/menu behavior needs a browser).

- [ ] **Step 1: Replace the suggestions source and the rendered rows**

In `src/features/knowledge/SpeciesAutocomplete.tsx`, change the imports at the top to:

```tsx
import { useId, useState } from 'react';
import { type CatalogSpeciesLike, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';
import { useSpeciesSuggestions } from './useSpeciesSuggestions';
import { SpeciesSuggestionRow } from './SpeciesSuggestionRow';
```

Replace the line:

```tsx
  const suggestions = useMemo(() => suggestSpecies(value, catalog), [value, catalog]);
```

with:

```tsx
  const { suggestions, loading } = useSpeciesSuggestions(value, catalog);
```

- [ ] **Step 2: Render rows via the component and add a loading row**

Replace the `{suggestions.map((s) => ( ... ))}` block (the `<li>`…`</li>` mapping) inside the `<ul>` with:

```tsx
          {suggestions.map((s) => (
            <SpeciesSuggestionRow key={s.scientificName} suggestion={s} isDark={isDark} onPick={() => pick(s)} />
          ))}
          {loading && (
            <li role="option" aria-selected={false} aria-disabled style={{ padding: '9px 10px', fontSize: 12, color: palette.sub }}>
              Searching…
            </li>
          )}
          {suggestions.some((s) => s.via === 'gbif') && (
            <li aria-hidden style={{ padding: '5px 10px 3px', fontSize: 10.5, color: palette.sub }}>
              Matches via GBIF · CC BY
            </li>
          )}
```

- [ ] **Step 3: Show the menu while loading even with no rows yet**

Replace:

```tsx
  const showMenu = open && suggestions.length > 0 && !exactlyMatchesTop;
```

with:

```tsx
  const showMenu = open && (suggestions.length > 0 || loading) && !exactlyMatchesTop;
```

- [ ] **Step 4: Type-check + run existing tests**

Run: `npm run build`
Expected: PASS. (Confirm the unused `useMemo`/`suggestSpecies` imports are gone — the file no longer references them.)

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/SpeciesAutocomplete.tsx
git commit -m "feat: SpeciesAutocomplete uses live-fallback hook + common-name rows"
```

---

### Task 8: `speciesSelectionFromSuggestion` pure helper

**Files:**
- Modify: `src/lib/knowledge/species-suggest.ts`
- Test: `tests/lib/species-suggest.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/species-suggest.test.ts`:

```ts
import { speciesSelectionFromSuggestion } from '../../src/lib/knowledge/species-suggest';

describe('speciesSelectionFromSuggestion', () => {
  it('uses the relation id for catalog-backed picks', () => {
    expect(speciesSelectionFromSuggestion({ scientificName: 'Ficus elastica', commonName: 'Rubber plant', speciesId: 'abc', slug: null }))
      .toEqual({ speciesId: 'abc', speciesText: '' });
  });
  it('uses free scientific text for non-catalog picks', () => {
    expect(speciesSelectionFromSuggestion({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' }))
      .toEqual({ speciesId: '', speciesText: 'Ocimum basilicum' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- species-suggest`
Expected: FAIL — `speciesSelectionFromSuggestion` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/knowledge/species-suggest.ts`:

```ts
/** The species-field updates a chosen suggestion implies: a catalog relation id,
 *  or free scientific text when the suggestion is not catalog-backed. */
export function speciesSelectionFromSuggestion(s: SpeciesSuggestion): {
  speciesId: string;
  speciesText: string;
} {
  return s.speciesId ? { speciesId: s.speciesId, speciesText: '' } : { speciesId: '', speciesText: s.scientificName };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- species-suggest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/species-suggest.ts tests/lib/species-suggest.test.ts
git commit -m "feat: add speciesSelectionFromSuggestion helper"
```

---

### Task 9: PlantForm Option A — common name fills species, species as a derived chip

**Files:**
- Modify: `src/features/plants/PlantForm.tsx`

Verified live in Task 10.

- [ ] **Step 1: Add state + selection handlers**

In `src/features/plants/PlantForm.tsx`, update the import on line 17 to add `speciesSelectionFromSuggestion`:

```tsx
import { speciesCatalogLabel, speciesSelectionFromSuggestion, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';
```

After the `const [speciesText, setSpeciesText] = useState(...)` line (≈ line 48), add:

```tsx
  const [editSpecies, setEditSpecies] = useState(false);
```

Replace the existing `handleSelectSpecies` function (≈ lines 102–112) with these two handlers:

```tsx
  function applySpecies(suggestion: SpeciesSuggestion) {
    const next = speciesSelectionFromSuggestion(suggestion);
    setSpeciesId(next.speciesId);
    setSpeciesText(next.speciesText);
    setEditSpecies(false);
  }

  // From the Common-name field: fill the species, and adopt the row's common name
  // (keep the user's typed text when the row has none — a scientific-only entry).
  function handleSelectFromCommonName(suggestion: SpeciesSuggestion) {
    applySpecies(suggestion);
    if (suggestion.commonName) setCommonName(suggestion.commonName);
  }

  // From the Species field: fill the species, and back-fill an empty common name.
  function handleSelectFromSpecies(suggestion: SpeciesSuggestion) {
    applySpecies(suggestion);
    if (!commonName.trim() && suggestion.commonName) setCommonName(suggestion.commonName);
  }

  const hasSpecies = Boolean(speciesId) || Boolean(speciesText.trim());
  const speciesChipLabel = speciesId
    ? selectedSpeciesLabel
    : speciesText.trim() || 'Species selected';
```

- [ ] **Step 2: Replace the dark-branch Common-name input + Species section**

In the dark branch, replace the Common Name `<label>…</label>` block (≈ lines 184–188) with:

```tsx
            {/* Common name — the novice entry point: typing suggests species and
                fills the Species chip below (see Option A). */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>What do you call it?</span>
              <SpeciesAutocomplete
                value={commonName}
                catalog={species}
                isDark
                disabled={busy}
                placeholder="e.g. basil, snake plant, monstera"
                onTextChange={setCommonName}
                onSelect={handleSelectFromCommonName}
              />
            </label>
```

Replace the entire Species block (the `{speciesId ? ( … ) : ( … )}` expression, ≈ lines 190–220) with:

```tsx
            {/* Species — a derived result of the name above; editable via Change. */}
            {hasSpecies && !editSpecies ? (
              <div style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species · auto-filled</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#141d16', border: '1px solid rgba(199,242,74,.32)', borderRadius: 12, padding: '11px 13px' }}>
                  <Icon name="leaf" size={18} stroke={1.9} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, fontStyle: 'italic', color: '#F2F6EF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speciesChipLabel}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#67766A' }}>Filled from the name above</span>
                  </span>
                  <button type="button" className="b-tap" onClick={() => setEditSpecies(true)} disabled={busy} aria-label="Change species" style={{ flexShrink: 0, borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: '#C7F24A', padding: '7px 12px', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species</span>
                  <SpeciesAutocomplete
                    value={speciesText}
                    catalog={species}
                    isDark
                    disabled={busy}
                    placeholder="e.g. Monstera deliciosa"
                    onTextChange={(t) => { setSpeciesId(''); setSpeciesText(t); }}
                    onSelect={handleSelectFromSpecies}
                  />
                </label>
                <SpeciesNameResolver query={speciesText} isDark onAdopt={setSpeciesText} />
              </div>
            )}
```

> The `leaf` icon name exists in `src/ui/Icon.tsx` and is used as `<Icon name="leaf" />`.

- [ ] **Step 3: Replace the light-branch Common-name input + Species section**

In the light branch, replace the Common Name `<label>…</label>` block (≈ lines 364–368) with:

```tsx
          {/* Common name — novice entry point (Option A). */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>What do you call it?</span>
            <SpeciesAutocomplete
              value={commonName}
              catalog={species}
              isDark={false}
              disabled={busy}
              placeholder="e.g. basil, snake plant, monstera"
              onTextChange={setCommonName}
              onSelect={handleSelectFromCommonName}
            />
          </label>
```

Replace the light-branch Species block (the `{speciesId ? ( … ) : ( … )}` expression, ≈ lines 370–400) with:

```tsx
          {/* Species — derived result, editable via Change. */}
          {hasSpecies && !editSpecies ? (
            <div style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species · auto-filled</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#EBF1E7', border: '1px solid #CFE0C2', borderRadius: 14, padding: '11px 13px' }}>
                <Icon name="leaf" size={18} stroke={1.9} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, fontStyle: 'italic', color: '#23302A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speciesChipLabel}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#9AA294' }}>Filled from the name above</span>
                </span>
                <button type="button" className="a-tap" onClick={() => setEditSpecies(true)} disabled={busy} aria-label="Change species" style={{ flexShrink: 0, borderRadius: 10, border: '1px solid #E7E0D2', background: '#fff', color: '#3C7140', padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species</span>
                <SpeciesAutocomplete
                  value={speciesText}
                  catalog={species}
                  isDark={false}
                  disabled={busy}
                  placeholder="e.g. Monstera deliciosa"
                  onTextChange={(t) => { setSpeciesId(''); setSpeciesText(t); }}
                  onSelect={handleSelectFromSpecies}
                />
              </label>
              <SpeciesNameResolver query={speciesText} isDark={false} onAdopt={setSpeciesText} />
            </div>
          )}
```

- [ ] **Step 4: Type-check + tests**

Run: `npm run build`
Expected: PASS. (`handleSelectSpecies` is fully replaced — confirm no remaining references.)

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/plants/PlantForm.tsx
git commit -m "feat: PlantForm Option A — common name fills species, species as derived chip"
```

---

### Task 10: Verify Part 1 live + full gate

**Files:** none (verification).

- [ ] **Step 1: Lint, build, tests**

Run: `npm run lint`
Run: `npm run build`
Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Live-verify in the preview**

Start the dev server (preview_start), then in the Add-a-plant form:
- Type `basil` in "What do you call it?" — after ~300ms a row "Basil / Ocimum basilicum · via GBIF" appears, with the "Matches via GBIF · CC BY" line.
- Click it — the Species chip fills with "Ocimum basilicum · Filled from the name above"; "Change" reveals the species autocomplete + GBIF verify.
- Type a curated name (`monstera`) — instant local rows, "Care guide" tag, no GBIF call/line.
- Check preview_console_logs — no errors.
- preview_screenshot for proof.

- [ ] **Step 3: Commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix: address Part 1 live-verification findings"
```

---

## PART 2 — Offline common-plants index

### Task 11: Seed list

**Files:**
- Create: `scripts/knowledge/common-plants.seed.ts`
- Test: `tests/scripts/common-plants-transform.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/common-plants-transform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COMMON_PLANT_SEED } from '../../scripts/knowledge/common-plants.seed';

describe('COMMON_PLANT_SEED', () => {
  it('is a non-empty list of unique, non-blank names', () => {
    expect(COMMON_PLANT_SEED.length).toBeGreaterThan(40);
    const norm = COMMON_PLANT_SEED.map((n) => n.trim().toLowerCase());
    expect(norm.every((n) => n.length > 0)).toBe(true);
    expect(new Set(norm).size).toBe(norm.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- common-plants-transform`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the seed**

Create `scripts/knowledge/common-plants.seed.ts`:

```ts
/**
 * Hand-maintained seed of cultivated-plant names for the offline common-plants
 * index (see docs/superpowers/specs/2026-06-13-common-name-species-autocomplete-design.md).
 * Names may be common or scientific; the generator resolves each via GBIF. This
 * is the only hand-edited artifact and is meant to grow over time.
 */
export const COMMON_PLANT_SEED: readonly string[] = [
  // Herbs
  'basil', 'holy basil', 'mint', 'peppermint', 'spearmint', 'rosemary', 'thyme',
  'oregano', 'marjoram', 'parsley', 'cilantro', 'sage', 'dill', 'chives', 'tarragon',
  'lemon balm', 'lemongrass', 'fennel', 'lavender',
  // Vegetables & fruit
  'tomato', 'chili pepper', 'bell pepper', 'cucumber', 'lettuce', 'spinach', 'kale',
  'arugula', 'strawberry', 'zucchini', 'eggplant', 'radish', 'carrot',
  // Foliage houseplants
  'snake plant', 'golden pothos', 'monstera', 'peace lily', 'spider plant', 'ZZ plant',
  'fiddle leaf fig', 'rubber plant', 'jade plant', 'boston fern', 'english ivy',
  'heartleaf philodendron', 'chinese evergreen', 'dumb cane', 'croton', 'dragon tree',
  'weeping fig', 'umbrella tree', 'swiss cheese plant', 'arrowhead plant', 'wandering jew',
  // Palms & tropicals
  'areca palm', 'parlour palm', 'kentia palm', 'bird of paradise', 'banana plant',
  // Prayer/foliage colour
  'calathea', 'prayer plant', 'nerve plant',
  // Succulents & cacti
  'aloe vera', 'echeveria', 'haworthia', 'christmas cactus', 'string of pearls',
  // Flowering
  'orchid', 'moth orchid', 'african violet', 'begonia', 'geranium', 'cyclamen',
  'anthurium', 'kalanchoe', 'hibiscus', 'jasmine', 'poinsettia',
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- common-plants-transform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/knowledge/common-plants.seed.ts tests/scripts/common-plants-transform.test.ts
git commit -m "feat: seed list for the offline common-plants index"
```

---

### Task 12: Pure generator transforms

**Files:**
- Create: `scripts/knowledge/common-plants-transform.ts`
- Test: `tests/scripts/common-plants-transform.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/scripts/common-plants-transform.test.ts`:

```ts
import { plantFromMatch, englishVernaculars, type CommonPlant } from '../../scripts/knowledge/common-plants-transform';

const PLANT_MATCH = { usageKey: 2927096, canonicalName: 'Ocimum basilicum', rank: 'SPECIES', kingdom: 'Plantae', matchType: 'EXACT' };
const ANIMAL_MATCH = { usageKey: 1, canonicalName: 'Canis lupus', rank: 'SPECIES', kingdom: 'Animalia', matchType: 'EXACT' };
const VERNACULARS = { results: [
  { vernacularName: 'basil', language: 'eng' },
  { vernacularName: 'sweet basil', language: 'eng' },
  { vernacularName: 'basil', language: 'eng' },
  { vernacularName: 'Basilikum', language: 'deu' },
] };

describe('plantFromMatch', () => {
  it('accepts a Plantae species and returns key + canonical name', () => {
    expect(plantFromMatch(PLANT_MATCH)).toEqual({ usageKey: 2927096, scientificName: 'Ocimum basilicum' });
  });
  it('rejects non-Plantae, non-species, or NONE matches', () => {
    expect(plantFromMatch(ANIMAL_MATCH)).toBeNull();
    expect(plantFromMatch({ matchType: 'NONE' })).toBeNull();
    expect(plantFromMatch({ ...PLANT_MATCH, rank: 'GENUS' })).toBeNull();
  });
});

describe('englishVernaculars', () => {
  it('returns deduped English names in order, capped at 4', () => {
    expect(englishVernaculars(VERNACULARS)).toEqual(['basil', 'sweet basil']);
  });
  it('returns [] when there is no English name', () => {
    expect(englishVernaculars({ results: [{ vernacularName: 'Basilikum', language: 'deu' }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- common-plants-transform`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `scripts/knowledge/common-plants-transform.ts`:

```ts
/** Pure transforms for the common-plants generator (build-common-plants.ts).
 *  Network orchestration lives in the generator; these are unit-tested. */

export interface CommonPlant {
  scientificName: string;
  commonNames: string[];
}

/** Accepts a GBIF /species/match response only when it is an accepted Plantae
 *  species, returning its backbone key + canonical name. */
export function plantFromMatch(match: unknown): { usageKey: number; scientificName: string } | null {
  if (!match || typeof match !== 'object') return null;
  const m = match as Record<string, unknown>;
  if (m.matchType === 'NONE') return null;
  if (m.kingdom !== 'Plantae' || m.rank !== 'SPECIES') return null;
  if (typeof m.usageKey !== 'number') return null;
  const canonical = typeof m.canonicalName === 'string' ? m.canonicalName.trim() : '';
  if (!canonical) return null;
  return { usageKey: m.usageKey, scientificName: canonical };
}

/** Deduped English vernacular names from a GBIF vernacularNames response, max 4. */
export function englishVernaculars(response: unknown): string[] {
  const results = (response as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    if (rec.language !== 'eng' || typeof rec.vernacularName !== 'string') continue;
    const name = rec.vernacularName.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === 4) break;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- common-plants-transform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/knowledge/common-plants-transform.ts tests/scripts/common-plants-transform.test.ts
git commit -m "feat: pure transforms for the common-plants generator"
```

---

### Task 13: Generator script + generated module

**Files:**
- Create: `scripts/knowledge/build-common-plants.ts`
- Modify: `package.json`
- Create (generated): `src/lib/knowledge/common-plants.ts`

- [ ] **Step 1: Write the generator**

Create `scripts/knowledge/build-common-plants.ts`:

```ts
/**
 * Generates src/lib/knowledge/common-plants.ts from the seed list by resolving
 * each name against the GBIF backbone (accepted name + English vernaculars).
 * Run manually; commit the output. Name data only — never care data.
 *
 *   npm run knowledge:build-common-plants
 */
import { writeFile } from 'node:fs/promises';
import { buildGbifMatchUrl } from '../../src/lib/knowledge/gbif';
import { COMMON_PLANT_SEED } from './common-plants.seed';
import { englishVernaculars, plantFromMatch, type CommonPlant } from './common-plants-transform';

const OUT = new URL('../../src/lib/knowledge/common-plants.ts', import.meta.url);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolve(name: string): Promise<CommonPlant | null> {
  const matchRes = await fetch(buildGbifMatchUrl(name));
  if (!matchRes.ok) return null;
  const plant = plantFromMatch(await matchRes.json());
  if (!plant) return null;
  const vernRes = await fetch(`https://api.gbif.org/v1/species/${plant.usageKey}/vernacularNames?limit=200`);
  const vernaculars = vernRes.ok ? englishVernaculars(await vernRes.json()) : [];
  const seed = name.trim().toLowerCase();
  const commonNames = vernaculars.some((n) => n.toLowerCase() === seed) || /[A-Z]/.test(plant.scientificName) === false
    ? vernaculars
    : [name.trim(), ...vernaculars].slice(0, 4);
  return { scientificName: plant.scientificName, commonNames: commonNames.length ? commonNames : [name.trim()] };
}

async function main() {
  const byName = new Map<string, CommonPlant>();
  for (const name of COMMON_PLANT_SEED) {
    try {
      const row = await resolve(name);
      if (row) byName.set(row.scientificName.toLowerCase(), row);
      else console.warn(`no Plantae match: ${name}`);
    } catch (e) {
      console.warn(`error resolving ${name}:`, e);
    }
    await sleep(120);
  }
  const rows = [...byName.values()].sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  const body = rows
    .map((r) => `  { scientificName: ${JSON.stringify(r.scientificName)}, commonNames: ${JSON.stringify(r.commonNames)} },`)
    .join('\n');
  const file = `/**
 * GENERATED FILE — do not edit by hand. Run \`npm run knowledge:build-common-plants\`.
 * Offline common-plant name index for the species typeahead. Generated ${new Date().toISOString().slice(0, 10)}
 * from the GBIF Backbone Taxonomy (CC BY 4.0 — https://www.gbif.org). Name data
 * only (common <-> scientific); never care data.
 */
export interface CommonPlant {
  scientificName: string;
  commonNames: string[];
}

export const COMMON_PLANTS: readonly CommonPlant[] = [
${body}
];
`;
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${rows.length} species to src/lib/knowledge/common-plants.ts`);
}

void main();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "knowledge:build-common-plants": "tsx scripts/knowledge/build-common-plants.ts",
```

- [ ] **Step 3: Run the generator (network) and inspect**

Run: `npm run knowledge:build-common-plants`
Expected: `wrote NN species to src/lib/knowledge/common-plants.ts` (NN ≈ 60+). The created `src/lib/knowledge/common-plants.ts` looks like:

```ts
export const COMMON_PLANTS: readonly CommonPlant[] = [
  { scientificName: "Aloe vera", commonNames: ["aloe vera","barbados aloe"] },
  { scientificName: "Ocimum basilicum", commonNames: ["basil","sweet basil"] },
  // …one line per resolved species
];
```

Confirm `Ocimum basilicum` is present (basil is in the seed).

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: PASS (the generated file compiles; not yet imported anywhere).

- [ ] **Step 5: Commit**

```bash
git add scripts/knowledge/build-common-plants.ts package.json src/lib/knowledge/common-plants.ts
git commit -m "feat: GBIF generator + generated offline common-plants index"
```

---

### Task 14: Merge the index into the corpus

**Files:**
- Modify: `src/lib/knowledge/species-suggest.ts`
- Test: `tests/lib/species-suggest.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/species-suggest.test.ts`:

```ts
import { suggestSpecies } from '../../src/lib/knowledge/species-suggest';

describe('suggestSpecies with the offline common-plants index', () => {
  it('resolves a common edible by common name with no network', () => {
    const hits = suggestSpecies('basil');
    expect(hits.some((s) => s.scientificName === 'Ocimum basilicum')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- species-suggest`
Expected: FAIL — basil is not in the corpus yet.

- [ ] **Step 3: Implement the wiring**

In `src/lib/knowledge/species-suggest.ts`, add the import near the top (with the `CARE_PROFILES` import):

```ts
import { COMMON_PLANTS } from './common-plants';
```

In `mergeCorpus`, immediately after the `for (const profile of CARE_PROFILES) { … }` loop, add:

```ts
  for (const plant of COMMON_PLANTS) {
    upsert(plant.scientificName, plant.commonNames, [], null, null);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- species-suggest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/species-suggest.ts tests/lib/species-suggest.test.ts
git commit -m "feat: merge offline common-plants index into suggestSpecies"
```

---

### Task 15: Verify Part 2 live + full gate

**Files:** none (verification).

- [ ] **Step 1: Lint, build, tests**

Run: `npm run lint`
Run: `npm run build`
Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Live-verify in the preview**

In the Add-a-plant form:
- Type `basil` in "What do you call it?" — it now resolves **instantly, offline** (a "Basil / Ocimum basilicum" row with **no** "via GBIF" line — it comes from the bundled index).
- Type a genuinely uncommon common name **not** in the seed list (e.g. `bunny ear cactus` or `string of dolphins`) — after the debounce a "via GBIF" row appears (live fallback still works for the long tail).
- Pick either — the Species chip fills.
- preview_console_logs — no errors. preview_screenshot for proof.

- [ ] **Step 3: Commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix: address Part 2 live-verification findings"
```

---

## Self-review notes (resolved)

- **Spec coverage:** GBIF vernacular fallback (Tasks 2–5), novice common-name rows + attribution (Tasks 6–7), Option A form (Tasks 8–9), offline index generated from GBIF (Tasks 11–14), provenance/no-care-data (generated-file header + index merged with `slug: null`), testing matrix (pure + SSR + live). All covered.
- **`via` tag origin:** local and index rows are shape-identical (`speciesId: null, slug: null`); the `via: 'gbif'` field — set only in `parseGbifVernacularResults` — is what distinguishes a live fallback row for the "via GBIF" tag. Verified consistent across Tasks 1, 3, 6.
- **Naming consistency:** `handleSelectFromCommonName` / `handleSelectFromSpecies` / `applySpecies` (Task 9) replace the old `handleSelectSpecies`; `speciesSelectionFromSuggestion` (Task 8) is used by `applySpecies`. `mergeSuggestions`/`shouldQueryRemote`/`suggestionRowView`/`speciesSelectionFromSuggestion` all live in `species-suggest.ts`.
- **Test env:** no jsdom — every component test uses `renderToStaticMarkup`; the only effectful unit (`useSpeciesSuggestions`) is verified live (Tasks 10, 15), its pure dependencies unit-tested.
