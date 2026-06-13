import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpeciesSuggestionRow } from '../../src/features/knowledge/SpeciesSuggestionRow';

const render = (suggestion: Parameters<typeof SpeciesSuggestionRow>[0]['suggestion']) =>
  renderToStaticMarkup(createElement(SpeciesSuggestionRow, { suggestion, isDark: true, onPick: () => {} }));

describe('SpeciesSuggestionRow', () => {
  it('renders the common name ahead of the italic scientific name, with the GBIF tag', () => {
    const html = render({ scientificName: 'Ocimum basilicum', commonName: 'Basil', speciesId: null, slug: null, via: 'gbif' });
    expect(html.indexOf('Basil')).toBeLessThan(html.indexOf('Ocimum basilicum'));
    expect(html).toContain('italic');
    expect(html).toContain('via GBIF');
  });
  it('shows the care-guide tag for curated rows', () => {
    const html = render({ scientificName: 'Monstera deliciosa', commonName: 'Swiss cheese plant', speciesId: null, slug: 'monstera-deliciosa' });
    expect(html).toContain('Care guide');
    expect(html).not.toContain('via GBIF');
  });
});
