import { sparklineGeometry, type SparklinePoint } from '../lib/sparkline';

interface SparklineProps {
  series: SparklinePoint[];
  /** Describes the trend for screen readers, e.g. "Height trend". */
  ariaLabel: string;
  width?: number;
  height?: number;
  stroke?: string;
}

/**
 * A tiny inline trend line — no dependency, just an SVG <polyline>. Renders
 * nothing when there are fewer than two data points, so callers can map over
 * metrics without guarding each one.
 */
export function Sparkline({
  series,
  ariaLabel,
  width = 96,
  height = 32,
  stroke = 'currentColor',
}: SparklineProps) {
  const geo = sparklineGeometry(series, { width, height, padding: 3 });
  if (!geo) return null;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <polyline
        points={geo.points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={geo.last.x} cy={geo.last.y} r={2.4} fill={stroke} />
    </svg>
  );
}
