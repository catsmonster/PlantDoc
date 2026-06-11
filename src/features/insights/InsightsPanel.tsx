import { useMemo, useState } from 'react';
import { plantInsights, type Insight, type InsightSeverity } from '../../lib/insights';
import { setInsightFeedback } from '../../lib/repo';
import type { InsightFeedback, Plant, Units } from '../../lib/types';

const severityStyles: Record<InsightSeverity, string> = {
  warning: 'border-clay-300 bg-clay-100',
  suggestion: 'border-leaf-100 bg-leaf-50',
  info: 'border-slate-200 bg-white',
};

function FeedbackButtons({
  insight,
  verdict,
  onFeedback,
}: {
  insight: Insight;
  verdict: InsightFeedback | undefined;
  onFeedback: (insight: Insight, helpful: boolean) => void;
}) {
  const base = 'rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-slate-100';
  const active = 'bg-slate-200';
  return (
    <span className="shrink-0 space-x-1" aria-label="Was this insight helpful?">
      <button
        type="button"
        title="Helpful"
        className={`${base} ${verdict?.helpful === true ? active : ''}`}
        onClick={() => onFeedback(insight, true)}
      >
        👍
      </button>
      <button
        type="button"
        title="Not helpful"
        className={`${base} ${verdict?.helpful === false ? active : ''}`}
        onClick={() => onFeedback(insight, false)}
      >
        👎
      </button>
    </span>
  );
}

export function InsightsPanel({
  plant,
  userId,
  units,
}: {
  plant: Plant;
  userId: string;
  units: Units;
}) {
  const insights = useMemo(() => plantInsights(plant, new Date(), units), [plant, units]);
  const [verdicts, setVerdicts] = useState<Map<string, InsightFeedback>>(
    () => new Map((plant.insight_feedback ?? []).map((f) => [f.insight_kind, f])),
  );

  if (insights.length === 0) return null;

  const handleFeedback = (insight: Insight, helpful: boolean) => {
    const existing = verdicts.get(insight.kind) ?? null;
    if (existing?.helpful === helpful) return;
    setInsightFeedback(userId, plant.$id, insight.kind, helpful, existing)
      .then((saved) => {
        setVerdicts((prev) => new Map(prev).set(insight.kind, saved));
      })
      .catch((e: unknown) => {
        console.warn('insight feedback failed', e);
      });
  };

  return (
    <section className="rounded-xl border border-leaf-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Care insights</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
          Experimental
        </span>
      </div>
      <ul className="space-y-2">
        {insights.map((insight) => (
          <li
            key={insight.kind}
            className={`rounded-lg border p-2.5 ${severityStyles[insight.severity]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{insight.title}</p>
              <FeedbackButtons
                insight={insight}
                verdict={verdicts.get(insight.kind)}
                onFeedback={handleFeedback}
              />
            </div>
            <p className="mt-0.5 text-sm leading-snug text-slate-600">{insight.detail}</p>
            <p className="mt-1 text-xs text-slate-400">
              Based on {insight.evidenceCount} {insight.evidenceCount === 1 ? 'entry' : 'entries'}{' '}
              — computed from your logs, not a prediction.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
