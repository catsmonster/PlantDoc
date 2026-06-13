/**
 * Generates src/lib/knowledge/common-plants.ts from the seed list by resolving
 * each name against the GBIF backbone (accepted name + English vernaculars).
 * Run manually; commit the output. Name data only — never care data.
 *
 *   npm run knowledge:build-common-plants
 */
import { writeFile } from 'node:fs/promises';
import { buildGbifMatchUrl } from '../../src/lib/knowledge/gbif';
import { COMMON_PLANT_SEED, type CommonPlantSeed } from './common-plants.seed';
import {
  commonNamesFor,
  englishVernaculars,
  plantFromMatch,
  type CommonPlant,
} from './common-plants-transform';

const OUT = new URL('../../src/lib/knowledge/common-plants.ts', import.meta.url);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolve a curated seed to an index row: /species/match on the scientific name
// is authoritative, then enrich with English vernaculars. The curated common
// name always leads (GBIF often omits the everyday word), so it stays searchable.
async function resolve(seed: CommonPlantSeed): Promise<CommonPlant | null> {
  const matchRes = await fetch(buildGbifMatchUrl(seed.scientific));
  if (!matchRes.ok) return null;
  const plant = plantFromMatch(await matchRes.json());
  if (!plant) return null;
  const vernRes = await fetch(`https://api.gbif.org/v1/species/${plant.usageKey}/vernacularNames?limit=200`);
  const vernaculars = vernRes.ok ? englishVernaculars(await vernRes.json()) : [];
  return { scientificName: plant.scientificName, commonNames: commonNamesFor(seed.common, vernaculars) };
}

async function main() {
  const byName = new Map<string, CommonPlant>();
  for (const seed of COMMON_PLANT_SEED) {
    try {
      const row = await resolve(seed);
      if (row) byName.set(row.scientificName.toLowerCase(), row);
      else console.warn(`no Plantae match: ${seed.common} (${seed.scientific})`);
    } catch (e) {
      console.warn(`error resolving ${seed.common} (${seed.scientific}):`, e);
    }
    await sleep(120);
  }
  const rows = [...byName.values()].sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  const body = rows
    .map((r) => `  { scientificName: ${JSON.stringify(r.scientificName)}, commonNames: ${JSON.stringify(r.commonNames)} },`)
    .join('\n');
  const file = `/**
 * GENERATED FILE — do not edit by hand. Run \`npm run knowledge:build-common-plants\`.
 * Offline common-plant name index for the species typeahead. Generated ${new Date().toISOString().slice(0, 10)}
 * from the GBIF Backbone Taxonomy (CC BY 4.0 — https://www.gbif.org). Name data
 * only (common <-> scientific); never care data.
 */
export interface CommonPlant {
  scientificName: string;
  commonNames: string[];
}

export const COMMON_PLANTS: readonly CommonPlant[] = [
${body}
];
`;
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${rows.length} species to src/lib/knowledge/common-plants.ts`);
}

void main();
