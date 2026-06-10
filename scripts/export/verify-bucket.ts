/**
 * Verifies open-data-exports bucket contents: lists files and fails if any
 * file carries a public (`any`) read grant. Run via `tsx scripts/export/verify-bucket.ts`.
 */
import { Query } from 'node-appwrite';
import { createAdminContext } from '../appwrite/client';

const BUCKET = 'open-data-exports';

async function main(): Promise<void> {
  const ctx = await createAdminContext();
  const result = await ctx.storage.listFiles({
    bucketId: BUCKET,
    queries: [Query.limit(100)],
  });
  let publicGrants = 0;
  for (const file of result.files) {
    const perms = file.$permissions as string[];
    const hasAny = perms.some((p) => p.includes('any'));
    if (hasAny) publicGrants += 1;
    console.log(`${file.name}  perms=${JSON.stringify(perms)}  ${hasAny ? 'PUBLIC!' : 'admin-only'}`);
  }
  console.log(`${result.files.length} files, ${publicGrants} with public grants`);
  if (publicGrants > 0) {
    console.error('FAIL: bucket contains files with public (any) grants');
    process.exit(1);
  }
  console.log('OK: no file-level public grants');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
