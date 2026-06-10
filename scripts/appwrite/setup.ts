/**
 * Idempotent Appwrite resource setup for the PlantDoc Phase 0 schema.
 *
 * Algorithm: get each resource first and create it only when missing. Existing
 * resources are compared against the schema definition; incompatible shapes
 * fail with a "manual migration required" error. Nothing is ever deleted.
 */
import {
  AppwriteException,
  Compression,
  Query,
  RelationMutate,
  RelationshipType,
  TablesDBIndexType,
  type Models,
} from 'node-appwrite';
import {
  BUCKETS,
  DATABASE_ID,
  DATABASE_NAME,
  TABLES,
  type BucketDef,
  type ColumnDef,
  type IndexDef,
  type TableDef,
} from '../../appwrite/schema';
import { createAdminContext, type AdminContext } from './client';
import { toPermissions } from './permissions';

class ManualMigrationRequired extends Error {
  constructor(resource: string, detail: string) {
    super(`Manual migration required for ${resource}: ${detail}`);
    this.name = 'ManualMigrationRequired';
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404;
}

const RELATION_TYPE = {
  oneToOne: RelationshipType.OneToOne,
  oneToMany: RelationshipType.OneToMany,
  manyToOne: RelationshipType.ManyToOne,
  manyToMany: RelationshipType.ManyToMany,
} as const;

const ON_DELETE = {
  cascade: RelationMutate.Cascade,
  setNull: RelationMutate.SetNull,
  restrict: RelationMutate.Restrict,
} as const;

const INDEX_TYPE = {
  key: TablesDBIndexType.Key,
  unique: TablesDBIndexType.Unique,
  fulltext: TablesDBIndexType.Fulltext,
} as const;

const COMPRESSION = {
  none: Compression.None,
  gzip: Compression.Gzip,
  zstd: Compression.Zstd,
} as const;

/** Acceptable remote `type` strings per column kind (API naming varies by version). */
const TYPE_ALIASES: Record<ColumnDef['kind'], string[]> = {
  varchar: ['varchar', 'string'],
  text: ['text', 'string'],
  integer: ['integer'],
  float: ['double', 'float'],
  boolean: ['boolean'],
  datetime: ['datetime'],
  enum: ['enum', 'string'],
  point: ['point'],
  relationship: ['relationship'],
};

interface RemoteColumn {
  key: string;
  type: string;
  status: string;
  required?: boolean;
  array?: boolean;
  elements?: string[];
  relatedTable?: string;
  relationType?: string;
  error?: string;
}

const stats = { created: 0, exists: 0, updated: 0 };

function log(action: 'created' | 'exists' | 'updated', resource: string): void {
  stats[action] += 1;
  console.log(`${action.padEnd(7)} ${resource}`);
}

/** True when two permission lists contain the same grants, ignoring order. */
function samePermissions(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

async function ensureDatabase(ctx: AdminContext): Promise<void> {
  try {
    await ctx.tablesDB.get({ databaseId: DATABASE_ID });
    log('exists', `database ${DATABASE_ID}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await ctx.tablesDB.create({ databaseId: DATABASE_ID, name: DATABASE_NAME });
    log('created', `database ${DATABASE_ID}`);
  }
}

async function ensureTable(ctx: AdminContext, table: TableDef): Promise<void> {
  try {
    const remote = await ctx.tablesDB.getTable({ databaseId: DATABASE_ID, tableId: table.id });
    const wanted = toPermissions(table.permissions);
    const broad = (remote.$permissions ?? []).filter((p: string) => p.includes('any'));
    if (broad.length > 0) {
      throw new ManualMigrationRequired(
        `table ${table.id}`,
        `unexpected public grant(s) present: ${broad.join(', ')}`,
      );
    }
    if (!samePermissions(remote.$permissions ?? [], wanted)) {
      await ctx.tablesDB.updateTable({
        databaseId: DATABASE_ID,
        tableId: table.id,
        name: table.name,
        permissions: wanted,
        rowSecurity: table.rowSecurity,
      });
      log('updated', `table ${table.id} permissions`);
      return;
    }
    log('exists', `table ${table.id}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await ctx.tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: table.id,
      name: table.name,
      permissions: toPermissions(table.permissions),
      rowSecurity: table.rowSecurity,
    });
    log('created', `table ${table.id}`);
  }
}

function assertColumnCompatible(tableId: string, col: ColumnDef, remote: RemoteColumn): void {
  const resource = `${tableId}.${col.key}`;
  if (!TYPE_ALIASES[col.kind].includes(remote.type)) {
    throw new ManualMigrationRequired(
      resource,
      `defined kind '${col.kind}' but remote type is '${remote.type}'`,
    );
  }
  if (col.kind !== 'relationship') {
    const wantRequired = col.required ?? false;
    if ((remote.required ?? false) !== wantRequired) {
      throw new ManualMigrationRequired(
        resource,
        `required flag differs (defined ${wantRequired}, remote ${remote.required ?? false})`,
      );
    }
    const wantArray = col.array ?? false;
    if ((remote.array ?? false) !== wantArray) {
      throw new ManualMigrationRequired(
        resource,
        `array flag differs (defined ${wantArray}, remote ${remote.array ?? false})`,
      );
    }
  }
  if (col.kind === 'enum' && remote.elements) {
    const want = [...col.elements].sort().join(',');
    const have = [...remote.elements].sort().join(',');
    if (want !== have) {
      throw new ManualMigrationRequired(resource, `enum elements differ (${have} vs ${want})`);
    }
  }
  if (col.kind === 'relationship') {
    if (remote.relatedTable && remote.relatedTable !== col.relatedTableId) {
      throw new ManualMigrationRequired(
        resource,
        `relationship target differs (remote ${remote.relatedTable}, defined ${col.relatedTableId})`,
      );
    }
    if (remote.relationType && remote.relationType !== col.relationType) {
      throw new ManualMigrationRequired(
        resource,
        `relationship type differs (remote ${remote.relationType}, defined ${col.relationType})`,
      );
    }
  }
}

async function createColumn(ctx: AdminContext, tableId: string, col: ColumnDef): Promise<void> {
  const base = { databaseId: DATABASE_ID, tableId, key: col.key };
  const required = col.required ?? false;
  const array = col.array ?? false;
  switch (col.kind) {
    case 'varchar':
      await ctx.tablesDB.createVarcharColumn({
        ...base,
        size: col.size,
        required,
        xdefault: col.default,
        array,
      });
      break;
    case 'text':
      await ctx.tablesDB.createTextColumn({ ...base, required, xdefault: col.default, array });
      break;
    case 'integer':
      await ctx.tablesDB.createIntegerColumn({
        ...base,
        required,
        min: col.min,
        max: col.max,
        xdefault: col.default,
        array,
      });
      break;
    case 'float':
      await ctx.tablesDB.createFloatColumn({
        ...base,
        required,
        min: col.min,
        max: col.max,
        xdefault: col.default,
        array,
      });
      break;
    case 'boolean':
      await ctx.tablesDB.createBooleanColumn({ ...base, required, xdefault: col.default, array });
      break;
    case 'datetime':
      await ctx.tablesDB.createDatetimeColumn({ ...base, required, xdefault: col.default, array });
      break;
    case 'enum':
      await ctx.tablesDB.createEnumColumn({
        ...base,
        elements: col.elements,
        required,
        xdefault: col.default,
        array,
      });
      break;
    case 'point':
      await ctx.tablesDB.createPointColumn({ ...base, required });
      break;
    case 'relationship':
      await ctx.tablesDB.createRelationshipColumn({
        databaseId: DATABASE_ID,
        tableId,
        relatedTableId: col.relatedTableId,
        type: RELATION_TYPE[col.relationType],
        twoWay: col.twoWay,
        key: col.key,
        twoWayKey: col.twoWayKey,
        onDelete: ON_DELETE[col.onDelete],
      });
      break;
  }
}

async function ensureColumn(ctx: AdminContext, tableId: string, col: ColumnDef): Promise<void> {
  try {
    const remote = (await ctx.tablesDB.getColumn({
      databaseId: DATABASE_ID,
      tableId,
      key: col.key,
    })) as unknown as RemoteColumn;
    if (['failed', 'stuck'].includes(remote.status)) {
      // A failed async create never became a real column and holds no data;
      // clearing it is recovery, not a destructive migration.
      console.log(`recreating failed column ${tableId}.${col.key} (${remote.error ?? 'no detail'})`);
      await ctx.tablesDB.deleteColumn({ databaseId: DATABASE_ID, tableId, key: col.key });
      await createColumn(ctx, tableId, col);
      log('created', `column ${tableId}.${col.key}`);
      return;
    }
    assertColumnCompatible(tableId, col, remote);
    log('exists', `column ${tableId}.${col.key}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await createColumn(ctx, tableId, col);
    log('created', `column ${tableId}.${col.key}`);
  }
}

/**
 * Relationship creation also builds indexes server-side; creating another
 * relationship on the same table while one is still processing can fail.
 * Wait for the column to settle before creating the next one.
 */
async function waitForColumn(ctx: AdminContext, tableId: string, key: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const remote = (await ctx.tablesDB.getColumn({
      databaseId: DATABASE_ID,
      tableId,
      key,
    })) as unknown as RemoteColumn;
    if (remote.status === 'available') return;
    if (['failed', 'stuck'].includes(remote.status)) {
      throw new Error(`column ${tableId}.${key} ${remote.status}: ${remote.error ?? 'no detail'}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for column ${tableId}.${key} (${remote.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function waitForColumns(ctx: AdminContext, table: TableDef): Promise<void> {
  const wanted = new Set(table.columns.map((c) => c.key));
  const deadline = Date.now() + 60_000;
  for (;;) {
    const { columns } = (await ctx.tablesDB.listColumns({
      databaseId: DATABASE_ID,
      tableId: table.id,
      queries: [Query.limit(100)],
    })) as unknown as { columns: RemoteColumn[] };
    const pending = columns.filter((c) => wanted.has(c.key) && c.status !== 'available');
    const failed = pending.filter((c) => ['failed', 'stuck'].includes(c.status));
    if (failed.length > 0) {
      const detail = failed.map((c) => `${c.key} (${c.status}: ${c.error ?? 'no detail'})`);
      throw new Error(`columns failed in ${table.id}: ${detail.join(', ')}`);
    }
    if (pending.length === 0) return;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for columns in ${table.id}: ${pending.map((c) => c.key).join(', ')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function ensureIndex(ctx: AdminContext, tableId: string, index: IndexDef): Promise<void> {
  try {
    const remote = (await ctx.tablesDB.getIndex({
      databaseId: DATABASE_ID,
      tableId,
      key: index.key,
    })) as unknown as Models.ColumnIndex;
    if (remote.type !== index.type || remote.columns.join(',') !== index.columns.join(',')) {
      throw new ManualMigrationRequired(
        `${tableId}.${index.key}`,
        `index differs (remote ${remote.type} on [${remote.columns.join(',')}], ` +
          `defined ${index.type} on [${index.columns.join(',')}])`,
      );
    }
    log('exists', `index ${tableId}.${index.key}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await ctx.tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId,
      key: index.key,
      type: INDEX_TYPE[index.type],
      columns: index.columns,
    });
    log('created', `index ${tableId}.${index.key}`);
  }
}

async function waitForIndexes(ctx: AdminContext, table: TableDef): Promise<void> {
  if (table.indexes.length === 0) return;
  const wanted = new Set(table.indexes.map((i) => i.key));
  const deadline = Date.now() + 60_000;
  for (;;) {
    const { indexes } = (await ctx.tablesDB.listIndexes({
      databaseId: DATABASE_ID,
      tableId: table.id,
      queries: [Query.limit(100)],
    })) as unknown as { indexes: { key: string; status: string; error?: string }[] };
    const pending = indexes.filter((i) => wanted.has(i.key) && i.status !== 'available');
    const failed = pending.filter((i) => ['failed', 'stuck'].includes(i.status));
    if (failed.length > 0) {
      const detail = failed.map((i) => `${i.key} (${i.status}: ${i.error ?? 'no detail'})`);
      throw new Error(`indexes failed in ${table.id}: ${detail.join(', ')}`);
    }
    if (pending.length === 0) return;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for indexes in ${table.id}: ${pending.map((i) => i.key).join(', ')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function ensureBucket(ctx: AdminContext, bucket: BucketDef): Promise<void> {
  try {
    const remote = await ctx.storage.getBucket({ bucketId: bucket.id });
    const broadGrants = (remote.$permissions ?? []).filter((p: string) => p.includes('any'));
    if (broadGrants.length > 0) {
      throw new ManualMigrationRequired(
        `bucket ${bucket.id}`,
        `unexpected public grant(s) present: ${broadGrants.join(', ')}`,
      );
    }
    const wanted = toPermissions(bucket.permissions);
    if (!samePermissions(remote.$permissions ?? [], wanted)) {
      await ctx.storage.updateBucket({
        bucketId: bucket.id,
        name: bucket.name,
        permissions: wanted,
        fileSecurity: bucket.fileSecurity,
        enabled: true,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: COMPRESSION[bucket.compression],
        encryption: bucket.encryption,
        antivirus: bucket.antivirus,
      });
      log('updated', `bucket ${bucket.id} permissions`);
      return;
    }
    log('exists', `bucket ${bucket.id}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await ctx.storage.createBucket({
      bucketId: bucket.id,
      name: bucket.name,
      permissions: toPermissions(bucket.permissions),
      fileSecurity: bucket.fileSecurity,
      enabled: true,
      maximumFileSize: bucket.maximumFileSize,
      allowedFileExtensions: bucket.allowedFileExtensions,
      compression: COMPRESSION[bucket.compression],
      encryption: bucket.encryption,
      antivirus: bucket.antivirus,
    });
    log('created', `bucket ${bucket.id}`);
  }
}

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  console.log(`applying schema to project (endpoint host: ${new URL(ctx.env.endpoint).host})`);

  await ensureDatabase(ctx);
  for (const table of TABLES) await ensureTable(ctx, table);

  // Scalar columns for every table first, then relationships (their related
  // tables and the parent-side twoWay columns need the tables to exist).
  for (const table of TABLES) {
    for (const col of table.columns.filter((c) => c.kind !== 'relationship')) {
      await ensureColumn(ctx, table.id, col);
    }
  }
  for (const table of TABLES) {
    for (const col of table.columns.filter((c) => c.kind === 'relationship')) {
      await ensureColumn(ctx, table.id, col);
      await waitForColumn(ctx, table.id, col.key);
    }
  }
  for (const table of TABLES) await waitForColumns(ctx, table);

  for (const table of TABLES) {
    for (const index of table.indexes) await ensureIndex(ctx, table.id, index);
  }
  for (const table of TABLES) await waitForIndexes(ctx, table);

  for (const bucket of BUCKETS) await ensureBucket(ctx, bucket);

  console.log(
    `done: ${stats.created} created, ${stats.updated} updated, ${stats.exists} already existed`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
