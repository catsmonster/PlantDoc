/** Display-unit helpers. PlantDoc stores metric internally (docs/guidelines.md). */

export type Units = 'metric' | 'imperial';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatHeight(cm: number, units: Units): string {
  if (units === 'imperial') return `${round1(cm / 2.54)} in`;
  return `${round1(cm)} cm`;
}

export function formatVolume(ml: number, units: Units): string {
  if (units === 'imperial') return `${round1(ml / 29.5735)} fl oz`;
  if (ml >= 1000) return `${round1(ml / 1000)} l`;
  return `${round1(ml)} ml`;
}

export function formatTemperature(celsius: number, units: Units): string {
  if (units === 'imperial') return `${round1((celsius * 9) / 5 + 32)}°F`;
  return `${round1(celsius)}°C`;
}

export const CM_PER_INCH = 2.54;
export const ML_PER_FL_OZ = 29.5735;

/** Convert a user-entered length (cm or in) to stored cm. */
export function lengthInputToCm(value: number, units: Units): number {
  return units === 'imperial' ? value * CM_PER_INCH : value;
}

/** Convert stored cm to the display/input unit (rounded for editing). */
export function cmToLengthInput(cm: number, units: Units): number {
  return units === 'imperial' ? round1(cm / CM_PER_INCH) : round1(cm);
}

/** Convert a user-entered volume (ml or fl oz) to stored ml. */
export function volumeInputToMl(value: number, units: Units): number {
  return units === 'imperial' ? value * ML_PER_FL_OZ : value;
}

/** Convert stored ml to the display/input unit (rounded for editing). */
export function mlToVolumeInput(ml: number, units: Units): number {
  return units === 'imperial' ? round1(ml / ML_PER_FL_OZ) : round1(ml);
}
