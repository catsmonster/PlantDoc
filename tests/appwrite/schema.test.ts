import { describe, expect, it } from 'vitest';
import { BUCKETS, DATABASE_ID, TABLES } from '../../appwrite/schema';

const REQUIRED_TABLES = [
  'profiles',
  'user_locations',
  'species',
  'plants',
  'observations',
  'treatments',
  'measurements',
  'photos',
  'environment_snapshots',
  'public_observations',
];

const REQUIRED_BUCKETS = [
  'plant-private-images',
  'plant-public-images',
  'open-data-exports',
];

describe('schema coverage', () => {
  it('defines the primary database', () => {
    expect(DATABASE_ID).toBe('plantdoc_main');
  });

  it('defines all Phase 0 tables', () => {
    expect(TABLES.map((t) => t.id).sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('defines all Phase 0 buckets', () => {
    expect(BUCKETS.map((b) => b.id).sort()).toEqual([...REQUIRED_BUCKETS].sort());
  });

  it('every table with user data has a required user_id varchar column', () => {
    const exempt = ['species', 'public_observations'];
    for (const table of TABLES.filter((t) => !exempt.includes(t.id))) {
      const col = table.columns.find((c) => c.key === 'user_id');
      expect(col, `${table.id}.user_id`).toBeDefined();
      expect(col!.kind).toBe('varchar');
      expect(col!.required).toBe(true);
    }
  });

  it('no table or bucket grants Role.any()', () => {
    for (const table of TABLES) {
      expect(table.permissions.join(), table.id).not.toMatch(/\bany\b/);
    }
    for (const bucket of BUCKETS) {
      expect(bucket.permissions.join(), bucket.id).not.toMatch(/\bany\b/);
    }
  });

  it('relationship columns only point at defined tables', () => {
    const ids = new Set(TABLES.map((t) => t.id));
    for (const table of TABLES) {
      for (const col of table.columns) {
        if (col.kind === 'relationship') {
          expect(ids.has(col.relatedTableId), `${table.id}.${col.key}`).toBe(true);
        }
      }
    }
  });

  it('public_observations has no relationship columns and no private fields', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    expect(pub.columns.some((c) => c.kind === 'relationship')).toBe(false);
    const keys = pub.columns.map((c) => c.key);
    const banned = [
      'user_id',
      'email',
      'nickname',
      'placement_label',
      'notes_private',
      'private_file_id',
      'location',
    ];
    for (const key of banned) {
      expect(keys, key).not.toContain(key);
    }
  });

  it('defines no custom created_at/updated_at columns (built-in timestamps)', () => {
    for (const table of TABLES) {
      const keys = table.columns.map((c) => c.key);
      expect(keys, table.id).not.toContain('created_at');
      expect(keys, table.id).not.toContain('updated_at');
    }
  });

  it('required columns never carry defaults (Appwrite constraint)', () => {
    for (const table of TABLES) {
      for (const col of table.columns) {
        if (col.required && 'default' in col) {
          expect(col.default, `${table.id}.${col.key}`).toBeUndefined();
        }
      }
    }
  });

  it('indexes reference only scalar (non-relationship) columns', () => {
    for (const table of TABLES) {
      const relationshipKeys = new Set(
        table.columns.filter((c) => c.kind === 'relationship').map((c) => c.key),
      );
      for (const index of table.indexes) {
        for (const column of index.columns) {
          expect(relationshipKeys.has(column), `${table.id}.${index.key}`).toBe(false);
        }
      }
    }
  });
});
