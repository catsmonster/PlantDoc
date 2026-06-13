/**
 * Builds value-over-time series from a plant's measurement observations so the
 * detail screen can chart growth and health trends. Pure and unit-tested; the
 * SVG lives in ui/Sparkline and the layout in features/timeline/TrendsCard.
 */

import type { SparklinePoint } from './sparkline';
import type { Measurement, Observation } from './types';

type MeasurementPick = (m: Measurement) => number | null;

/** Time-ordered points for one measurement metric, dropping rows where the
 * metric was not recorded. */
export function measurementSeries(
  observations: Observation[],
  pick: MeasurementPick,
): SparklinePoint[] {
  const points: SparklinePoint[] = [];
  for (const obs of observations) {
    const measurement = obs.measurements?.[0];
    if (!measurement) continue;
    const value = pick(measurement);
    if (value == null) continue;
    points.push({ t: Date.parse(obs.observed_at), value });
  }
  return points.sort((a, b) => a.t - b.t);
}

export interface TrendMetric {
  key: string;
  label: string;
  pick: MeasurementPick;
  /** Format the latest value for the metric's summary label. */
  format: (value: number) => string;
}

/** The measurement metrics worth charting, in display order. Height formatting
 * is unit-aware and supplied by the caller. */
export function trendMetrics(formatHeight: (cm: number) => string): TrendMetric[] {
  return [
    { key: 'height', label: 'Height', pick: (m) => m.height_cm, format: formatHeight },
    { key: 'leaves', label: 'Leaves', pick: (m) => m.leaf_count, format: (v) => `${v}` },
    { key: 'health', label: 'Health', pick: (m) => m.health_score, format: (v) => `${v}/5` },
    {
      key: 'soil',
      label: 'Soil moisture',
      pick: (m) => m.soil_moisture_percent,
      format: (v) => `${v}%`,
    },
  ];
}
