/**
 * Lists every species in the catalogue (cursor-paginated) for the mining
 * loaders, so they mine whatever knowledge:seed-species has populated rather
 * than a hardcoded list. Roadmap Phase 4A, slice 5.
 */
import { Query, type TablesDB } from 'node-appwrite';

export interface CatalogedSpecies {
  slug: string;
  scientificName: string;
}

export async function listAllSpecies(tablesDB: TablesDB, db: string): Promise<CatalogedSpecies[]> {
  const out: CatalogedSpecies[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await tablesDB.listRows({ databaseId: db, tableId: 'species', queries });
    const rows = (res.rows ?? []) as unknown as {
      $id: string;
      slug?: string;
      scientific_name?: string;
    }[];
    for (const r of rows) {
      if (r.scientific_name) out.push({ slug: r.slug ?? r.$id, scientificName: r.scientific_name });
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].$id;
  }
  return out;
}
