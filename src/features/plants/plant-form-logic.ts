import type { PlacementType, Units } from '../../lib/types';
import { cmToLengthInput, lengthInputToCm } from '../../lib/units';

const POT_DIMENSION_MIN_CM = 1;
const POT_DIMENSION_MAX_CM = 200;

/** A pot-dimension field value (cm or in) -> stored cm, or null when blank/invalid/out-of-range.
 *  Bounds + 2-dp rounding match the repot path (logsheet-logic) so both entry points agree. */
export function potDimensionToCm(value: string, units: Units): number | null {
  if (!value.trim() || !Number.isFinite(Number(value))) return null;
  const cm = lengthInputToCm(Number(value), units);
  if (cm < POT_DIMENSION_MIN_CM || cm > POT_DIMENSION_MAX_CM) return null;
  return Math.round(cm * 100) / 100;
}

/** Stored cm -> the field's initial value in the user's unit (empty when unset). */
export function potDimensionInitialValue(cm: number | null | undefined, units: Units): string {
  return cm != null ? String(cmToLengthInput(cm, units)) : '';
}

/** Rain reaches the pot only when the plant lives outside, so we ask the
 *  question for outdoor/balcony and leave it not-applicable elsewhere (spec Unit 4). */
export function placementNeedsRainAnswer(placement: PlacementType): boolean {
  return placement === 'outdoor' || placement === 'balcony';
}

/** The value to persist for `rain_exposed`: the explicit choice for outdoor/balcony,
 *  null (not applicable) otherwise. A null result for an outdoor plant means the user
 *  has not answered yet — the form blocks the save until they do. */
export function resolveRainExposed(placement: PlacementType, rainExposed: boolean | null): boolean | null {
  return placementNeedsRainAnswer(placement) ? rainExposed : null;
}
