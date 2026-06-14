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

/**
 * Resolves a species to Permapeople cultivation facts. Distinguishes failure from
 * absence so a batch loader never destroys good data on a flaky/rate-limited run:
 * returns `null` when a request *fails* (non-ok response incl. HTTP 429 or a
 * network error) and `[]` only when the call *succeeds* but there is no exact
 * match or no cultivation traits. Loaders must skip (not clear) a species when
 * this returns `null`.
 */
export async function fetchPermapeopleFacts(
  scientificName: string,
  creds: PermapeopleCreds,
  fetcher: typeof fetch = fetch,
): Promise<CareFact[] | null> {
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
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as { plants?: PlantSummary[] };
    const id = pickPermapeopleMatch(searchJson.plants ?? [], scientificName);
    if (id === null) return []; // searched successfully, genuinely no exact match
    const detailRes = await fetcher(`${PERMAPEOPLE_BASE}/plants/${id}`, { headers });
    if (!detailRes.ok) return null;
    return parsePermapeopleCultivationFacts(await detailRes.json());
  } catch {
    return null;
  }
}
