export const WATER_AMOUNT_MIN_ML = 10;
export const WATER_AMOUNT_MAX_ML = 2000;
export const WATER_AMOUNT_STEP_ML = 10;
export const WATER_AMOUNT_DEFAULT_ML = 250;

function waterAmountRangeMessage(): string {
  return `Water amount must be between ${WATER_AMOUNT_MIN_ML} ml and ${WATER_AMOUNT_MAX_ML} ml.`;
}

export function clampWaterAmountMl(value: number): number {
  return Math.min(WATER_AMOUNT_MAX_ML, Math.max(WATER_AMOUNT_MIN_ML, value));
}

export function normalizeWaterAmountText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return value;

  return String(clampWaterAmountMl(amount));
}

export function parseWaterAmountMl(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < WATER_AMOUNT_MIN_ML || amount > WATER_AMOUNT_MAX_ML) {
    throw new Error(waterAmountRangeMessage());
  }

  return amount;
}

export function waterAmountSliderValue(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return WATER_AMOUNT_DEFAULT_ML;

  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return WATER_AMOUNT_DEFAULT_ML;

  const stepped = Math.round(amount / WATER_AMOUNT_STEP_ML) * WATER_AMOUNT_STEP_ML;
  return clampWaterAmountMl(stepped);
}
