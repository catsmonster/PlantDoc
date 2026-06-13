/**
 * Pure geometry for the inline trend sparklines on the plant detail screen.
 * Turns a value-over-time series into SVG polyline coordinates inside a box.
 *
 * Side-effect-free and framework-free so it is unit-tested directly; the SVG
 * markup lives in ui/Sparkline. SVG's y axis grows downward, so the largest
 * value maps to the smallest y (top of the box).
 */

export interface SparklinePoint {
  /** Epoch milliseconds — the x axis. */
  t: number;
  value: number;
}

export interface SparklineGeometry {
  /** `"x,y x,y ..."` for an SVG <polyline points> attribute. */
  points: string;
  /** Coordinates of the final point, for an end-of-line marker. */
  last: { x: number; y: number };
  min: number;
  max: number;
}

export interface SparklineBox {
  width: number;
  height: number;
  /** Inset on every side so the stroke and end dot are not clipped. */
  padding?: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Geometry for a sparkline, or null when there is nothing to draw (< 2 points). */
export function sparklineGeometry(
  series: SparklinePoint[],
  box: SparklineBox,
): SparklineGeometry | null {
  const n = series.length;
  if (n < 2) return null;

  const padding = box.padding ?? 0;
  const left = padding;
  const right = box.width - padding;
  const top = padding;
  const bottom = box.height - padding;

  const times = series.map((p) => p.t);
  const values = series.map((p) => p.value);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT;
  const spanV = maxV - minV;

  const coords = series.map((p, i) => {
    const x = spanT === 0 ? left + (right - left) * (i / (n - 1)) : left + (right - left) * ((p.t - minT) / spanT);
    const y = spanV === 0 ? (top + bottom) / 2 : bottom - (bottom - top) * ((p.value - minV) / spanV);
    return { x: round(x), y: round(y) };
  });

  return {
    points: coords.map((c) => `${c.x},${c.y}`).join(' '),
    last: coords[coords.length - 1],
    min: minV,
    max: maxV,
  };
}
