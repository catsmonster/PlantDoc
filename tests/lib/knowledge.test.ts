import { describe, expect, it, vi } from 'vitest';
import {
  CARE_PROFILES,
  careProfileForPlant,
  findCareProfile,
  searchCareProfiles,
  sourceOf,
  type SpeciesCareProfile,
  type Sourced,
} from '../../src/lib/knowledge/care-profiles';
import {
  KNOWLEDGE_SOURCES,
  commercialSources,
  getSource,
} from '../../src/lib/knowledge/sources';
import {
  buildGbifMatchUrl,
  matchGbifSpecies,
  parseGbifMatch,
  summarizeGbifMatch,
  type GbifMatch,
} from '../../src/lib/knowledge/gbif';

function allSourcedFields(profile: SpeciesCareProfile): Sourced<unknown>[] {
  return [
    profile.family,
    profile.light,
    profile.waterCadenceDays,
    profile.comfortableTemperatureC,
    profile.humidity,
    profile.toxicity,
    profile.commonStressSigns,
    profile.likelyPests,
  ];
}

describe('knowledge source registry', () => {
  it('gives every source a license, attribution, and commercial flag', () => {
    expect(KNOWLEDGE_SOURCES.length).toBeGreaterThan(0);
    for (const source of KNOWLEDGE_SOURCES) {
      expect(source.id).toBeTruthy();
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.attribution.trim().length).toBeGreaterThan(0);
      expect(typeof source.commercialOk).toBe('boolean');
    }
  });

  it('has unique source ids', () => {
    const ids = KNOWLEDGE_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes only commercial-safe sources via commercialSources()', () => {
    for (const source of commercialSources()) {
      expect(source.commercialOk).toBe(true);
    }
    // Every source currently bundled is commercial-safe by policy.
    expect(commercialSources().length).toBe(KNOWLEDGE_SOURCES.length);
  });
});

describe('starter care pack provenance', () => {
  it('ships 10 profiles with stable, unique slugs', () => {
    expect(CARE_PROFILES.length).toBe(10);
    const slugs = CARE_PROFILES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('binds every populated field to a registered source (no orphan provenance)', () => {
    for (const profile of CARE_PROFILES) {
      expect(getSource(profile.nameSourceId)).not.toBeNull();
      for (const field of allSourcedFields(profile)) {
        expect(sourceOf(field)).not.toBeNull();
      }
    }
  });

  it('keeps watering cadence ranges ordered and positive', () => {
    for (const profile of CARE_PROFILES) {
      const { min, max } = profile.waterCadenceDays.value;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
    }
  });
});

describe('care profile lookup and search', () => {
  it('matches by accepted name, synonym, and common name (case-insensitive)', () => {
    expect(findCareProfile('Monstera deliciosa')?.slug).toBe('monstera-deliciosa');
    expect(findCareProfile('philodendron pertusum')?.slug).toBe('monstera-deliciosa');
    expect(findCareProfile('swiss cheese plant')?.slug).toBe('monstera-deliciosa');
    // Snake plant moved genus; the old name must still resolve.
    expect(findCareProfile('Sansevieria trifasciata')?.slug).toBe('sansevieria-trifasciata');
  });

  it('returns null rather than guessing on an unknown species', () => {
    expect(findCareProfile('Quercus robur')).toBeNull();
    expect(findCareProfile('')).toBeNull();
    expect(findCareProfile(null)).toBeNull();
  });

  it('ranks exact matches ahead of substring matches', () => {
    const results = searchCareProfiles('pothos');
    expect(results[0]?.slug).toBe('epipremnum-aureum');
    expect(searchCareProfiles('xyzzy')).toEqual([]);
  });

  it('resolves a profile from a plant by its hydrated species relation', () => {
    const profile = careProfileForPlant({
      species_id: { scientific_name: 'Epipremnum aureum', common_names: [] },
      species_text: null,
      common_name: null,
    });
    expect(profile?.slug).toBe('epipremnum-aureum');
  });

  it('falls back to free-text species when no relation is hydrated', () => {
    const profile = careProfileForPlant({
      species_id: null,
      species_text: 'Peace lily',
      common_name: null,
    });
    expect(profile?.slug).toBe('spathiphyllum-wallisii');
  });
});

describe('GBIF taxonomy resolution', () => {
  it('builds a non-strict match URL', () => {
    const url = buildGbifMatchUrl('Monstera deliciosa');
    expect(url).toContain('https://api.gbif.org/v1/species/match');
    expect(url).toContain('name=Monstera+deliciosa');
    expect(url).toContain('strict=false');
  });

  it('parses an accepted match and ignores a NONE result', () => {
    const match = parseGbifMatch({
      usageKey: 2868095,
      scientificName: 'Monstera deliciosa Liebm.',
      canonicalName: 'Monstera deliciosa',
      rank: 'SPECIES',
      status: 'ACCEPTED',
      confidence: 97,
      family: 'Araceae',
      genus: 'Monstera',
      matchType: 'EXACT',
    });
    expect(match).toMatchObject({
      usageKey: 2868095,
      canonicalName: 'Monstera deliciosa',
      family: 'Araceae',
    });
    expect(parseGbifMatch({ matchType: 'NONE', confidence: 0 })).toBeNull();
    expect(parseGbifMatch({ scientificName: 'No key' })).toBeNull();
  });

  it('returns null on a failed fetch instead of throwing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    await expect(matchGbifSpecies('Monstera deliciosa', fetcher)).resolves.toBeNull();
  });

  it('resolves a live-shaped response through the fetch wrapper', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          usageKey: 2868095,
          scientificName: 'Monstera deliciosa Liebm.',
          canonicalName: 'Monstera deliciosa',
          rank: 'SPECIES',
          status: 'ACCEPTED',
          confidence: 97,
          matchType: 'EXACT',
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const match = await matchGbifSpecies('Monstera deliciosa', fetcher);
    expect(match?.usageKey).toBe(2868095);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toContain('strict=false');
  });
});

describe('GBIF match summary for onboarding display', () => {
  const accepted: GbifMatch = {
    scientificName: 'Monstera deliciosa Liebm.',
    canonicalName: 'Monstera deliciosa',
    rank: 'SPECIES',
    status: 'ACCEPTED',
    usageKey: 2868095,
    confidence: 97,
    family: 'Araceae',
    genus: 'Monstera',
  };

  it('summarizes an accepted match with a human headline and the canonical name', () => {
    const summary = summarizeGbifMatch('monstera deliciosa', accepted);
    expect(summary.canonicalName).toBe('Monstera deliciosa');
    expect(summary.statusLabel).toBe('Accepted name');
    expect(summary.family).toBe('Araceae');
    expect(summary.headline).toBe('Accepted name · Araceae · 97% match');
  });

  it('flags when the canonical name differs from what the user typed (so we can offer to adopt it)', () => {
    // User typed a legacy synonym; GBIF resolves to the current accepted name.
    const synonym: GbifMatch = {
      ...accepted,
      scientificName: 'Dracaena trifasciata (Prain) Mabb.',
      canonicalName: 'Dracaena trifasciata',
      status: 'SYNONYM',
      family: 'Asparagaceae',
    };
    const differs = summarizeGbifMatch('Sansevieria trifasciata', synonym);
    expect(differs.differsFromQuery).toBe(true);
    expect(differs.statusLabel).toBe('Synonym');

    // Same name (ignoring case/whitespace) → nothing to adopt.
    const same = summarizeGbifMatch('  monstera   deliciosa ', accepted);
    expect(same.differsFromQuery).toBe(false);
  });

  it('omits missing family and zero confidence from the headline', () => {
    const sparse: GbifMatch = {
      ...accepted,
      status: 'DOUBTFUL',
      family: null,
      confidence: 0,
    };
    const summary = summarizeGbifMatch('mystery plant', sparse);
    expect(summary.headline).toBe('Doubtful match');
    expect(summary.family).toBeNull();
  });
});
