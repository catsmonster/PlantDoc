import { describe, expect, it } from 'vitest';
import { SEED_ROWS, SEED_USER_IDS } from '../../appwrite/seed-data';
import { TABLES } from '../../appwrite/schema';

describe('seed data', () => {
  it('uses only synthetic seed user ids', () => {
    expect(SEED_USER_IDS).toEqual(['seed_user_alex', 'seed_user_mina']);
    for (const row of SEED_ROWS) {
      const uid = (row.data as Record<string, unknown>).user_id;
      if (uid !== undefined) expect(SEED_USER_IDS, row.rowId).toContain(uid);
    }
  });

  it('all row ids are deterministic seed_ ids', () => {
    for (const row of SEED_ROWS) {
      expect(row.rowId).toMatch(/^seed_[a-z0-9_]+$/);
    }
  });

  it('targets only defined tables', () => {
    const ids = new Set(TABLES.map((t) => t.id));
    for (const row of SEED_ROWS) expect(ids.has(row.tableId), row.tableId).toBe(true);
  });

  it('contains no real-looking PII', () => {
    const blob = JSON.stringify(SEED_ROWS);
    expect(blob).not.toMatch(/@gmail|@outlook|@yahoo|@proton/i);
    expect(blob).not.toMatch(/galvando/i);
  });

  it('uses coarse geography only (max 1 decimal of precision)', () => {
    for (const row of SEED_ROWS.filter((r) => r.tableId === 'user_locations')) {
      const location = (row.data as { location?: [number, number] }).location;
      if (location) {
        for (const coord of location) {
          expect(Number(coord.toFixed(1)), row.rowId).toBe(coord);
        }
      }
    }
  });

  it('public_observations seed rows come only from consented observations', () => {
    const consented = new Set(
      SEED_ROWS.filter(
        (r) =>
          r.tableId === 'observations' &&
          (r.data as { contribute_to_public_dataset?: boolean }).contribute_to_public_dataset ===
            true,
      ).map((r) => r.rowId),
    );
    const pubRows = SEED_ROWS.filter((r) => r.tableId === 'public_observations');
    expect(pubRows.length).toBeGreaterThan(0);
    for (const row of pubRows) {
      const source = (row.data as { source_observation_id: string }).source_observation_id;
      expect(consented.has(source), row.rowId).toBe(true);
      expect((row.data as Record<string, unknown>).observed_month).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('is deterministic across imports (no Date.now / Math.random)', async () => {
    const again = await import('../../appwrite/seed-data');
    expect(JSON.stringify(again.SEED_ROWS)).toBe(JSON.stringify(SEED_ROWS));
  });
});
