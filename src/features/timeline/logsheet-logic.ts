import type { LogInput } from '../../lib/log';
import type { PlantInput } from '../../lib/repo';
import type { SubstrateType, Units } from '../../lib/types';
import { lengthInputToCm } from '../../lib/units';
import { parseWaterAmountMl } from '../../lib/water-amount';

const POT_DIMENSION_MIN_CM = 1;
const POT_DIMENSION_MAX_CM = 200;

function parseValidPotDimension(value: string, units: Units): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = lengthInputToCm(Number(value), units);
  if (!Number.isFinite(parsed) || parsed < POT_DIMENSION_MIN_CM || parsed > POT_DIMENSION_MAX_CM) {
    return undefined;
  }
  return Math.round(parsed * 100) / 100;
}

export function buildWateringTreatment(
  amount: string,
  method: string,
): NonNullable<LogInput['treatment']> {
  const parsedAmount = parseWaterAmountMl(amount);
  if (parsedAmount === undefined) {
    return {
      treatment_type: 'watering',
      amount_value: null,
      method,
    };
  }
  return {
    treatment_type: 'watering',
    amount_value: parsedAmount,
    amount_unit: 'ml',
    method,
  };
}

export function buildRepotPlantUpdate(
  repotDiameter: string,
  repotHeight: string,
  repotSubstrate: SubstrateType | '',
  units: Units = 'metric',
): Partial<PlantInput> {
  const potUpdate: Partial<PlantInput> = {};
  const diameter = parseValidPotDimension(repotDiameter, units);
  const height = parseValidPotDimension(repotHeight, units);
  if (diameter !== undefined) potUpdate.pot_diameter_cm = diameter;
  if (height !== undefined) potUpdate.pot_height_cm = height;
  if (repotSubstrate) potUpdate.substrate_type = repotSubstrate;
  return potUpdate;
}

export async function submitRepotPlantUpdate(
  plantId: string,
  repotDiameter: string,
  repotHeight: string,
  repotSubstrate: SubstrateType | '',
  updatePlantFn: (plantId: string, input: Partial<PlantInput>) => Promise<unknown>,
  units: Units = 'metric',
): Promise<void> {
  const potUpdate = buildRepotPlantUpdate(repotDiameter, repotHeight, repotSubstrate, units);
  if (Object.keys(potUpdate).length > 0) await updatePlantFn(plantId, potUpdate);
}
