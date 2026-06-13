/**
 * GBIF Backbone Taxonomy name resolution (roadmap Phase 4A). GBIF's match
 * endpoint is free, key-less, CORS-enabled, and commercial-use-OK under CC BY,
 * so it is safe to call directly from the browser for accepted-name lookup.
 *
 * Split into a URL builder and a response parser (pure, unit-testable) plus a
 * thin fetch wrapper, mirroring the gemini-preview module. We use GBIF only for
 * taxonomy — accepted scientific names and synonyms — never to infer care.
 */

import type { SpeciesSuggestion } from './species-suggest';

export const GBIF_SPECIES_MATCH_URL = 'https://api.gbif.org/v1/species/match';

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

export interface GbifMatch {
  scientificName: string;
  canonicalName: string;
  rank: string;
  /** GBIF taxonomic status, e.g. ACCEPTED or SYNONYM. */
  status: string;
  /** Stable GBIF backbone identifier. */
  usageKey: number;
  /** 0-100 confidence GBIF assigns to the match. */
  confidence: number;
  family: string | null;
  genus: string | null;
}

export function buildGbifMatchUrl(name: string): string {
  const params = new URLSearchParams({ name: name.trim(), strict: 'false' });
  return `${GBIF_SPECIES_MATCH_URL}?${params.toString()}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Parses a GBIF match response. Returns null when GBIF reports no usable match
 * (`matchType: "NONE"` or a missing usageKey) so callers fall back cleanly.
 */
export function parseGbifMatch(response: unknown): GbifMatch | null {
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;
  if (record.matchType === 'NONE') return null;
  const usageKey = record.usageKey;
  const scientificName = asString(record.scientificName);
  if (typeof usageKey !== 'number' || !scientificName) return null;
  return {
    scientificName,
    canonicalName: asString(record.canonicalName) ?? scientificName,
    rank: asString(record.rank) ?? 'UNKNOWN',
    status: asString(record.status) ?? 'UNKNOWN',
    usageKey,
    confidence: typeof record.confidence === 'number' ? record.confidence : 0,
    family: asString(record.family),
    genus: asString(record.genus),
  };
}

export interface GbifNameSummary {
  /** Canonical accepted name GBIF resolved to — the name worth adopting. */
  canonicalName: string;
  /** True when the canonical name differs from what the user typed (ignoring case/spacing). */
  differsFromQuery: boolean;
  /** Short human label for the taxonomic status, e.g. "Accepted name". */
  statusLabel: string;
  family: string | null;
  confidence: number;
  /** One-line summary for the UI, e.g. "Accepted name · Araceae · 97% match". */
  headline: string;
}

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Accepted name',
  SYNONYM: 'Synonym',
  DOUBTFUL: 'Doubtful match',
};

function normalizeName(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Shapes a raw GBIF match into the fields the onboarding UI shows: a canonical
 * name to adopt, whether it differs from the user's text, and a one-line
 * headline. Pure, so it is unit-tested without the network.
 */
export function summarizeGbifMatch(query: string, match: GbifMatch): GbifNameSummary {
  const statusLabel = STATUS_LABELS[match.status.toUpperCase()] ?? 'Matched name';
  const parts = [statusLabel];
  if (match.family) parts.push(match.family);
  if (match.confidence > 0) parts.push(`${match.confidence}% match`);
  return {
    canonicalName: match.canonicalName,
    differsFromQuery: normalizeName(match.canonicalName) !== normalizeName(query),
    statusLabel,
    family: match.family,
    confidence: match.confidence,
    headline: parts.join(' · '),
  };
}

/**
 * Resolves a free-text species string to a GBIF backbone match. Returns null on
 * network error or no match; never throws, so onboarding stays usable offline.
 */
export async function matchGbifSpecies(
  name: string,
  fetcher: typeof fetch = fetch,
): Promise<GbifMatch | null> {
  if (!name.trim()) return null;
  try {
    const response = await fetcher(buildGbifMatchUrl(name));
    if (!response.ok) return null;
    const json: unknown = await response.json();
    return parseGbifMatch(json);
  } catch {
    return null;
  }
}
