/**
 * Deterministic per-plant care insights (Phase 4). Pure: computed entirely
 * from the timeline `getPlantWithTimeline` already loads — no reads, no
 * network. Every insight is a number the user can verify against their own
 * entries; nothing here is a model prediction.
 */

import { careProfileForPlant, type SpeciesCareProfile } from './knowledge/care-profiles';
import type { Observation, Plant } from './types';
import { formatHeight, type Units } from './units';

export type InsightSeverity = 'info' | 'suggestion' | 'warning';

export interface Insight {
  kind: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Number of timeline entries this insight was computed from. */
  evidenceCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WATERINGS = 3;
const OVERDUE_FACTOR = 1.5;
const MIN_TREND_POINTS = 3;
const MIN_TREND_SPAN_DAYS = 14;
/** Slopes per 30 days inside the dead-band read as stable, not a trend. */
const TREND_DEAD_BAND = 0.5;
const PEST_WINDOW_DAYS = 30;
const DRY_SOIL_PERCENT = 10;

function daysBetween(earlierMs: number, laterMs: number): number {
  return (laterMs - earlierMs) / DAY_MS;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Least-squares slope of value over time, scaled to change per 30 days. */
function slopePer30Days(points: { ms: number; value: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.ms, 0) / n;
  const meanY = points.reduce((s, p) => s + p.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.ms - meanX) * (p.value - meanY);
    den += (p.ms - meanX) ** 2;
  }
  if (den === 0) return 0;
  return (num / den) * 30 * DAY_MS;
}

interface Timeline {
  /** Ascending by observed_at. */
  observations: Observation[];
  wateringTimes: number[];
  treatmentTimes: Map<string, number[]>;
}

function buildTimeline(plant: Plant): Timeline {
  const observations = [...(plant.observations ?? [])].sort(
    (a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at),
  );
  const treatmentTimes = new Map<string, number[]>();
  for (const obs of observations) {
    for (const t of obs.treatments ?? []) {
      const list = treatmentTimes.get(t.treatment_type) ?? [];
      list.push(Date.parse(obs.observed_at));
      treatmentTimes.set(t.treatment_type, list);
    }
  }
  return { observations, wateringTimes: treatmentTimes.get('watering') ?? [], treatmentTimes };
}

function plural(n: number, unit: string): string {
  const rounded = Math.round(n);
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`;
}

interface WateringStatus {
  insight: Insight;
  due: boolean;
}

/** Reference cadence sentence from the starter care pack, when the species matches. */
function referenceCadenceHint(profile: SpeciesCareProfile | null): string {
  if (!profile) return '';
  const { min, max } = profile.waterCadenceDays.value;
  const range = min === max ? plural(min, 'day') : `${min}-${max} days`;
  return ` Typical for ${profile.scientificName} is about every ${range} (PlantDoc starter guide), but your plant's own rhythm wins.`;
}

function wateringInsight(
  timeline: Timeline,
  nowMs: number,
  careProfile: SpeciesCareProfile | null,
): WateringStatus | null {
  const times = timeline.wateringTimes;
  if (times.length === 0) return null;
  if (times.length < MIN_WATERINGS) {
    return {
      due: false,
      insight: {
        kind: 'watering_data',
        severity: 'info',
        title: 'Building a watering baseline',
        detail:
          `Log ${MIN_WATERINGS}+ waterings and PlantDoc can estimate this plant's cadence.` +
          referenceCadenceHint(careProfile),
        evidenceCount: times.length,
      },
    };
  }
  const intervals = times.slice(1).map((t, i) => daysBetween(times[i], t));
  const cadence = median(intervals);
  const sinceLast = daysBetween(times[times.length - 1], nowMs);
  const cadenceText = `Watering is typically every ${plural(cadence, 'day')}`;
  if (sinceLast >= cadence * OVERDUE_FACTOR) {
    return {
      due: true,
      insight: {
        kind: 'watering_overdue',
        severity: 'warning',
        title: 'Watering looks overdue',
        detail: `${cadenceText}; it has been ${plural(sinceLast, 'day')}. Worth checking the soil.`,
        evidenceCount: times.length,
      },
    };
  }
  if (sinceLast >= cadence) {
    return {
      due: true,
      insight: {
        kind: 'watering_due',
        severity: 'suggestion',
        title: 'Watering may be due',
        detail: `${cadenceText}; it has been ${plural(sinceLast, 'day')}. Worth checking the soil.`,
        evidenceCount: times.length,
      },
    };
  }
  return {
    due: false,
    insight: {
      kind: 'watering_ok',
      severity: 'info',
      title: 'Watering on cadence',
      detail: `${cadenceText}; last watered ${plural(sinceLast, 'day')} ago.`,
      evidenceCount: times.length,
    },
  };
}

interface MetricSeries {
  points: { ms: number; value: number }[];
}

function metricSeries(
  timeline: Timeline,
  pick: (m: NonNullable<Observation['measurements']>[number]) => number | null,
): MetricSeries {
  const points: { ms: number; value: number }[] = [];
  for (const obs of timeline.observations) {
    const value = obs.measurements?.[0] ? pick(obs.measurements[0]) : null;
    if (value != null) points.push({ ms: Date.parse(obs.observed_at), value });
  }
  return { points };
}

function trendInsight(
  series: MetricSeries,
  config: {
    kind: string;
    growingTitle: string;
    stableTitle: string;
    decliningTitle: string;
    decliningSeverity: InsightSeverity;
    format: (slope: number) => string;
  },
): Insight | null {
  const { points } = series;
  if (points.length < MIN_TREND_POINTS) return null;
  const spanDays = daysBetween(points[0].ms, points[points.length - 1].ms);
  if (spanDays < MIN_TREND_SPAN_DAYS) return null;
  const slope = slopePer30Days(points);
  if (Math.abs(slope) < TREND_DEAD_BAND) {
    return {
      kind: config.kind,
      severity: 'info',
      title: config.stableTitle,
      detail: `Holding steady over the last ${plural(spanDays, 'day')}.`,
      evidenceCount: points.length,
    };
  }
  if (slope > 0) {
    return {
      kind: config.kind,
      severity: 'info',
      title: config.growingTitle,
      detail: `${config.format(slope)} per 30 days over the last ${plural(spanDays, 'day')}.`,
      evidenceCount: points.length,
    };
  }
  return {
    kind: config.kind,
    severity: config.decliningSeverity,
    title: config.decliningTitle,
    detail: `${config.format(slope)} per 30 days over the last ${plural(spanDays, 'day')}.`,
    evidenceCount: points.length,
  };
}

function stressInsights(timeline: Timeline, nowMs: number, wateringDue: boolean): Insight[] {
  const out: Insight[] = [];

  const health = metricSeries(timeline, (m) => m.health_score);
  const latestHealth = health.points[health.points.length - 1];
  if (latestHealth && latestHealth.value <= 2) {
    out.push({
      kind: 'health_low',
      severity: 'warning',
      title: 'Health score is low',
      detail: `Latest health score is ${latestHealth.value}/5. Check light, water, and pests.`,
      evidenceCount: health.points.length,
    });
  } else if (
    health.points.length >= 2 &&
    latestHealth.value < health.points[health.points.length - 2].value
  ) {
    out.push({
      kind: 'health_drop',
      severity: 'warning',
      title: 'Health score dropped',
      detail: `Health went from ${health.points[health.points.length - 2].value}/5 to ${latestHealth.value}/5 between the last two check-ins.`,
      evidenceCount: health.points.length,
    });
  }

  const pest = metricSeries(timeline, (m) => m.pest_severity_score);
  const latestPest = pest.points[pest.points.length - 1];
  if (latestPest && latestPest.value >= 5) {
    out.push({
      kind: 'pest_severity',
      severity: 'warning',
      title: 'Pest severity is high',
      detail: `Latest pest severity is ${latestPest.value}/10. Consider isolating the plant while treating.`,
      evidenceCount: pest.points.length,
    });
  }

  const pestTreatments = (timeline.treatmentTimes.get('pest_control') ?? []).filter(
    (ms) => daysBetween(ms, nowMs) <= PEST_WINDOW_DAYS,
  );
  if (pestTreatments.length >= 2) {
    out.push({
      kind: 'pest_pressure',
      severity: 'warning',
      title: 'Recurring pest treatments',
      detail: `${pestTreatments.length} pest-control treatments in the last ${PEST_WINDOW_DAYS} days — the infestation may not be cleared yet.`,
      evidenceCount: pestTreatments.length,
    });
  }

  const moisture = metricSeries(timeline, (m) => m.soil_moisture_percent);
  const latestMoisture = moisture.points[moisture.points.length - 1];
  if (latestMoisture && latestMoisture.value < DRY_SOIL_PERCENT && wateringDue) {
    out.push({
      kind: 'soil_dry',
      severity: 'warning',
      title: 'Soil reads very dry',
      detail: `Latest soil moisture is ${latestMoisture.value}% and watering is past its usual cadence.`,
      evidenceCount: moisture.points.length,
    });
  }

  return out;
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { warning: 0, suggestion: 1, info: 2 };

export function plantInsights(plant: Plant, now: Date, units: Units): Insight[] {
  const timeline = buildTimeline(plant);
  if (timeline.observations.length === 0) return [];
  const nowMs = now.getTime();
  const out: Insight[] = [];

  const careProfile = careProfileForPlant(plant);
  const watering = wateringInsight(timeline, nowMs, careProfile);
  if (watering) out.push(watering.insight);

  const height = trendInsight(metricSeries(timeline, (m) => m.height_cm), {
    kind: 'growth_height',
    growingTitle: 'Growing taller',
    stableTitle: 'Height is stable',
    decliningTitle: 'Height is decreasing',
    decliningSeverity: 'info',
    format: (slope) => `${slope > 0 ? '+' : '−'}${formatHeight(Math.abs(slope), units)}`,
  });
  if (height) out.push(height);

  const leaves = trendInsight(metricSeries(timeline, (m) => m.leaf_count), {
    kind: 'growth_leaves',
    growingTitle: 'Putting out leaves',
    stableTitle: 'Leaf count is stable',
    decliningTitle: 'Losing leaves',
    decliningSeverity: 'warning',
    format: (slope) =>
      `${slope > 0 ? '+' : '−'}${Math.round(Math.abs(slope) * 10) / 10} leaves`,
  });
  if (leaves) out.push(leaves);

  out.push(...stressInsights(timeline, nowMs, watering?.due ?? false));

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function isPlantThirsty(plant: Plant, now: Date = new Date()): boolean {
  const timeline = buildTimeline(plant);
  const times = timeline.wateringTimes;
  if (times.length === 0) return false;
  const sinceLast = daysBetween(times[times.length - 1], now.getTime());
  if (times.length < MIN_WATERINGS) {
    // default baseline of 8 days if not enough data
    return sinceLast >= 8;
  }
  const intervals = times.slice(1).map((t, i) => daysBetween(times[i], t));
  const cadence = median(intervals);
  return sinceLast >= cadence;
}

export function isPlantThirstyFromSummary(plant: Plant, now: Date = new Date()): boolean {
  if (plant.status !== 'active') return false;
  if (!plant.last_watered_at) return false;

  const lastWateredMs = Date.parse(plant.last_watered_at);
  if (isNaN(lastWateredMs)) return false;

  const sinceLast = daysBetween(lastWateredMs, now.getTime());
  const count = plant.watering_count ?? 0;

  if (count < MIN_WATERINGS) {
    return sinceLast >= 8;
  }
  return sinceLast >= (plant.watering_cadence_days ?? 8);
}

export function getUpdatedWateringSummary(
  current: {
    last_watered_at?: string | null;
    watering_count?: number | null;
    watering_cadence_days?: number | null;
  },
  newWateringDate: string,
) {
  const currentCount = current.watering_count ?? 0;
  const newCount = currentCount + 1;

  let last_watered_at = current.last_watered_at || newWateringDate;
  if (current.last_watered_at && newWateringDate > current.last_watered_at) {
    last_watered_at = newWateringDate;
  }

  return {
    last_watered_at,
    watering_count: newCount,
    watering_cadence_days: current.watering_cadence_days ?? null,
  };
}

export function getUpdatedPhotoSummary(
  current: {
    latest_photo_file_id?: string | null;
    latest_photo_observed_at?: string | null;
  },
  newPhotoFileId: string,
  newPhotoObservedAt: string,
) {
  let latest_photo_file_id = current.latest_photo_file_id || newPhotoFileId;
  let latest_photo_observed_at = current.latest_photo_observed_at || newPhotoObservedAt;

  if (current.latest_photo_observed_at && newPhotoObservedAt > current.latest_photo_observed_at) {
    latest_photo_file_id = newPhotoFileId;
    latest_photo_observed_at = newPhotoObservedAt;
  }

  return {
    latest_photo_file_id,
    latest_photo_observed_at,
  };
}

