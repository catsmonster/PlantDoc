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

/** The index row's common names: the curator's everyday name first (always kept,
 *  since GBIF often omits the colloquial word), then English vernaculars, deduped
 *  case-insensitively and capped at 5. */
export function commonNamesFor(curated: string, vernaculars: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [curated, ...vernaculars]) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length === 5) break;
  }
  return out;
}
