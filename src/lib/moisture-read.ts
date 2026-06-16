/**
 * Read entry point (spec Unit D): a plant's inferred soil moisture, confidence,
 * and watering recommendation, composed from the pure engine. Pure: callers pass
 * already-loaded data, weather state, and `now`.
 */
import type { MoistureFeedback, Plant } from './types';
import type { SpeciesCareProfile } from './knowledge/care-profiles';
import type { WeatherSeries } from './openmeteo';
import { hasMoistureAnchor } from './moisture-anchor';
import { buildMoistureInputs, isFeedbackEligible } from './moisture-inputs';
import {
  estimateMoisture,
  recommendWatering,
  TARGET_BY_BAND,
  type Confidence,
  type MoistureBand,
  type WateringRecommendation,
} from './moisture';

export type PotSizePromptPlant = Pick<Plant, 'placement_type' | 'pot_diameter_cm' | 'pot_height_cm'>;

export function shouldPromptForPotSize(plant: PotSizePromptPlant): boolean {
  return plant.pot_diameter_cm == null || plant.pot_height_cm == null;
}

export interface PlantMoisture {
  moisturePercent: number;
  confidence: Confidence;
  recommendation: WateringRecommendation;
  band: MoistureBand;
  /** Whether the feedback prompt should be shown (spec Unit C). */
  feedbackEligible: boolean;
  /** No in-window soil check: used by the honest low-confidence nudge. */
  needsSoilCheck: boolean;
  /** Substrate unset: used by the honest low-confidence nudge. */
  needsSubstrate: boolean;
}

export type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; series: WeatherSeries }
  | { status: 'unavailable' };

export type MoistureCardState =
  | { kind: 'ready'; moisture: PlantMoisture }
  | { kind: 'needs_pot' }
  | { kind: 'needs_location' }
  | { kind: 'needs_observation' }
  | { kind: 'weather_loading' }
  | { kind: 'weather_unavailable' };

/** One tier down: an unsourced species band is a weaker prior. */
const LOWER_CONFIDENCE: Record<Confidence, Confidence> = { high: 'medium', medium: 'low', low: 'low' };

function isOutdoor(plant: Plant): boolean {
  return plant.placement_type === 'outdoor' || plant.placement_type === 'balcony';
}

function hasLocationCoords(plant: Plant): boolean {
  const loc = plant.location_id;
  return !!loc && typeof loc === 'object' && Array.isArray((loc as { location?: unknown }).location);
}

export function moistureCardState(
  plant: Plant,
  careProfile: SpeciesCareProfile | null,
  feedback: MoistureFeedback[],
  now: number,
  weather: WeatherState | undefined,
): MoistureCardState {
  // Only a missing pot hides the gauge; a 0/negative dimension is form-prevented
  // and flows through as ~0% via the capacity guard in estimateMoisture.
  if (shouldPromptForPotSize(plant)) return { kind: 'needs_pot' };

  let weatherSeries: WeatherSeries | undefined;
  if (isOutdoor(plant)) {
    if (!hasLocationCoords(plant)) return { kind: 'needs_location' };
  }
  if (!hasMoistureAnchor(plant)) return { kind: 'needs_observation' };
  if (isOutdoor(plant)) {
    if (!weather || weather.status === 'loading') return { kind: 'weather_loading' };
    if (weather.status === 'unavailable') return { kind: 'weather_unavailable' };
    weatherSeries = weather.series;
  }

  const { estimate, band, bandSourced, latestFeedback, lastNonFeedbackEventMs, hasRecentGroundTruth } =
    buildMoistureInputs({ plant, careProfile, feedback, now, weatherSeries });
  const { moisturePercent, confidence, capacityMl } = estimateMoisture(estimate);
  const recommendation = recommendWatering(moisturePercent, {
    band,
    // Amount only when the band is real mined data (spec Unit 1 gate).
    ...(bandSourced ? { targetFraction: TARGET_BY_BAND[band], capacityMl } : {}),
  });
  const feedbackEligible = isFeedbackEligible({ currentPercent: moisturePercent, latestFeedback, lastNonFeedbackEventMs });

  return {
    kind: 'ready',
    moisture: {
      moisturePercent,
      confidence: bandSourced ? confidence : LOWER_CONFIDENCE[confidence],
      recommendation,
      band,
      feedbackEligible,
      needsSoilCheck: !hasRecentGroundTruth,
      needsSubstrate: !estimate.substratePresent,
    },
  };
}

/** Back-compat accessor: the moisture value when the card is ready, else null. */
export function readyMoisture(state: MoistureCardState): PlantMoisture | null {
  return state.kind === 'ready' ? state.moisture : null;
}

/**
 * Returns null so legacy callers hide the gauge/insight for non-ready states.
 * New UI should prefer `moistureCardState` to show the specific reason.
 */
export function moistureForPlant(
  plant: Plant,
  careProfile: SpeciesCareProfile | null,
  feedback: MoistureFeedback[],
  now: number,
  weather?: WeatherState,
): PlantMoisture | null {
  return readyMoisture(moistureCardState(plant, careProfile, feedback, now, weather));
}
