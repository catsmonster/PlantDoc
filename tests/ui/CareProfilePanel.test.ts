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
