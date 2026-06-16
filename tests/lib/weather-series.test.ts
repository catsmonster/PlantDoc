import { describe, expect, it } from 'vitest';
import { distinctWeatherKeys, plantWeatherKey, seriesWindow } from '../../src/lib/weather-series';

const indoor = { placement_type: 'indoor', location_id: null } as never;
const wateringObservation = {
  treatments: [{ treatment_type: 'watering' }],
  measurements: [],
};
const outdoorNoHistory = { placement_type: 'outdoor', location_id: { location: [4.9, 52.2] }, observations: [] } as never;
const outdoorA = {
  placement_type: 'outdoor',
  location_id: { location: [4.9, 52.2] },
  observations: [wateringObservation],
} as never;
const outdoorADupe = {
  placement_type: 'balcony',
  location_id: { location: [4.91, 52.24] },
  observations: [wateringObservation],
} as never;
const outdoorNoLoc = { placement_type: 'outdoor', location_id: null } as never;

describe('weather-series keys', () => {
  it('builds a 60-day window ending today', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    const { startIso, endIso } = seriesWindow(now);
    expect(endIso).toBe('2026-06-16');
    expect(startIso).toBe('2026-04-17');
  });

  it('keys outdoor plants by rounded coords + window once a moisture anchor exists', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    expect(plantWeatherKey(indoor, now)).toBeNull();
    expect(plantWeatherKey(outdoorNoLoc, now)).toBeNull();
    expect(plantWeatherKey(outdoorNoHistory, now)).toBeNull();
    expect(plantWeatherKey(outdoorA, now)).toBe(plantWeatherKey(outdoorADupe, now));
  });

  it('dedupes distinct keys across a plant list', () => {
    const now = Date.parse('2026-06-16T10:00:00Z');
    expect(distinctWeatherKeys([indoor, outdoorNoHistory, outdoorA, outdoorADupe, outdoorNoLoc], now)).toHaveLength(1);
  });
});
