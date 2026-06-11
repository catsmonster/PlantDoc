/**
 * One-off Phase 3 migration: replace the one-way environment_snapshots →
 * observations relationship with a two-way cascade version. Refuses to run
 * if the table has rows. Re-run `npm run appwrite:setup` afterwards to
 * create the new column from schema.ts.
 */
import { Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from './client';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const rows = await ctx.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: 'environment_snapshots',
    queries: [Query.limit(100)],
  });
  const nonSeed = rows.rows.filter((r) => !r.$id.startsWith('seed_'));
  if (nonSeed.length > 0 || rows.total > rows.rows.length) {
    throw new Error(
      `environment_snapshots has ${nonSeed.length || 'paged'} non-seed rows; manual migration required.`,
    );
  }
  for (const row of rows.rows) {
    await ctx.tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: 'environment_snapshots',
      rowId: row.$id,
    });
    console.log(`deleted seed row ${row.$id} (recreate via npm run appwrite:seed)`);
  }
  try {
    await ctx.tablesDB.deleteColumn({
      databaseId: DATABASE_ID,
      tableId: 'environment_snapshots',
      key: 'observation_id',
    });
    console.log('deleted one-way observation_id column');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('not found') && !message.includes('Column not found')) throw error;
    console.log('observation_id column already absent');
  }
  console.log('done — run npm run appwrite:setup to recreate it two-way');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
