/**
 * knowledge:seed-species — upserts the full species catalogue (editorial pack +
 * common-plants seed) into the `species` table, plus the source registry.
 * Idempotent by slug. The mining loaders (cross-links, OpenPlantbook,
 * Permapeople) read the table, so this is the one place that decides "which
 * species exist"; growing coverage is just growing the seed. Roadmap Phase 4A,
 * slice 5. Requires Appwrite admin creds (.env); never prints secret values.
 */
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { buildSpeciesCatalog } from './catalog';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const db = DATABASE_ID;

  for (const row of buildSourceRows()) {
    await ctx.tablesDB.upsertRow({
      databaseId: db,
      tableId: 'source_datasets',
      rowId: row.source_key,
      data: row,
    });
  }

  const catalog = buildSpeciesCatalog();
  for (const s of catalog) {
    await ctx.tablesDB.upsertRow({
      databaseId: db,
      tableId: 'species',
      rowId: s.slug,
      data: { scientific_name: s.scientificName, common_names: s.commonNames, slug: s.slug },
    });
  }
  console.log(`seeded ${catalog.length} species`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
