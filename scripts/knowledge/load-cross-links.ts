/**
 * knowledge:cross-links — populates taxon_references for the catalogued species
 * by resolving each species' cross-links from Wikidata (CC0) + the GBIF match
 * API (CC-BY). Idempotent: source_datasets upsert by source_key; each species'
 * taxon_references are cleared and re-inserted, so a re-run converges.
 * Relationship columns take the related row id (species slug / source key, both
 * deterministic). Keyless network; requires only Appwrite admin creds (.env).
 *
 * Pure shaping is tested in tests/lib/knowledge-wikidata.test.ts and
 * knowledge-taxon-refs.test.ts; this file is thin SDK + fetch glue, matching
 * scripts/knowledge/load-knowledge.ts.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { fetchWikidataCrossLinks } from '../../src/lib/knowledge/wikidata';
import { matchGbifSpecies } from '../../src/lib/knowledge/gbif';
import { buildTaxonRefRows } from '../../src/lib/knowledge/taxon-refs';
import { listAllSpecies } from './species-list';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const db = DATABASE_ID;

  // Ensure the cross-link target catalogs exist as source rows.
  for (const row of buildSourceRows()) {
    await ctx.tablesDB.upsertRow({
      databaseId: db,
      tableId: 'source_datasets',
      rowId: row.source_key,
      data: row,
    });
  }

  const catalog = await listAllSpecies(ctx.tablesDB, db);
  let total = 0;
  for (const p of catalog) {
    const [wikidata, gbif] = await Promise.all([
      fetchWikidataCrossLinks(p.scientificName),
      matchGbifSpecies(p.scientificName),
    ]);
    const rows = buildTaxonRefRows(p.slug, wikidata, gbif?.usageKey ?? null);

    const species = await ctx.tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      queries: [Query.select(['*', 'taxon_references.*'])],
    });
    const existing =
      (species as unknown as { taxon_references?: { $id: string }[] }).taxon_references ?? [];
    for (const ref of existing) {
      await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'taxon_references', rowId: ref.$id });
    }
    for (const row of rows) {
      await ctx.tablesDB.createRow({
        databaseId: db,
        tableId: 'taxon_references',
        rowId: ID.unique(),
        data: {
          species_id: row.species_slug,
          source_id: row.source_key,
          external_id: row.external_id,
          external_url: row.external_url,
        },
      });
    }
    total += rows.length;
    console.log(`${p.slug}: ${rows.length} refs`);
    await sleep(300); // be polite to the Wikidata Query Service
  }
  console.log(`loaded ${total} taxon_references across ${catalog.length} species`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
