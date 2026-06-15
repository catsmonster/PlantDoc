import { describe, expect, it } from 'vitest';
import { buildLogPayload } from '../../src/lib/log';

const base = {
  userId: 'u1',
  plantId: 'p1',
  observedAt: '2026-06-09T10:00:00.000Z',
  contribute: false,
};

describe('buildLogPayload', () => {
  it('builds a watering treatment log', () => {
    const payload = buildLogPayload({
      ...base,
      treatment: { treatment_type: 'watering', amount_value: 250, amount_unit: 'ml' },
    });
    expect(payload.observation.observation_type).toBe('treatment');
    expect(payload.treatment).toMatchObject({ user_id: 'u1', treatment_type: 'watering' });
    expect(payload.measurement).toBeUndefined();
  });

  it('builds an unknown watering amount as null with no unit', () => {
    const payload = buildLogPayload({
      ...base,
      treatment: { treatment_type: 'watering', amount_value: undefined, amount_unit: undefined },
    });
    expect(payload.treatment).toEqual({
      user_id: 'u1',
      treatment_type: 'watering',
      amount_value: null,
    });
  });

  it('builds a measurement log and drops undefined values', () => {
    const payload = buildLogPayload({
      ...base,
      measurement: { height_cm: 30, leaf_count: undefined },
    });
    expect(payload.observation.observation_type).toBe('measurement');
    expect(payload.measurement).toEqual({ user_id: 'u1', height_cm: 30 });
  });

  it('builds a plain note and trims it', () => {
    const payload = buildLogPayload({ ...base, note: '  hello  ' });
    expect(payload.observation.observation_type).toBe('note');
    expect(payload.observation.notes_private).toBe('hello');
  });

  it('rejects treatment+measurement combos and empty measurements', () => {
    expect(() =>
      buildLogPayload({
        ...base,
        treatment: { treatment_type: 'watering' },
        measurement: { height_cm: 1 },
      }),
    ).toThrow();
    expect(() => buildLogPayload({ ...base, measurement: {} })).toThrow();
  });
});
