import type { Units } from '../../lib/types';
import { cmToLengthInput, lengthInputToCm } from '../../lib/units';

/** A pot-dimension field value (cm or in) -> stored cm, or null when blank/invalid. */
export function potDimensionToCm(value: string, units: Units): number | null {
  if (!value.trim() || !Number.isFinite(Number(value))) return null;
  return lengthInputToCm(Number(value), units);
}

/** Stored cm -> the field's initial value in the user's unit (empty when unset). */
export function potDimensionInitialValue(cm: number | null | undefined, units: Units): string {
  return cm != null ? String(cmToLengthInput(cm, units)) : '';
}
