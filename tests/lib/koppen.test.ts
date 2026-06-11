import { describe, expect, it } from 'vitest';
import { aggregateMonthly, koppenZone } from '../../src/lib/koppen';

// Monthly fixtures are idealized climate normals (Jan..Dec), northern
// hemisphere unless stated. Values chosen to be unambiguous for each zone.

describe('koppenZone', () => {
  it('classifies tropical rainforest (Af) — hot and wet year-round', () => {
    const temp = [26, 27, 27, 27, 28, 28, 27, 27, 27, 27, 27, 26];
    const precip = [250, 160, 190, 180, 170, 130, 150, 170, 180, 190, 250, 270];
    expect(koppenZone(temp, precip, 1)).toBe('Af');
  });

  it('classifies tropical savanna (Aw) — hot with a dry winter', () => {
    const temp = [27, 28, 29, 30, 29, 27, 26, 26, 27, 28, 28, 27];
    const precip = [2, 2, 10, 50, 180, 240, 270, 250, 230, 120, 20, 4];
    expect(koppenZone(temp, precip, 1)).toBe('Aw');
  });

  it('classifies hot desert (BWh)', () => {
    const temp = [14, 16, 20, 25, 30, 33, 35, 35, 32, 27, 20, 15];
    const precip = [3, 2, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3];
    expect(koppenZone(temp, precip, 1)).toBe('BWh');
  });

  it('classifies cold steppe (BSk)', () => {
    const temp = [-2, 0, 6, 12, 18, 23, 26, 25, 19, 12, 4, -1];
    const precip = [10, 12, 20, 30, 40, 35, 25, 22, 25, 22, 14, 10];
    expect(koppenZone(temp, precip, 1)).toBe('BSk');
  });

  it('classifies Mediterranean (Csa) — dry hot summer, mild wet winter', () => {
    const temp = [6, 8, 11, 13, 18, 23, 26, 26, 21, 15, 10, 7];
    const precip = [50, 45, 35, 45, 40, 20, 8, 9, 25, 60, 65, 55];
    expect(koppenZone(temp, precip, 1)).toBe('Csa');
  });

  it('classifies oceanic (Cfb) — mild, no dry season, warm summer', () => {
    const temp = [5, 5, 7, 9, 13, 16, 18, 18, 15, 11, 8, 6];
    const precip = [55, 40, 42, 44, 50, 53, 45, 50, 50, 60, 60, 55];
    expect(koppenZone(temp, precip, 1)).toBe('Cfb');
  });

  it('classifies humid continental (Dfb)', () => {
    const temp = [-6, -5, 0, 7, 13, 17, 19, 18, 13, 7, 1, -4];
    const precip = [40, 35, 38, 40, 55, 70, 80, 70, 60, 50, 50, 45];
    expect(koppenZone(temp, precip, 1)).toBe('Dfb');
  });

  it('classifies tundra (ET) — warmest month between 0 and 10 °C', () => {
    const temp = [-20, -21, -18, -11, -2, 4, 7, 6, 2, -6, -13, -18];
    const precip = [10, 8, 9, 10, 12, 18, 25, 30, 25, 18, 12, 10];
    expect(koppenZone(temp, precip, 1)).toBe('ET');
  });

  it('flips seasons for the southern hemisphere', () => {
    // Mediterranean with hot dry January (austral summer)
    const temp = [26, 26, 21, 15, 10, 7, 6, 8, 11, 13, 18, 23];
    const precip = [8, 9, 25, 60, 65, 55, 50, 45, 35, 45, 40, 20];
    expect(koppenZone(temp, precip, -1)).toBe('Csa');
  });

  it('rejects inputs that are not 12 months long', () => {
    expect(koppenZone([20, 21], [50, 60], 1)).toBeNull();
  });
});

describe('aggregateMonthly', () => {
  it('averages temperature and monthly precipitation totals across years', () => {
    const dates: string[] = [];
    const temps: number[] = [];
    const precs: number[] = [];
    for (const year of [2024, 2025]) {
      for (let month = 1; month <= 12; month++) {
        for (const day of [5, 15, 25]) {
          dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
          temps.push(month); // mean temp = month number
          precs.push(2); // 3 days × 2 mm = 6 mm/month sampled per year
        }
      }
    }
    const result = aggregateMonthly(dates, temps, precs);
    expect(result).not.toBeNull();
    expect(result!.tempC[0]).toBeCloseTo(1);
    expect(result!.tempC[11]).toBeCloseTo(12);
    expect(result!.precipMm[5]).toBeCloseTo(6);
  });

  it('returns null when a month has no data', () => {
    const dates = ['2025-01-10', '2025-02-10'];
    expect(aggregateMonthly(dates, [5, 6], [10, 10])).toBeNull();
  });

  it('ignores null readings and returns null if a month is all nulls', () => {
    const dates: string[] = [];
    const temps: (number | null)[] = [];
    const precs: (number | null)[] = [];
    for (let month = 1; month <= 12; month++) {
      dates.push(`2025-${String(month).padStart(2, '0')}-10`);
      temps.push(month === 6 ? null : 10);
      precs.push(5);
    }
    expect(aggregateMonthly(dates, temps, precs)).toBeNull();
  });
});
