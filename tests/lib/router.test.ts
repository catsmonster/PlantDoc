import { describe, expect, it } from 'vitest';
import { parseRoute, routeToPath, type Route } from '../../src/lib/router';

describe('parseRoute', () => {
  it('maps the root path to the plants dashboard', () => {
    expect(parseRoute('/')).toEqual({ name: 'plants' });
  });

  it('treats an empty path as the plants dashboard', () => {
    expect(parseRoute('')).toEqual({ name: 'plants' });
  });

  it('maps /locations to the locations screen', () => {
    expect(parseRoute('/locations')).toEqual({ name: 'locations' });
  });

  it('maps /plants/new to the add-plant form', () => {
    expect(parseRoute('/plants/new')).toEqual({ name: 'add-plant' });
  });

  it('maps /plants/:id to the plant detail screen', () => {
    expect(parseRoute('/plants/abc123')).toEqual({ name: 'plant', plantId: 'abc123' });
  });

  it('maps /plants/:id/edit to the edit-plant form', () => {
    expect(parseRoute('/plants/abc123/edit')).toEqual({ name: 'edit-plant', plantId: 'abc123' });
  });

  it('ignores a trailing slash', () => {
    expect(parseRoute('/plants/abc123/')).toEqual({ name: 'plant', plantId: 'abc123' });
  });

  it('decodes percent-encoded ids', () => {
    expect(parseRoute('/plants/a%20b')).toEqual({ name: 'plant', plantId: 'a b' });
  });

  it('falls back to the plants dashboard for unknown paths', () => {
    expect(parseRoute('/totally/unknown')).toEqual({ name: 'plants' });
  });
});

describe('routeToPath', () => {
  it('serializes the plants dashboard to the root path', () => {
    expect(routeToPath({ name: 'plants' })).toBe('/');
  });

  it('serializes the add-plant form', () => {
    expect(routeToPath({ name: 'add-plant' })).toBe('/plants/new');
  });

  it('serializes the plant detail screen', () => {
    expect(routeToPath({ name: 'plant', plantId: 'abc123' })).toBe('/plants/abc123');
  });

  it('serializes the edit-plant form', () => {
    expect(routeToPath({ name: 'edit-plant', plantId: 'abc123' })).toBe('/plants/abc123/edit');
  });

  it('serializes the locations screen', () => {
    expect(routeToPath({ name: 'locations' })).toBe('/locations');
  });

  it('encodes ids that contain unsafe characters', () => {
    expect(routeToPath({ name: 'plant', plantId: 'a b' })).toBe('/plants/a%20b');
  });
});

describe('parseRoute ∘ routeToPath round trip', () => {
  const routes: Route[] = [
    { name: 'plants' },
    { name: 'add-plant' },
    { name: 'plant', plantId: 'abc123' },
    { name: 'edit-plant', plantId: 'abc123' },
    { name: 'locations' },
  ];

  for (const route of routes) {
    it(`round-trips ${route.name}`, () => {
      expect(parseRoute(routeToPath(route))).toEqual(route);
    });
  }
});
