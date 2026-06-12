/**
 * Human-reviewed starter care pack for 10 common houseplants (roadmap Phase 4A,
 * first slice). Bundled data — no Appwrite table yet — so the slice is
 * self-contained, deterministic, and offline-safe.
 *
 * Provenance rule (roadmap): every populated field carries a `sourceId` into
 * KNOWLEDGE_SOURCES. A field we cannot source is omitted, never guessed. Care
 * ranges are PlantDoc editorial baselines; taxonomy facts cite POWO.
 */

import { getSource, type KnowledgeSource } from './sources';

/** A reference fact bound to the source it came from. */
export interface Sourced<T> {
  value: T;
  sourceId: string;
}

export interface CareRange {
  min: number;
  max: number;
}

export interface SpeciesCareProfile {
  /** Stable slug for keys and feedback. */
  slug: string;
  scientificName: string;
  /** Source for the accepted scientific name. */
  nameSourceId: string;
  /** Common names, lowercased-matchable at lookup time. */
  commonNames: string[];
  /** Scientific synonyms, for matching legacy names users may type. */
  synonyms: string[];
  family: Sourced<string>;
  light: Sourced<string>;
  /** Typical days between waterings for an indoor plant in average conditions. */
  waterCadenceDays: Sourced<CareRange>;
  comfortableTemperatureC: Sourced<CareRange>;
  humidity: Sourced<string>;
  /** Safety flag — pet/human toxicity in plain language. */
  toxicity: Sourced<string>;
  commonStressSigns: Sourced<string[]>;
  likelyPests: Sourced<string[]>;
}

const EDITORIAL = 'plantdoc-editorial';
const POWO = 'powo';

export const CARE_PROFILES: readonly SpeciesCareProfile[] = [
  {
    slug: 'monstera-deliciosa',
    scientificName: 'Monstera deliciosa',
    nameSourceId: POWO,
    commonNames: ['Swiss cheese plant', 'Split-leaf philodendron'],
    synonyms: ['Philodendron pertusum'],
    family: { value: 'Araceae', sourceId: POWO },
    light: { value: 'Bright indirect light; tolerates medium light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'Average to high (40-60%)', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (insoluble calcium oxalates)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Yellowing lower leaves from overwatering', 'Few leaf splits in low light'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Spider mites', 'Thrips', 'Mealybugs'], sourceId: EDITORIAL },
  },
  {
    slug: 'epipremnum-aureum',
    scientificName: 'Epipremnum aureum',
    nameSourceId: POWO,
    commonNames: ['Pothos', 'Golden pothos', "Devil's ivy"],
    synonyms: ['Scindapsus aureus', 'Pothos aureus'],
    family: { value: 'Araceae', sourceId: POWO },
    light: { value: 'Low to bright indirect light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 7, max: 12 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 17, max: 29 }, sourceId: EDITORIAL },
    humidity: { value: 'Tolerates average household humidity', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (insoluble calcium oxalates)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Limp, wrinkled leaves when underwatered', 'Pale leaves in too much direct sun'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Mealybugs', 'Spider mites'], sourceId: EDITORIAL },
  },
  {
    slug: 'sansevieria-trifasciata',
    scientificName: 'Dracaena trifasciata',
    nameSourceId: POWO,
    commonNames: ['Snake plant', "Mother-in-law's tongue"],
    synonyms: ['Sansevieria trifasciata'],
    family: { value: 'Asparagaceae', sourceId: POWO },
    light: { value: 'Low to bright indirect light; very forgiving', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 14, max: 21 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 30 }, sourceId: EDITORIAL },
    humidity: { value: 'Low; tolerates dry air', sourceId: EDITORIAL },
    toxicity: { value: 'Mildly toxic to cats and dogs if eaten (saponins)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Soft, mushy base from overwatering', 'Wrinkled leaves when very underwatered'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Mealybugs', 'Spider mites'], sourceId: EDITORIAL },
  },
  {
    slug: 'zamioculcas-zamiifolia',
    scientificName: 'Zamioculcas zamiifolia',
    nameSourceId: POWO,
    commonNames: ['ZZ plant', 'Zanzibar gem'],
    synonyms: ['Caladium zamiifolium'],
    family: { value: 'Araceae', sourceId: POWO },
    light: { value: 'Low to bright indirect light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 14, max: 21 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 26 }, sourceId: EDITORIAL },
    humidity: { value: 'Low; tolerates dry air', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (insoluble calcium oxalates)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Yellowing stems from overwatering', 'Wrinkled rhizomes when severely dry'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Mealybugs'], sourceId: EDITORIAL },
  },
  {
    slug: 'spathiphyllum-wallisii',
    scientificName: 'Spathiphyllum wallisii',
    nameSourceId: POWO,
    commonNames: ['Peace lily'],
    synonyms: [],
    family: { value: 'Araceae', sourceId: POWO },
    light: { value: 'Medium to bright indirect light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 5, max: 8 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'High; appreciates extra humidity', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (insoluble calcium oxalates)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Dramatic drooping when thirsty (recovers after watering)', 'Brown leaf tips from dry air or tap-water salts'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Spider mites', 'Mealybugs', 'Aphids'], sourceId: EDITORIAL },
  },
  {
    slug: 'ficus-lyrata',
    scientificName: 'Ficus lyrata',
    nameSourceId: POWO,
    commonNames: ['Fiddle-leaf fig'],
    synonyms: [],
    family: { value: 'Moraceae', sourceId: POWO },
    light: { value: 'Bright indirect light; some direct sun', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'Average to high', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (irritant sap)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Brown spots and leaf drop from inconsistent watering', 'Dropping leaves after being moved'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Spider mites', 'Scale', 'Mealybugs'], sourceId: EDITORIAL },
  },
  {
    slug: 'chlorophytum-comosum',
    scientificName: 'Chlorophytum comosum',
    nameSourceId: POWO,
    commonNames: ['Spider plant', 'Airplane plant'],
    synonyms: ['Anthericum comosum'],
    family: { value: 'Asparagaceae', sourceId: POWO },
    light: { value: 'Bright indirect light; tolerates medium light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 16, max: 26 }, sourceId: EDITORIAL },
    humidity: { value: 'Average', sourceId: EDITORIAL },
    toxicity: { value: 'Non-toxic to cats and dogs', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Brown leaf tips from tap-water fluoride or dry air', 'Pale leaves in low light'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Spider mites', 'Aphids'], sourceId: EDITORIAL },
  },
  {
    slug: 'aloe-vera',
    scientificName: 'Aloe vera',
    nameSourceId: POWO,
    commonNames: ['Aloe vera', 'Medicinal aloe'],
    synonyms: ['Aloe barbadensis'],
    family: { value: 'Asphodelaceae', sourceId: POWO },
    light: { value: 'Bright light, including some direct sun', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 14, max: 21 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 13, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'Low; tolerates dry air', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (saponins, anthraquinones)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Soft, translucent leaves from overwatering', 'Curling, thin leaves when underwatered'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Mealybugs', 'Scale'], sourceId: EDITORIAL },
  },
  {
    slug: 'dracaena-marginata',
    scientificName: 'Dracaena marginata',
    nameSourceId: POWO,
    commonNames: ['Dragon tree', 'Madagascar dragon tree'],
    synonyms: ['Dracaena reflexa var. angustifolia'],
    family: { value: 'Asparagaceae', sourceId: POWO },
    light: { value: 'Medium to bright indirect light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 10, max: 14 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'Average', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (saponins)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Brown leaf tips from tap-water fluoride or salts', 'Yellowing from overwatering'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Spider mites', 'Mealybugs', 'Scale'], sourceId: EDITORIAL },
  },
  {
    slug: 'philodendron-hederaceum',
    scientificName: 'Philodendron hederaceum',
    nameSourceId: POWO,
    commonNames: ['Heartleaf philodendron'],
    synonyms: ['Philodendron scandens', 'Philodendron cordatum'],
    family: { value: 'Araceae', sourceId: POWO },
    light: { value: 'Low to bright indirect light', sourceId: EDITORIAL },
    waterCadenceDays: { value: { min: 7, max: 10 }, sourceId: EDITORIAL },
    comfortableTemperatureC: { value: { min: 18, max: 27 }, sourceId: EDITORIAL },
    humidity: { value: 'Average to high', sourceId: EDITORIAL },
    toxicity: { value: 'Toxic to cats and dogs if eaten (insoluble calcium oxalates)', sourceId: EDITORIAL },
    commonStressSigns: {
      value: ['Yellow leaves from overwatering', 'Leggy growth with small leaves in low light'],
      sourceId: EDITORIAL,
    },
    likelyPests: { value: ['Aphids', 'Mealybugs', 'Spider mites'], sourceId: EDITORIAL },
  },
] as const;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Resolves a single care profile from a free-text species string by exact
 * (case-insensitive) match against accepted name, synonyms, or common names.
 * Returns null when nothing matches — callers must not guess.
 */
export function findCareProfile(query: string | null | undefined): SpeciesCareProfile | null {
  if (!query) return null;
  const q = normalize(query);
  if (!q) return null;
  for (const profile of CARE_PROFILES) {
    if (normalize(profile.scientificName) === q) return profile;
    if (profile.synonyms.some((s) => normalize(s) === q)) return profile;
    if (profile.commonNames.some((c) => normalize(c) === q)) return profile;
  }
  return null;
}

/**
 * Ranked substring search over accepted names, synonyms, and common names for
 * species onboarding. Exact matches rank first, then name prefix, then any
 * substring hit.
 */
export function searchCareProfiles(query: string, limit = 8): SpeciesCareProfile[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { profile: SpeciesCareProfile; score: number }[] = [];
  for (const profile of CARE_PROFILES) {
    const haystacks = [profile.scientificName, ...profile.commonNames, ...profile.synonyms].map(
      normalize,
    );
    let best = Infinity;
    for (const hay of haystacks) {
      if (hay === q) best = Math.min(best, 0);
      else if (hay.startsWith(q)) best = Math.min(best, 1);
      else if (hay.includes(q)) best = Math.min(best, 2);
    }
    if (best < Infinity) scored.push({ profile, score: best });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.profile.scientificName.localeCompare(b.profile.scientificName))
    .slice(0, limit)
    .map((s) => s.profile);
}

interface PlantSpeciesLike {
  common_name?: string | null;
  species_text?: string | null;
  species_id?: { scientific_name?: string; common_names?: string[] } | string | null;
}

/** Resolves the care profile for a plant from whichever species fields it has. */
export function careProfileForPlant(plant: PlantSpeciesLike): SpeciesCareProfile | null {
  const candidates: (string | null | undefined)[] = [];
  if (plant.species_id && typeof plant.species_id === 'object') {
    candidates.push(plant.species_id.scientific_name);
    candidates.push(...(plant.species_id.common_names ?? []));
  }
  candidates.push(plant.species_text, plant.common_name);
  for (const candidate of candidates) {
    const match = findCareProfile(candidate);
    if (match) return match;
  }
  return null;
}

/** Resolves the KnowledgeSource for a sourced field, for provenance display. */
export function sourceOf<T>(field: Sourced<T>): KnowledgeSource | null {
  return getSource(field.sourceId);
}
