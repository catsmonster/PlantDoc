/**
 * knowledge:mine-permapeople — pulls Permapeople cultivation traits for the
 * catalogued species and writes them as sourced care_facts from a QUARANTINED
 * CC-BY-SA source. Source-scoped + idempotent: only this source's facts are
 * cleared per species, so it composes with the other care-fact loaders in any
 * order. Needs Permapeople key id/secret (PERMAPEOPLE_ID / PERMAPEOPLE_API in
 * .env) + Appwrite admin creds. Never prints secret values.
 *
 * Pure shaping is tested in tests/lib/knowledge-permapeople.test.ts; this file
 * is thin SDK + fetch glue, matching scripts/knowledge/load-openplantbook.ts.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { CARE_PROFILES } from '../../src/lib/knowledge/care-profiles';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import { fetchPermapeopleFacts } from '../../src/lib/knowledge/permapeople';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveCreds(): { keyId: string; secret: string } {
  const keyId = process.env.PERMAPEOPLE_ID?.trim();
  const secret = process.env.PERMAPEOPLE_API?.trim();
  if (!keyId || !secret) {
    throw new Error(
      'Missing Permapeople credentials: set PERMAPEOPLE_ID (key id) and ' +
        'PERMAPEOPLE_API (key secret) in .env (server secrets — no VITE_ prefix).',
    );
  }
  return { keyId, secret };
}

async function main(): Promise<void> {
  const ctx = await createAdminContext(); // also loads .env into process.env
  const creds = resolveCreds();
  const db = DATABASE_ID;

  const ppRow = buildSourceRows().find((r) => r.source_key === 'permapeople')!;
  await ctx.tablesDB.upsertRow({
    databaseId: db,
    tableId: 'source_datasets',
    rowId: 'permapeople',
    data: ppRow,
  });

  let total = 0;
  for (const p of CARE_PROFILES) {
    const facts = await fetchPermapeopleFacts(p.scientificName, creds);
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
      if (src === 'permapeople') {
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
          source_id: 'permapeople',
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
    console.log(`${p.slug}: ${facts.length} permapeople facts`);
    await sleep(200);
  }
  console.log(`loaded ${total} Permapeople care_facts`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
