import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildRepotPlantUpdate,
  buildWateringTreatment,
  submitRepotPlantUpdate,
} from '../../src/features/timeline/logsheet-logic';

const source = readFileSync(
  join(process.cwd(), 'src', 'features', 'timeline', 'LogSheet.tsx'),
  'utf8',
);

describe('LogSheet watering treatment payload', () => {
  it('builds untouched water amounts as unknown with no unit', () => {
    expect(buildWateringTreatment('', 'top water')).toEqual({
      treatment_type: 'watering',
      amount_value: null,
      method: 'top water',
    });
  });

  it('builds entered water amounts with milliliter units', () => {
    expect(buildWateringTreatment('375', 'bottom water')).toEqual({
      treatment_type: 'watering',
      amount_value: 375,
      amount_unit: 'ml',
      method: 'bottom water',
    });
  });
});

describe('LogSheet repot plant update', () => {
  it('allows fractional repot dimensions in both theme branches', () => {
    const dimensionInputs = source
      .split('\n')
      .filter(
        (line) =>
          line.includes('New pot diameter in ${imperial') ||
          line.includes('New pot height in ${imperial'),
      );
    expect(dimensionInputs).toHaveLength(4);
    expect(dimensionInputs.every((line) => line.includes('step="any"'))).toBe(true);
  });

  it('includes only provided valid diameter, height, and substrate', () => {
    expect(buildRepotPlantUpdate('14', '', 'chunky_aroid')).toEqual({
      pot_diameter_cm: 14,
      substrate_type: 'chunky_aroid',
    });
    expect(buildRepotPlantUpdate('', '11.5', '')).toEqual({ pot_height_cm: 11.5 });
    expect(buildRepotPlantUpdate('', '', '')).toEqual({});
  });

  it('converts imperial repot dimensions to stored centimetres', () => {
    expect(buildRepotPlantUpdate('10', '8', '', 'imperial')).toEqual({
      pot_diameter_cm: 25.4,
      pot_height_cm: 20.32,
    });
  });

  it('treats omitted units as metric (back-compat)', () => {
    expect(buildRepotPlantUpdate('14', '', 'chunky_aroid')).toEqual({
      pot_diameter_cm: 14,
      substrate_type: 'chunky_aroid',
    });
  });

  it('repotting with dimensions persists pot fields so pot-size prompting clears', async () => {
    const updatePlant = vi.fn().mockResolvedValue({});
    await submitRepotPlantUpdate('plant-1', '13', '12', '', updatePlant, 'metric');
    expect(updatePlant).toHaveBeenCalledWith('plant-1', { pot_diameter_cm: 13, pot_height_cm: 12 });
  });

  it('omits invalid or out-of-range diameter and height values', () => {
    expect(buildRepotPlantUpdate('0', '-1', 'standard')).toEqual({
      substrate_type: 'standard',
    });
    expect(buildRepotPlantUpdate('999', '201', '')).toEqual({});
    expect(buildRepotPlantUpdate('abc', 'Infinity', '')).toEqual({});
  });

  it('submits plant updates only when the valid repot payload is non-empty', async () => {
    const updatePlant = vi.fn().mockResolvedValue({});

    await submitRepotPlantUpdate('plant-1', '13', '12', 'succulent_gritty', updatePlant);
    expect(updatePlant).toHaveBeenCalledWith('plant-1', {
      pot_diameter_cm: 13,
      pot_height_cm: 12,
      substrate_type: 'succulent_gritty',
    });

    updatePlant.mockClear();
    await submitRepotPlantUpdate('plant-1', '0', '999', '', updatePlant);
    expect(updatePlant).not.toHaveBeenCalled();
  });
});
