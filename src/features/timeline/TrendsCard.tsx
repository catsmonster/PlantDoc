import { measurementSeries, trendMetrics } from '../../lib/trends';
import { formatHeight, type Units } from '../../lib/units';
import type { Plant } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { Sparkline } from '../../ui/Sparkline';

/**
 * Inline growth & health trends for the plant detail screen. Charts only the
 * measurement metrics the user has logged at least twice, and renders nothing
 * otherwise — these are deterministic readings of the user's own entries, not
 * predictions (docs/AGENTS.md principle 4: scientific humility).
 */
export function TrendsCard({
  plant,
  units,
  isDark,
}: {
  plant: Plant;
  units: Units;
  isDark: boolean;
}) {
  const observations = plant.observations ?? [];
  const rows = trendMetrics((cm) => formatHeight(cm, units))
    .map((metric) => ({ metric, series: measurementSeries(observations, metric.pick) }))
    .filter((row) => row.series.length >= 2);

  if (rows.length === 0) return null;

  const accent = isDark ? '#C7F24A' : '#3C7140';
  const border = isDark ? '1px solid rgba(255,255,255,.09)' : '1px solid #E7E0D2';
  const background = isDark ? '#111912' : '#FFFDF8';
  const text = isDark ? '#F2F6EF' : '#23302A';
  const muted = isDark ? '#9BAA98' : '#6B7568';

  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: isDark ? 14 : 18,
        border,
        background,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name="arrowUp" size={16} stroke={2.2} style={{ color: accent }} />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: text }}>Growth &amp; health</span>
      </div>

      {rows.map(({ metric, series }) => {
        const latest = series[series.length - 1].value;
        return (
          <div
            key={metric.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '10px 0',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: muted, letterSpacing: '.02em' }}>{metric.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: text, lineHeight: 1.1 }}>
                {metric.format(latest)}
              </div>
            </div>
            <Sparkline
              series={series}
              ariaLabel={`${metric.label} trend`}
              stroke={accent}
              width={120}
              height={34}
            />
          </div>
        );
      })}

      <p style={{ margin: '6px 0 0', fontSize: 10, color: muted, letterSpacing: '.06em' }}>
        FROM YOUR LOGGED MEASUREMENTS · COMPUTED
      </p>
    </div>
  );
}
