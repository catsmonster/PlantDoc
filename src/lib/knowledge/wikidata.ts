/**
 * Wikidata cross-link extractor (roadmap Phase 4A, slice 2). Resolves a taxon
 * name (P225) to its QID and its stable IDs in other catalogs (GBIF, USDA,
 * POWO, IPNI, EOL). Wikidata is CC0, so cross-links cited from here carry no
 * share-alike obligation. Pure SPARQL-URL builder + response parser (unit
 * tested) plus a non-throwing fetch wrapper, mirroring gbif.ts. Admin-script
 * use only (sets a User-Agent), never called from the browser.
 */

export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';

/** Each Wikidata external-id property we map to a cross-link source catalog. */
export const CROSS_LINK_PROPERTIES: readonly {
  sourceKey: string;
  property: string;
  url: (id: string) => string;
}[] = [
  { sourceKey: 'gbif', property: 'P846', url: (id) => `https://www.gbif.org/species/${id}` },
  { sourceKey: 'usda', property: 'P1772', url: (id) => `https://plants.usda.gov/plant-profile/${id}` },
  { sourceKey: 'powo', property: 'P5037', url: (id) => `https://powo.science.kew.org/taxon/${id}` },
  { sourceKey: 'ipni', property: 'P961', url: (id) => `https://www.ipni.org/n/${id}` },
  { sourceKey: 'eol', property: 'P830', url: (id) => `https://eol.org/pages/${id}` },
];

export interface CrossLinkId {
  sourceKey: string;
  externalId: string;
  externalUrl: string;
}

export interface WikidataCrossLinks {
  qid: string | null;
  entityUrl: string | null;
  ids: CrossLinkId[];
}

function escapeSparqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildWikidataSparqlUrl(scientificName: string): string {
  const optionals = CROSS_LINK_PROPERTIES.map(
    (p) => `OPTIONAL { ?item wdt:${p.property} ?${p.sourceKey}. }`,
  ).join(' ');
  const vars = CROSS_LINK_PROPERTIES.map((p) => `?${p.sourceKey}`).join(' ');
  const query =
    `SELECT ?item ${vars} WHERE { ` +
    `?item wdt:P225 "${escapeSparqlString(scientificName.trim())}". ${optionals} } LIMIT 1`;
  return `${WIKIDATA_SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
}

function literal(binding: Record<string, unknown>, key: string): string | null {
  const cell = binding[key];
  if (cell && typeof cell === 'object' && typeof (cell as { value?: unknown }).value === 'string') {
    const v = (cell as { value: string }).value.trim();
    return v || null;
  }
  return null;
}

export function parseWikidataCrossLinks(response: unknown): WikidataCrossLinks {
  const empty: WikidataCrossLinks = { qid: null, entityUrl: null, ids: [] };
  if (!response || typeof response !== 'object') return empty;
  const bindings = (response as { results?: { bindings?: unknown } }).results?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) return empty;
  const binding = bindings[0] as Record<string, unknown>;
  const itemUri = literal(binding, 'item');
  const qid = itemUri ? (itemUri.split('/').pop() ?? null) : null;
  const ids: CrossLinkId[] = [];
  for (const p of CROSS_LINK_PROPERTIES) {
    const value = literal(binding, p.sourceKey);
    if (value) ids.push({ sourceKey: p.sourceKey, externalId: value, externalUrl: p.url(value) });
  }
  return {
    qid,
    entityUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
    ids,
  };
}

/** Non-throwing live lookup. Returns empty links on network error or no match. */
export async function fetchWikidataCrossLinks(
  scientificName: string,
  fetcher: typeof fetch = fetch,
): Promise<WikidataCrossLinks> {
  if (!scientificName.trim()) return { qid: null, entityUrl: null, ids: [] };
  try {
    const response = await fetcher(buildWikidataSparqlUrl(scientificName), {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'PlantDoc/1.0 (open knowledge mining; +https://plantdoc.galvando.com)',
      },
    });
    if (!response.ok) return { qid: null, entityUrl: null, ids: [] };
    const json: unknown = await response.json();
    return parseWikidataCrossLinks(json);
  } catch {
    return { qid: null, entityUrl: null, ids: [] };
  }
}
