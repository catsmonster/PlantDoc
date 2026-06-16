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

describe('listPlants', () => {
  beforeEach(() => {
    mocks.listRows.mockReset();
  });

  it('selects rain_exposed with the lightweight scalar plant fields', async () => {
    mocks.listRows.mockResolvedValueOnce({ rows: [] });

    const { listPlants } = await import('../../src/lib/repo');
    await listPlants('u1');

    expect(mocks.listRows).toHaveBeenCalledWith({
      databaseId: 'db',
      tableId: 'plants',
      queries: expect.arrayContaining([
        expect.stringContaining('rain_exposed'),
      ]),
    });
  });
});

describe('listPlantsForDashboard', () => {
  beforeEach(() => {
    mocks.listRows.mockReset();
  });

  const careFact = (over: Record<string, unknown>) => ({
    attribute: 'light',
    value_min: null,
    value_max: null,
    value_text: null,
    value_unit: null,
    trust: 'editorial',
    source_id: 'plantdoc-editorial',
    ...over,
  });

  const dashboardRow = (overrides: Record<string, unknown> = {}) => ({
    $id: 'plant-1',
    user_id: 'u1',
    nickname: 'Kitchen Monstera',
    status: 'active',
    placement_type: 'indoor',
    pot_diameter_cm: 14,
    pot_height_cm: 12,
    substrate_type: 'standard',
    pot_drains: true,
    light_level: 'medium',
    moisture_feedback: [],
    observations: [
      { $id: 'o2', observed_at: '2026-06-02T09:00:00.000Z', observation_type: 'treatment', treatments: [] },
      { $id: 'o1', observed_at: '2026-06-10T09:00:00.000Z', observation_type: 'treatment', treatments: [] },
    ],
    species_id: {
      $id: 'species-1',
      scientific_name: 'Monstera deliciosa',
      slug: 'monstera-deliciosa',
      common_names: ['Swiss cheese plant'],
      care_facts: [
        careFact({ attribute: 'light', value_text: 'Bright indirect light' }),
        careFact({
          attribute: 'soil_moisture_percent',
          value_min: 30,
          value_max: 60,
          value_unit: '%',
          trust: 'community_unverified',
          source_id: 'openplantbook',
        }),
        careFact({ attribute: 'water_requirement', value_text: 'moist', trust: 'sourced', source_id: 'permapeople' }),
      ],
    },
    ...overrides,
  });

  it('hydrates the relationship columns moistureForPlant needs in one ordered page', async () => {
    mocks.listRows.mockResolvedValueOnce({ rows: [dashboardRow()] });

    const { listPlantsForDashboard } = await import('../../src/lib/repo');
    await listPlantsForDashboard('u1');

    expect(mocks.listRows).toHaveBeenCalledTimes(1);
    expect(mocks.listRows).toHaveBeenCalledWith({
      databaseId: 'db',
      tableId: 'plants',
      queries: [
        'equal:user_id:"u1"',
        'orderDesc:$createdAt',
        'limit:100',
        'select:*,species_id.*,species_id.care_facts.*,location_id.*,observations.*,observations.treatments.*,observations.measurements.*,moisture_feedback.*',
      ],
    });
  });

  it('composes the table-backed care profile from the hydrated species facts', async () => {
    mocks.listRows.mockResolvedValueOnce({ rows: [dashboardRow()] });

    const { listPlantsForDashboard } = await import('../../src/lib/repo');
    const dashboard = await listPlantsForDashboard('u1');

    expect(dashboard).toHaveLength(1);
    const { plant, careProfile } = dashboard[0];
    expect(careProfile).not.toBeNull();
    expect(careProfile?.light.value).toBe('Bright indirect light');
    expect(careProfile?.communityRanges?.some((r) => r.attribute === 'soil_moisture_percent')).toBe(true);
    expect(careProfile?.cultivationFacts?.some((c) => c.attribute === 'water_requirement')).toBe(true);
    // Observations are sorted newest-first like the other timeline reads.
    expect(plant.observations?.map((o) => o.$id)).toEqual(['o1', 'o2']);
  });

  it('returns a null care profile when the species has no mined facts', async () => {
    mocks.listRows.mockResolvedValueOnce({
      rows: [dashboardRow({ species_id: { $id: 'species-2', scientific_name: 'Ficus', care_facts: [] } })],
    });

    const { listPlantsForDashboard } = await import('../../src/lib/repo');
    const dashboard = await listPlantsForDashboard('u1');

    expect(dashboard[0].careProfile).toBeNull();
  });
});
