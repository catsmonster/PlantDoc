import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src', 'features', 'timeline', 'LogSheet.tsx'),
  'utf8',
);

describe('LogSheet water amount controls', () => {
  it('uses an open amount field and bounded slider in both themes', () => {
    expect(source).toContain('function WaterAmountField');
    expect(source).toContain('aria-label="Water amount in milliliters"');
    expect(source).toContain('type="number"');
    expect(source).toContain('type="range"');
    expect(source).toContain('min={WATER_AMOUNT_MIN_ML}');
    expect(source).toContain('max={WATER_AMOUNT_MAX_ML}');
    expect(source).toContain('step={WATER_AMOUNT_STEP_ML}');
    expect(source.match(/<WaterAmountField/g)).toHaveLength(2);
    expect(source).not.toContain("['150', '250', '500']");
  });
});
