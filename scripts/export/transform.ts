import { PUBLIC_EXPORT_FIELDS } from '../../appwrite/schema';

/**
 * Pure privacy transform: consented source observations -> public rows.
 * Everything that touches Appwrite lives in build.ts/publish.ts; this module
 * is the unit-tested boundary that decides what may become public.
 */

export interface SourceSpecies {
  $id: string;
  scientific_name: string;
}

export interface SourcePlant {
  $id: string;
  nickname?: string;
  acquired_on: string | null;
  species_text: string | null;
  species_id?: SourceSpecies | null;
}

export interface SourceTreatment {
  $id: string;
  treatment_type: string;
  amount_value?: number | null;
  amount_unit?: string | null;
  method?: string | null;
  product_name?: string | null;
}

export interface SourceMeasurement {
  $id: string;
  height_cm?: number | null;
  leaf_count?: number | null;
  soil_moisture_percent?: number | null;
  health_score?: number | null;
}

export interface SourcePhoto {
  $id: string;
  private_file_id?: string;
  allow_public_image?: boolean;
}

export interface SourceObservation {
  $id: string;
  user_id?: string;
  observed_at: string;
  observation_type: string;
  notes_private?: string | null;
  contribute_to_public_dataset: boolean;
  plant_id?: SourcePlant | null;
  treatments?: SourceTreatment[];
  measurements?: SourceMeasurement[];
  photos?: SourcePhoto[];
}

export type PublicRow = Record<string, string | number | null>;

export interface TransformOptions {
  datasetVersion: string;
  publishedAt: string;
}

const EXPORTABLE_TYPES = new Set(['treatment', 'measurement']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the public projection of a consented observation, null when the
 * observation type has no public payload yet (notes are private by policy;
 * photos wait for the sanitize pipeline). Throws on non-consented input so
 * callers can never publish by accident.
 */
export function toPublicRow(obs: SourceObservation, opts: TransformOptions): PublicRow | null {
  if (obs.contribute_to_public_dataset !== true) {
    throw new Error(`Observation ${obs.$id} has no public-dataset consent.`);
  }
  if (!EXPORTABLE_TYPES.has(obs.observation_type)) return null;

  const plant = obs.plant_id ?? null;
  const species = plant?.species_id ?? null;
  const treatment = obs.treatments?.[0] ?? null;
  const measurement = obs.measurements?.[0] ?? null;

  const observedMs = Date.parse(obs.observed_at);
  let plantAgeDays: number | null = null;
  if (plant?.acquired_on) {
    const age = Math.floor((observedMs - Date.parse(plant.acquired_on)) / DAY_MS);
    plantAgeDays = age >= 0 ? age : null;
  }

  // Full PUBLIC_EXPORT_FIELDS shape; fields without data stay null so every
  // export row has identical columns.
  const row: PublicRow = {
    source_observation_id: obs.$id,
    species_id: species?.$id ?? null,
    scientific_name: species?.scientific_name ?? plant?.species_text ?? null,
    observed_month: obs.observed_at.slice(0, 7),
    plant_age_days: plantAgeDays,
    observation_type: obs.observation_type,
    treatment_type: treatment?.treatment_type ?? null,
    amount_value: treatment?.amount_value ?? null,
    amount_unit: treatment?.amount_unit ?? null,
    height_cm: measurement?.height_cm ?? null,
    leaf_count: measurement?.leaf_count ?? null,
    soil_moisture_percent: measurement?.soil_moisture_percent ?? null,
    health_score: measurement?.health_score ?? null,
    // Location features land in Phase 3; precision is already the coarsest tier.
    country: null,
    region: null,
    climate_zone: null,
    geo_cell: null,
    geo_precision: 'country',
    environment_source: null,
    outdoor_temperature_c: null,
    relative_humidity_percent: null,
    light_lux: null,
    // Never expose a file id until a sanitized public derivative exists.
    public_file_id: null,
    dataset_version: opts.datasetVersion,
    published_at: opts.publishedAt,
  };
  return row;
}

function speciesKey(row: PublicRow): string {
  return String(row.scientific_name ?? row.species_id ?? 'unknown');
}

/**
 * Minimum-cohort geo coarsening (privacy.md): species x country x region
 * groups under `k` lose region; species x country groups under `k` lose
 * country too. Climate zone / geo cell are already coarse tiers.
 */
export function coarsenGeoCohorts(rows: PublicRow[], k: number): PublicRow[] {
  const regionCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.region != null) {
      const key = `${speciesKey(row)}|${row.country}|${row.region}`;
      regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1);
    }
  }
  const afterRegion = rows.map((row): PublicRow => {
    if (row.region == null) return { ...row };
    const key = `${speciesKey(row)}|${row.country}|${row.region}`;
    if ((regionCounts.get(key) ?? 0) >= k) return { ...row };
    return { ...row, region: null, geo_precision: 'country' };
  });
  for (const row of afterRegion) {
    if (row.country != null) {
      const key = `${speciesKey(row)}|${row.country}`;
      countryCounts.set(key, (countryCounts.get(key) ?? 0) + 1);
    }
  }
  return afterRegion.map((row): PublicRow => {
    if (row.country == null) return row;
    const key = `${speciesKey(row)}|${row.country}`;
    if ((countryCounts.get(key) ?? 0) >= k) return row;
    return { ...row, country: null, region: null, geo_precision: 'country' };
  });
}

export interface AggregateCell {
  scientific_name: string;
  observed_month: string;
  metric: string;
  n: number;
  mean: number;
}

const AGGREGATE_METRICS: { metric: string; value: (row: PublicRow) => number | null }[] = [
  {
    metric: 'watering_amount_ml',
    value: (r) =>
      r.treatment_type === 'watering' && r.amount_unit === 'ml' && typeof r.amount_value === 'number'
        ? r.amount_value
        : null,
  },
  { metric: 'height_cm', value: (r) => (typeof r.height_cm === 'number' ? r.height_cm : null) },
  { metric: 'leaf_count', value: (r) => (typeof r.leaf_count === 'number' ? r.leaf_count : null) },
  {
    metric: 'soil_moisture_percent',
    value: (r) => (typeof r.soil_moisture_percent === 'number' ? r.soil_moisture_percent : null),
  },
  {
    metric: 'health_score',
    value: (r) => (typeof r.health_score === 'number' ? r.health_score : null),
  },
];

/** Species x month x metric cells with mean + n; cells under `minCohort` are suppressed. */
export function buildAggregates(rows: PublicRow[], minCohort: number): AggregateCell[] {
  const cells = new Map<string, { name: string; month: string; metric: string; values: number[] }>();
  for (const row of rows) {
    const name = speciesKey(row);
    const month = String(row.observed_month);
    for (const { metric, value } of AGGREGATE_METRICS) {
      const v = value(row);
      if (v === null) continue;
      const key = `${name}|${month}|${metric}`;
      const cell = cells.get(key) ?? { name, month, metric, values: [] };
      cell.values.push(v);
      cells.set(key, cell);
    }
  }
  return [...cells.values()]
    .filter((c) => c.values.length >= minCohort)
    .map((c) => ({
      scientific_name: c.name,
      observed_month: c.month,
      metric: c.metric,
      n: c.values.length,
      mean: Math.round((c.values.reduce((a, b) => a + b, 0) / c.values.length) * 100) / 100,
    }));
}

function csvEscape(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: PublicRow[], fields: string[]): string {
  const lines = [fields.join(',')];
  for (const row of rows) {
    lines.push(fields.map((f) => csvEscape(row[f] ?? null)).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function toJsonl(rows: PublicRow[], fields: string[]): string {
  return rows
    .map((row) => JSON.stringify(Object.fromEntries(fields.map((f) => [f, row[f] ?? null]))))
    .join('\n') + '\n';
}

/** Next dataset version after the highest manifest-vN.json present in the bucket. */
export function nextVersion(existingFileNames: string[]): string {
  let max = 0;
  for (const name of existingFileNames) {
    const match = /^manifest-v(\d+)\.json$/.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `v${max + 1}`;
}

export { PUBLIC_EXPORT_FIELDS };
