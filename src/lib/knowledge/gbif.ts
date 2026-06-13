/**
 * GBIF Backbone Taxonomy name resolution (roadmap Phase 4A). GBIF's match
 * endpoint is free, key-less, CORS-enabled, and commercial-use-OK under CC BY,
 * so it is safe to call directly from the browser for accepted-name lookup.
 *
 * Split into a URL builder and a response parser (pure, unit-testable) plus a
 * thin fetch wrapper, mirroring the gemini-preview module. We use GBIF only for
 * taxonomy — accepted scientific names and synonyms — never to infer care.
 */

export const GBIF_SPECIES_MATCH_URL = 'https://api.gbif.org/v1/species/match';

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
