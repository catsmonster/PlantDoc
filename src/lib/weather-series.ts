import { useEffect, useState } from 'react';
import { forApi, type Coords } from './geo';
import { fetchWeatherSeries, type WeatherSeries } from './openmeteo';
import { hasMoistureAnchor } from './moisture-anchor';
import type { WeatherState } from './moisture-read';
import type { Plant } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** [startIso, endIso] for the 60-day dry-down window ending on `now`'s UTC date. */
export function seriesWindow(now: number): { startIso: string; endIso: string } {
  return { startIso: iso(now - WINDOW_DAYS * DAY_MS), endIso: iso(now) };
}

function isOutdoor(plant: Plant): boolean {
  return plant.placement_type === 'outdoor' || plant.placement_type === 'balcony';
}

function plantCoords(plant: Plant): Coords | null {
  const loc = plant.location_id;
  if (loc && typeof loc === 'object' && Array.isArray((loc as { location?: unknown }).location)) {
    const arr = (loc as { location: number[] }).location;
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') return { lat: arr[1], lon: arr[0] };
  }
  return null;
}

/** Cache/fetch key for an outdoor plant (rounded coords + window); null when N/A. */
export function plantWeatherKey(plant: Plant, now: number): string | null {
  if (!isOutdoor(plant)) return null;
  if (!hasMoistureAnchor(plant)) return null;
  const coords = plantCoords(plant);
  if (!coords) return null;
  const { lat, lon } = forApi(coords);
  const { startIso, endIso } = seriesWindow(now);
  return `${lat},${lon}|${startIso}|${endIso}`;
}

export function distinctWeatherKeys(plants: Plant[], now: number): string[] {
  const keys = new Set<string>();
  for (const plant of plants) {
    const key = plantWeatherKey(plant, now);
    if (key) keys.add(key);
  }
  return [...keys];
}

type CacheEntry = { status: 'loading' } | { status: 'ready'; series: WeatherSeries } | { status: 'unavailable' };

const cache = new Map<string, CacheEntry>();

/**
 * Resolves each plant's WeatherState from a shared (coords, window) cache.
 * Indoor/greenhouse plants return undefined because they need no weather series.
 */
export function useWeatherSeries(plants: Plant[], now: number): (plant: Plant) => WeatherState | undefined {
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    for (const key of distinctWeatherKeys(plants, now)) {
      if (cache.has(key)) continue;
      cache.set(key, { status: 'loading' });
      const [coordsPart, startIso, endIso] = key.split('|');
      const [lat, lon] = coordsPart.split(',').map(Number);
      fetchWeatherSeries({ lat, lon }, startIso, endIso)
        .then((series) => {
          cache.set(key, series ? { status: 'ready', series } : { status: 'unavailable' });
        })
        .catch(() => cache.set(key, { status: 'unavailable' }))
        .finally(() => {
          if (!cancelled) force((n) => n + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [plants, now]);

  return (plant: Plant): WeatherState | undefined => {
    const key = plantWeatherKey(plant, now);
    if (!key) return undefined;
    return cache.get(key) ?? { status: 'loading' };
  };
}
