import type { LogInput } from '../../lib/log';
import type { MoistureFeedbackInput } from '../../lib/repo';
import type { EstimateFeedback, Observation, SoilState, TreatmentType, Units } from '../../lib/types';
import { formatHeight, formatVolume } from '../../lib/units';

export { shouldPromptForPotSize } from '../../lib/moisture-read';

const treatmentLabels: Record<TreatmentType, string> = {
  watering: 'Watered',
  fertilizing: 'Fertilized',
  repotting: 'Repotted',
  pruning: 'Pruned',
  misting: 'Misted',
  pest_control: 'Pest control',
  cleaning: 'Cleaned leaves',
  relocation: 'Moved',
};

export function buildSoilCheckLogInput({
  userId,
  plantId,
  soilState,
  contribute,
  observedAt,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  observedAt: string;
}): LogInput {
  return {
    userId,
    plantId,
    observedAt,
    contribute,
    measurement: { soil_state: soilState },
  };
}

export async function submitSoilCheck({
  userId,
  plantId,
  soilState,
  contribute,
  now = () => new Date(),
  createLog,
  refresh,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  now?: () => Date;
  createLog: (input: LogInput) => Promise<Observation>;
  refresh: () => void;
}): Promise<void> {
  await createLog(
    buildSoilCheckLogInput({
      userId,
      plantId,
      soilState,
      contribute,
      observedAt: now().toISOString(),
    }),
  );
  refresh();
}

export function buildMoistureFeedbackInput({
  plantId,
  estimateFeedback,
  magnitude,
  predictedMoisturePercent,
  observedAt,
}: {
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  observedAt: string;
}): MoistureFeedbackInput {
  return {
    plantId,
    observedAt,
    estimate_feedback: estimateFeedback,
    magnitude: estimateFeedback === 'correct' ? null : magnitude,
    predicted_moisture_percent: predictedMoisturePercent,
  };
}

export async function submitMoistureFeedback({
  userId,
  plantId,
  estimateFeedback,
  magnitude,
  predictedMoisturePercent,
  now = () => new Date(),
  createMoistureFeedback,
  refresh,
}: {
  userId: string;
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  now?: () => Date;
  createMoistureFeedback: (userId: string, input: MoistureFeedbackInput) => Promise<unknown>;
  refresh: () => void;
}): Promise<void> {
  await createMoistureFeedback(
    userId,
    buildMoistureFeedbackInput({
      plantId,
      estimateFeedback,
      magnitude,
      predictedMoisturePercent,
      observedAt: now().toISOString(),
    }),
  );
  refresh();
}

export function detailLine(obs: Observation, units: Units): string | null {
  if (obs.observation_type === 'treatment') {
    const t = obs.treatments?.[0];
    if (!t) return 'Care';
    const parts = [treatmentLabels[t.treatment_type]];
    if (t.amount_value != null) {
      parts.push(
        t.amount_unit === 'ml'
          ? formatVolume(t.amount_value, units)
          : `${t.amount_value} ${t.amount_unit ?? ''}`.trim(),
      );
    }
    if (t.method) parts.push(t.method);
    if (t.product_name) parts.push(t.product_name);
    return parts.join(' · ');
  }
  if (obs.observation_type === 'measurement') {
    const m = obs.measurements?.[0];
    if (!m) return 'Measured';
    const parts: string[] = [];
    if (m.height_cm != null) parts.push(formatHeight(m.height_cm, units));
    if (m.leaf_count != null) parts.push(`${m.leaf_count} leaves`);
    if (m.soil_moisture_percent != null) parts.push(`soil ${m.soil_moisture_percent}%`);
    if (m.soil_state) parts.push(`soil ${m.soil_state}`);
    if (m.health_score != null) parts.push(`health ${m.health_score}/5`);
    return parts.length ? parts.join(' · ') : 'Measured';
  }
  if (obs.observation_type === 'photo') return 'Photo';
  if (obs.observation_type === 'note') return null;
  return obs.observation_type.replace('_', ' ');
}
