/**
 * Read entry point (spec Unit D): a plant's inferred soil moisture, confidence,
 * and watering recommendation, composed from the pure engine. Pure — the caller
 * passes already-loaded data and `now`.
 */
import type { MoistureFeedback, Plant } from './types';
import type { SpeciesCareProfile } from './knowledge/care-profiles';
import { buildMoistureInputs } from './moisture-inputs';
import {
  estimateMoisture,
  recommendWatering,
  type Confidence,
  type MoistureBand,
  type WateringRecommendation,
} from './moisture';

export interface PlantMoisture {
  moisturePercent: number;
  confidence: Confidence;
  recommendation: WateringRecommendation;
  band: MoistureBand;
}

/** One tier down — an unsourced species band is a weaker prior. */
const LOWER_CONFIDENCE: Record<Confidence, Confidence> = { high: 'medium', medium: 'low', low: 'low' };

/**
 * Returns null — so the UI hides the gauge/insight — when the pot size is unknown
 * or the plant lives outdoors / on a balcony (outdoor inference is deferred to
 * v1.1). When the species band is an unsourced fallback, confidence drops a tier.
 */
export function moistureForPlant(
  plant: Plant,
  careProfile: SpeciesCareProfile | null,
  feedback: MoistureFeedback[],
  now: number,
): PlantMoisture | null {
  // Only a missing pot hides the gauge; a 0/negative dimension is form-prevented and
  // flows through as ~0% via the capacity guard in estimateMoisture.
  if (plant.pot_diameter_cm == null || plant.pot_height_cm == null) return null;
  if (plant.placement_type === 'outdoor' || plant.placement_type === 'balcony') return null;

  const { estimate, band, bandSourced } = buildMoistureInputs({ plant, careProfile, feedback, now });
  const { moisturePercent, confidence } = estimateMoisture(estimate);
  const recommendation = recommendWatering(moisturePercent, { band });

  return {
    moisturePercent,
    confidence: bandSourced ? confidence : LOWER_CONFIDENCE[confidence],
    recommendation,
    band,
  };
}
