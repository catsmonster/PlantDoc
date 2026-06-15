import type { ObservationType, SoilState, TreatmentType } from './types';

/** Input collected by the logging UI for a single timeline entry. */
export interface LogInput {
  userId: string;
  plantId: string;
  observedAt: string;
  contribute: boolean;
  note?: string;
  treatment?: {
    treatment_type: TreatmentType;
    amount_value?: number | null;
    amount_unit?: string | null;
    product_name?: string;
    method?: string;
  };
  measurement?: {
    height_cm?: number;
    leaf_count?: number;
    soil_moisture_percent?: number;
    health_score?: number;
    soil_state?: SoilState;
  };
}

export interface LogPayload {
  observation: {
    user_id: string;
    plant_id: string;
    observed_at: string;
    observation_type: ObservationType;
    notes_private: string | null;
    contribute_to_public_dataset: boolean;
  };
  treatment?: Record<string, unknown>;
  measurement?: Record<string, unknown>;
}

/** Pure assembly of the rows a log entry creates; the repo persists them. */
export function buildLogPayload(input: LogInput): LogPayload {
  if (input.treatment && input.measurement) {
    throw new Error('A log entry is either a treatment or a measurement, not both.');
  }
  const observation_type: ObservationType = input.treatment
    ? 'treatment'
    : input.measurement
      ? 'measurement'
      : 'note';
  const payload: LogPayload = {
    observation: {
      user_id: input.userId,
      plant_id: input.plantId,
      observed_at: input.observedAt,
      observation_type,
      notes_private: input.note?.trim() ? input.note.trim() : null,
      contribute_to_public_dataset: input.contribute,
    },
  };
  if (input.treatment) {
    const entries = Object.entries(input.treatment).filter(([, v]) => v !== undefined);
    payload.treatment = { user_id: input.userId, ...Object.fromEntries(entries) };
    if (
      input.treatment.treatment_type === 'watering' &&
      input.treatment.amount_value === undefined
    ) {
      payload.treatment.amount_value = null;
    }
  }
  if (input.measurement) {
    const entries = Object.entries(input.measurement).filter(([, v]) => v !== undefined);
    if (entries.length === 0) throw new Error('Measurement log needs at least one value.');
    payload.measurement = { user_id: input.userId, ...Object.fromEntries(entries) };
  }
  return payload;
}
