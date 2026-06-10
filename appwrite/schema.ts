/**
 * Declarative Appwrite schema for PlantDoc Phase 0.
 *
 * Single source of truth consumed by scripts/appwrite/setup.ts and the
 * local validation tests. Pure data: no SDK imports, so tests never need
 * network access or credentials.
 *
 * Conventions (see docs/schema.md and docs/superpowers/plans/2026-06-09-phase-0-foundation.md):
 * - Built-in $createdAt/$updatedAt replace custom created_at/updated_at columns.
 * - Entity links use native TablesDB relationships; user_id stays a plain
 *   string because Auth users are not TablesDB rows.
 * - Appwrite forbids defaults on required columns, so "required with default"
 *   fields from the docs are optional-with-default here.
 * - public_observations is a derived staging table: plain columns only, no
 *   relationships, no private fields.
 */

/** Permission DSL kept SDK-free: 'action:role' or 'action:user:<id>'. */
export type Perm = string;

interface ColumnBase {
  key: string;
  required?: boolean;
  array?: boolean;
}

export type ColumnDef =
  | (ColumnBase & { kind: 'varchar'; size: number; default?: string })
  | (ColumnBase & { kind: 'text'; default?: string })
  | (ColumnBase & { kind: 'integer'; min?: number; max?: number; default?: number })
  | (ColumnBase & { kind: 'float'; min?: number; max?: number; default?: number })
  | (ColumnBase & { kind: 'boolean'; default?: boolean })
  | (ColumnBase & { kind: 'datetime'; default?: string })
  | (ColumnBase & { kind: 'enum'; elements: string[]; default?: string })
  | (ColumnBase & { kind: 'point' })
  | (ColumnBase & {
      kind: 'relationship';
      relatedTableId: string;
      relationType: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
      twoWay: boolean;
      twoWayKey?: string;
      onDelete: 'cascade' | 'setNull' | 'restrict';
    });

export interface IndexDef {
  key: string;
  type: 'key' | 'unique' | 'fulltext';
  columns: string[];
}

export interface TableDef {
  id: string;
  name: string;
  permissions: Perm[];
  rowSecurity: boolean;
  columns: ColumnDef[];
  indexes: IndexDef[];
}

export interface BucketDef {
  id: string;
  name: string;
  permissions: Perm[];
  fileSecurity: boolean;
  maximumFileSize: number;
  allowedFileExtensions: string[];
  compression: 'none' | 'gzip' | 'zstd';
  encryption: boolean;
  antivirus: boolean;
}

export const DATABASE_ID = 'plantdoc_main';
export const DATABASE_NAME = 'PlantDoc Main';

const MB = 1024 * 1024;

const userId: ColumnDef = { kind: 'varchar', key: 'user_id', size: 64, required: true };
const notesPrivate: ColumnDef = { kind: 'text', key: 'notes_private' };

export const TABLES: TableDef[] = [
  {
    id: 'profiles',
    name: 'Profiles',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      { kind: 'varchar', key: 'display_name', size: 128 },
      { kind: 'enum', key: 'preferred_units', elements: ['metric', 'imperial'], default: 'metric' },
      { kind: 'boolean', key: 'public_contribution_default', default: false },
    ],
    indexes: [{ key: 'idx_user_id', type: 'unique', columns: ['user_id'] }],
  },
  {
    id: 'user_locations',
    name: 'User Locations',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      { kind: 'varchar', key: 'label', size: 128 },
      { kind: 'varchar', key: 'country', size: 64 },
      { kind: 'varchar', key: 'region', size: 128 },
      { kind: 'varchar', key: 'city', size: 128 },
      { kind: 'varchar', key: 'postal_code_prefix', size: 16 },
      { kind: 'point', key: 'location' },
      {
        kind: 'enum',
        key: 'location_precision',
        elements: ['exact', 'local', 'regional', 'climate', 'country'],
        required: true,
      },
      { kind: 'varchar', key: 'climate_zone', size: 32 },
    ],
    indexes: [{ key: 'idx_user_id', type: 'key', columns: ['user_id'] }],
  },
  {
    id: 'species',
    name: 'Species',
    permissions: ['read:users'],
    rowSecurity: false,
    columns: [
      { kind: 'varchar', key: 'scientific_name', size: 255, required: true },
      { kind: 'varchar', key: 'common_names', size: 128, array: true },
      { kind: 'varchar', key: 'family', size: 128 },
      { kind: 'varchar', key: 'genus', size: 128 },
      { kind: 'varchar', key: 'cultivar', size: 128 },
      { kind: 'varchar', key: 'external_taxon_id', size: 128 },
    ],
    indexes: [],
  },
  {
    id: 'plants',
    name: 'Plants',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        kind: 'relationship',
        key: 'species_id',
        relatedTableId: 'species',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'setNull',
      },
      { kind: 'varchar', key: 'species_text', size: 255 },
      { kind: 'varchar', key: 'nickname', size: 128, required: true },
      { kind: 'varchar', key: 'common_name', size: 128 },
      { kind: 'datetime', key: 'acquired_on' },
      {
        kind: 'enum',
        key: 'status',
        elements: ['active', 'archived', 'deceased', 'gifted'],
        default: 'active',
      },
      {
        kind: 'enum',
        key: 'placement_type',
        elements: ['indoor', 'outdoor', 'greenhouse', 'balcony'],
        required: true,
      },
      { kind: 'varchar', key: 'placement_label', size: 128 },
      {
        kind: 'relationship',
        key: 'location_id',
        relatedTableId: 'user_locations',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'setNull',
      },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', columns: ['user_id'] },
      { key: 'idx_status', type: 'key', columns: ['status'] },
    ],
  },
  {
    id: 'observations',
    name: 'Observations',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        // Required at the app layer; Appwrite relationship columns cannot be required.
        kind: 'relationship',
        key: 'plant_id',
        relatedTableId: 'plants',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'observations',
        onDelete: 'cascade',
      },
      { kind: 'datetime', key: 'observed_at', required: true },
      {
        kind: 'enum',
        key: 'observation_type',
        elements: ['treatment', 'measurement', 'photo', 'note', 'environment', 'health_check'],
        required: true,
      },
      notesPrivate,
      { kind: 'boolean', key: 'contribute_to_public_dataset', default: false },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', columns: ['user_id'] },
      { key: 'idx_observed_at', type: 'key', columns: ['observed_at'] },
      { key: 'idx_observation_type', type: 'key', columns: ['observation_type'] },
    ],
  },
  {
    id: 'treatments',
    name: 'Treatments',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        kind: 'relationship',
        key: 'observation_id',
        relatedTableId: 'observations',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'treatments',
        onDelete: 'cascade',
      },
      {
        kind: 'enum',
        key: 'treatment_type',
        elements: [
          'watering',
          'fertilizing',
          'repotting',
          'pruning',
          'misting',
          'pest_control',
          'cleaning',
          'relocation',
        ],
        required: true,
      },
      { kind: 'float', key: 'amount_value', min: 0 },
      { kind: 'varchar', key: 'amount_unit', size: 16 },
      { kind: 'varchar', key: 'product_name', size: 128 },
      { kind: 'varchar', key: 'method', size: 64 },
      notesPrivate,
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', columns: ['user_id'] },
      { key: 'idx_treatment_type', type: 'key', columns: ['treatment_type'] },
    ],
  },
  {
    id: 'measurements',
    name: 'Measurements',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        kind: 'relationship',
        key: 'observation_id',
        relatedTableId: 'observations',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'measurements',
        onDelete: 'cascade',
      },
      { kind: 'float', key: 'height_cm', min: 0 },
      { kind: 'integer', key: 'leaf_count', min: 0 },
      { kind: 'float', key: 'soil_moisture_percent', min: 0, max: 100 },
      { kind: 'integer', key: 'health_score', min: 1, max: 10 },
      { kind: 'integer', key: 'pest_severity_score', min: 0, max: 10 },
      { kind: 'integer', key: 'bloom_count', min: 0 },
      notesPrivate,
    ],
    indexes: [],
  },
  {
    id: 'photos',
    name: 'Photos',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        kind: 'relationship',
        key: 'observation_id',
        relatedTableId: 'observations',
        relationType: 'manyToOne',
        twoWay: true,
        twoWayKey: 'photos',
        onDelete: 'cascade',
      },
      { kind: 'varchar', key: 'private_file_id', size: 64, required: true },
      { kind: 'varchar', key: 'public_file_id', size: 64 },
      { kind: 'text', key: 'caption_private' },
      { kind: 'integer', key: 'width', min: 0 },
      { kind: 'integer', key: 'height', min: 0 },
      { kind: 'datetime', key: 'captured_at' },
      { kind: 'boolean', key: 'exif_stripped', default: false },
      { kind: 'boolean', key: 'allow_public_image', default: false },
    ],
    indexes: [],
  },
  {
    id: 'environment_snapshots',
    name: 'Environment Snapshots',
    permissions: ['create:users'],
    rowSecurity: true,
    columns: [
      userId,
      {
        kind: 'relationship',
        key: 'plant_id',
        relatedTableId: 'plants',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'setNull',
      },
      {
        kind: 'relationship',
        key: 'observation_id',
        relatedTableId: 'observations',
        relationType: 'manyToOne',
        twoWay: false,
        onDelete: 'setNull',
      },
      { kind: 'datetime', key: 'recorded_at', required: true },
      {
        kind: 'enum',
        key: 'source',
        elements: ['manual', 'weather_api', 'device_sensor', 'inferred'],
        required: true,
      },
      { kind: 'float', key: 'indoor_temperature_c' },
      { kind: 'float', key: 'outdoor_temperature_c' },
      { kind: 'float', key: 'relative_humidity_percent', min: 0, max: 100 },
      { kind: 'float', key: 'light_lux', min: 0 },
      { kind: 'float', key: 'photoperiod_hours', min: 0, max: 24 },
      { kind: 'varchar', key: 'weather_summary', size: 255 },
      { kind: 'varchar', key: 'climate_zone', size: 32 },
      { kind: 'varchar', key: 'geo_resolution', size: 32 },
    ],
    indexes: [],
  },
  {
    id: 'public_observations',
    name: 'Public Observations',
    permissions: [],
    rowSecurity: false,
    columns: [
      { kind: 'varchar', key: 'source_observation_id', size: 64, required: true },
      { kind: 'varchar', key: 'species_id', size: 64 },
      { kind: 'varchar', key: 'scientific_name', size: 255 },
      { kind: 'varchar', key: 'observed_month', size: 7, required: true },
      { kind: 'integer', key: 'plant_age_days', min: 0 },
      { kind: 'varchar', key: 'observation_type', size: 32, required: true },
      { kind: 'varchar', key: 'treatment_type', size: 32 },
      { kind: 'float', key: 'amount_value', min: 0 },
      { kind: 'varchar', key: 'amount_unit', size: 16 },
      { kind: 'float', key: 'height_cm', min: 0 },
      { kind: 'integer', key: 'leaf_count', min: 0 },
      { kind: 'float', key: 'soil_moisture_percent', min: 0, max: 100 },
      { kind: 'integer', key: 'health_score', min: 1, max: 10 },
      { kind: 'varchar', key: 'country', size: 64 },
      { kind: 'varchar', key: 'region', size: 128 },
      { kind: 'varchar', key: 'climate_zone', size: 32 },
      { kind: 'varchar', key: 'geo_cell', size: 32 },
      {
        kind: 'enum',
        key: 'geo_precision',
        elements: ['country', 'regional', 'climate', 'coarse_cell'],
        required: true,
      },
      { kind: 'varchar', key: 'environment_source', size: 16 },
      { kind: 'float', key: 'outdoor_temperature_c' },
      { kind: 'float', key: 'relative_humidity_percent', min: 0, max: 100 },
      { kind: 'float', key: 'light_lux', min: 0 },
      { kind: 'varchar', key: 'public_file_id', size: 64 },
      { kind: 'varchar', key: 'dataset_version', size: 32, required: true },
      { kind: 'datetime', key: 'published_at', required: true },
    ],
    indexes: [
      { key: 'idx_scientific_name', type: 'key', columns: ['scientific_name'] },
      { key: 'idx_observed_month', type: 'key', columns: ['observed_month'] },
      { key: 'idx_climate_zone', type: 'key', columns: ['climate_zone'] },
    ],
  },
];

export const BUCKETS: BucketDef[] = [
  {
    id: 'plant-private-images',
    name: 'Plant Private Images',
    permissions: ['create:users'],
    fileSecurity: true,
    maximumFileSize: 15 * MB,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
    compression: 'none',
    encryption: true,
    antivirus: true,
  },
  {
    id: 'plant-public-images',
    name: 'Plant Public Images',
    permissions: [],
    fileSecurity: false,
    maximumFileSize: 15 * MB,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    compression: 'none',
    encryption: false,
    antivirus: true,
  },
  {
    id: 'open-data-exports',
    name: 'Open Data Exports',
    permissions: [],
    fileSecurity: false,
    maximumFileSize: 50 * MB,
    allowedFileExtensions: ['csv', 'jsonl', 'json', 'txt', 'md', 'zip'],
    compression: 'gzip',
    encryption: false,
    antivirus: false,
  },
];

/**
 * Fields a future public-export job may project into public files/APIs.
 * Everything else on public_observations (currently source_observation_id)
 * is internal-only traceability.
 */
export const INTERNAL_ONLY_FIELDS = ['source_observation_id'];

export const PUBLIC_EXPORT_FIELDS = TABLES.find((t) => t.id === 'public_observations')!
  .columns.map((c) => c.key)
  .filter((key) => !INTERNAL_ONLY_FIELDS.includes(key));
