import { describe, expect, it } from 'vitest';
import { buildSourceRows, buildFactRows, factNaturalKey } from '../../src/lib/knowledge/load-rows';
import { KNOWLEDGE_SOURCES } from '../../src/lib/knowledge/sources';

describe('buildSourceRows', () => {
  it('maps every registry source to an upsertable row with a stable source_key', () => {
    const rows = buildSourceRows();
    expect(rows.length).toBe(KNOWLEDGE_SOURCES.length);
    const editorial = rows.find((r) => r.source_key === 'plantdoc-editorial')!;
    expect(editorial.license).toBe('editorial');
    expect(editorial.commercial_ok).toBe(true);
    expect(editorial.quarantined).toBe(false);
  });

  it('flags share-alike licenses (CC-BY-SA, ODbL) as quarantined', () => {
    const rows = buildSourceRows();
    for (const row of rows) {
      const expected = row.license === 'CC-BY-SA' || row.license === 'ODbL';
      expect(row.quarantined, row.source_key).toBe(expected);
    }
  });
});

describe('buildFactRows', () => {
  it('emits one row per editorial fact, all tied to a known source_key', () => {
    const rows = buildFactRows();
    expect(rows.length).toBeGreaterThan(50);
    const keys = new Set(KNOWLEDGE_SOURCES.map((s) => s.id));
    expect(rows.every((r) => keys.has(r.source_key))).toBe(true);
    expect(rows.every((r) => r.species_slug.length > 0 && r.attribute.length > 0)).toBe(true);
  });

  it('natural key is stable and unique per (species, source, attribute, value)', () => {
    const rows = buildFactRows();
    const keys = rows.map(factNaturalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
