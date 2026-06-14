import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CareProfilePanel } from '../../src/features/knowledge/CareProfilePanel';
import type { SpeciesCareProfile } from '../../src/lib/knowledge/care-profiles';

const base: SpeciesCareProfile = {
  slug: 'monstera-deliciosa',
  scientificName: 'Monstera deliciosa',
  nameSourceId: 'powo',
  commonNames: [],
  synonyms: [],
  family: { value: 'Araceae', sourceId: 'powo' },
  light: { value: 'Bright indirect', sourceId: 'plantdoc-editorial' },
  waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: 'plantdoc-editorial' },
  comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: 'plantdoc-editorial' },
  humidity: { value: 'Average', sourceId: 'plantdoc-editorial' },
  toxicity: { value: 'Toxic to pets', sourceId: 'plantdoc-editorial' },
  commonStressSigns: { value: [], sourceId: 'plantdoc-editorial' },
  likelyPests: { value: [], sourceId: 'plantdoc-editorial' },
  communityRanges: [
    { attribute: 'light_lux', label: 'Light', min: 800, max: 15000, unit: 'lux', sourceId: 'openplantbook' },
    { attribute: 'humidity_percent', label: 'Humidity', min: 30, max: 85, unit: '%', sourceId: 'openplantbook' },
  ],
};

const render = (isDark: boolean) =>
  renderToStaticMarkup(createElement(CareProfilePanel, { profile: base, units: 'metric', isDark }));

describe('CareProfilePanel community ranges', () => {
  it.each([true, false])('renders the unverified community block with OpenPlantbook (isDark=%s)', (isDark) => {
    const html = render(isDark);
    expect(html.toLowerCase()).toContain('unverified');
    expect(html).toContain('800');
    expect(html).toContain('15000');
    expect(html).toContain('OpenPlantbook');
  });

  it('does not render the block when there are no community ranges', () => {
    const html = renderToStaticMarkup(
      createElement(CareProfilePanel, {
        profile: { ...base, communityRanges: undefined },
        units: 'metric',
        isDark: true,
      }),
    );
    expect(html.toLowerCase()).not.toContain('unverified');
  });
});

describe('CareProfilePanel omits absent facts', () => {
  // A mined-only species (like basil): no editorial text fields, no watering
  // cadence — composeCareProfile fills these with empty sentinels ('' / {0,0}).
  // The panel must skip those rows rather than render blank labels, a meaningless
  // "every 0 days", or attribute a source that backs nothing visible.
  const minedOnly: SpeciesCareProfile = {
    ...base,
    slug: 'ocimum-basilicum',
    scientificName: 'Ocimum basilicum',
    nameSourceId: 'powo',
    family: { value: '', sourceId: 'powo' },
    light: { value: '', sourceId: 'powo' },
    waterCadenceDays: { value: { min: 0, max: 0 }, sourceId: 'powo' },
    comfortableTemperatureC: { value: { min: 8, max: 32 }, sourceId: 'openplantbook' },
    humidity: { value: '', sourceId: 'powo' },
    toxicity: { value: '', sourceId: 'powo' },
    commonStressSigns: { value: [], sourceId: 'powo' },
    likelyPests: { value: [], sourceId: 'powo' },
    communityRanges: [
      { attribute: 'temperature_c', label: 'Temperature', min: 8, max: 32, unit: 'C', sourceId: 'openplantbook' },
    ],
    cultivationFacts: [
      { attribute: 'growth_rate', label: 'Growth', value: 'Fast', sourceId: 'permapeople' },
    ],
  };

  it.each([true, false])('skips blank rows and "every 0 days" (isDark=%s)', (isDark) => {
    const html = renderToStaticMarkup(
      createElement(CareProfilePanel, { profile: minedOnly, units: 'metric', isDark }),
    );
    expect(html).not.toContain('every 0 days');
    expect(html).not.toContain('Family');
    expect(html).not.toContain('Toxicity');
    expect(html).not.toContain('Likely pests');
    // The present sourced fact still renders, as do the mined blocks.
    expect(html).toContain('Comfortable temp');
    expect(html).toContain('Growth');
    expect(html).toContain('Fast');
  });

  it('does not attribute a source whose facts are all absent', () => {
    const html = renderToStaticMarkup(
      createElement(CareProfilePanel, { profile: minedOnly, units: 'metric', isDark: true }),
    );
    // No visible fact is POWO-sourced, so POWO must not appear in the footer.
    expect(html).not.toContain('Plants of the World Online');
  });

  it('still renders a populated editorial fact and its source', () => {
    const html = renderToStaticMarkup(
      createElement(CareProfilePanel, { profile: base, units: 'metric', isDark: true }),
    );
    expect(html).toContain('Araceae');
    expect(html).toContain('every 7-10 days');
  });
});

describe('CareProfilePanel cultivation block', () => {
  it.each([true, false])(
    'renders the Cultivation block with Permapeople CC-BY-SA attribution (isDark=%s)',
    (isDark) => {
      const profile: SpeciesCareProfile = {
        ...base,
        communityRanges: undefined,
        cultivationFacts: [
          { attribute: 'soil', label: 'Soil type', value: 'Light (sandy), Medium', sourceId: 'permapeople' },
          { attribute: 'growth_rate', label: 'Growth', value: 'Fast', sourceId: 'permapeople' },
        ],
      };
      const html = renderToStaticMarkup(
        createElement(CareProfilePanel, { profile, units: 'metric', isDark }),
      );
      expect(html).toContain('Cultivation');
      expect(html).toContain('Light (sandy), Medium');
      expect(html).toContain('Permapeople');
      expect(html).toContain('CC-BY-SA');
    },
  );
});
