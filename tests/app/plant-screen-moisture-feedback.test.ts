import { describe, expect, it, vi } from 'vitest';
import {
  buildMoistureFeedbackInput,
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

  it('submits exact createMoistureFeedback payload and refreshes after success', async () => {
    const createMoistureFeedback = vi.fn().mockResolvedValue({});
    const refresh = vi.fn();

    await submitMoistureFeedback({
      userId: 'user-1',
      plantId: 'plant-1',
      estimateFeedback: 'wetter',
      magnitude: 2,
      predictedMoisturePercent: 37,
      now: () => new Date('2026-06-15T11:00:00.000Z'),
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
  });
});
