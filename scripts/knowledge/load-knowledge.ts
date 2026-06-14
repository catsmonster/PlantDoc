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
import { buildSourceRows, buildFactRows, type FactRow } from '../../src/lib/knowledge/load-rows';

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

  // 3. care_facts — source-scoped: clear only the facts this loader owns
  //    (editorial + the POWO family fact), then insert fresh. Facts from other
  //    loaders (e.g. OpenPlantbook's community_unverified ranges) survive, so the
  //    care-fact loaders compose and re-run in any order.
  const factRows = buildFactRows();
  const bySlug = new Map<string, FactRow[]>();
  for (const row of factRows) {
    const list = bySlug.get(row.species_slug) ?? [];
    list.push(row);
    bySlug.set(row.species_slug, list);
  }
  let inserted = 0;
  for (const p of CARE_PROFILES) {
    const rows = bySlug.get(p.slug) ?? [];
    const owned = new Set(rows.map((r) => r.source_key));
    const species = await ctx.tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      queries: [Query.select(['*', 'care_facts.*'])],
    });
    const existing =
      (species as unknown as { care_facts?: { $id: string; source_id?: unknown }[] }).care_facts ?? [];
    for (const f of existing) {
      const src =
        typeof f.source_id === 'string' ? f.source_id : String((f.source_id as { $id?: string })?.$id ?? '');
      if (owned.has(src)) {
        await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'care_facts', rowId: f.$id });
      }
    }
    for (const row of rows) {
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
    inserted += rows.length;
  }
  console.log(`loaded ${inserted} care_facts`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
