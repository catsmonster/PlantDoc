import { describe, expect, it } from 'vitest';
import {
  pickPermapeopleMatch,
  parsePermapeopleCultivationFacts,
} from '../../src/lib/knowledge/permapeople';

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
