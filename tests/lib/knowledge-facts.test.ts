import { describe, expect, it } from 'vitest';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import {
  editorialProfileToFacts,
  composeCareProfile,
  careFactsFromSpeciesRow,
  type CareFact,
} from '../../src/lib/knowledge/facts';

const monstera = CARE_PROFILES.find((p) => p.slug === 'monstera-deliciosa')!;

describe('editorialProfileToFacts', () => {
  it('emits one fact per care field, each carrying the profile sourceId', () => {
    const facts = editorialProfileToFacts(monstera);
    const attrs = facts.map((f) => f.attribute);
    expect(attrs).toContain('light');
    expect(attrs).toContain('water_cadence_days');
    expect(attrs).toContain('temperature_c');
    expect(attrs).toContain('toxicity');
    // list fields explode to one row each
    expect(facts.filter((f) => f.attribute === 'pest').length).toBe(monstera.likelyPests.value.length);
    // every fact has a source
    expect(facts.every((f) => f.sourceId.length > 0)).toBe(true);
    // ranges land in value_min/value_max
    const water = facts.find((f) => f.attribute === 'water_cadence_days')!;
    expect(water.valueMin).toBe(7);
    expect(water.valueMax).toBe(10);
  });
});

describe('composeCareProfile', () => {
  it('round-trips editorial facts back into the SpeciesCareProfile shape', () => {
    const facts = editorialProfileToFacts(monstera);
    const profile = composeCareProfile(monstera.scientificName, facts, {
      slug: monstera.slug,
      commonNames: monstera.commonNames,
      synonyms: monstera.synonyms,
      nameSourceId: monstera.nameSourceId,
    });
    expect(profile).not.toBeNull();
    expect(profile!.light.value).toBe(monstera.light.value);
    expect(profile!.waterCadenceDays.value).toEqual(monstera.waterCadenceDays.value);
    expect(profile!.likelyPests.value).toEqual(monstera.likelyPests.value);
    expect(profile!.toxicity.sourceId).toBe(monstera.toxicity.sourceId);
  });

  it('prefers sourced > editorial > community_unverified on conflict', () => {
    const facts: CareFact[] = [
      { attribute: 'humidity', valueText: 'Editorial humidity', sourceId: 'plantdoc-editorial', trust: 'editorial' },
      { attribute: 'humidity', valueText: 'Verified humidity', sourceId: 'powo', trust: 'sourced' },
      { attribute: 'humidity', valueText: 'Crowd humidity', sourceId: 'openplantbook', trust: 'community_unverified' },
    ];
    const profile = composeCareProfile('Test sp.', facts, {
      slug: 'test', commonNames: [], synonyms: [], nameSourceId: 'powo',
    });
    expect(profile!.humidity.value).toBe('Verified humidity');
    expect(profile!.humidity.sourceId).toBe('powo');
  });

  it('returns null when there are no facts', () => {
    expect(
      composeCareProfile('Empty sp.', [], { slug: 'e', commonNames: [], synonyms: [], nameSourceId: 'powo' }),
    ).toBeNull();
  });

  it('exposes cultivation text facts (e.g. Permapeople) as cultivationFacts with labels + source', () => {
    const facts: CareFact[] = [
      { attribute: 'family', valueText: 'Araceae', sourceId: 'powo', trust: 'sourced' },
      { attribute: 'soil', valueText: 'Light (sandy), Medium', sourceId: 'permapeople', trust: 'sourced' },
      { attribute: 'growth_rate', valueText: 'Fast', sourceId: 'permapeople', trust: 'sourced' },
      { attribute: 'edibility', valueText: 'Fruit', sourceId: 'permapeople', trust: 'sourced' },
    ];
    const profile = composeCareProfile('Monstera deliciosa', facts, {
      slug: 'm', commonNames: [], synonyms: [], nameSourceId: 'powo',
    })!;
    const cult = profile.cultivationFacts ?? [];
    const byAttr = new Map(cult.map((c) => [c.attribute, c]));
    expect(byAttr.get('soil')).toMatchObject({ label: 'Soil type', value: 'Light (sandy), Medium', sourceId: 'permapeople' });
    expect(byAttr.get('growth_rate')).toMatchObject({ label: 'Growth', value: 'Fast' });
    expect(cult.map((c) => c.attribute)).not.toContain('family'); // primary fields stay out of the block
  });

  it('exposes community_unverified indoor ranges as communityRanges, separate from sourced fields', () => {
    const facts: CareFact[] = [
      { attribute: 'family', valueText: 'Araceae', sourceId: 'powo', trust: 'sourced' },
      { attribute: 'temperature_c', valueMin: 18, valueMax: 27, valueUnit: 'C', sourceId: 'plantdoc-editorial', trust: 'editorial' },
      { attribute: 'temperature_c', valueMin: 12, valueMax: 32, valueUnit: 'C', sourceId: 'openplantbook', trust: 'community_unverified' },
      { attribute: 'light_lux', valueMin: 800, valueMax: 15000, valueUnit: 'lux', sourceId: 'openplantbook', trust: 'community_unverified' },
    ];
    const profile = composeCareProfile('Monstera deliciosa', facts, {
      slug: 'monstera-deliciosa', commonNames: [], synonyms: [], nameSourceId: 'powo',
    })!;
    // Sourced/editorial precedence is unchanged: editorial temp still wins the primary field.
    expect(profile.comfortableTemperatureC.value).toEqual({ min: 18, max: 27 });
    const ranges = profile.communityRanges ?? [];
    const byAttr = new Map(ranges.map((r) => [r.attribute, r]));
    expect(byAttr.get('light_lux')).toMatchObject({ label: 'Light', min: 800, max: 15000, sourceId: 'openplantbook' });
    expect(byAttr.get('temperature_c')).toMatchObject({ min: 12, max: 32 });
    expect(ranges.every((r) => r.sourceId === 'openplantbook')).toBe(true);
  });
});

describe('careFactsFromSpeciesRow', () => {
  it('maps an Appwrite species row with hydrated care_facts into CareFact[]', () => {
    const row = {
      care_facts: [
        { attribute: 'light', value_text: 'Bright indirect', value_min: null, value_max: null, value_unit: null, trust: 'editorial' as const, source_id: 's1' },
        { attribute: 'water_cadence_days', value_text: null, value_min: 7, value_max: 10, value_unit: 'days', trust: 'editorial' as const, source_id: 's1' },
      ],
    };
    const facts = careFactsFromSpeciesRow(row, (id) => (id === 's1' ? 'plantdoc-editorial' : id));
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ attribute: 'light', valueText: 'Bright indirect', sourceId: 'plantdoc-editorial' });
    expect(facts[1]).toMatchObject({ attribute: 'water_cadence_days', valueMin: 7, valueMax: 10 });
  });
});
