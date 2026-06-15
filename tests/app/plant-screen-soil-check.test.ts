import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as plantScreenLogic from '../../src/features/timeline/plant-screen-logic';
import {
  buildSoilCheckLogInput,
  detailLine,
  submitSoilCheck,
} from '../../src/features/timeline/plant-screen-logic';
import type { Observation } from '../../src/lib/types';
import type { Plant } from '../../src/lib/types';
import { makePlant } from '../lib/moisture-fixtures';

const plantScreenSource = readFileSync(
  join(process.cwd(), 'src', 'features', 'timeline', 'PlantScreen.tsx'),
  'utf8',
);
const plantsScreenSource = readFileSync(
  join(process.cwd(), 'src', 'features', 'plants', 'PlantsScreen.tsx'),
  'utf8',
);

const baseObservation: Observation = {
  $id: 'obs-1',
  $createdAt: '2026-06-15T09:00:00.000Z',
  $updatedAt: '2026-06-15T09:00:00.000Z',
  user_id: 'user-1',
  observed_at: '2026-06-15T09:00:00.000Z',
  observation_type: 'measurement',
  notes_private: null,
  contribute_to_public_dataset: true,
};

describe('PlantScreen soil check quick action', () => {
  it('builds a soil-state-only measurement log input', () => {
    expect(
      buildSoilCheckLogInput({
        userId: 'user-1',
        plantId: 'plant-1',
        soilState: 'dry',
        contribute: true,
        observedAt: '2026-06-15T10:00:00.000Z',
      }),
    ).toEqual({
      userId: 'user-1',
      plantId: 'plant-1',
      observedAt: '2026-06-15T10:00:00.000Z',
      contribute: true,
      measurement: { soil_state: 'dry' },
    });
  });

  it('shows a meaningful detail line for soil-state-only measurements', () => {
    expect(
      detailLine(
        {
          ...baseObservation,
          measurements: [
            {
              $id: 'measurement-1',
              $createdAt: '2026-06-15T09:00:00.000Z',
              $updatedAt: '2026-06-15T09:00:00.000Z',
              user_id: 'user-1',
              height_cm: null,
              leaf_count: null,
              soil_moisture_percent: null,
              health_score: null,
              pest_severity_score: null,
              bloom_count: null,
              soil_state: 'moist',
              notes_private: null,
            },
          ],
        },
        'metric',
      ),
    ).toBe('soil moist');
  });

  it('submits exact createLog payload and refreshes after success', async () => {
    const createLog = vi.fn().mockResolvedValue(baseObservation);
    const refresh = vi.fn();

    await submitSoilCheck({
      userId: 'user-1',
      plantId: 'plant-1',
      soilState: 'wet',
      contribute: false,
      now: () => new Date('2026-06-15T11:00:00.000Z'),
      createLog,
      refresh,
    });

    expect(createLog).toHaveBeenCalledWith({
      userId: 'user-1',
      plantId: 'plant-1',
      observedAt: '2026-06-15T11:00:00.000Z',
      contribute: false,
      measurement: { soil_state: 'wet' },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe('PlantScreen missing pot-size moisture nudge', () => {
  const shouldPromptForPotSize = (
    plantScreenLogic as {
      shouldPromptForPotSize?: (plant: Pick<Plant, 'placement_type' | 'pot_diameter_cm' | 'pot_height_cm'>) => boolean;
    }
  ).shouldPromptForPotSize;

  it('prompts only for moisture-eligible placements missing a pot dimension', () => {
    expect(shouldPromptForPotSize?.(makePlant({ pot_diameter_cm: null }))).toBe(true);
    expect(shouldPromptForPotSize?.(makePlant({ pot_height_cm: null }))).toBe(true);
    expect(shouldPromptForPotSize?.(makePlant({ placement_type: 'greenhouse', pot_height_cm: null }))).toBe(true);
    expect(shouldPromptForPotSize?.(makePlant({ placement_type: 'outdoor', pot_diameter_cm: null }))).toBe(false);
    expect(shouldPromptForPotSize?.(makePlant({ placement_type: 'balcony', pot_height_cm: null }))).toBe(false);
    expect(shouldPromptForPotSize?.(makePlant())).toBe(false);
  });

  it('wires the chosen add-pot-size CTA where the moisture gauge would be', () => {
    expect(plantScreenSource).toContain('Add pot size to track soil moisture');
    expect(plantScreenSource).toContain('onClick={() => onEdit(plant)}');
    expect(plantsScreenSource).toContain('Add pot size');
  });
});
