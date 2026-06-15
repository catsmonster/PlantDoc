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
    expect(source).toContain("const [amount, setAmount] = useState(draft?.amount ?? '')");
    expect(source).toContain('placeholder="250"');
    expect(source).toContain('amount_value: parsedAmount ?? null');
    expect(source).toContain("amount_unit: parsedAmount === undefined ? undefined : 'ml'");
    expect(source).toContain('type="range"');
    expect(source).toContain('min={WATER_AMOUNT_MIN_ML}');
    expect(source).toContain('max={WATER_AMOUNT_MAX_ML}');
    expect(source).toContain('step={WATER_AMOUNT_STEP_ML}');
    expect(source.match(/<WaterAmountField/g)).toHaveLength(2);
    expect(source).not.toContain("['150', '250', '500']");
  });
});

describe('LogSheet repot plant update', () => {
  it('updates the plant with only provided repot pot fields', () => {
    expect(source).toContain('function buildRepotPlantUpdate');
    expect(source).toContain('potUpdate.pot_diameter_cm = Number(repotDiameter)');
    expect(source).toContain('potUpdate.pot_height_cm = Number(repotHeight)');
    expect(source).toContain('if (repotSubstrate) potUpdate.substrate_type = repotSubstrate');
    expect(source).toContain(
      'const potUpdate = buildRepotPlantUpdate(repotDiameter, repotHeight, repotSubstrate)',
    );
    expect(source).toContain(
      'if (Object.keys(potUpdate).length > 0) await updatePlant(plantId, potUpdate)',
    );
  });
});
