import { describe, expect, it } from 'vitest';
import { sparklineGeometry } from '../../src/lib/sparkline';

const box = { width: 100, height: 20, padding: 2 };

describe('sparklineGeometry', () => {
  it('returns null with fewer than two points (nothing to draw)', () => {
    expect(sparklineGeometry([], box)).toBeNull();
    expect(sparklineGeometry([{ t: 0, value: 5 }], box)).toBeNull();
  });

  it('maps an ascending series across the box, inverting y for SVG', () => {
    const geo = sparklineGeometry(
      [
        { t: 0, value: 0 },
        { t: 10, value: 10 },
      ],
      box,
    );
    // x spans [padding, width-padding]; the max value sits at the top (low y).
    expect(geo).toEqual({
      points: '2,18 98,2',
      last: { x: 98, y: 2 },
      min: 0,
      max: 10,
    });
  });

  it('scales intermediate points proportionally', () => {
    const geo = sparklineGeometry(
      [
        { t: 0, value: 0 },
        { t: 5, value: 5 },
        { t: 10, value: 0 },
      ],
      box,
    );
    expect(geo?.points).toBe('2,18 50,2 98,18');
  });

  it('draws a flat series down the vertical middle', () => {
    const geo = sparklineGeometry(
      [
        { t: 0, value: 5 },
        { t: 10, value: 5 },
      ],
      box,
    );
    expect(geo?.points).toBe('2,10 98,10');
    expect(geo?.min).toBe(5);
    expect(geo?.max).toBe(5);
  });

  it('spreads points evenly by index when all timestamps are equal', () => {
    const geo = sparklineGeometry(
      [
        { t: 5, value: 0 },
        { t: 5, value: 10 },
      ],
      box,
    );
    expect(geo?.points).toBe('2,18 98,2');
  });

  it('orders points by their position in the series, not by value', () => {
    const geo = sparklineGeometry(
      [
        { t: 0, value: 10 },
        { t: 10, value: 0 },
      ],
      box,
    );
    expect(geo?.points).toBe('2,2 98,18');
    expect(geo?.last).toEqual({ x: 98, y: 18 });
  });
});
