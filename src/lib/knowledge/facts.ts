/**
 * The relational care-fact model (roadmap Phase 4A, slice B). A care profile is
 * a set of `CareFact` rows, each bound to one source by `sourceId` — preserving
 * the per-field provenance the bundled `Sourced<T>` model expressed, now as
 * table rows. `composeCareProfile` shapes facts (from the bundle or Appwrite)
 * back into the `SpeciesCareProfile` the UI already consumes; precedence picks a
 * display value when sources disagree. `editorialProfileToFacts` is the adapter
 * that turns the bundled editorial 10 into the first fact dataset.
 */

import {
  type CareRange,
  type SpeciesCareProfile,
  type Sourced,
  CARE_PROFILES,
} from './care-profiles';

export type Trust = 'sourced' | 'editorial' | 'community_unverified';

/** One care fact. Numeric ranges use min/max; text/categorical use valueText. */
export interface CareFact {
  attribute: string;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
  valueUnit?: string;
  sourceId: string;
  trust: Trust;
}

/** Minimal identity a composed profile needs beyond its facts. */
export interface SpeciesIdentity {
  slug: string;
  commonNames: string[];
  synonyms: string[];
  nameSourceId: string;
}

const TRUST_RANK: Record<Trust, number> = { sourced: 0, editorial: 1, community_unverified: 2 };

/** Lowest TRUST_RANK wins; ties keep the first seen (stable import order). */
function pickBest(facts: CareFact[]): CareFact | null {
  return facts.reduce<CareFact | null>(
    (best, f) => (best === null || TRUST_RANK[f.trust] < TRUST_RANK[best.trust] ? f : best),
    null,
  );
}

function sourced<T>(value: T, fact: CareFact): Sourced<T> {
  return { value, sourceId: fact.sourceId };
}

/** Explodes an editorial profile into facts (one row per field; lists per item). */
export function editorialProfileToFacts(profile: SpeciesCareProfile): CareFact[] {
  const t: Trust = 'editorial';
  return [
    { attribute: 'family', valueText: profile.family.value, sourceId: profile.family.sourceId, trust: 'sourced' },
    { attribute: 'light', valueText: profile.light.value, sourceId: profile.light.sourceId, trust: t },
    {
      attribute: 'water_cadence_days',
      valueMin: profile.waterCadenceDays.value.min,
      valueMax: profile.waterCadenceDays.value.max,
      valueUnit: 'days',
      sourceId: profile.waterCadenceDays.sourceId,
      trust: t,
    },
    {
      attribute: 'temperature_c',
      valueMin: profile.comfortableTemperatureC.value.min,
      valueMax: profile.comfortableTemperatureC.value.max,
      valueUnit: 'C',
      sourceId: profile.comfortableTemperatureC.sourceId,
      trust: t,
    },
    { attribute: 'humidity', valueText: profile.humidity.value, sourceId: profile.humidity.sourceId, trust: t },
    { attribute: 'toxicity', valueText: profile.toxicity.value, sourceId: profile.toxicity.sourceId, trust: t },
    ...profile.commonStressSigns.value.map((s): CareFact => ({
      attribute: 'stress_sign', valueText: s, sourceId: profile.commonStressSigns.sourceId, trust: t,
    })),
    ...profile.likelyPests.value.map((p): CareFact => ({
      attribute: 'pest', valueText: p, sourceId: profile.likelyPests.sourceId, trust: t,
    })),
  ];
}

function rangeFact(facts: CareFact[], attribute: string): Sourced<CareRange> | null {
  const best = pickBest(facts.filter((f) => f.attribute === attribute));
  if (!best || best.valueMin === undefined || best.valueMax === undefined) return null;
  return sourced({ min: best.valueMin, max: best.valueMax }, best);
}

function textFact(facts: CareFact[], attribute: string): Sourced<string> | null {
  const best = pickBest(facts.filter((f) => f.attribute === attribute && f.valueText !== undefined));
  return best ? sourced(best.valueText!, best) : null;
}

function listFact(facts: CareFact[], attribute: string): Sourced<string[]> | null {
  const rows = facts.filter((f) => f.attribute === attribute && f.valueText !== undefined);
  if (rows.length === 0) return null;
  const seen = new Set<string>();
  const values: string[] = [];
  for (const r of rows) {
    const key = r.valueText!.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(r.valueText!);
    }
  }
  return { value: values, sourceId: pickBest(rows)!.sourceId };
}

/**
 * Shapes care facts into the SpeciesCareProfile the UI consumes. Returns null
 * when there are no facts. Missing fields fall back to an empty sourced value so
 * the panel can render whatever facts exist; callers gate on a non-null return.
 */
export function composeCareProfile(
  scientificName: string,
  facts: CareFact[],
  identity: SpeciesIdentity,
): SpeciesCareProfile | null {
  if (facts.length === 0) return null;
  const empty: Sourced<string> = { value: '', sourceId: identity.nameSourceId };
  const emptyRange: Sourced<CareRange> = { value: { min: 0, max: 0 }, sourceId: identity.nameSourceId };
  return {
    slug: identity.slug,
    scientificName,
    nameSourceId: identity.nameSourceId,
    commonNames: identity.commonNames,
    synonyms: identity.synonyms,
    family: textFact(facts, 'family') ?? empty,
    light: textFact(facts, 'light') ?? empty,
    waterCadenceDays: rangeFact(facts, 'water_cadence_days') ?? emptyRange,
    comfortableTemperatureC: rangeFact(facts, 'temperature_c') ?? emptyRange,
    humidity: textFact(facts, 'humidity') ?? empty,
    toxicity: textFact(facts, 'toxicity') ?? empty,
    commonStressSigns: listFact(facts, 'stress_sign') ?? { value: [], sourceId: identity.nameSourceId },
    likelyPests: listFact(facts, 'pest') ?? { value: [], sourceId: identity.nameSourceId },
  };
}

/** All editorial profiles as facts, keyed by slug — the slice-1 dataset. */
export function editorialFactsBySlug(): Map<string, CareFact[]> {
  return new Map(CARE_PROFILES.map((p) => [p.slug, editorialProfileToFacts(p)]));
}

interface RawCareFactRow {
  attribute: string;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  value_unit: string | null;
  trust: Trust;
  source_id: unknown;
}

/**
 * Maps a hydrated Appwrite species row (`care_facts.*` selected) into CareFact[].
 * `resolveSourceKey` turns the relationship's related-row $id into the stable
 * source key the UI cache is keyed by (Appwrite returns relationship values as
 * the related id, or a nested object, on a plain read).
 */
export function careFactsFromSpeciesRow(
  row: { care_facts?: RawCareFactRow[] },
  resolveSourceKey: (relatedId: string) => string,
): CareFact[] {
  return (row.care_facts ?? []).map((r) => ({
    attribute: r.attribute,
    valueMin: r.value_min ?? undefined,
    valueMax: r.value_max ?? undefined,
    valueText: r.value_text ?? undefined,
    valueUnit: r.value_unit ?? undefined,
    trust: r.trust,
    sourceId: resolveSourceKey(
      typeof r.source_id === 'string'
        ? r.source_id
        : String((r.source_id as { $id?: string })?.$id ?? ''),
    ),
  }));
}
