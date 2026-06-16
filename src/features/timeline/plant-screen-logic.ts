import type { LogInput } from '../../lib/log';
import type { MoistureFeedbackInput } from '../../lib/repo';
import type { EstimateFeedback, MoistureFeedback, Observation, SoilState, TreatmentType, Units } from '../../lib/types';
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
  observedAt,
  createLog,
  refresh,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  observedAt: string;
  createLog: (input: LogInput) => Promise<Observation>;
  refresh: () => void;
}): Promise<Observation> {
  const observation = await createLog(
    buildSoilCheckLogInput({ userId, plantId, soilState, contribute, observedAt }),
  );
  refresh();
  return observation;
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
  observedAt,
  createMoistureFeedback,
  refresh,
}: {
  userId: string;
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  observedAt: string;
  createMoistureFeedback: (userId: string, input: MoistureFeedbackInput) => Promise<MoistureFeedback>;
  refresh: () => void;
}): Promise<MoistureFeedback> {
  const created = await createMoistureFeedback(
    userId,
    buildMoistureFeedbackInput({ plantId, estimateFeedback, magnitude, predictedMoisturePercent, observedAt }),
  );
  refresh();
  return created;
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

/** Merge canonical rows with optimistic pending rows, deduped by id. Canonical rows win. */
export function mergeById<T extends { $id: string }>(canonical: T[], pending: T[]): T[] {
  const ids = new Set(canonical.map((row) => row.$id));
  return [...canonical, ...pending.filter((row) => !ids.has(row.$id))];
}

/** Drop pending flat rows once a canonical re-fetch includes the same id. */
export function dropReconciledRows<T extends { $id: string }>(pending: T[], canonical: T[]): T[] {
  const ids = new Set(canonical.map((row) => row.$id));
  return pending.filter((row) => !ids.has(row.$id));
}

function observationHydration(observation: Observation): number {
  return (
    (observation.measurements?.length ?? 0) +
    (observation.treatments?.length ?? 0) +
    (observation.photos?.length ?? 0)
  );
}

export function mergeObservations(canonical: Observation[], pending: Observation[]): Observation[] {
  const byId = new Map<string, Observation>();
  for (const observation of canonical) byId.set(observation.$id, observation);
  for (const optimistic of pending) {
    const existing = byId.get(optimistic.$id);
    if (!existing || observationHydration(optimistic) > observationHydration(existing)) {
      byId.set(optimistic.$id, optimistic);
    }
  }
  return [...byId.values()];
}

/** Keep a pending observation until the canonical row is at least as hydrated. */
export function dropReconciledObservations(pending: Observation[], canonical: Observation[]): Observation[] {
  const canonicalHydration = new Map(canonical.map((observation) => [observation.$id, observationHydration(observation)] as const));
  return pending.filter((observation) => (canonicalHydration.get(observation.$id) ?? 0) < observationHydration(observation));
}
