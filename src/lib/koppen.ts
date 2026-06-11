/**
 * Köppen-Geiger climate classification (Peel et al. 2007 criteria) from
 * monthly normals, plus aggregation of daily weather series into those
 * normals. Pure module: the Open-Meteo client feeds it, tests pin it.
 */

export interface MonthlyNormals {
  /** Mean temperature per calendar month, Jan..Dec, °C. */
  tempC: number[];
  /** Mean monthly precipitation total per calendar month, Jan..Dec, mm. */
  precipMm: number[];
}

/**
 * Collapses daily series (ISO dates + daily mean temp + daily precip sum)
 * into 12 monthly normals. Returns null when any calendar month has no
 * usable data — a partial year produces no zone rather than a wrong one.
 */
export function aggregateMonthly(
  dates: string[],
  tempMeans: (number | null)[],
  precipSums: (number | null)[],
): MonthlyNormals | null {
  const tempByMonth: number[][] = Array.from({ length: 12 }, () => []);
  const precipByMonthYear = new Map<number, Map<string, number>>();
  for (let i = 0; i < dates.length; i++) {
    const month = Number(dates[i].slice(5, 7)) - 1;
    if (Number.isNaN(month) || month < 0 || month > 11) continue;
    const temp = tempMeans[i];
    if (temp != null) tempByMonth[month].push(temp);
    const precip = precipSums[i];
    if (precip != null) {
      const year = dates[i].slice(0, 4);
      const byYear = precipByMonthYear.get(month) ?? new Map<string, number>();
      byYear.set(year, (byYear.get(year) ?? 0) + precip);
      precipByMonthYear.set(month, byYear);
    }
  }

  const tempC: number[] = [];
  const precipMm: number[] = [];
  for (let month = 0; month < 12; month++) {
    const temps = tempByMonth[month];
    const yearTotals = [...(precipByMonthYear.get(month)?.values() ?? [])];
    if (temps.length === 0 || yearTotals.length === 0) return null;
    tempC.push(temps.reduce((a, b) => a + b, 0) / temps.length);
    precipMm.push(yearTotals.reduce((a, b) => a + b, 0) / yearTotals.length);
  }
  return { tempC, precipMm };
}

const NORTH_SUMMER = [3, 4, 5, 6, 7, 8]; // Apr..Sep

/**
 * Köppen-Geiger zone from monthly normals. `hemisphereSign` is positive for
 * the northern hemisphere (use the latitude's sign). Returns null on
 * malformed input.
 */
export function koppenZone(
  tempC: number[],
  precipMm: number[],
  hemisphereSign: number,
): string | null {
  if (tempC.length !== 12 || precipMm.length !== 12) return null;

  const summerMonths = new Set(
    hemisphereSign >= 0 ? NORTH_SUMMER : [0, 1, 2, 9, 10, 11].map((m) => m),
  );
  const summerPrecip = precipMm.filter((_, m) => summerMonths.has(m));
  const winterPrecip = precipMm.filter((_, m) => !summerMonths.has(m));

  const tMax = Math.max(...tempC);
  const tMin = Math.min(...tempC);
  const mat = tempC.reduce((a, b) => a + b, 0) / 12;
  const map = precipMm.reduce((a, b) => a + b, 0);
  const summerTotal = summerPrecip.reduce((a, b) => a + b, 0);

  // Aridity threshold depends on when the rain falls.
  let pThreshold: number;
  if (summerTotal >= 0.7 * map) pThreshold = 2 * mat + 28;
  else if (map - summerTotal >= 0.7 * map) pThreshold = 2 * mat;
  else pThreshold = 2 * mat + 14;

  if (map < 10 * pThreshold) {
    const wetness = map < 5 * pThreshold ? 'W' : 'S';
    return `B${wetness}${mat >= 18 ? 'h' : 'k'}`;
  }

  if (tMin >= 18) {
    const driest = Math.min(...precipMm);
    if (driest >= 60) return 'Af';
    if (driest >= 100 - map / 25) return 'Am';
    return 'Aw';
  }

  if (tMax < 10) return tMax < 0 ? 'EF' : 'ET';

  const driestSummer = Math.min(...summerPrecip);
  const wettestSummer = Math.max(...summerPrecip);
  const driestWinter = Math.min(...winterPrecip);
  const wettestWinter = Math.max(...winterPrecip);
  let seasonal: 's' | 'w' | 'f';
  if (driestSummer < 40 && driestSummer < wettestWinter / 3) seasonal = 's';
  else if (driestWinter < wettestSummer / 10) seasonal = 'w';
  else seasonal = 'f';

  const warmMonths = tempC.filter((t) => t >= 10).length;
  const group = tMin > 0 ? 'C' : 'D';
  let heat: string;
  if (tMax >= 22) heat = 'a';
  else if (warmMonths >= 4) heat = 'b';
  else heat = group === 'D' && tMin < -38 ? 'd' : 'c';

  return `${group}${seasonal}${heat}`;
}
