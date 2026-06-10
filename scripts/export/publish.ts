/**
 * Generates versioned open-data artifacts from public_observations and
 * uploads them to the open-data-exports bucket. Files stay admin-only unless
 * --publish is passed, which grants file-level public read (the "approval"
 * step from docs/privacy.md). Run via `npm run export:publish [-- --publish]`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { DATABASE_ID, PUBLIC_EXPORT_FIELDS } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { buildAggregates, nextVersion, toCsv, toJsonl, type PublicRow } from './transform';

const BUCKET = 'open-data-exports';
const PAGE = 100;
const MIN_COHORT = 5;
const LICENSE = 'CC BY 4.0 (draft — to be finalized before public launch)';

/** Every public field needs dictionary prose; publish fails if one is missing. */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  species_id: 'Catalog id of the species, when the plant is linked to the shared catalog.',
  scientific_name: 'Scientific name from the catalog, or the grower-entered species text.',
  observed_month: 'Observation date bucketed to calendar month (YYYY-MM).',
  plant_age_days: 'Days between plant acquisition and the observation, when known.',
  observation_type: 'Kind of observation: treatment or measurement.',
  treatment_type: 'Care action (watering, fertilizing, repotting, ...), when a treatment.',
  amount_value: 'Treatment amount in amount_unit, when recorded.',
  amount_unit: 'Unit for amount_value (currently ml).',
  height_cm: 'Plant height in centimeters, when measured.',
  leaf_count: 'Number of leaves, when counted.',
  soil_moisture_percent: 'Soil moisture percentage, when measured.',
  health_score: 'Grower-assessed health score (1-5 in the app; schema allows 1-10).',
  country: 'Coarse country, only when the species x country cohort is large enough.',
  region: 'Coarse region, only when the species x region cohort is large enough.',
  climate_zone: 'Köppen-style climate zone (Phase 3; currently empty).',
  geo_cell: 'Coarse geographic cell (Phase 3; currently empty).',
  geo_precision: 'Geographic precision tier of this row (country is the coarsest).',
  environment_source: 'Source of environment readings (Phase 3; currently empty).',
  outdoor_temperature_c: 'Outdoor temperature in °C (Phase 3; currently empty).',
  relative_humidity_percent: 'Relative humidity percent (Phase 3; currently empty).',
  light_lux: 'Light level in lux (Phase 3; currently empty).',
  public_file_id: 'Sanitized public image id, only with explicit image consent (not yet live).',
  dataset_version: 'Dataset version this row was published in.',
  published_at: 'Publication timestamp for this dataset version.',
};

function dataDictionary(version: string, generatedAt: string): string {
  const lines = [
    '# PlantDoc Open Dataset — Data Dictionary',
    '',
    `Latest version: ${version} (generated ${generatedAt})`,
    `License: ${LICENSE}`,
    '',
    'Every row derives from a single consented plant-care observation. Private',
    'data (identities, names, notes, exact dates, exact locations, original',
    'images) never enters this dataset; see docs/privacy.md in the source repo.',
    `Aggregate files suppress cells with fewer than ${MIN_COHORT} observations.`,
    '',
    '| Field | Description |',
    '| --- | --- |',
  ];
  for (const field of PUBLIC_EXPORT_FIELDS) {
    const description = FIELD_DESCRIPTIONS[field];
    if (!description) throw new Error(`Missing data-dictionary entry for field: ${field}`);
    lines.push(`| \`${field}\` | ${description} |`);
  }
  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const publish = process.argv.includes('--publish');
  const ctx = await createAdminContext();
  const generatedAt = new Date().toISOString();

  const rows: PublicRow[] = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await ctx.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: 'public_observations',
      queries,
    });
    rows.push(...(result.rows as unknown as PublicRow[]));
    if (result.rows.length < PAGE) break;
    cursor = result.rows[result.rows.length - 1].$id;
  }

  const existingFiles: { $id: string; name: string }[] = [];
  let fileCursor: string | null = null;
  for (;;) {
    const queries = [Query.limit(PAGE)];
    if (fileCursor) queries.push(Query.cursorAfter(fileCursor));
    const result = await ctx.storage.listFiles({ bucketId: BUCKET, queries });
    existingFiles.push(...result.files);
    if (result.files.length < PAGE) break;
    fileCursor = result.files[result.files.length - 1].$id;
  }

  const version = nextVersion(existingFiles.map((f) => f.name));
  const stamped = rows.map(
    (row): PublicRow => ({
      ...row,
      dataset_version: version,
      published_at: generatedAt,
    }),
  );
  const species = new Set(stamped.map((r) => r.scientific_name ?? r.species_id ?? 'unknown'));
  const months = [...new Set(stamped.map((r) => String(r.observed_month)))].sort();

  const csv = toCsv(stamped, PUBLIC_EXPORT_FIELDS);
  const jsonl = toJsonl(stamped, PUBLIC_EXPORT_FIELDS);
  const aggregates = JSON.stringify(
    { dataset_version: version, generated_at: generatedAt, min_cohort: MIN_COHORT, cells: buildAggregates(stamped, MIN_COHORT) },
    null,
    2,
  );
  const manifest = JSON.stringify(
    {
      dataset_version: version,
      generated_at: generatedAt,
      row_count: stamped.length,
      species_count: species.size,
      months_covered: months,
      fields: PUBLIC_EXPORT_FIELDS,
      min_cohort: MIN_COHORT,
      license: LICENSE,
      public: publish,
    },
    null,
    2,
  );
  const changelogEntry = [
    `## ${version} — ${generatedAt.slice(0, 10)}`,
    '',
    `- ${stamped.length} observations across ${species.size} species (${months[0] ?? 'n/a'} to ${months[months.length - 1] ?? 'n/a'}).`,
    '- Rows from deleted or consent-revoked observations are removed at build time and never re-published.',
    `- Files: plantdoc-observations-${version}.csv / .jsonl, aggregates-${version}.json, manifest-${version}.json.`,
    '',
  ].join('\n');

  let previousChangelog = '';
  const existingChangelog = existingFiles.find((f) => f.name === 'changelog.md');
  if (existingChangelog) {
    const buffer = await ctx.storage.getFileDownload({
      bucketId: BUCKET,
      fileId: existingChangelog.$id,
    });
    previousChangelog = Buffer.from(buffer).toString('utf8').replace(/^# [^\n]*\n+/, '');
  }
  const changelog = `# PlantDoc Open Dataset — Changelog\n\n${changelogEntry}${previousChangelog}`;
  const dictionary = dataDictionary(version, generatedAt);

  mkdirSync('exports', { recursive: true });
  const artifacts: { name: string; content: string; fixedId?: string }[] = [
    { name: `plantdoc-observations-${version}.csv`, content: csv },
    { name: `plantdoc-observations-${version}.jsonl`, content: jsonl },
    { name: `aggregates-${version}.json`, content: aggregates },
    { name: `manifest-${version}.json`, content: manifest },
    { name: 'data-dictionary.md', content: dictionary, fixedId: 'data-dictionary' },
    { name: 'changelog.md', content: changelog, fixedId: 'changelog' },
  ];

  const permissions = publish ? [Permission.read(Role.any())] : [];
  for (const artifact of artifacts) {
    writeFileSync(join('exports', artifact.name), artifact.content, 'utf8');
    if (artifact.fixedId) {
      const stale = existingFiles.find((f) => f.$id === artifact.fixedId);
      if (stale) await ctx.storage.deleteFile({ bucketId: BUCKET, fileId: artifact.fixedId });
    }
    await ctx.storage.createFile({
      bucketId: BUCKET,
      fileId: artifact.fixedId ?? ID.unique(),
      file: InputFile.fromPlainText(artifact.content, artifact.name),
      permissions,
    });
    console.log(`uploaded ${artifact.name}`);
  }

  console.log(
    `publish complete: ${version}, ${stamped.length} rows, ${species.size} species, ` +
      `${publish ? 'PUBLIC read granted' : 'admin-only (pass --publish to grant public read)'}`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
