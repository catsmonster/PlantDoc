import { describe, expect, it } from 'vitest';
import {
  buildWikidataSparqlUrl,
  parseWikidataCrossLinks,
  fetchWikidataCrossLinks,
} from '../../src/lib/knowledge/wikidata';

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const FIXTURE = {
  results: {
    bindings: [
      {
        item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q161205' },
        gbif: { type: 'literal', value: '2872152' },
        usda: { type: 'literal', value: 'MODE5' },
        powo: { type: 'literal', value: '85648-1' },
      },
    ],
  },
};

describe('buildWikidataSparqlUrl', () => {
  it('matches the taxon name (P225) and requests JSON', () => {
    const url = buildWikidataSparqlUrl('Monstera deliciosa');
    expect(url).toContain('query.wikidata.org/sparql');
    expect(url).toContain('format=json');
    expect(decodeURIComponent(url)).toContain('wdt:P225 "Monstera deliciosa"');
    expect(decodeURIComponent(url)).toContain('wdt:P846'); // GBIF id optional
  });

  it('escapes embedded quotes so the query stays well-formed', () => {
    const url = buildWikidataSparqlUrl('Some "weird" name');
    expect(decodeURIComponent(url)).toContain('Some \\"weird\\" name');
  });
});

describe('parseWikidataCrossLinks', () => {
  it('extracts the QID, entity URL, and each present external id with a resolved URL', () => {
    const links = parseWikidataCrossLinks(FIXTURE);
    expect(links.qid).toBe('Q161205');
    expect(links.entityUrl).toBe('https://www.wikidata.org/wiki/Q161205');
    const byKey = new Map(links.ids.map((i) => [i.sourceKey, i]));
    expect(byKey.get('gbif')!.externalId).toBe('2872152');
    expect(byKey.get('gbif')!.externalUrl).toBe('https://www.gbif.org/species/2872152');
    expect(byKey.get('usda')!.externalUrl).toBe('https://plants.usda.gov/plant-profile/MODE5');
    expect(byKey.get('powo')!.externalUrl).toBe('https://powo.science.kew.org/taxon/85648-1');
    expect(byKey.has('ipni')).toBe(false); // absent in fixture → no row
  });

  it('returns empty links for an empty result set', () => {
    const links = parseWikidataCrossLinks({ results: { bindings: [] } });
    expect(links.qid).toBeNull();
    expect(links.entityUrl).toBeNull();
    expect(links.ids).toEqual([]);
  });

  it('returns empty links for a malformed response', () => {
    expect(parseWikidataCrossLinks(null).ids).toEqual([]);
    expect(parseWikidataCrossLinks({}).qid).toBeNull();
  });
});

describe('fetchWikidataCrossLinks failure vs empty', () => {
  it('returns null (not empty links) when the request fails, so a re-run never clears good refs', async () => {
    const failed = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
    expect(await fetchWikidataCrossLinks('Monstera deliciosa', failed)).toBeNull();
    const threw = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchWikidataCrossLinks('Monstera deliciosa', threw)).toBeNull();
  });
  it('returns parsed links on success', async () => {
    const ok = (async () => j(FIXTURE)) as unknown as typeof fetch;
    const links = await fetchWikidataCrossLinks('Monstera deliciosa', ok);
    expect(links?.qid).toBe('Q161205');
  });
  it('returns an empty-but-non-null result when the query succeeds with no match', async () => {
    const ok = (async () => j({ results: { bindings: [] } })) as unknown as typeof fetch;
    const links = await fetchWikidataCrossLinks('Nonexistent plantus', ok);
    expect(links).not.toBeNull();
    expect(links!.qid).toBeNull();
    expect(links!.ids).toEqual([]);
  });
});
