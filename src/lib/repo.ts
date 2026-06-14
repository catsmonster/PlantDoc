import { ID, Query } from 'appwrite';
import { DATABASE_ID, PRIVATE_IMAGES_BUCKET, storage, tablesDB } from './appwrite';
import { forStorage, type Coords, type LocationPrecision } from './geo';
import { buildLogPayload, type LogInput } from './log';
import { ownerPermissions } from './owner';
import { composeCareProfile, careFactsFromSpeciesRow, type CareFact } from './knowledge/facts';
import { getSource } from './knowledge/sources';
import type { SpeciesCareProfile } from './knowledge/care-profiles';
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

/**
 * The full read-only species catalogue for onboarding, cursor-paginated so
 * EVERY catalogued species is selectable. A fixed `limit` would hide species
 * past the first page: the plant could never get a `species_id` relation for
 * them, leaving their mined `care_facts` permanently unreachable in the UI. A
 * light column select keeps the payload small (the form only needs the id,
 * name, and common names).
 *
 * This loads the whole catalogue per form open, which is fine for a catalogue
 * in the hundreds. Once it grows into the thousands, move suggestion ranking +
 * `species_id` resolution server-side instead (see docs/knowledge-layer.md).
 */
export async function listSpecies(): Promise<Species[]> {
  const rows: Species[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [Query.limit(100), Query.select(['$id', 'scientific_name', 'common_names'])];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await tablesDB.listRows({ databaseId: db, tableId: 'species', queries });
    const page = result.rows as unknown as Species[];
    rows.push(...page);
    if (page.length < 100) break;
    cursor = page[page.length - 1].$id;
  }
  return rows;
}

/**
 * Loads the table-backed care profile for a species, composed from its
 * care_facts. Facts are read through the species two-way relation (relationship
 * columns are not directly queryable), then shaped into the SpeciesCareProfile
 * the UI consumes. Returns null when the species has no facts or the read fails,
 * so the panel degrades to hidden rather than erroring.
 *
 * Slice 1: source rows are upserted with rowId = source_key, so the hydrated
 * source id already IS the registry key; getSource resolves it directly, with an
 * editorial fallback. Slice 2 swaps in a cached source_datasets index.
 */
export async function getCareProfile(speciesId: string): Promise<SpeciesCareProfile | null> {
  try {
    const row = await tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: speciesId,
      queries: [Query.select(['*', 'care_facts.*'])],
    });
    const facts: CareFact[] = careFactsFromSpeciesRow(row as never, (id) =>
      getSource(id) ? id : 'plantdoc-editorial',
    );
    const r = row as { scientific_name?: string; slug?: string; common_names?: string[] };
    return composeCareProfile(r.scientific_name ?? '', facts, {
      slug: r.slug ?? speciesId,
      commonNames: r.common_names ?? [],
      synonyms: [],
      nameSourceId: 'powo',
    });
  } catch {
    return null;
  }
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
  last_watered_at?: string | null;
  watering_count?: number | null;
  watering_cadence_days?: number | null;
  latest_photo_file_id?: string | null;
  latest_photo_observed_at?: string | null;
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
        'last_watered_at',
        'watering_count',
        'watering_cadence_days',
        'latest_photo_file_id',
        'latest_photo_observed_at',
      ]),
    ],
  });
  return result.rows as unknown as Plant[];
}

export async function listPlantsWithTimeline(userId: string): Promise<Plant[]> {
  const result = await tablesDB.listRows({
    databaseId: db,
    tableId: 'plants',
    queries: [
      Query.equal('user_id', userId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      Query.select([
        '*',
        'observations.*',
        'observations.treatments.*',
      ]),
    ],
  });
  const plants = result.rows as unknown as Plant[];
  for (const plant of plants) {
    plant.observations = [...(plant.observations ?? [])].sort((a, b) =>
      b.observed_at.localeCompare(a.observed_at),
    );
  }
  return plants;
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

export async function updatePlantSummaryFields(plantId: string): Promise<Plant> {
  const plant = await getPlantWithTimeline(plantId);

  // Compute last_watered_at, watering_count, watering_cadence_days
  const waterings = (plant.observations ?? [])
    .filter((obs) => obs.treatments?.some((t) => t.treatment_type === 'watering'))
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at));

  const wateringCount = waterings.length;
  const lastWateredAt = wateringCount > 0 ? waterings[wateringCount - 1].observed_at : null;

  let wateringCadenceDays: number | null = null;
  if (wateringCount >= 3) {
    const times = waterings.map((w) => Date.parse(w.observed_at));
    const intervals = times.slice(1).map((t, i) => (t - times[i]) / (24 * 60 * 60 * 1000));
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    wateringCadenceDays = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Compute latest_photo_file_id, latest_photo_observed_at
  const photos = (plant.observations ?? [])
    .filter((obs) => obs.observation_type === 'photo' && obs.photos && obs.photos.length > 0)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));

  const latestPhoto = photos[0];
  const latestPhotoFileId = latestPhoto ? latestPhoto.photos![0].private_file_id : null;
  const latestPhotoObservedAt = latestPhoto ? latestPhoto.observed_at : null;

  const updated = await tablesDB.updateRow({
    databaseId: db,
    tableId: 'plants',
    rowId: plantId,
    data: {
      last_watered_at: lastWateredAt,
      watering_count: wateringCount,
      watering_cadence_days: wateringCadenceDays,
      latest_photo_file_id: latestPhotoFileId,
      latest_photo_observed_at: latestPhotoObservedAt,
    },
  });

  return updated as unknown as Plant;
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
  // Best-effort update of plant summary fields
  updatePlantSummaryFields(input.plantId).catch((err) => {
    console.error('Failed to update plant summary fields:', err);
  });
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
  // Best-effort update of plant summary fields
  updatePlantSummaryFields(input.plantId).catch((err) => {
    console.error('Failed to update plant summary fields:', err);
  });
  return observation;
}

/** View URL for a private photo (no transformation — works on the free plan;
 * access is enforced by the file's owner-only permissions). */
export function photoUrl(fileId: string): string {
  return storage.getFileView({ bucketId: PRIVATE_IMAGES_BUCKET, fileId });
}
