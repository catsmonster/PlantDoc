/**
 * knowledge:mine — upserts source_datasets + species + care_facts for the
 * editorial dataset (roadmap Phase 4A, slice 1). Idempotent: sources and species
 * upsert by deterministic rowId (source_key / slug); each species' care_facts are
 * cleared and re-inserted, so a re-run converges. Relationship columns take the
 * related row id, and because species/source ids ARE the deterministic rowIds,
 * no lookup map is needed. Requires Appwrite admin credentials (.env); never
 * prints secret values.
 *
 * Pure row shaping is tested in tests/lib/knowledge-load-rows.test.ts; this file
 * is thin SDK glue over those builders, matching scripts/appwrite/seed.ts.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { buildSourceRows, buildFactRows } from '../../src/lib/knowledge/load-rows';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const db = DATABASE_ID;

  // 1. source_datasets — upsert by source_key as the row id.
  const sources = buildSourceRows();
  for (const row of sources) {
    await ctx.tablesDB.upsertRow({
      databaseId: db,
      tableId: 'source_datasets',
      rowId: row.source_key,
      data: row,
    });
  }
  console.log(`upserted ${sources.length} source_datasets`);

  // 2. species — upsert by slug as the row id (canonical editorial species).
  for (const p of CARE_PROFILES) {
    await ctx.tablesDB.upsertRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      data: {
        scientific_name: p.scientificName,
        common_names: p.commonNames,
        family: p.family.value,
        slug: p.slug,
      },
    });
  }
  console.log(`upserted ${CARE_PROFILES.length} species`);

  // 3. care_facts — clear each species' facts, then insert fresh.
  for (const p of CARE_PROFILES) {
    const species = await ctx.tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      queries: [Query.select(['*', 'care_facts.*'])],
    });
    const existing = (species as unknown as { care_facts?: { $id: string }[] }).care_facts ?? [];
    for (const f of existing) {
      await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'care_facts', rowId: f.$id });
    }
  }
  const facts = buildFactRows();
  for (const row of facts) {
    await ctx.tablesDB.createRow({
      databaseId: db,
      tableId: 'care_facts',
      rowId: ID.unique(),
      data: {
        species_id: row.species_slug,
        source_id: row.source_key,
        attribute: row.attribute,
        value_min: row.value_min,
        value_max: row.value_max,
        value_text: row.value_text,
        value_unit: row.value_unit,
        trust: row.trust,
      },
    });
  }
  console.log(`loaded ${facts.length} care_facts`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
