/**
 * Deterministic synthetic seed data for PlantDoc Phase 0.
 *
 * Every row uses a fixed `seed_` id, fixed timestamps, synthetic users, and
 * coarse geography. Rows are listed in dependency order (relationship targets
 * before the rows that reference them) so the seed script can apply them
 * sequentially. Re-running the seed upserts by rowId and never duplicates.
 *
 * Privacy rules (docs/privacy.md): no real emails, no exact coordinates,
 * no real notes, no EXIF, no real image uploads.
 */
import type { Perm } from './schema';

export interface SeedRow {
  tableId: string;
  rowId: string;
  data: Record<string, unknown>;
  permissions: Perm[];
}

export const SEED_USER_IDS = ['seed_user_alex', 'seed_user_mina'];

function owned(userId: string): Perm[] {
  return [`read:user:${userId}`, `update:user:${userId}`, `delete:user:${userId}`];
}

const ALEX = 'seed_user_alex';
const MINA = 'seed_user_mina';
const PUBLISHED_AT = '2026-06-01T00:00:00.000Z';

export const SEED_ROWS: SeedRow[] = [
  // --- profiles ---
  {
    tableId: 'profiles',
    rowId: 'seed_profile_alex',
    data: {
      user_id: ALEX,
      display_name: 'Seed Alex',
      preferred_units: 'metric',
      public_contribution_default: false,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'profiles',
    rowId: 'seed_profile_mina',
    data: {
      user_id: MINA,
      display_name: 'Seed Mina',
      preferred_units: 'imperial',
      public_contribution_default: false,
    },
    permissions: owned(MINA),
  },

  // --- user_locations (coarse synthetic geography only) ---
  {
    tableId: 'user_locations',
    rowId: 'seed_loc_alex_home',
    data: {
      user_id: ALEX,
      label: 'Seed Home A',
      country: 'Netherlands',
      region: 'Utrecht',
      location: [5.1, 52.1],
      location_precision: 'regional',
      climate_zone: 'Cfb',
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'user_locations',
    rowId: 'seed_loc_mina_home',
    data: {
      user_id: MINA,
      label: 'Seed Home B',
      country: 'Israel',
      region: 'HaMerkaz',
      location: [34.9, 32.1],
      location_precision: 'regional',
      climate_zone: 'Csa',
    },
    permissions: owned(MINA),
  },

  // --- species (admin-managed, table-level read for app users) ---
  {
    tableId: 'species',
    rowId: 'seed_species_monstera',
    data: {
      scientific_name: 'Monstera deliciosa',
      common_names: ['Swiss cheese plant'],
      family: 'Araceae',
      genus: 'Monstera',
    },
    permissions: [],
  },
  {
    tableId: 'species',
    rowId: 'seed_species_pothos',
    data: {
      scientific_name: 'Epipremnum aureum',
      common_names: ['golden pothos', "devil's ivy"],
      family: 'Araceae',
      genus: 'Epipremnum',
    },
    permissions: [],
  },
  {
    tableId: 'species',
    rowId: 'seed_species_coffea',
    data: {
      scientific_name: 'Coffea arabica',
      common_names: ['arabica coffee'],
      family: 'Rubiaceae',
      genus: 'Coffea',
    },
    permissions: [],
  },

  // --- plants ---
  {
    tableId: 'plants',
    rowId: 'seed_plant_alex_monstera',
    data: {
      user_id: ALEX,
      species_id: 'seed_species_monstera',
      nickname: 'Seed Monstera',
      common_name: 'Monstera',
      acquired_on: '2025-11-15T00:00:00.000Z',
      status: 'active',
      placement_type: 'indoor',
      placement_label: 'Seed Room 1',
      location_id: 'seed_loc_alex_home',
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'plants',
    rowId: 'seed_plant_alex_pothos',
    data: {
      user_id: ALEX,
      species_id: 'seed_species_pothos',
      nickname: 'Seed Pothos',
      common_name: 'Pothos',
      acquired_on: '2026-01-20T00:00:00.000Z',
      status: 'active',
      placement_type: 'indoor',
      placement_label: 'Seed Room 2',
      location_id: 'seed_loc_alex_home',
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'plants',
    rowId: 'seed_plant_mina_coffea',
    data: {
      user_id: MINA,
      species_id: 'seed_species_coffea',
      nickname: 'Seed Coffea',
      common_name: 'Coffee plant',
      acquired_on: '2026-02-10T00:00:00.000Z',
      status: 'active',
      placement_type: 'balcony',
      placement_label: 'Seed Balcony',
      location_id: 'seed_loc_mina_home',
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'plants',
    rowId: 'seed_plant_mina_monstera',
    data: {
      user_id: MINA,
      species_id: 'seed_species_monstera',
      species_text: 'Monstera (store label)',
      nickname: 'Seed Monstera B',
      common_name: 'Monstera',
      status: 'active',
      placement_type: 'indoor',
      placement_label: 'Seed Room 3',
      location_id: 'seed_loc_mina_home',
    },
    permissions: owned(MINA),
  },

  // --- observations (timeline parents) ---
  {
    tableId: 'observations',
    rowId: 'seed_obs_alex_water_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_monstera',
      observed_at: '2026-05-02T08:30:00.000Z',
      observation_type: 'treatment',
      contribute_to_public_dataset: true,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_alex_measure_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_monstera',
      observed_at: '2026-05-02T08:35:00.000Z',
      observation_type: 'measurement',
      contribute_to_public_dataset: true,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_alex_photo_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_monstera',
      observed_at: '2026-05-03T09:00:00.000Z',
      observation_type: 'photo',
      notes_private: 'Synthetic note: new leaf unfurling.',
      contribute_to_public_dataset: false,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_alex_fert_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_pothos',
      observed_at: '2026-05-10T18:00:00.000Z',
      observation_type: 'treatment',
      contribute_to_public_dataset: false,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_alex_health_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_pothos',
      observed_at: '2026-05-17T10:00:00.000Z',
      observation_type: 'health_check',
      notes_private: 'Synthetic note: two yellow leaves removed.',
      contribute_to_public_dataset: false,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_mina_water_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_coffea',
      observed_at: '2026-05-04T07:45:00.000Z',
      observation_type: 'treatment',
      contribute_to_public_dataset: true,
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_mina_repot_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_coffea',
      observed_at: '2026-05-11T12:00:00.000Z',
      observation_type: 'treatment',
      contribute_to_public_dataset: false,
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_mina_measure_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_monstera',
      observed_at: '2026-05-12T19:30:00.000Z',
      observation_type: 'measurement',
      contribute_to_public_dataset: true,
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_mina_note_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_monstera',
      observed_at: '2026-05-20T21:00:00.000Z',
      observation_type: 'note',
      notes_private: 'Synthetic note: leaning toward window.',
      contribute_to_public_dataset: false,
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'observations',
    rowId: 'seed_obs_mina_pest_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_monstera',
      observed_at: '2026-05-25T08:00:00.000Z',
      observation_type: 'treatment',
      contribute_to_public_dataset: false,
    },
    permissions: owned(MINA),
  },

  // --- treatments (one per treatment observation) ---
  {
    tableId: 'treatments',
    rowId: 'seed_treat_alex_water_1',
    data: {
      user_id: ALEX,
      observation_id: 'seed_obs_alex_water_1',
      treatment_type: 'watering',
      amount_value: 250,
      amount_unit: 'ml',
      method: 'top_water',
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'treatments',
    rowId: 'seed_treat_alex_fert_1',
    data: {
      user_id: ALEX,
      observation_id: 'seed_obs_alex_fert_1',
      treatment_type: 'fertilizing',
      amount_value: 5,
      amount_unit: 'ml',
      product_name: 'Synthetic Grow 5-2-3',
      method: 'diluted_in_water',
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'treatments',
    rowId: 'seed_treat_mina_water_1',
    data: {
      user_id: MINA,
      observation_id: 'seed_obs_mina_water_1',
      treatment_type: 'watering',
      amount_value: 300,
      amount_unit: 'ml',
      method: 'bottom_water',
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'treatments',
    rowId: 'seed_treat_mina_repot_1',
    data: {
      user_id: MINA,
      observation_id: 'seed_obs_mina_repot_1',
      treatment_type: 'repotting',
      notes_private: 'Synthetic note: moved to 24cm pot.',
    },
    permissions: owned(MINA),
  },
  {
    tableId: 'treatments',
    rowId: 'seed_treat_mina_pest_1',
    data: {
      user_id: MINA,
      observation_id: 'seed_obs_mina_pest_1',
      treatment_type: 'pest_control',
      product_name: 'Synthetic neem oil',
      method: 'foliar_spray',
    },
    permissions: owned(MINA),
  },

  // --- measurements ---
  {
    tableId: 'measurements',
    rowId: 'seed_meas_alex_1',
    data: {
      user_id: ALEX,
      observation_id: 'seed_obs_alex_measure_1',
      height_cm: 62,
      leaf_count: 14,
      health_score: 8,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'measurements',
    rowId: 'seed_meas_alex_health_1',
    data: {
      user_id: ALEX,
      observation_id: 'seed_obs_alex_health_1',
      health_score: 6,
      pest_severity_score: 2,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'measurements',
    rowId: 'seed_meas_mina_1',
    data: {
      user_id: MINA,
      observation_id: 'seed_obs_mina_measure_1',
      height_cm: 48.5,
      leaf_count: 9,
      soil_moisture_percent: 35,
      health_score: 7,
    },
    permissions: owned(MINA),
  },

  // --- photos (synthetic metadata only; no real file uploads in Phase 0) ---
  {
    tableId: 'photos',
    rowId: 'seed_photo_alex_1',
    data: {
      user_id: ALEX,
      observation_id: 'seed_obs_alex_photo_1',
      private_file_id: 'seed_file_placeholder_001',
      caption_private: 'Synthetic caption: leaf detail.',
      width: 1024,
      height: 768,
      captured_at: '2026-05-03T08:58:00.000Z',
      exif_stripped: true,
      allow_public_image: false,
    },
    permissions: owned(ALEX),
  },

  // --- environment_snapshots ---
  {
    tableId: 'environment_snapshots',
    rowId: 'seed_env_alex_1',
    data: {
      user_id: ALEX,
      plant_id: 'seed_plant_alex_monstera',
      observation_id: 'seed_obs_alex_water_1',
      recorded_at: '2026-05-02T08:30:00.000Z',
      source: 'manual',
      indoor_temperature_c: 21.5,
      relative_humidity_percent: 55,
    },
    permissions: owned(ALEX),
  },
  {
    tableId: 'environment_snapshots',
    rowId: 'seed_env_mina_1',
    data: {
      user_id: MINA,
      plant_id: 'seed_plant_mina_coffea',
      observation_id: 'seed_obs_mina_water_1',
      recorded_at: '2026-05-04T07:45:00.000Z',
      source: 'weather_api',
      outdoor_temperature_c: 24,
      relative_humidity_percent: 60,
      weather_summary: 'Synthetic: clear morning.',
      climate_zone: 'Csa',
      geo_resolution: 'regional',
    },
    permissions: owned(MINA),
  },

  // --- public_observations (derived from consented observations only) ---
  {
    tableId: 'public_observations',
    rowId: 'seed_pub_obs_1',
    data: {
      source_observation_id: 'seed_obs_alex_water_1',
      species_id: 'seed_species_monstera',
      scientific_name: 'Monstera deliciosa',
      observed_month: '2026-05',
      plant_age_days: 168,
      observation_type: 'treatment',
      treatment_type: 'watering',
      amount_value: 250,
      amount_unit: 'ml',
      country: 'Netherlands',
      climate_zone: 'Cfb',
      geo_precision: 'climate',
      environment_source: 'manual',
      relative_humidity_percent: 55,
      dataset_version: 'seed-0',
      published_at: PUBLISHED_AT,
    },
    permissions: [],
  },
  {
    tableId: 'public_observations',
    rowId: 'seed_pub_obs_2',
    data: {
      source_observation_id: 'seed_obs_mina_measure_1',
      species_id: 'seed_species_monstera',
      scientific_name: 'Monstera deliciosa',
      observed_month: '2026-05',
      observation_type: 'measurement',
      height_cm: 48.5,
      leaf_count: 9,
      soil_moisture_percent: 35,
      health_score: 7,
      country: 'Israel',
      climate_zone: 'Csa',
      geo_precision: 'climate',
      dataset_version: 'seed-0',
      published_at: PUBLISHED_AT,
    },
    permissions: [],
  },
];
