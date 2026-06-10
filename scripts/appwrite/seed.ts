/**
 * Applies the deterministic synthetic seed data. Upserts by fixed rowId, so
 * repeated runs update rather than duplicate. Requires appwrite:setup to have
 * been run first. Never prints secret values.
 */
import { DATABASE_ID } from '../../appwrite/schema';
import { SEED_ROWS } from '../../appwrite/seed-data';
import { createAdminContext } from './client';
import { toPermissions } from './setup';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  console.log(`seeding ${SEED_ROWS.length} rows into ${DATABASE_ID}`);

  for (const row of SEED_ROWS) {
    await ctx.tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: row.tableId,
      rowId: row.rowId,
      data: row.data,
      permissions: toPermissions(row.permissions),
    });
    console.log(`upserted ${row.tableId}/${row.rowId}`);
  }

  console.log('seed complete');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
