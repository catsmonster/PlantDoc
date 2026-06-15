import { describe, expect, it } from 'vitest';
import { moistureForPlant } from '../../src/lib/moisture-read';
import { baseProfile, daysAgo, makePlant, measurement, NOW, observation, treatment } from './moisture-fixtures';

describe('moistureForPlant', () => {
  it('returns a bounded estimate for an indoor potted plant', () => {
    const result = moistureForPlant(makePlant(), null, [], NOW);
    if (result === null) throw new Error('expected a moisture estimate');
    expect(result.moisturePercent).toBeGreaterThanOrEqual(0);
    expect(result.moisturePercent).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high']).toContain(result.confidence);
    expect(['water_now', 'drying', 'comfortable', 'overwatered']).toContain(result.recommendation.status);
  });

  it('returns null when the pot size is unknown', () => {
    expect(moistureForPlant(makePlant({ pot_diameter_cm: null }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ pot_height_cm: null }), null, [], NOW)).toBeNull();
  });

  it('returns null for outdoor and balcony placements (deferred to v1.1)', () => {
    expect(moistureForPlant(makePlant({ placement_type: 'outdoor' }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ placement_type: 'balcony' }), null, [], NOW)).toBeNull();
  });

  it('still estimates for a greenhouse plant', () => {
    expect(moistureForPlant(makePlant({ placement_type: 'greenhouse' }), null, [], NOW)).not.toBeNull();
  });

  it('lowers confidence one tier when the species band is an unsourced fallback', () => {
    // Engineered so estimateMoisture scores exactly 4 ('high'): substrate + a measured
    // watering + 2 corrections. The two calls differ only in bandSourced, isolating the downgrade.
    const plant = makePlant({
      substrate_type: 'standard',
      observations: [
        observation(daysAgo(2), { observation_type: 'treatment', treatments: [treatment('watering', 200)] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_moisture_percent: 55 })] }),
      ],
    });
    const sourced = baseProfile({
      communityRanges: [
        { attribute: 'soil_moisture_percent', label: 'Soil moisture', min: 20, max: 50, unit: '%', sourceId: 'opb' },
      ],
    });
    const sourcedResult = moistureForPlant(plant, sourced, [], NOW);
    const fallbackResult = moistureForPlant(plant, null, [], NOW);
    if (sourcedResult === null || fallbackResult === null) throw new Error('expected estimates');
    expect(sourcedResult.confidence).toBe('high');
    expect(fallbackResult.confidence).toBe('medium');
  });
});
