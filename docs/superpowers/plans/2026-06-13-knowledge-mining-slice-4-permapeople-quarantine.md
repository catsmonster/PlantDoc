# Knowledge Mining — Slice 4: Permapeople Quarantined Cultivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mine Permapeople's cited cultivation traits (light/water requirement, soil type, growth, hardiness zone, edible parts) into `care_facts` from a **quarantined CC-BY-SA source**, and surface them in the plant panel as a dedicated, attributed "Cultivation" block — proving the share-alike quarantine machinery end-to-end on the live backend.

**Architecture:** A `permapeople.ts` extractor (keyed search → exact scientific-name match → detail → pure parser mapping the key-value `data` array to a curated set of cultivation text attributes). Permapeople registers as `license: CC-BY-SA`, which `buildSourceRows` auto-flags `quarantined: true`. The attributes are new (`light_requirement`, `water_requirement`, `soil`, `growth_rate`, `hardiness_zone`, `edibility`) so they never collide with the editorial care fields; the shaper exposes them as `cultivationFacts` and the panel renders them with visible CC-BY-SA attribution. A source-scoped `knowledge:mine-permapeople` loader composes with the others.

**Tech Stack:** TypeScript, Vitest (node + SSR), node-appwrite admin client, Permapeople REST API (key-id/secret headers).

**License note:** Permapeople data is CC-BY-SA 4.0 — commercial use permitted **with attribution + share-alike**, so any derived dataset stays attributed and out of unencumbered commercial/export paths. Modeled `license: CC-BY-SA`, `commercial_ok: true`, `quarantined: true`. Multi-source design choice: Permapeople's qualitative light/water traits go to *distinct* `*_requirement` attributes (a transparent side-by-side with the editorial fields) rather than overwriting them — clearer than a merged conflict widget; full per-field conflict UI stays deferred.

---

## File structure

- `src/lib/knowledge/sources.ts` (modify) — register the `permapeople` source (CC-BY-SA).
- `src/lib/knowledge/permapeople.ts` (create) — `pickPermapeopleMatch`, `parsePermapeopleCultivationFacts`, `fetchPermapeopleFacts`.
- `src/lib/knowledge/care-profiles.ts` (modify) — `CultivationFact` type + `cultivationFacts?`.
- `src/lib/knowledge/facts.ts` (modify) — `CULTIVATION_LABELS`, `extractCultivationFacts`, attach in `composeCareProfile`.
- `src/features/knowledge/CareProfilePanel.tsx` (modify) — render the Cultivation block (both themes) + include sources in the footer.
- `scripts/knowledge/load-permapeople.ts` (create) — `knowledge:mine-permapeople`.
- `package.json` (modify) — add the script.
- Tests: `tests/lib/knowledge-permapeople.test.ts`, `tests/lib/knowledge-facts.test.ts` (extend), `tests/ui/CareProfilePanel.test.ts` (extend), `tests/lib/knowledge-load-rows.test.ts` (extend).

---

### Task 1: Register the Permapeople source (CC-BY-SA, quarantined)

**Files:** Modify `src/lib/knowledge/sources.ts`; extend `tests/lib/knowledge-load-rows.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
it('registers permapeople as a quarantined CC-BY-SA cultivation source', () => {
  const row = buildSourceRows().find((r) => r.source_key === 'permapeople');
  expect(row).toBeDefined();
  expect(row!.license).toBe('CC-BY-SA');
  expect(row!.quarantined).toBe(true);
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-load-rows`.

- [ ] **Step 3: Implement** — append to `KNOWLEDGE_SOURCES`:

```ts
  // Quarantined cultivation source (slice 4). CC-BY-SA: commercial use permitted
  // with attribution + share-alike, so derived data stays attributed and out of
  // unencumbered export/commercial paths (quarantined flag set by buildSourceRows).
  {
    id: 'permapeople',
    name: 'Permapeople',
    url: 'https://permapeople.org',
    license: 'CC-BY-SA',
    commercialOk: true,
    attribution: 'Permapeople (permapeople.org) — CC BY-SA 4.0',
  },
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-load-rows`.
- [ ] **Step 5: Commit** — `feat(knowledge): register Permapeople as quarantined CC-BY-SA source`.

---

### Task 2: Permapeople extractor

**Files:** Create `src/lib/knowledge/permapeople.ts`; test `tests/lib/knowledge-permapeople.test.ts`.

Detail (confirmed live): `{ scientific_name, name, data: [{key, value}, ...] }`. Search: `POST /api/search {q}` → `{ plants: [...] }`. Auth: `x-permapeople-key-id` / `x-permapeople-key-secret`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import {
  pickPermapeopleMatch,
  parsePermapeopleCultivationFacts,
} from '../../src/lib/knowledge/permapeople';

describe('pickPermapeopleMatch', () => {
  it('returns the id whose scientific_name matches exactly', () => {
    const plants = [
      { id: 1, scientific_name: 'Monstera adansonii' },
      { id: 5869, scientific_name: 'Monstera deliciosa' },
    ];
    expect(pickPermapeopleMatch(plants, 'Monstera deliciosa')).toBe(5869);
  });
  it('returns null without an exact match', () => {
    expect(pickPermapeopleMatch([{ id: 1, scientific_name: 'Monstera adansonii' }], 'Monstera deliciosa')).toBeNull();
  });
});

describe('parsePermapeopleCultivationFacts', () => {
  const DETAIL = {
    scientific_name: 'Monstera deliciosa',
    data: [
      { key: 'Light requirement', value: 'Full sun, Partial sun/shade, Full shade' },
      { key: 'Water requirement', value: 'Moist, Wet' },
      { key: 'Soil type', value: 'Light (sandy), Medium, Heavy (clay)' },
      { key: 'Growth', value: 'Fast' },
      { key: 'USDA Hardiness zone', value: '10-12' },
      { key: 'Edible parts', value: 'Fruit' },
      { key: 'Wikipedia', value: 'https://en.wikipedia.org/...' },
    ],
  };
  it('maps the curated cultivation keys to sourced permapeople facts; ignores other keys', () => {
    const facts = parsePermapeopleCultivationFacts(DETAIL);
    const byAttr = new Map(facts.map((f) => [f.attribute, f.valueText]));
    expect(facts.every((f) => f.sourceId === 'permapeople' && f.trust === 'sourced')).toBe(true);
    expect(byAttr.get('light_requirement')).toBe('Full sun, Partial sun/shade, Full shade');
    expect(byAttr.get('water_requirement')).toBe('Moist, Wet');
    expect(byAttr.get('soil')).toBe('Light (sandy), Medium, Heavy (clay)');
    expect(byAttr.get('growth_rate')).toBe('Fast');
    expect(byAttr.get('hardiness_zone')).toBe('10-12');
    expect(byAttr.get('edibility')).toBe('Fruit');
    expect([...byAttr.keys()]).not.toContain('Wikipedia');
  });
  it('returns [] for a malformed detail', () => {
    expect(parsePermapeopleCultivationFacts(null)).toEqual([]);
    expect(parsePermapeopleCultivationFacts({ data: 'nope' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-permapeople`.

- [ ] **Step 3: Implement** `src/lib/knowledge/permapeople.ts`:

```ts
/**
 * Permapeople cultivation extractor (roadmap Phase 4A, slice 4). Resolves a
 * scientific name to Permapeople's cited cultivation traits. CC-BY-SA, so the
 * source is QUARANTINED — derived facts stay attributed and out of unencumbered
 * commercial/export paths. Search is fuzzy → attach only on an exact
 * scientific-name match. Traits map to distinct cultivation attributes (not the
 * editorial care fields), shown in their own attributed block. Pure parser +
 * match picker (unit tested) plus a non-throwing fetch orchestration.
 * Admin-script use only (needs API key id/secret).
 */

import type { CareFact } from './facts';

export const PERMAPEOPLE_BASE = 'https://permapeople.org/api';

/** Curated Permapeople `data` keys → our cultivation attribute keys. */
const FIELD_MAP: Readonly<Record<string, string>> = {
  'Light requirement': 'light_requirement',
  'Water requirement': 'water_requirement',
  'Soil type': 'soil',
  Growth: 'growth_rate',
  'USDA Hardiness zone': 'hardiness_zone',
  'Edible parts': 'edibility',
};

interface PlantSummary {
  id?: unknown;
  scientific_name?: unknown;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The numeric id whose scientific_name equals the queried name, else null. */
export function pickPermapeopleMatch(plants: PlantSummary[], scientificName: string): number | null {
  const want = normalize(scientificName);
  for (const p of plants) {
    if (typeof p.scientific_name === 'string' && normalize(p.scientific_name) === want) {
      return typeof p.id === 'number' ? p.id : null;
    }
  }
  return null;
}

export function parsePermapeopleCultivationFacts(detail: unknown): CareFact[] {
  if (!detail || typeof detail !== 'object') return [];
  const data = (detail as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const facts: CareFact[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const key = (entry as { key?: unknown }).key;
    const value = (entry as { value?: unknown }).value;
    if (typeof key !== 'string' || typeof value !== 'string' || !value.trim()) continue;
    const attribute = FIELD_MAP[key];
    if (!attribute) continue;
    facts.push({
      attribute,
      valueText: value.trim(),
      sourceId: 'permapeople',
      trust: 'sourced',
    });
  }
  return facts;
}

interface PermapeopleCreds {
  keyId: string;
  secret: string;
}

/** Resolves a species to Permapeople cultivation facts, or [] on any failure / no exact match. */
export async function fetchPermapeopleFacts(
  scientificName: string,
  creds: PermapeopleCreds,
  fetcher: typeof fetch = fetch,
): Promise<CareFact[]> {
  const headers = {
    'x-permapeople-key-id': creds.keyId,
    'x-permapeople-key-secret': creds.secret,
    'Content-Type': 'application/json',
  };
  try {
    const searchRes = await fetcher(`${PERMAPEOPLE_BASE}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: scientificName }),
    });
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as { plants?: PlantSummary[] };
    const id = pickPermapeopleMatch(searchJson.plants ?? [], scientificName);
    if (id === null) return [];
    const detailRes = await fetcher(`${PERMAPEOPLE_BASE}/plants/${id}`, { headers });
    if (!detailRes.ok) return [];
    return parsePermapeopleCultivationFacts(await detailRes.json());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-permapeople`.
- [ ] **Step 5: Commit** — `feat(knowledge): Permapeople cultivation extractor (exact-match, quarantined CC-BY-SA)`.

---

### Task 3: `cultivationFacts` projection in the shaper

**Files:** Modify `src/lib/knowledge/care-profiles.ts` + `src/lib/knowledge/facts.ts`; extend `tests/lib/knowledge-facts.test.ts`.

- [ ] **Step 1: Failing test** (add to `knowledge-facts.test.ts`):

```ts
it('exposes cultivation text facts (e.g. Permapeople) as cultivationFacts with labels + source', () => {
  const facts: CareFact[] = [
    { attribute: 'family', valueText: 'Araceae', sourceId: 'powo', trust: 'sourced' },
    { attribute: 'soil', valueText: 'Light (sandy), Medium', sourceId: 'permapeople', trust: 'sourced' },
    { attribute: 'growth_rate', valueText: 'Fast', sourceId: 'permapeople', trust: 'sourced' },
    { attribute: 'edibility', valueText: 'Fruit', sourceId: 'permapeople', trust: 'sourced' },
  ];
  const profile = composeCareProfile('Monstera deliciosa', facts, {
    slug: 'm', commonNames: [], synonyms: [], nameSourceId: 'powo',
  })!;
  const cult = profile.cultivationFacts ?? [];
  const byAttr = new Map(cult.map((c) => [c.attribute, c]));
  expect(byAttr.get('soil')).toMatchObject({ label: 'Soil type', value: 'Light (sandy), Medium', sourceId: 'permapeople' });
  expect(byAttr.get('growth_rate')).toMatchObject({ label: 'Growth', value: 'Fast' });
  expect(cult.map((c) => c.attribute)).not.toContain('family'); // primary fields stay out of the block
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- knowledge-facts`.

- [ ] **Step 3a:** In `care-profiles.ts`, add the type + optional field:

```ts
/** A cited cultivation trait (e.g. Permapeople), shown in its own attributed block. */
export interface CultivationFact {
  attribute: string;
  label: string;
  value: string;
  sourceId: string;
}
```

Add to `SpeciesCareProfile` (after `communityRanges`):

```ts
  /** Cited cultivation traits (e.g. Permapeople, CC-BY-SA), shown apart with attribution. */
  cultivationFacts?: CultivationFact[];
```

- [ ] **Step 3b:** In `facts.ts`, import `CultivationFact`, add the label map + extractor, attach it:

```ts
/** Cultivation text attributes surfaced in their own block, in display order. */
const CULTIVATION_LABELS: { attribute: string; label: string }[] = [
  { attribute: 'light_requirement', label: 'Light requirement' },
  { attribute: 'water_requirement', label: 'Water requirement' },
  { attribute: 'soil', label: 'Soil type' },
  { attribute: 'growth_rate', label: 'Growth' },
  { attribute: 'hardiness_zone', label: 'Hardiness zone' },
  { attribute: 'edibility', label: 'Edible parts' },
];

function extractCultivationFacts(facts: CareFact[]): CultivationFact[] {
  const out: CultivationFact[] = [];
  for (const { attribute, label } of CULTIVATION_LABELS) {
    const best = pickBest(facts.filter((f) => f.attribute === attribute && f.valueText !== undefined));
    if (best) out.push({ attribute, label, value: best.valueText!, sourceId: best.sourceId });
  }
  return out;
}
```

In `composeCareProfile`, compute `const cultivationFacts = extractCultivationFacts(facts);` and add `cultivationFacts: cultivationFacts.length ? cultivationFacts : undefined,` to the returned object. Import `CultivationFact` from `./care-profiles`.

- [ ] **Step 4: Run, expect PASS.** `npm test -- knowledge-facts` and `npm test -- knowledge`.
- [ ] **Step 5: Commit** — `feat(knowledge): expose cited cultivation traits as cultivationFacts in the shaper`.

---

### Task 4: Panel renders the Cultivation block

**Files:** Modify `src/features/knowledge/CareProfilePanel.tsx`; extend `tests/ui/CareProfilePanel.test.ts`.

- [ ] **Step 1: Failing test** (add to `CareProfilePanel.test.ts`, and add `cultivationFacts` to a profile):

```ts
it.each([true, false])('renders the Cultivation block with Permapeople CC-BY-SA attribution (isDark=%s)', (isDark) => {
  const profile = {
    ...base,
    communityRanges: undefined,
    cultivationFacts: [
      { attribute: 'soil', label: 'Soil type', value: 'Light (sandy), Medium', sourceId: 'permapeople' },
      { attribute: 'growth_rate', label: 'Growth', value: 'Fast', sourceId: 'permapeople' },
    ],
  };
  const html = renderToStaticMarkup(createElement(CareProfilePanel, { profile, units: 'metric', isDark }));
  expect(html).toContain('Cultivation');
  expect(html).toContain('Light (sandy), Medium');
  expect(html).toContain('Permapeople');
  expect(html).toContain('CC-BY-SA');
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm test -- CareProfilePanel`.

- [ ] **Step 3:** In `usedSources`, also add `...(profile.cultivationFacts ?? []).map((c) => c.sourceId)` to the `ids` set. Then add a Cultivation block in BOTH theme branches (after the community block, before the sources footer). Each row: `label` + `value`; the block footer shows the cited source(s) with license, e.g. `Source: Permapeople (CC-BY-SA)`. Derive the footer from the distinct cultivation source ids:

```tsx
{profile.cultivationFacts && profile.cultivationFacts.length > 0 && (() => {
  const cultSources = [...new Set(profile.cultivationFacts.map((c) => c.sourceId))]
    .map(getSource).filter((s): s is KnowledgeSource => s !== null);
  return (
    <div style={{ marginTop: 16 }}>
      {/* header "Cultivation" + theme-appropriate styling */}
      {profile.cultivationFacts.map((c) => (
        <div key={c.attribute} /* row */>
          <span /* label */>{c.label}</span>
          <span /* value */>{c.value}</span>
        </div>
      ))}
      <p /* footer */>
        {cultSources.map((s) => `Source: ${s.name} (${s.license})`).join(' · ')}
      </p>
    </div>
  );
})()}
```

Use the dark palette (`#67766A`, `#CBD8C6`) in the dark branch and the light palette (`#9AA294`, `#23302A`) in the light branch, mirroring the community block styling. Header label "Cultivation".

- [ ] **Step 4: Run, expect PASS.** `npm test -- CareProfilePanel`.
- [ ] **Step 5: Commit** — `feat(knowledge): plant panel renders cited Cultivation block with CC-BY-SA attribution`.

---

### Task 5: Permapeople loader

**Files:** Create `scripts/knowledge/load-permapeople.ts`; modify `package.json`.

- [ ] **Step 1:** Create `scripts/knowledge/load-permapeople.ts` (mirror `load-openplantbook.ts`, source = `permapeople`, creds from `PERMAPEOPLE_ID` (key id) + `PERMAPEOPLE_API` (secret); source-scoped clearing of `permapeople` facts; upsert the `permapeople` source row first).

```ts
function resolveCreds(): { keyId: string; secret: string } {
  const keyId = process.env.PERMAPEOPLE_ID?.trim();
  const secret = process.env.PERMAPEOPLE_API?.trim();
  if (!keyId || !secret) {
    throw new Error(
      'Missing Permapeople credentials: set PERMAPEOPLE_ID (key id) and ' +
        'PERMAPEOPLE_API (key secret) in .env (server secrets — no VITE_ prefix).',
    );
  }
  return { keyId, secret };
}
```

The body is identical in shape to `load-openplantbook.ts` but calls `fetchPermapeopleFacts(p.scientificName, creds)`, uses `source_id: 'permapeople'`, and clears existing facts whose source is `permapeople`.

- [ ] **Step 2:** Add to `package.json`: `"knowledge:mine-permapeople": "tsx scripts/knowledge/load-permapeople.ts"`.
- [ ] **Step 3: Typecheck** — `node ./node_modules/typescript/bin/tsc -b` → exit 0.
- [ ] **Step 4: Commit** — `feat(knowledge): knowledge:mine-permapeople loader (quarantined cultivation facts)`.

---

### Task 6: Live populate + verify + gate

- [ ] **Step 1:** Run `./node_modules/.bin/tsx scripts/knowledge/load-permapeople.ts`. Expect per-species fact counts; total > 20.
- [ ] **Step 2:** Verify a species composes `cultivationFacts` sourced to `permapeople`, and that the `permapeople` source_dataset row is `quarantined: true` (one-off tsx read).
- [ ] **Step 3:** Full gate — `npm test`, `npm run lint`, `node ./node_modules/typescript/bin/tsc -b`.

---

### Task 7: Docs

- [ ] Update `docs/knowledge-layer.md`: add the Permapeople row to the source-policy table (CC BY-SA · quarantined), a Pieces row for `permapeople.ts` + the loader, and a note that quarantined cultivation facts render in the attributed "Cultivation" block. Commit — `docs(knowledge): document Permapeople quarantined cultivation mining (slice 4)`.

---

## Self-review

- **Spec coverage:** build-order step 4 (Permapeople, `quarantined` flag, attribution UI) — Tasks 1–7. **PFAF deferred**: Permapeople (keyed, present) already covers the cultivation ground and is the more actively maintained of the two; the PFAF scraped-CSV staging is a separate optional add (noted). "Conflict disclosure" is addressed by transparent side-by-side blocks (editorial care vs cited cultivation) rather than a merged widget; a full per-field conflict UI stays deferred.
- **Type consistency:** `CareFact` is the extractor output + loader input; `CultivationFact` defined in care-profiles.ts, produced by facts.ts, consumed by the panel. Cultivation attribute keys (`light_requirement`, `water_requirement`, `soil`, `growth_rate`, `hardiness_zone`, `edibility`) match across extractor `FIELD_MAP`, shaper `CULTIVATION_LABELS`, and are disjoint from the editorial/community attributes.
- **Licensing:** Permapeople = CC-BY-SA → `quarantined: true` (auto), attribution + license shown in the block; kept out of unencumbered export/commercial paths by the flag. No `user_id`; privacy test unchanged.
- **Idempotency:** source-scoped clearing keeps all three care-fact loaders order-independent.
