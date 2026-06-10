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
