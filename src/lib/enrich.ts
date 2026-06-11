import { fetchDailyWeather } from './openmeteo';
import { createEnvironmentSnapshot, locationCoords } from './repo';
import type { UserLocation } from './types';

/**
 * Weather enrichment for a freshly logged observation. Best-effort by
 * design: returns quietly when the plant has no located coordinates or the
 * weather API has nothing for the date. Callers must treat failures as
 * non-fatal — a log entry must never fail because enrichment did.
 */
export async function enrichObservationWeather(input: {
  userId: string;
  plantId: string;
  observationId: string;
  observedAt: string;
  location: UserLocation | null | undefined;
}): Promise<boolean> {
  const coords = locationCoords(input.location);
  if (!coords || !input.location) return false;
  const weather = await fetchDailyWeather(coords, input.observedAt.slice(0, 10));
  if (!weather) return false;
  await createEnvironmentSnapshot({
    userId: input.userId,
    plantId: input.plantId,
    observationId: input.observationId,
    recordedAt: input.observedAt,
    outdoorTempC: weather.outdoorTempC,
    humidityPercent: weather.humidityPercent,
    photoperiodHours: weather.photoperiodHours,
    summary: weather.summary,
    climateZone: input.location.climate_zone,
    geoResolution: input.location.location_precision,
  });
  return true;
}
