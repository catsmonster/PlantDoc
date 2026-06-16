import type { Plant } from './types';

export function hasMoistureAnchor(plant: Pick<Plant, 'observations'>): boolean {
  for (const observation of plant.observations ?? []) {
    if (
      observation.treatments?.some(
        (treatment) =>
          treatment.treatment_type === 'watering' || treatment.treatment_type === 'repotting',
      )
    ) {
      return true;
    }
    if (
      observation.measurements?.some(
        (measurement) =>
          measurement.soil_state != null || typeof measurement.soil_moisture_percent === 'number',
      )
    ) {
      return true;
    }
  }
  return false;
}
