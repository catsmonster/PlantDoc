import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
}));

vi.mock('appwrite', () => ({
  ID: { unique: () => 'unique-id' },
  Query: {
    cursorAfter: (id: string) => `cursorAfter:${id}`,
    equal: (field: string, value: unknown) => `equal:${field}:${JSON.stringify(value)}`,
    limit: (n: number) => `limit:${n}`,
    orderAsc: (field: string) => `orderAsc:${field}`,
    orderDesc: (field: string) => `orderDesc:${field}`,
    select: (fields: string[]) => `select:${fields.join(',')}`,
  },
}));

vi.mock('../../src/lib/appwrite', () => ({
  DATABASE_ID: 'db',
  PRIVATE_IMAGES_BUCKET: 'private-images',
  storage: {},
  tablesDB: {
    listRows: mocks.listRows,
  },
}));

const row = (id: string, name = id) => ({
  $id: id,
  scientific_name: name,
  common_names: [],
});

describe('listSpecies', () => {
  beforeEach(() => {
    mocks.listRows.mockReset();
  });

  it('fetches the current catalogue in one ordered page', async () => {
    mocks.listRows.mockResolvedValueOnce({
      rows: Array.from({ length: 259 }, (_, i) => row(`species-${i}`)),
    });

    const { listSpecies } = await import('../../src/lib/repo');
    const species = await listSpecies();

    expect(species).toHaveLength(259);
    expect(mocks.listRows).toHaveBeenCalledTimes(1);
    expect(mocks.listRows).toHaveBeenCalledWith({
      databaseId: 'db',
      tableId: 'species',
      queries: [
        'limit:1000',
        'orderAsc:scientific_name',
        'select:$id,scientific_name,common_names',
      ],
    });
  });

  it('keeps cursor pagination as a fallback beyond one page', async () => {
    mocks.listRows
      .mockResolvedValueOnce({ rows: Array.from({ length: 1000 }, (_, i) => row(`species-${i}`)) })
      .mockResolvedValueOnce({ rows: [row('species-1000')] });

    const { listSpecies } = await import('../../src/lib/repo');
    const species = await listSpecies();

    expect(species).toHaveLength(1001);
    expect(mocks.listRows).toHaveBeenCalledTimes(2);
    expect(mocks.listRows).toHaveBeenNthCalledWith(2, {
      databaseId: 'db',
      tableId: 'species',
      queries: [
        'limit:1000',
        'orderAsc:scientific_name',
        'select:$id,scientific_name,common_names',
        'cursorAfter:species-999',
      ],
    });
  });
});
