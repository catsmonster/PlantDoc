import { ID, Query } from 'appwrite';
import { DATABASE_ID, PRIVATE_IMAGES_BUCKET, storage, tablesDB } from './appwrite';
import { forStorage, type Coords, type LocationPrecision } from './geo';
import { buildLogPayload, type LogInput } from './log';
import { ownerPermissions } from './owner';
import type {
  EnvironmentSnapshot,
  InsightFeedback,
  Observation,
  Plant,
  PlacementType,
  PlantStatus,
  Profile,
  Species,
  Units,
  UserLocation,
} from './types';

/**
 * All Appwrite reads/writes for the app go through this module. Every row is
 * stamped with `user_id` and owner-only permissions (row security is on;
 * tables only grant create to authenticated users).
 */

const db = DATABASE_ID;

// ---------- profiles ----------

export interface ProfileInput {
  display_name: string | null;
  preferred_units: Units;
  public_contribution_default: boolean;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const result = await tablesDB.listRows({
    databaseId: db,
    tableId: 'profiles',
    queries: [Query.equal('user_id', userId), Query.limit(1)],
  });
  return (result.rows[0] as unknown as Profile) ?? null;
}

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const row = await tablesDB.createRow({
    databaseId: db,
    tableId: 'profiles',
    rowId: ID.unique(),
    data: { user_id: userId, ...input },
    permissions: ownerPermissions(userId),
  });
  return row as unknown as Profile;
}

// ---------- species (read-only catalog) ----------

export async function listSpecies(): Promise<Species[]> {
  const result = await tablesDB.listRows({
    databaseId: db,
    tableId: 'species',
    queries: [Query.orderAsc('scientific_name'), Query.limit(100)],
  });
  return result.rows as unknown as Species[];
}

// ---------- locations ----------

export interface LocationInput {
  label: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  coords: Coords | null;
  location_precision: LocationPrecision;
  climate_zone: string | null;
}

export async function listLocations(userId: string): Promise<UserLocation[]> {
  const result = await tablesDB.listRows({
    databaseId: db,
    tableId: 'user_locations',
    queries: [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(100)],
  });
  return result.rows as unknown as UserLocation[];
}

/** Coordinates are rounded to storage precision (~1.1 km) before the write —
 * exact GPS never persists (docs/privacy.md). */
export async function createLocation(userId: string, input: LocationInput): Promise<UserLocation> {
  const { coords, ...rest } = input;
  const rounded = coords ? forStorage(coords) : null;
  const row = await tablesDB.createRow({
    databaseId: db,
    tableId: 'user_locations',
    rowId: ID.unique(),
    data: {
      user_id: userId,
      ...rest,
      location: rounded ? [rounded.lon, rounded.lat] : null,
    },
    permissions: ownerPermissions(userId),
  });
  return row as unknown as UserLocation;
}

/** Plants referencing the location keep working: the relationship is setNull. */
export async function deleteLocation(locationId: string): Promise<void> {
  await tablesDB.deleteRow({ databaseId: db, tableId: 'user_locations', rowId: locationId });
}

/** [lon, lat] storage order (GeoJSON) back to Coords. */
export function locationCoords(location: UserLocation | null | undefined): Coords | null {
  if (!location?.location) return null;
  const [lon, lat] = location.location;
  return { lat, lon };
}

// ---------- plants ----------

export interface PlantInput {
  nickname: string;
  placement_type: PlacementType;
  species_id?: string | null;
  species_text?: string | null;
  common_name?: string | null;
  acquired_on?: string | null;
  placement_label?: string | null;
  status?: PlantStatus;
  location_id?: string | null;
}

/** Scalar-only dashboard list; skips relationship columns so Appwrite does not
 * hydrate each plant's full observation tree. */
export async function listPlants(userId: string): Promise<Plant[]> {
  const result = await tablesDB.listRows({
    databaseId: db,
    tableId: 'plants',
    queries: [
      Query.equal('user_id', userId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      Query.select([
        '$id',
        '$createdAt',
        '$updatedAt',
        'user_id',
        'species_text',
        'nickname',
        'common_name',
        'acquired_on',
        'status',
        'placement_type',
        'placement_label',
      ]),
    ],
  });
  return result.rows as unknown as Plant[];
}

/** Full plant read with the timeline embedded. Appwrite does not hydrate
 * relationships unless selected, and relationship columns are not queryable,
 * so the nested select below IS the timeline read. */
export async function getPlantWithTimeline(plantId: string): Promise<Plant> {
  const row = await tablesDB.getRow({
    databaseId: db,
    tableId: 'plants',
    rowId: plantId,
    queries: [
      Query.select([
        '*',
        'species_id.*',
        'location_id.*',
        'observations.*',
        'observations.treatments.*',
        'observations.measurements.*',
        'observations.photos.*',
        'observations.environment_snapshots.*',
        'insight_feedback.*',
      ]),
    ],
  });
  const plant = row as unknown as Plant;
  plant.observations = [...(plant.observations ?? [])].sort((a, b) =>
    b.observed_at.localeCompare(a.observed_at),
  );
  return plant;
}

export async function createPlant(userId: string, input: PlantInput): Promise<Plant> {
  const row = await tablesDB.createRow({
    databaseId: db,
    tableId: 'plants',
    rowId: ID.unique(),
    data: { user_id: userId, status: 'active', ...input },
    permissions: ownerPermissions(userId),
  });
  return row as unknown as Plant;
}

export async function updatePlant(plantId: string, input: Partial<PlantInput>): Promise<Plant> {
  const row = await tablesDB.updateRow({
    databaseId: db,
    tableId: 'plants',
    rowId: plantId,
    data: input,
  });
  return row as unknown as Plant;
}

// ---------- logging ----------

/** Creates the observation row, then its treatment/measurement child. */
export async function createLog(input: LogInput): Promise<Observation> {
  const payload = buildLogPayload(input);
  const perms = ownerPermissions(input.userId);
  const observation = (await tablesDB.createRow({
    databaseId: db,
    tableId: 'observations',
    rowId: ID.unique(),
    data: { ...payload.observation, plant_id: input.plantId },
    permissions: perms,
  })) as unknown as Observation;
  if (payload.treatment) {
    await tablesDB.createRow({
      databaseId: db,
      tableId: 'treatments',
      rowId: ID.unique(),
      data: { ...payload.treatment, observation_id: observation.$id },
      permissions: perms,
    });
  }
  if (payload.measurement) {
    await tablesDB.createRow({
      databaseId: db,
      tableId: 'measurements',
      rowId: ID.unique(),
      data: { ...payload.measurement, observation_id: observation.$id },
      permissions: perms,
    });
  }
  return observation;
}

// ---------- environment snapshots ----------

export interface SnapshotInput {
  userId: string;
  plantId: string;
  observationId: string;
  recordedAt: string;
  outdoorTempC: number | null;
  humidityPercent: number | null;
  photoperiodHours: number | null;
  summary: string | null;
  climateZone: string | null;
  geoResolution: string;
}

/** Weather-API enrichment row for a freshly logged observation. */
export async function createEnvironmentSnapshot(
  input: SnapshotInput,
): Promise<EnvironmentSnapshot> {
  const row = await tablesDB.createRow({
    databaseId: db,
    tableId: 'environment_snapshots',
    rowId: ID.unique(),
    data: {
      user_id: input.userId,
      plant_id: input.plantId,
      observation_id: input.observationId,
      recorded_at: input.recordedAt,
      source: 'weather_api',
      outdoor_temperature_c: input.outdoorTempC,
      relative_humidity_percent: input.humidityPercent,
      photoperiod_hours: input.photoperiodHours,
      weather_summary: input.summary,
      climate_zone: input.climateZone,
      geo_resolution: input.geoResolution,
    },
    permissions: ownerPermissions(input.userId),
  });
  return row as unknown as EnvironmentSnapshot;
}

// ---------- insight feedback ----------

/** One verdict per (plant, insight kind): updates the existing row when the
 * caller passes it, otherwise creates a new owner-only row. */
export async function setInsightFeedback(
  userId: string,
  plantId: string,
  insightKind: string,
  helpful: boolean,
  existing?: InsightFeedback | null,
): Promise<InsightFeedback> {
  if (existing) {
    const row = await tablesDB.updateRow({
      databaseId: db,
      tableId: 'insight_feedback',
      rowId: existing.$id,
      data: { helpful },
    });
    return row as unknown as InsightFeedback;
  }
  const row = await tablesDB.createRow({
    databaseId: db,
    tableId: 'insight_feedback',
    rowId: ID.unique(),
    data: { user_id: userId, plant_id: plantId, insight_kind: insightKind, helpful },
    permissions: ownerPermissions(userId),
  });
  return row as unknown as InsightFeedback;
}

// ---------- photos ----------

export interface PhotoInput {
  userId: string;
  plantId: string;
  observedAt: string;
  contribute: boolean;
  caption?: string;
}

/** Uploads the original to the private bucket (owner-only file permissions;
 * EXIF is NOT stripped here — originals never leave the private bucket), then
 * records the photo observation + photos row. */
export async function uploadPhoto(input: PhotoInput, file: File): Promise<Observation> {
  const perms = ownerPermissions(input.userId);
  const uploaded = await storage.createFile({
    bucketId: PRIVATE_IMAGES_BUCKET,
    fileId: ID.unique(),
    file,
    permissions: perms,
  });
  const observation = (await tablesDB.createRow({
    databaseId: db,
    tableId: 'observations',
    rowId: ID.unique(),
    data: {
      user_id: input.userId,
      plant_id: input.plantId,
      observed_at: input.observedAt,
      observation_type: 'photo',
      notes_private: input.caption?.trim() ? input.caption.trim() : null,
      contribute_to_public_dataset: input.contribute,
    },
    permissions: perms,
  })) as unknown as Observation;
  await tablesDB.createRow({
    databaseId: db,
    tableId: 'photos',
    rowId: ID.unique(),
    data: {
      user_id: input.userId,
      observation_id: observation.$id,
      private_file_id: uploaded.$id,
      caption_private: input.caption?.trim() ? input.caption.trim() : null,
      exif_stripped: false,
      allow_public_image: false,
    },
    permissions: perms,
  });
  return observation;
}

/** View URL for a private photo (no transformation — works on the free plan;
 * access is enforced by the file's owner-only permissions). */
export function photoUrl(fileId: string): string {
  return storage.getFileView({ bucketId: PRIVATE_IMAGES_BUCKET, fileId });
}
