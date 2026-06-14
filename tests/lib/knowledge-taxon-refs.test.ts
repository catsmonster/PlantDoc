import { describe, expect, it } from 'vitest';
import { buildTaxonRefRows, taxonRefNaturalKey } from '../../src/lib/knowledge/taxon-refs';
import type { WikidataCrossLinks } from '../../src/lib/knowledge/wikidata';

const WD: WikidataCrossLinks = {
  qid: 'Q161205',
  entityUrl: 'https://www.wikidata.org/wiki/Q161205',
  ids: [
    { sourceKey: 'gbif', externalId: '2872152', externalUrl: 'https://www.gbif.org/species/2872152' },
    { sourceKey: 'usda', externalId: 'MODE5', externalUrl: 'https://plants.usda.gov/plant-profile/MODE5' },
  ],
};

describe('buildTaxonRefRows', () => {
  it('emits a wikidata QID row plus each cross-link, all tied to the slug', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, null);
    const byKey = new Map(rows.map((r) => [r.source_key, r]));
    expect(byKey.get('wikidata')!.external_id).toBe('Q161205');
    expect(byKey.get('wikidata')!.external_url).toBe('https://www.wikidata.org/wiki/Q161205');
    expect(byKey.get('gbif')!.external_id).toBe('2872152');
    expect(byKey.get('usda')!.external_id).toBe('MODE5');
    expect(rows.every((r) => r.species_slug === 'monstera-deliciosa')).toBe(true);
  });

  it('prefers the authoritative GBIF match usageKey over Wikidata P846 (deduped by source)', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, 5407241);
    const gbif = rows.filter((r) => r.source_key === 'gbif');
    expect(gbif.length).toBe(1);
    expect(gbif[0].external_id).toBe('5407241');
  });

  it('omits the wikidata row when there is no QID', () => {
    const rows = buildTaxonRefRows('x', { qid: null, entityUrl: null, ids: [] }, null);
    expect(rows).toEqual([]);
  });

  it('natural key is unique per (species, source)', () => {
    const rows = buildTaxonRefRows('monstera-deliciosa', WD, 5407241);
    const keys = rows.map(taxonRefNaturalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
