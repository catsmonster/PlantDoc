import { describe, expect, it } from 'vitest';
import {
  BUCKETS,
  INTERNAL_ONLY_FIELDS,
  PUBLIC_EXPORT_FIELDS,
  TABLES,
} from '../../appwrite/schema';

/**
 * Fields that must never appear in a public export projection.
 * See docs/privacy.md "Private" data class.
 */
const PRIVATE_FIELDS = [
  'user_id',
  'email',
  'latitude',
  'longitude',
  'location',
  'postal_code',
  'postal_code_prefix',
  'nickname',
  'placement_label',
  'room',
  'notes_private',
  'caption_private',
  'private_file_id',
  'file_path',
  'exif',
  'captured_at',
  'observed_at',
  'label',
  'city',
  // Plant dashboard summary fields — private, never exported
  'last_watered_at',
  'watering_count',
  'watering_cadence_days',
  'latest_photo_file_id',
  'latest_photo_observed_at',
];

describe('public export privacy', () => {
  it('public export fields contain no private fields', () => {
    for (const banned of PRIVATE_FIELDS) {
      expect(PUBLIC_EXPORT_FIELDS, banned).not.toContain(banned);
    }
  });

  it('source_observation_id is internal-only and not exportable', () => {
    expect(INTERNAL_ONLY_FIELDS).toContain('source_observation_id');
    expect(PUBLIC_EXPORT_FIELDS).not.toContain('source_observation_id');
  });

  it('every public export field exists on public_observations', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    const keys = new Set(pub.columns.map((c) => c.key));
    for (const field of PUBLIC_EXPORT_FIELDS) {
      expect(keys.has(field), field).toBe(true);
    }
  });

  it('public_observations uses month bucket, not exact timestamps', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    const keys = pub.columns.map((c) => c.key);
    expect(keys).toContain('observed_month');
    expect(keys).not.toContain('observed_at');
  });

  it('no public-read grants on export surfaces in Phase 0', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    expect(pub.permissions).toEqual([]);
    for (const id of ['plant-public-images', 'open-data-exports']) {
      expect(BUCKETS.find((b) => b.id === id)!.permissions, id).toEqual([]);
    }
  });

  it('geo precision options exclude exact coordinates', () => {
    const pub = TABLES.find((t) => t.id === 'public_observations')!;
    const geo = pub.columns.find((c) => c.key === 'geo_precision')!;
    expect(geo.kind).toBe('enum');
    if (geo.kind === 'enum') {
      expect(geo.elements).not.toContain('exact');
      expect(geo.elements).not.toContain('local');
    }
  });
});
