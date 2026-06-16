/**
 * knowledge:mine-openplantbook — pulls OpenPlantbook indoor ranges for the
 * catalogued species and writes them as community_unverified care_facts.
 * Source-scoped + idempotent: only this source's facts are cleared per species,
 * so it composes with knowledge:mine in any order. Needs OpenPlantbook OAuth
 * creds (OPEN_PLANTBOOK_CLIENT_ID / OPEN_PLANTBOOK_SECRET in .env) + Appwrite
 * admin creds. Never prints secret values.
 *
 * Resumable by default: a species that already has openplantbook facts is
 * skipped without spending an API request, so a daily run makes forward
 * progress under OpenPlantbook's per-day quota instead of re-fetching covered
 * species. Pass `--refresh` to force a full re-pull (clear + re-fetch every
 * species) when you want fresh values. Species with no exact name match keep
 * 0 facts and are re-attempted each run (one cheap search call apiece).
 *
 * Pure shaping is tested in tests/lib/knowledge-openplantbook.test.ts; this file
 * is thin SDK + fetch glue, matching scripts/knowledge/load-knowledge.ts.
 */
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID } from '../../appwrite/schema';
import { createAdminContext } from '../appwrite/client';
import { buildSourceRows } from '../../src/lib/knowledge/load-rows';
import {
  fetchOpenPlantbookFacts,
  fetchOpenPlantbookToken,
} from '../../src/lib/knowledge/openplantbook';
import { listAllSpecies } from './species-list';

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

interface ExistingFact {
  $id: string;
  source_id?: unknown;
}

/** Resolves a care_fact's source_id whether it's a plain string or a relation row. */
function factSource(f: ExistingFact): string {
  return typeof f.source_id === 'string'
    ? f.source_id
    : String((f.source_id as { $id?: string })?.$id ?? '');
}

async function main(): Promise<void> {
  const ctx = await createAdminContext(); // also loads .env into process.env
  const creds = resolveCreds();
  const db = DATABASE_ID;
  const refresh = process.argv.includes('--refresh');

  const opbRow = buildSourceRows().find((r) => r.source_key === 'openplantbook')!;
  await ctx.tablesDB.upsertRow({
    databaseId: db,
    tableId: 'source_datasets',
    rowId: 'openplantbook',
    data: opbRow,
  });

  // Auth once and reuse the token across the whole catalog.
  const token = await fetchOpenPlantbookToken(creds);
  if (!token) throw new Error('OpenPlantbook authentication failed (check credentials).');

  const catalog = await listAllSpecies(ctx.tablesDB, db);
  console.log(
    `${catalog.length} species in catalog; mode: ${refresh ? 'refresh (re-pull all)' : 'resume (skip already-covered)'}`,
  );
  let total = 0;
  let covered = 0;
  let failed = 0;
  for (const p of catalog) {
    // Read existing facts first (Appwrite call — costs no OpenPlantbook quota).
    const species = await ctx.tablesDB.getRow({
      databaseId: db,
      tableId: 'species',
      rowId: p.slug,
      queries: [Query.select(['*', 'care_facts.*'])],
    });
    const existing = (species as unknown as { care_facts?: ExistingFact[] }).care_facts ?? [];
    const existingOpb = existing.filter((f) => factSource(f) === 'openplantbook');

    // Resume mode: a species that already has openplantbook facts is done — skip
    // it before spending any request so the daily quota goes to uncovered species.
    if (!refresh && existingOpb.length > 0) {
      covered++;
      continue;
    }

    const facts = await fetchOpenPlantbookFacts(p.scientificName, creds, fetch, token);
    // null = request failed (e.g. rate limit); skip so we never clear good data.
    if (facts === null) {
      failed++;
      console.warn(`${p.slug}: openplantbook fetch failed — keeping existing facts`);
      await sleep(200);
      continue;
    }
    // Clear this source's stale facts (a no-op in resume mode, where existingOpb
    // is empty by definition) before writing the fresh pull.
    for (const f of existingOpb) {
      await ctx.tablesDB.deleteRow({ databaseId: db, tableId: 'care_facts', rowId: f.$id });
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
  console.log(
    `loaded ${total} OpenPlantbook care_facts ` +
      `(${covered} already covered/skipped, ${failed} skipped on fetch failure)`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
