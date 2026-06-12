/**
 * backfill-summaries.ts
 *
 * One-off admin script that populates the five summary columns
 * (last_watered_at, watering_count, watering_cadence_days,
 *  latest_photo_file_id, latest_photo_observed_at) for all existing plants
 * by scanning their full observation timelines.
 *
 * Usage:
 *   npx tsx scripts/appwrite/backfill-summaries.ts
 *
 * Safe to re-run: each plant update is independent.
 * Requires APPWRITE_API_KEY and the other env vars in .env.
 */

import { Query, type TablesDB } from 'node-appwrite';
import { createAdminContext } from './client';
import { DATABASE_ID } from '../../appwrite/schema';

const PLANTS_TABLE = 'plants';
const OBSERVATIONS_TABLE = 'observations';
const TREATMENTS_TABLE = 'treatments';
const PHOTOS_TABLE = 'photos';
const PAGE_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = { $id: string } & Record<string, unknown>;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface PlantSummary {
  last_watered_at: string | null;
  watering_count: number;
  watering_cadence_days: number | null;
  latest_photo_file_id: string | null;
  latest_photo_observed_at: string | null;
}

async function listRowsPage(
  tablesDB: TablesDB,
  tableId: string,
  queries: string[],
): Promise<Row[]> {
  const result = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId, queries });
  return result.rows as unknown as Row[];
}

async function computeSummary(tablesDB: TablesDB, plantId: string): Promise<PlantSummary> {
  // Fetch all watering observations for this plant
  const wateringTimes: number[] = [];
  let lastWateredAt: string | null = null;

  // Page through observations to find waterings
  let cursor: string | undefined;
  for (;;) {
    const queries = [
      Query.equal('plant_id', plantId),
      Query.equal('observation_type', 'treatment'),
      Query.limit(PAGE_SIZE),
      Query.orderAsc('observed_at'),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await listRowsPage(tablesDB, OBSERVATIONS_TABLE, queries);
    for (const obs of page) {
      // Fetch treatments for this observation to check treatment_type
      const treats = await listRowsPage(tablesDB, TREATMENTS_TABLE, [
        Query.equal('observation_id', obs.$id),
        Query.equal('treatment_type', 'watering'),
        Query.limit(1),
      ]);
      if (treats.length > 0) {
        const ms = Date.parse(obs.observed_at as string);
        wateringTimes.push(ms);
        if (!lastWateredAt || (obs.observed_at as string) > lastWateredAt) {
          lastWateredAt = obs.observed_at as string;
        }
      }
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].$id;
  }

  // Compute cadence
  let wateringCadenceDays: number | null = null;
  if (wateringTimes.length >= 3) {
    const sorted = [...wateringTimes].sort((a, b) => a - b);
    const intervals = sorted.slice(1).map((t, i) => (t - sorted[i]) / DAY_MS);
    wateringCadenceDays = Math.round(median(intervals));
  }

  // Find latest photo
  let latestPhotoFileId: string | null = null;
  let latestPhotoObservedAt: string | null = null;

  cursor = undefined;
  for (;;) {
    const queries = [
      Query.equal('plant_id', plantId),
      Query.equal('observation_type', 'photo'),
      Query.limit(PAGE_SIZE),
      Query.orderDesc('observed_at'),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await listRowsPage(tablesDB, OBSERVATIONS_TABLE, queries);
    for (const obs of page) {
      const photos = await listRowsPage(tablesDB, PHOTOS_TABLE, [
        Query.equal('observation_id', obs.$id),
        Query.limit(1),
      ]);
      if (photos.length > 0) {
        const candidateAt = obs.observed_at as string;
        if (!latestPhotoObservedAt || candidateAt > latestPhotoObservedAt) {
          latestPhotoFileId = photos[0].private_file_id as string;
          latestPhotoObservedAt = candidateAt;
        }
        break; // descending order, first photo observation is the most recent
      }
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].$id;
    if (latestPhotoFileId) break; // already found the latest
  }

  return {
    last_watered_at: lastWateredAt,
    watering_count: wateringTimes.length,
    watering_cadence_days: wateringCadenceDays,
    latest_photo_file_id: latestPhotoFileId,
    latest_photo_observed_at: latestPhotoObservedAt,
  };
}

async function main() {
  const { tablesDB, env } = await createAdminContext();
  console.log(`Connected to Appwrite project "${env.projectId}" at ${env.endpoint}`);

  let plantCursor: string | undefined;
  let total = 0;
  let updated = 0;
  let failed = 0;

  for (;;) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderAsc('$id')];
    if (plantCursor) queries.push(Query.cursorAfter(plantCursor));

    const page = await listRowsPage(tablesDB, PLANTS_TABLE, queries);
    if (page.length === 0) break;

    for (const plant of page) {
      total += 1;
      try {
        const summary = await computeSummary(tablesDB, plant.$id);
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: PLANTS_TABLE,
          rowId: plant.$id,
          data: summary,
        });
        console.log(
          `  ✓ ${plant.$id} (${plant.nickname ?? 'unnamed'}): ` +
            `${summary.watering_count} waterings, cadence=${summary.watering_cadence_days ?? 'N/A'}d, ` +
            `photo=${summary.latest_photo_file_id ? 'yes' : 'none'}`,
        );
        updated += 1;
      } catch (err) {
        console.error(`  ✗ ${plant.$id}: ${(err as Error).message}`);
        failed += 1;
      }
    }

    if (page.length < PAGE_SIZE) break;
    plantCursor = page[page.length - 1].$id;
  }

  console.log(`\nDone. ${total} plants processed: ${updated} updated, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
