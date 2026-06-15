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
  'insight_feedback',
  'moisture_feedback',
  'source_datasets',
  'taxon_references',
  'care_facts',
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
    const exempt = ['species', 'source_datasets', 'taxon_references', 'care_facts', 'public_observations'];
    for (const table of TABLES.filter((t) => !exempt.includes(t.id))) {
      const col = table.columns.find((c) => c.key === 'user_id');
      expect(col, `${table.id}.user_id`).toBeDefined();
      expect(col!.kind).toBe('varchar');
      expect(col!.required).toBe(true);
    }
  });

  it('private user tables grant exactly create:users at table level', () => {
    const privateTables = [
      'profiles',
      'user_locations',
      'plants',
      'observations',
      'treatments',
      'measurements',
      'photos',
      'environment_snapshots',
      'insight_feedback',
      'moisture_feedback',
    ];
    for (const id of privateTables) {
      expect(TABLES.find((t) => t.id === id)!.permissions, id).toEqual(['create:users']);
    }
    expect(TABLES.find((t) => t.id === 'species')!.permissions).toEqual(['read:users']);
    expect(TABLES.find((t) => t.id === 'public_observations')!.permissions).toEqual([]);
  });

  it('only the private images bucket grants create:users', () => {
    expect(BUCKETS.find((b) => b.id === 'plant-private-images')!.permissions).toEqual([
      'create:users',
    ]);
    for (const id of ['plant-public-images', 'open-data-exports']) {
      expect(BUCKETS.find((b) => b.id === id)!.permissions, id).toEqual([]);
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

  it('environment_snapshots.observation_id is two-way with cascade delete', () => {
    const snapshots = TABLES.find((t) => t.id === 'environment_snapshots')!;
    const rel = snapshots.columns.find((c) => c.key === 'observation_id')!;
    expect(rel.kind).toBe('relationship');
    if (rel.kind === 'relationship') {
      expect(rel.twoWay).toBe(true);
      expect(rel.twoWayKey).toBe('environment_snapshots');
      expect(rel.onDelete).toBe('cascade');
    }
  });

  it('insight_feedback.plant_id is two-way with cascade delete', () => {
    const feedback = TABLES.find((t) => t.id === 'insight_feedback')!;
    const rel = feedback.columns.find((c) => c.key === 'plant_id')!;
    expect(rel.kind).toBe('relationship');
    if (rel.kind === 'relationship') {
      expect(rel.relatedTableId).toBe('plants');
      expect(rel.twoWay).toBe(true);
      expect(rel.twoWayKey).toBe('insight_feedback');
      expect(rel.onDelete).toBe('cascade');
    }
  });

  it('moisture_feedback.plant_id is two-way with cascade delete', () => {
    const feedback = TABLES.find((t) => t.id === 'moisture_feedback')!;
    const rel = feedback.columns.find((c) => c.key === 'plant_id')!;
    expect(rel.kind).toBe('relationship');
    if (rel.kind === 'relationship') {
      expect(rel.relatedTableId).toBe('plants');
      expect(rel.twoWay).toBe(true);
      expect(rel.twoWayKey).toBe('moisture_feedback');
      expect(rel.onDelete).toBe('cascade');
    }
  });

  it('public_observations has a unique index on source_observation_id for upserts', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    const index = pub.indexes.find((i) => i.key === 'idx_source_observation');
    expect(index).toBeDefined();
    expect(index!.type).toBe('unique');
    expect(index!.columns).toEqual(['source_observation_id']);
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

  it('knowledge reference tables are admin-write, public-read with no user grants', () => {
    for (const id of ['source_datasets', 'taxon_references', 'care_facts']) {
      expect(TABLES.find((t) => t.id === id)!.permissions, id).toEqual(['read:users']);
      expect(TABLES.find((t) => t.id === id)!.rowSecurity, id).toBe(false);
    }
  });

  it('care_facts and taxon_references relate to species two-way with cascade', () => {
    for (const id of ['care_facts', 'taxon_references']) {
      const rel = TABLES.find((t) => t.id === id)!.columns.find((c) => c.key === 'species_id')!;
      expect(rel.kind, id).toBe('relationship');
      if (rel.kind === 'relationship') {
        expect(rel.relatedTableId, id).toBe('species');
        expect(rel.twoWay, id).toBe(true);
        expect(rel.twoWayKey, id).toBe(id);
        expect(rel.onDelete, id).toBe('cascade');
      }
    }
  });

  it('care_facts and taxon_references relate to source_datasets (restrict, one-way)', () => {
    for (const id of ['care_facts', 'taxon_references']) {
      const rel = TABLES.find((t) => t.id === id)!.columns.find((c) => c.key === 'source_id')!;
      expect(rel.kind, id).toBe('relationship');
      if (rel.kind === 'relationship') {
        expect(rel.relatedTableId, id).toBe('source_datasets');
        expect(rel.twoWay, id).toBe(false);
        expect(rel.onDelete, id).toBe('restrict');
      }
    }
  });

  it('source_datasets has a unique index on source_key', () => {
    const t = TABLES.find((t) => t.id === 'source_datasets')!;
    const idx = t.indexes.find((i) => i.key === 'idx_source_key');
    expect(idx).toBeDefined();
    expect(idx!.type).toBe('unique');
    expect(idx!.columns).toEqual(['source_key']);
  });

  it('species has a slug column with a unique index', () => {
    const t = TABLES.find((t) => t.id === 'species')!;
    expect(t.columns.find((c) => c.key === 'slug')?.kind).toBe('varchar');
    expect(t.indexes.find((i) => i.key === 'idx_slug')?.type).toBe('unique');
  });
});
