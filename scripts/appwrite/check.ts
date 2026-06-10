/**
 * Local-only validation: credentials shape + schema definition sanity.
 * Performs no remote reads or writes. Never prints secret values.
 */
import { BUCKETS, DATABASE_ID, TABLES } from '../../appwrite/schema';
import { loadAppwriteEnv } from './env';

async function main(): Promise<void> {
  const problems: string[] = [];

  try {
    const env = await loadAppwriteEnv();
    console.log(`env: ok (project id, name, endpoint, api key resolved for ${env.projectName})`);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  const tableIds = new Set(TABLES.map((t) => t.id));
  if (tableIds.size !== TABLES.length) problems.push('duplicate table ids in schema');
  for (const table of TABLES) {
    if (table.permissions.some((p) => p.includes('any'))) {
      problems.push(`${table.id}: Role.any() grant is forbidden in Phase 0`);
    }
    for (const col of table.columns) {
      if (col.kind === 'relationship' && !tableIds.has(col.relatedTableId)) {
        problems.push(`${table.id}.${col.key}: unknown related table ${col.relatedTableId}`);
      }
    }
  }
  for (const bucket of BUCKETS) {
    if (bucket.permissions.some((p) => p.includes('any'))) {
      problems.push(`${bucket.id}: Role.any() grant is forbidden in Phase 0`);
    }
  }

  const columnCount = TABLES.reduce((n, t) => n + t.columns.length, 0);
  const indexCount = TABLES.reduce((n, t) => n + t.indexes.length, 0);
  console.log(
    `schema: database ${DATABASE_ID}, ${TABLES.length} tables, ` +
      `${columnCount} columns, ${indexCount} indexes, ${BUCKETS.length} buckets`,
  );

  if (problems.length > 0) {
    console.error('check failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('check: all good');
}

void main();
