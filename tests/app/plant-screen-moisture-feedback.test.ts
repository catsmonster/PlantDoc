import { describe, expect, it, vi } from 'vitest';
import type { Observation } from '../../src/lib/types';
import {
  buildMoistureFeedbackInput,
  dropReconciledObservations,
  dropReconciledRows,
  mergeById,
  mergeObservations,
  submitMoistureFeedback,
} from '../../src/features/timeline/plant-screen-logic';

describe('PlantScreen moisture feedback (post-check estimate tap)', () => {
  it('builds a wetter feedback input retaining magnitude', () => {
    expect(
      buildMoistureFeedbackInput({
        plantId: 'plant-1',
        estimateFeedback: 'wetter',
        magnitude: 3,
        predictedMoisturePercent: 42,
        observedAt: '2026-06-15T10:00:00.000Z',
      }),
    ).toEqual({
      plantId: 'plant-1',
      observedAt: '2026-06-15T10:00:00.000Z',
      estimate_feedback: 'wetter',
      magnitude: 3,
      predicted_moisture_percent: 42,
    });
  });

  it('forces magnitude to null for correct feedback even if a number is passed', () => {
    expect(
      buildMoistureFeedbackInput({
        plantId: 'plant-1',
        estimateFeedback: 'correct',
        magnitude: 4,
        predictedMoisturePercent: 55,
        observedAt: '2026-06-15T10:00:00.000Z',
      }),
    ).toEqual({
      plantId: 'plant-1',
      observedAt: '2026-06-15T10:00:00.000Z',
      estimate_feedback: 'correct',
      magnitude: null,
      predicted_moisture_percent: 55,
    });
  });

  it('builds a drier feedback input with magnitude 5', () => {
    expect(
      buildMoistureFeedbackInput({
        plantId: 'plant-1',
        estimateFeedback: 'drier',
        magnitude: 5,
        predictedMoisturePercent: 18,
        observedAt: '2026-06-15T10:00:00.000Z',
      }),
    ).toEqual({
      plantId: 'plant-1',
      observedAt: '2026-06-15T10:00:00.000Z',
      estimate_feedback: 'drier',
      magnitude: 5,
      predicted_moisture_percent: 18,
    });
  });

  it('submits with the caller-supplied observedAt and returns the created row', async () => {
    const created = { $id: 'fb-99' };
    const createMoistureFeedback = vi.fn().mockResolvedValue(created);
    const refresh = vi.fn();

    const result = await submitMoistureFeedback({
      userId: 'user-1',
      plantId: 'plant-1',
      estimateFeedback: 'wetter',
      magnitude: 2,
      predictedMoisturePercent: 37,
      observedAt: '2026-06-15T11:00:00.000Z',
      createMoistureFeedback,
      refresh,
    });

    expect(createMoistureFeedback).toHaveBeenCalledWith('user-1', {
      plantId: 'plant-1',
      observedAt: '2026-06-15T11:00:00.000Z',
      estimate_feedback: 'wetter',
      magnitude: 2,
      predicted_moisture_percent: 37,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(created);
  });

  it('mergeById appends pending feedback rows the canonical set lacks; dropReconciledRows prunes the rest', () => {
    const canonical = [{ $id: 'a' }];
    const pending = [{ $id: 'a' }, { $id: 'temp-1' }];
    expect(mergeById(canonical, pending)).toEqual([{ $id: 'a' }, { $id: 'temp-1' }]);
    expect(dropReconciledRows(pending, canonical)).toEqual([{ $id: 'temp-1' }]);
  });

  it('mergeObservations prefers the hydrated optimistic soil-check over an un-hydrated canonical parent', () => {
    const pending = [{ $id: 'o1', measurements: [{ soil_state: 'moist' }] }] as unknown as Observation[];
    const parentOnly = [{ $id: 'o1' }] as unknown as Observation[];
    const merged = mergeObservations(parentOnly, pending);
    expect(merged).toHaveLength(1);
    expect(merged[0].measurements).toHaveLength(1);
  });

  it('dropReconciledObservations keeps a pending soil-check until the canonical row hydrates its measurement', () => {
    const pending = [{ $id: 'o1', measurements: [{ soil_state: 'moist' }] }] as unknown as Observation[];
    const parentOnly = [{ $id: 'o1' }] as unknown as Observation[];
    const hydrated = [{ $id: 'o1', measurements: [{ soil_state: 'moist' }] }] as unknown as Observation[];
    expect(dropReconciledObservations(pending, parentOnly)).toHaveLength(1);
    expect(dropReconciledObservations(pending, hydrated)).toHaveLength(0);
  });
});
