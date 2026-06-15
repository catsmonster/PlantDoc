import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src', 'features', 'locations', 'LocationForm.tsx'),
  'utf8',
);

describe('LocationForm geocoding and sharing copy', () => {
  it('labels location_precision as a public sharing tier, not pin precision', () => {
    expect(source).toContain('Public sharing');
    expect(source).not.toContain('Location precision');
    expect(source).not.toContain('Exact (~1 km) — best weather accuracy');
  });

  it('discloses city/neighborhood search without encouraging street addresses', () => {
    expect(source).toContain('city, neighborhood, or municipality');
    expect(source).toContain('Do not enter a street address');
    expect(source).toContain('OpenStreetMap');
  });

  it('includes subregion/admin2 context in geocoder result labels', () => {
    expect(source).toContain('r.subregion');
  });
});
