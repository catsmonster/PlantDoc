/**
 * Rebuilds public_observations from consented source observations.
 * Creates new rows, updates changed ones, and deletes rows whose source
 * observation was deleted or had its consent revoked (privacy.md revocation).
 * Run via `npm run export:build`. Server-side only; never prints secrets.
 */
import { Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import {
  coarsenGeoCohorts,
  toPublicRow,
  type PublicRow,
  type SourceObservation,
} from './transform';

const PAGE = 100;
const MIN_COHORT = 5;

async function listAll<T>(fetchPage: (cursor: string | null) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    all.push(...page);
    if (page.length < PAGE) return all;
    cursor = (page[page.length - 1] as { $id: string }).$id;
  }
}

export interface BuildSummary {
  consented: number;
  exportable: number;
  created: number;
  updated: number;
  removed: number;
}

export async function buildPublicObservations(): Promise<BuildSummary> {
  const ctx = await createAdminContext();
  const now = new Date().toISOString();

  const consented = await listAll<SourceObservation>(async (cursor) => {
    const queries = [
      Query.equal('contribute_to_public_dataset', true),
      Query.limit(PAGE),
      Query.select([
        '*',
        'plant_id.*',
        'plant_id.species_id.*',
        'plant_id.location_id.*',
        'treatments.*',
        'measurements.*',
        'photos.*',
      ]),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await ctx.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: 'observations',
      queries,
    });
    return result.rows as unknown as SourceObservation[];
  });

  // dataset_version on live rows tracks the build, not a published artifact;
  // publish.ts stamps artifact versions. Use a build timestamp marker here.
  const buildVersion = `build-${now.slice(0, 10)}`;
  const desiredRows = new Map<string, PublicRow>();
  for (const obs of consented) {
    const row = toPublicRow(obs, { datasetVersion: buildVersion, publishedAt: now });
    if (row) desiredRows.set(obs.$id, row);
  }
  const coarsened = coarsenGeoCohorts([...desiredRows.values()], MIN_COHORT);
  for (const row of coarsened) desiredRows.set(String(row.source_observation_id), row);

  interface ExistingRow extends PublicRow {
    $id: string;
  }
  const existing = await listAll<ExistingRow>(async (cursor) => {
    const queries = [Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await ctx.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: 'public_observations',
      queries,
    });
    return result.rows as unknown as ExistingRow[];
  });
  const existingBySource = new Map(existing.map((row) => [String(row.source_observation_id), row]));

  const summary: BuildSummary = {
    consented: consented.length,
    exportable: desiredRows.size,
    created: 0,
    updated: 0,
    removed: 0,
  };

  // Fields that changing alone should not trigger an update write.
  const VOLATILE = new Set(['dataset_version', 'published_at']);
  const differs = (desired: PublicRow, current: ExistingRow): boolean =>
    Object.entries(desired).some(
      ([key, value]) => !VOLATILE.has(key) && (current[key] ?? null) !== value,
    );

  for (const [sourceId, desired] of desiredRows) {
    const current = existingBySource.get(sourceId);
    if (!current) {
      await ctx.tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: 'public_observations',
        rowId: 'unique()',
        data: desired,
      });
      summary.created += 1;
      console.log(`created  ${sourceId}`);
    } else if (differs(desired, current)) {
      await ctx.tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: 'public_observations',
        rowId: current.$id,
        data: desired,
      });
      summary.updated += 1;
      console.log(`updated  ${sourceId}`);
    }
  }

  for (const [sourceId, row] of existingBySource) {
    if (!desiredRows.has(sourceId)) {
      await ctx.tablesDB.deleteRow({
        databaseId: DATABASE_ID,
        tableId: 'public_observations',
        rowId: row.$id,
      });
      summary.removed += 1;
      console.log(`removed  ${sourceId} (deleted or consent revoked)`);
    }
  }

  console.log(
    `build complete: ${summary.consented} consented, ${summary.exportable} exportable, ` +
      `${summary.created} created, ${summary.updated} updated, ${summary.removed} removed`,
  );
  return summary;
}

void buildPublicObservations().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
