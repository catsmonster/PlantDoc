import { describe, expect, it } from 'vitest';
import { measurementSeries } from '../../src/lib/trends';
import type { Observation } from '../../src/lib/types';

/** Minimal measurement observation for series extraction. */
function obs(observedAt: string, height: number | null): Observation {
  return {
    observed_at: observedAt,
    observation_type: 'measurement',
    measurements: [{ height_cm: height } as never],
  } as unknown as Observation;
}

describe('measurementSeries', () => {
  it('extracts the picked metric as time-ordered points', () => {
    const series = measurementSeries(
      [obs('2026-01-03T00:00:00Z', 12), obs('2026-01-01T00:00:00Z', 10)],
      (m) => m.height_cm,
    );
    expect(series).toEqual([
      { t: Date.parse('2026-01-01T00:00:00Z'), value: 10 },
      { t: Date.parse('2026-01-03T00:00:00Z'), value: 12 },
    ]);
  });

  it('skips observations whose picked metric is null', () => {
    const series = measurementSeries(
      [obs('2026-01-01T00:00:00Z', 10), obs('2026-01-02T00:00:00Z', null), obs('2026-01-03T00:00:00Z', 14)],
      (m) => m.height_cm,
    );
    expect(series.map((p) => p.value)).toEqual([10, 14]);
  });

  it('skips observations that carry no measurement row', () => {
    const note = { observed_at: '2026-01-01T00:00:00Z', observation_type: 'note' } as unknown as Observation;
    expect(measurementSeries([note], (m) => m.height_cm)).toEqual([]);
  });
});
