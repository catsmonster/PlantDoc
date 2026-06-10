/** Row shapes as the web SDK returns them (system fields prefixed with $). */

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
  observations?: Observation[];
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

export interface Observation extends RowMeta {
  user_id: string;
  observed_at: string;
  observation_type: ObservationType;
  notes_private: string | null;
  contribute_to_public_dataset: boolean;
  treatments?: Treatment[];
  measurements?: Measurement[];
  photos?: Photo[];
}
