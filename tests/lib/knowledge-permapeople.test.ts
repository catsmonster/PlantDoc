import { describe, expect, it } from 'vitest';
import {
  pickPermapeopleMatch,
  parsePermapeopleCultivationFacts,
  fetchPermapeopleFacts,
} from '../../src/lib/knowledge/permapeople';

const CREDS = { keyId: 'k', secret: 's' };

/** Fake fetch routing Permapeople endpoints by URL substring. */
function ppFetcher(routes: { search?: () => Response; detail?: () => Response }): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith('/search')) return routes.search?.() ?? new Response('', { status: 500 });
    if (u.includes('/plants/')) return routes.detail?.() ?? new Response('', { status: 500 });
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('pickPermapeopleMatch', () => {
  it('returns the id whose scientific_name matches exactly', () => {
    const plants = [
      { id: 1, scientific_name: 'Monstera adansonii' },
      { id: 5869, scientific_name: 'Monstera deliciosa' },
    ];
    expect(pickPermapeopleMatch(plants, 'Monstera deliciosa')).toBe(5869);
  });
  it('returns null without an exact match', () => {
    expect(
      pickPermapeopleMatch([{ id: 1, scientific_name: 'Monstera adansonii' }], 'Monstera deliciosa'),
    ).toBeNull();
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

describe('fetchPermapeopleFacts failure vs empty', () => {
  it('returns null (not []) when the search request fails, so a rate-limited run never clears good data', async () => {
    const fetcher = ppFetcher({ search: () => new Response('rate limited', { status: 429 }) });
    expect(await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher)).toBeNull();
  });
  it('returns [] (genuine no data) when search succeeds but nothing matches exactly', async () => {
    const fetcher = ppFetcher({ search: () => j({ plants: [{ id: 1, scientific_name: 'Other plant' }] }) });
    expect(await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher)).toEqual([]);
  });
  it('returns null when the detail request fails after an exact match', async () => {
    const fetcher = ppFetcher({
      search: () => j({ plants: [{ id: 42, scientific_name: 'Monstera deliciosa' }] }),
      detail: () => new Response('', { status: 500 }),
    });
    expect(await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher)).toBeNull();
  });
  it('returns facts on an exact match with a good detail response', async () => {
    const fetcher = ppFetcher({
      search: () => j({ plants: [{ id: 42, scientific_name: 'Monstera deliciosa' }] }),
      detail: () => j({ data: [{ key: 'Growth', value: 'Fast' }] }),
    });
    const facts = await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher);
    expect(facts).not.toBeNull();
    expect(facts!.find((f) => f.attribute === 'growth_rate')).toMatchObject({ valueText: 'Fast' });
  });
  it('returns null on a network throw', async () => {
    const fetcher = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher)).toBeNull();
  });
  it('returns null when a 200 response carries a malformed (non-JSON) body', async () => {
    const fetcher = ppFetcher({ search: () => new Response('not json', { status: 200 }) });
    expect(await fetchPermapeopleFacts('Monstera deliciosa', CREDS, fetcher)).toBeNull();
  });
});
