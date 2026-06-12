/** Row shapes as the web SDK returns them (system fields prefixed with $). */

import type { LocationPrecision } from './geo';

export type Units = 'metric' | 'imperial';

export interface RowMeta {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface Profile extends RowMeta {
  user_id: string;
  display_name: string | null;
  preferred_units: Units;
  public_contribution_default: boolean;
}

export interface Species extends RowMeta {
  scientific_name: string;
  common_names: string[];
  family: string | null;
  genus: string | null;
}

export type PlantStatus = 'active' | 'archived' | 'deceased' | 'gifted';
export type PlacementType = 'indoor' | 'outdoor' | 'greenhouse' | 'balcony';

export interface UserLocation extends RowMeta {
  user_id: string;
  label: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code_prefix: string | null;
  /** GeoJSON order: [longitude, latitude]; rounded to ~1.1 km before write. */
  location: [number, number] | null;
  location_precision: LocationPrecision;
  climate_zone: string | null;
}

export interface Plant extends RowMeta {
  user_id: string;
  species_id: Species | null;
  species_text: string | null;
  nickname: string;
  common_name: string | null;
  acquired_on: string | null;
  status: PlantStatus;
  placement_type: PlacementType;
  placement_label: string | null;
  /** String when not hydrated by the read's select. */
  location_id?: UserLocation | string | null;
  observations?: Observation[];
  insight_feedback?: InsightFeedback[];
  last_watered_at?: string | null;
  watering_count?: number | null;
  watering_cadence_days?: number | null;
  latest_photo_file_id?: string | null;
  latest_photo_observed_at?: string | null;
}

export interface InsightFeedback extends RowMeta {
  user_id: string;
  insight_kind: string;
  helpful: boolean;
}

export type ObservationType =
  | 'treatment'
  | 'measurement'
  | 'photo'
  | 'note'
  | 'environment'
  | 'health_check';

export type TreatmentType =
  | 'watering'
  | 'fertilizing'
  | 'repotting'
  | 'pruning'
  | 'misting'
  | 'pest_control'
  | 'cleaning'
  | 'relocation';

export interface Treatment extends RowMeta {
  user_id: string;
  treatment_type: TreatmentType;
  amount_value: number | null;
  amount_unit: string | null;
  product_name: string | null;
  method: string | null;
  notes_private: string | null;
}

export interface Measurement extends RowMeta {
  user_id: string;
  height_cm: number | null;
  leaf_count: number | null;
  soil_moisture_percent: number | null;
  health_score: number | null;
  pest_severity_score: number | null;
  bloom_count: number | null;
  notes_private: string | null;
}

export interface Photo extends RowMeta {
  user_id: string;
  private_file_id: string;
  caption_private: string | null;
  exif_stripped: boolean;
  allow_public_image: boolean;
}

export type SnapshotSource = 'manual' | 'weather_api' | 'device_sensor' | 'inferred';

export interface EnvironmentSnapshot extends RowMeta {
  user_id: string;
  recorded_at: string;
  source: SnapshotSource;
  indoor_temperature_c: number | null;
  outdoor_temperature_c: number | null;
  relative_humidity_percent: number | null;
  light_lux: number | null;
  photoperiod_hours: number | null;
  weather_summary: string | null;
  climate_zone: string | null;
  geo_resolution: string | null;
}

export interface Observation extends RowMeta {
  user_id: string;
  observed_at: string;
  observation_type: ObservationType;
  notes_private: string | null;
  contribute_to_public_dataset: boolean;
  treatments?: Treatment[];
  measurements?: Measurement[];
  photos?: Photo[];
  environment_snapshots?: EnvironmentSnapshot[];
}
