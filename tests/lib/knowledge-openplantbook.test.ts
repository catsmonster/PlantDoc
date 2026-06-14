import { describe, expect, it } from 'vitest';
import {
  pickOpenPlantbookMatch,
  parseOpenPlantbookCareFacts,
  fetchOpenPlantbookToken,
  fetchOpenPlantbookFacts,
} from '../../src/lib/knowledge/openplantbook';

const CREDS = { clientId: 'a', secret: 'b' };

/** Fake fetch routing OpenPlantbook endpoints by URL substring. */
function opbFetcher(routes: { search?: () => Response; detail?: () => Response }): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/plant/search')) return routes.search?.() ?? new Response('', { status: 500 });
    if (u.includes('/plant/detail/')) return routes.detail?.() ?? new Response('', { status: 500 });
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('pickOpenPlantbookMatch', () => {
  it('returns the pid whose display_pid matches the scientific name (case-insensitive)', () => {
    const results = [
      { pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' },
      { pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa' },
    ];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBe('monstera deliciosa');
  });
  it('returns null when no result matches exactly (no fuzzy guess)', () => {
    const results = [{ pid: 'monstera friedrichsthalii', display_pid: 'Monstera friedrichsthalii' }];
    expect(pickOpenPlantbookMatch(results, 'Monstera deliciosa')).toBeNull();
  });
});

describe('parseOpenPlantbookCareFacts', () => {
  const DETAIL = {
    pid: 'monstera deliciosa',
    min_temp: 12,
    max_temp: 32,
    min_env_humid: 30,
    max_env_humid: 85,
    min_light_lux: 800,
    max_light_lux: 15000,
    min_soil_moist: 15,
    max_soil_moist: 60,
    min_soil_ec: 350,
    max_soil_ec: 2000,
  };
  it('emits community_unverified ranges for each present indoor metric, sourced to openplantbook', () => {
    const facts = parseOpenPlantbookCareFacts(DETAIL);
    const byAttr = new Map(facts.map((f) => [f.attribute, f]));
    expect(
      facts.every((f) => f.trust === 'community_unverified' && f.sourceId === 'openplantbook'),
    ).toBe(true);
    expect(byAttr.get('temperature_c')).toMatchObject({ valueMin: 12, valueMax: 32, valueUnit: 'C' });
    expect(byAttr.get('humidity_percent')).toMatchObject({ valueMin: 30, valueMax: 85, valueUnit: '%' });
    expect(byAttr.get('light_lux')).toMatchObject({ valueMin: 800, valueMax: 15000, valueUnit: 'lux' });
    expect(byAttr.get('soil_moisture_percent')).toMatchObject({ valueMin: 15, valueMax: 60 });
    expect(byAttr.get('soil_ec')).toMatchObject({ valueMin: 350, valueMax: 2000 });
  });
  it('skips a metric when either bound is missing or non-numeric', () => {
    const facts = parseOpenPlantbookCareFacts({ pid: 'x', min_temp: 12, max_temp: null });
    expect(facts.find((f) => f.attribute === 'temperature_c')).toBeUndefined();
  });
  it('returns [] for a malformed detail', () => {
    expect(parseOpenPlantbookCareFacts(null)).toEqual([]);
  });
});

describe('fetchOpenPlantbookToken', () => {
  it('returns the access_token from the token endpoint', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ access_token: 'tok123' }), { status: 200 })) as unknown as typeof fetch;
    const token = await fetchOpenPlantbookToken({ clientId: 'a', secret: 'b' }, fake);
    expect(token).toBe('tok123');
  });
  it('returns null on a non-ok response', async () => {
    const fake = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    expect(await fetchOpenPlantbookToken({ clientId: 'a', secret: 'b' }, fake)).toBeNull();
  });
});

describe('fetchOpenPlantbookFacts failure vs empty', () => {
  it('returns null (not []) when the search request fails, so a rate-limited run never clears good data', async () => {
    const fetcher = opbFetcher({ search: () => new Response('rate limited', { status: 429 }) });
    expect(await fetchOpenPlantbookFacts('Monstera deliciosa', CREDS, fetcher, 'tok')).toBeNull();
  });
  it('returns null when authentication yields no token', async () => {
    const fetcher = opbFetcher({}); // token path: no token provided, token endpoint not routed -> 500
    expect(await fetchOpenPlantbookFacts('Monstera deliciosa', CREDS, fetcher)).toBeNull();
  });
  it('returns [] (genuine no data) when search succeeds but nothing matches exactly', async () => {
    const fetcher = opbFetcher({ search: () => j({ results: [{ pid: 'other', display_pid: 'Other plant' }] }) });
    expect(await fetchOpenPlantbookFacts('Monstera deliciosa', CREDS, fetcher, 'tok')).toEqual([]);
  });
  it('returns null when the detail request fails after an exact match', async () => {
    const fetcher = opbFetcher({
      search: () => j({ results: [{ pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa' }] }),
      detail: () => new Response('', { status: 500 }),
    });
    expect(await fetchOpenPlantbookFacts('Monstera deliciosa', CREDS, fetcher, 'tok')).toBeNull();
  });
  it('returns facts on an exact match with a good detail response', async () => {
    const fetcher = opbFetcher({
      search: () => j({ results: [{ pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa' }] }),
      detail: () => j({ min_temp: 12, max_temp: 32 }),
    });
    const facts = await fetchOpenPlantbookFacts('Monstera deliciosa', CREDS, fetcher, 'tok');
    expect(facts).not.toBeNull();
    expect(facts!.find((f) => f.attribute === 'temperature_c')).toMatchObject({ valueMin: 12, valueMax: 32 });
  });
});
