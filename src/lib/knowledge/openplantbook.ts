/**
 * OpenPlantbook indoor-care extractor (roadmap Phase 4A, slice 3). Resolves a
 * scientific name to OpenPlantbook's crowd-sourced indoor ranges (temperature,
 * humidity, light lux, soil moisture, soil EC). Search is fuzzy, so we attach
 * data only on an exact name match — never a near miss. Every fact is
 * `community_unverified` trust and sourced to `openplantbook`, kept visibly
 * separate in the UI. Pure parser + match picker (unit tested) plus a
 * non-throwing fetch orchestration. Admin-script use only (needs OAuth creds).
 */

import type { CareFact } from './facts';

export const OPENPLANTBOOK_BASE = 'https://open.plantbook.io/api/v1';

interface SearchResult {
  pid?: unknown;
  display_pid?: unknown;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The pid of the result whose pid/display_pid equals the queried name, else null. */
export function pickOpenPlantbookMatch(results: SearchResult[], scientificName: string): string | null {
  const want = normalize(scientificName);
  for (const r of results) {
    const pid = typeof r.pid === 'string' ? r.pid : '';
    const display = typeof r.display_pid === 'string' ? r.display_pid : '';
    if (normalize(display) === want || normalize(pid) === want) return pid || null;
  }
  return null;
}

const RANGE_FIELDS: readonly { attribute: string; min: string; max: string; unit: string }[] = [
  { attribute: 'temperature_c', min: 'min_temp', max: 'max_temp', unit: 'C' },
  { attribute: 'humidity_percent', min: 'min_env_humid', max: 'max_env_humid', unit: '%' },
  { attribute: 'light_lux', min: 'min_light_lux', max: 'max_light_lux', unit: 'lux' },
  { attribute: 'soil_moisture_percent', min: 'min_soil_moist', max: 'max_soil_moist', unit: '%' },
  { attribute: 'soil_ec', min: 'min_soil_ec', max: 'max_soil_ec', unit: 'uS/cm' },
];

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseOpenPlantbookCareFacts(detail: unknown): CareFact[] {
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as Record<string, unknown>;
  const facts: CareFact[] = [];
  for (const f of RANGE_FIELDS) {
    const min = num(d[f.min]);
    const max = num(d[f.max]);
    if (min === null || max === null) continue;
    facts.push({
      attribute: f.attribute,
      valueMin: min,
      valueMax: max,
      valueUnit: f.unit,
      sourceId: 'openplantbook',
      trust: 'community_unverified',
    });
  }
  return facts;
}

interface OpenPlantbookCreds {
  clientId: string;
  secret: string;
}

/** OAuth client-credentials token, or null on failure. Exported so a batch
 *  loader fetches it once and reuses it across many species. */
export async function fetchOpenPlantbookToken(
  creds: OpenPlantbookCreds,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetcher(`${OPENPLANTBOOK_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.secret,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: unknown };
    return typeof json.access_token === 'string' ? json.access_token : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a species to OpenPlantbook care facts. Distinguishes failure from
 * absence so a batch loader never destroys good data on a flaky/rate-limited run:
 * returns `null` when a request *fails* (no token, non-ok response incl. HTTP 429,
 * or a network error) and `[]` only when the call *succeeds* but there is no exact
 * match or no indoor ranges. Pass a pre-fetched `token` to avoid re-authing across
 * a batch. Loaders must skip (not clear) a species when this returns `null`.
 */
export async function fetchOpenPlantbookFacts(
  scientificName: string,
  creds: OpenPlantbookCreds,
  fetcher: typeof fetch = fetch,
  token?: string,
): Promise<CareFact[] | null> {
  const access = token ?? (await fetchOpenPlantbookToken(creds, fetcher));
  if (!access) return null;
  const auth = { Authorization: `Bearer ${access}` };
  try {
    const searchRes = await fetcher(
      `${OPENPLANTBOOK_BASE}/plant/search?alias=${encodeURIComponent(scientificName)}`,
      { headers: auth },
    );
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as { results?: SearchResult[] };
    const pid = pickOpenPlantbookMatch(searchJson.results ?? [], scientificName);
    if (!pid) return []; // searched successfully, genuinely no exact match
    const detailRes = await fetcher(
      `${OPENPLANTBOOK_BASE}/plant/detail/${encodeURIComponent(pid)}/`,
      { headers: auth },
    );
    if (!detailRes.ok) return null;
    return parseOpenPlantbookCareFacts(await detailRes.json());
  } catch {
    return null;
  }
}
