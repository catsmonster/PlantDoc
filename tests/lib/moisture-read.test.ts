import { describe, expect, it } from 'vitest';
import { moistureCardState, moistureForPlant } from '../../src/lib/moisture-read';
import type { WeatherSeries } from '../../src/lib/openmeteo';
import type { UserLocation } from '../../src/lib/types';
import { baseProfile, daysAgo, makePlant, measurement, NOW, observation, treatment } from './moisture-fixtures';

describe('moistureForPlant', () => {
  const wateringAnchor = observation(daysAgo(20), {
    observation_type: 'treatment',
    treatments: [treatment('watering', null)],
  });

  it('returns a bounded estimate for an indoor potted plant with a moisture anchor', () => {
    const result = moistureForPlant(makePlant({ observations: [wateringAnchor] }), null, [], NOW);
    if (result === null) throw new Error('expected a moisture estimate');
    expect(result.moisturePercent).toBeGreaterThanOrEqual(0);
    expect(result.moisturePercent).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high']).toContain(result.confidence);
    expect(['water_now', 'drying', 'comfortable', 'overwatered']).toContain(result.recommendation.status);
  });

  it('waits for a watering, repot, or soil check before showing a numeric estimate', () => {
    expect(moistureCardState(makePlant(), null, [], NOW, undefined).kind).toBe('needs_observation');
    expect(moistureForPlant(makePlant(), null, [], NOW)).toBeNull();
  });

  it('returns null when the pot size is unknown', () => {
    expect(moistureForPlant(makePlant({ pot_diameter_cm: null }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ pot_height_cm: null }), null, [], NOW)).toBeNull();
  });

  it('returns null for outdoor and balcony placements (deferred to v1.1)', () => {
    expect(moistureForPlant(makePlant({ placement_type: 'outdoor' }), null, [], NOW)).toBeNull();
    expect(moistureForPlant(makePlant({ placement_type: 'balcony' }), null, [], NOW)).toBeNull();
  });

  it('still estimates for a greenhouse plant with a moisture anchor', () => {
    expect(
      moistureForPlant(
        makePlant({ placement_type: 'greenhouse', observations: [wateringAnchor] }),
        null,
        [],
        NOW,
      ),
    ).not.toBeNull();
  });

  it('includes a suggested water amount only when the band is sourced and water_now', () => {
    // An old unknown watering anchors the estimate but dries down to residual
    // (~5%) -> water_now. A sourced soil_moisture_percent range makes
    // bandSourced true (spec Unit 1 gate).
    const plantDueToWater = makePlant({
      observations: [
        observation(daysAgo(55), { observation_type: 'treatment', treatments: [treatment('watering', null)] }),
      ],
    });
    const sourcedCareProfile = baseProfile({
      communityRanges: [
        { attribute: 'soil_moisture_percent', label: 'Soil moisture', min: 60, max: 80, unit: '%', sourceId: 'opb' },
      ],
    });
    const ready = moistureForPlant(plantDueToWater, sourcedCareProfile, [], NOW);
    expect(ready?.recommendation.status).toBe('water_now');
    expect(ready?.recommendation.suggestedWaterMl).toBeGreaterThan(0);

    // Same plant, but an unsourced (bundled-fallback) profile -> no amount.
    const unsourced = moistureForPlant(plantDueToWater, null, [], NOW);
    expect(unsourced?.recommendation.suggestedWaterMl).toBeUndefined();
  });

  it('lowers confidence one tier when the species band is an unsourced fallback', () => {
    // Engineered so estimateMoisture scores exactly 4 ('high'): substrate + a measured
    // watering + 2 corrections. The two calls differ only in bandSourced, isolating the downgrade.
    const plant = makePlant({
      substrate_type: 'standard',
      observations: [
        observation(daysAgo(2), { observation_type: 'treatment', treatments: [treatment('watering', 200)] }),
        observation(daysAgo(2), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
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

  it('distinguishes the outdoor card states', () => {
    const location = { location: [5.1, 52.1] } as unknown as UserLocation;
    const emptyish: WeatherSeries = new Map();
    const indoorWithPot = makePlant({ observations: [wateringAnchor] });

    const outdoorNoLoc = { ...indoorWithPot, placement_type: 'outdoor' as const, location_id: null };
    expect(moistureCardState(outdoorNoLoc, null, [], NOW, undefined).kind).toBe('needs_location');

    const outdoorWithLoc = { ...indoorWithPot, placement_type: 'outdoor' as const, location_id: location };
    expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'loading' }).kind).toBe('weather_loading');
    expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'unavailable' }).kind).toBe('weather_unavailable');
    expect(moistureCardState(outdoorWithLoc, null, [], NOW, { status: 'ready', series: emptyish }).kind).toBe('ready');

    const noPot = { ...indoorWithPot, pot_diameter_cm: null };
    expect(moistureCardState(noPot, null, [], NOW, undefined).kind).toBe('needs_pot');
  });

  it('does not show outdoor weather-derived moisture before a timeline anchor', () => {
    const location = { location: [5.1, 52.1] } as unknown as UserLocation;
    const series: WeatherSeries = new Map([
      ['2026-07-15', { tempC: 24, humidityPct: 70, precipMm: 30 }],
    ]);
    const plant = makePlant({
      placement_type: 'outdoor',
      location_id: location,
      rain_exposed: true,
    });

    expect(moistureCardState(plant, null, [], NOW, { status: 'ready', series }).kind).toBe(
      'needs_observation',
    );
  });
});

describe('moistureForPlant eligibility and enrichment', () => {
  it('flags feedback eligible and both enrichment needs for a bare plant', () => {
    const result = moistureForPlant(
      makePlant({ substrate_type: null, observations: [observation(daysAgo(2), { observation_type: 'treatment', treatments: [treatment('watering', null)] })] }),
      null,
      [],
      NOW,
    );
    if (result === null) throw new Error('expected an estimate');
    expect(result.feedbackEligible).toBe(true);
    expect(result.needsSubstrate).toBe(true);
    expect(result.needsSoilCheck).toBe(true);
  });

  it('clears needsSoilCheck once a soil check exists in-window', () => {
    const plant = makePlant({
      observations: [
        observation(daysAgo(1), { observation_type: 'measurement', measurements: [measurement({ soil_state: 'moist' })] }),
      ],
    });
    const result = moistureForPlant(plant, null, [], NOW);
    if (result === null) throw new Error('expected an estimate');
    expect(result.needsSoilCheck).toBe(false);
  });
});
