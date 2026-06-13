/**
 * knowledge:mine-openplantbook — pulls OpenPlantbook indoor ranges for the
 * catalogued species and writes them as community_unverified care_facts.
 * Source-scoped + idempotent: only this source's facts are cleared per species,
 * so it composes with knowledge:mine in any order. Needs OpenPlantbook OAuth
 * creds (OPEN_PLANTBOOK_CLIENT_ID / OPEN_PLANTBOOK_SECRET in .env) + Appwrite
 * admin creds. Never prints secret values.
 *
 * Pure shaping is tested in tests/lib/knowledge-openplantbook.test.ts; this file
 * is thin SDK + fetch glue, matching scripts/knowledge/load-knowledge.ts.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { fetchOpenPlantbookFacts } from '../../src/lib/knowledge/openplantbook';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveCreds(): { clientId: string; secret: string } {
  const clientId = process.env.OPEN_PLANTBOOK_CLIENT_ID?.trim();
  const secret = process.env.OPEN_PLANTBOOK_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error(
      'Missing OpenPlantbook credentials: set OPEN_PLANTBOOK_CLIENT_ID and ' +
        'OPEN_PLANTBOOK_SECRET in .env (server secrets — no VITE_ prefix).',
    );
  }
  return { clientId, secret };
}

async function main(): Promise<void> {
  const ctx = await createAdminContext(); // also loads .env into process.env
  const creds = resolveCreds();
  const db = DATABASE_ID;

  const opbRow = buildSourceRows().find((r) => r.source_key === 'openplantbook')!;
  await ctx.tablesDB.upsertRow({
    databaseId: db,
    tableId: 'source_datasets',
    rowId: 'openplantbook',
    data: opbRow,
  });

  let total = 0;
  for (const p of CARE_PROFILES) {
    const facts = await fetchOpenPlantbookFacts(p.scientificName, creds);
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
      if (src === 'openplantbook') {
        await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'care_facts', rowId: f.$id });
      }
    }
    for (const fact of facts) {
      await ctx.tablesDB.createRow({
        databaseId: db,
        tableId: 'care_facts',
        rowId: ID.unique(),
        data: {
          species_id: p.slug,
          source_id: 'openplantbook',
          attribute: fact.attribute,
          value_min: fact.valueMin ?? null,
          value_max: fact.valueMax ?? null,
          value_text: fact.valueText ?? null,
          value_unit: fact.valueUnit ?? null,
          trust: fact.trust,
        },
      });
    }
    total += facts.length;
    console.log(`${p.slug}: ${facts.length} openplantbook facts`);
    await sleep(200);
  }
  console.log(`loaded ${total} OpenPlantbook care_facts`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
