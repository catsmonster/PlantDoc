import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  clearLogDraft,
  isDefaultLogDraft,
  loadLogDraft,
  logDraftKey,
  saveLogDraft,
  type LogDraft,
} from '../../lib/drafts';
import { enrichObservationWeather } from '../../lib/enrich';
import { errorMessage } from '../../lib/error';
import { createLog } from '../../lib/repo';
import type { Profile, TreatmentType, UserLocation } from '../../lib/types';
import { Button } from '../../ui/Button';
import { CheckboxField, ErrorText, Segmented, SelectField, TextField } from '../../ui/Field';

type Mode = 'water' | 'care' | 'measure' | 'note';

const careTypes: { value: TreatmentType; label: string }[] = [
  { value: 'fertilizing', label: 'Fertilizing' },
  { value: 'repotting', label: 'Repotting' },
  { value: 'pruning', label: 'Pruning' },
  { value: 'misting', label: 'Misting' },
  { value: 'pest_control', label: 'Pest control' },
  { value: 'cleaning', label: 'Leaf cleaning' },
  { value: 'relocation', label: 'Relocation' },
];

const waterMethods = ['top water', 'bottom water', 'soak'];

/** Local datetime-local value for "now" (minute precision). */
function nowLocal(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function LogSheet({
  userId,
  plantId,
  profile,
  location,
  onClose,
  onLogged,
}: {
  userId: string;
  plantId: string;
  profile: Profile;
  location?: UserLocation | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const imperial = profile.preferred_units === 'imperial';
  const draftKey = logDraftKey(userId, plantId);
  // Unsaved input from a failed save, dismiss, or reload (src/lib/drafts.ts).
  const draft = useMemo(() => loadLogDraft(localStorage, draftKey), [draftKey]);
  const [mode, setMode] = useState<Mode>(draft?.mode ?? 'water');
  const [observedAt, setObservedAt] = useState(nowLocal());
  const [contribute, setContribute] = useState(
    draft?.contribute ?? profile.public_contribution_default,
  );
  const [note, setNote] = useState(draft?.note ?? '');
  // Watering fast path: 250 ml preset.
  const [amount, setAmount] = useState(draft?.amount ?? '250');
  const [method, setMethod] = useState(draft?.method ?? waterMethods[0]);
  const [careType, setCareType] = useState<TreatmentType>(
    (draft?.careType as TreatmentType) ?? 'fertilizing',
  );
  const [productName, setProductName] = useState(draft?.productName ?? '');
  const [height, setHeight] = useState(draft?.height ?? '');
  const [leafCount, setLeafCount] = useState(draft?.leafCount ?? '');
  const [soilMoisture, setSoilMoisture] = useState(draft?.soilMoisture ?? '');
  const [healthScore, setHealthScore] = useState(draft?.healthScore ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restored = draft !== null;

  useEffect(() => {
    const current: LogDraft = {
      v: 1,
      mode,
      amount,
      method,
      careType,
      productName,
      height,
      leafCount,
      soilMoisture,
      healthScore,
      note,
      contribute,
    };
    if (isDefaultLogDraft(current, profile.public_contribution_default)) {
      clearLogDraft(localStorage, draftKey);
    } else {
      saveLogDraft(localStorage, draftKey, current);
    }
  }, [
    mode,
    amount,
    method,
    careType,
    productName,
    height,
    leafCount,
    soilMoisture,
    healthScore,
    note,
    contribute,
    draftKey,
    profile.public_contribution_default,
  ]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const observedAtIso = new Date(observedAt).toISOString();
      const base = {
        userId,
        plantId,
        observedAt: observedAtIso,
        contribute,
        note: note || undefined,
      };
      let observation;
      if (mode === 'water') {
        observation = await createLog({
          ...base,
          treatment: {
            treatment_type: 'watering',
            amount_value: amount ? Number(amount) : undefined,
            amount_unit: amount ? 'ml' : undefined,
            method,
          },
        });
      } else if (mode === 'care') {
        observation = await createLog({
          ...base,
          treatment: {
            treatment_type: careType,
            product_name: productName.trim() || undefined,
          },
        });
      } else if (mode === 'measure') {
        const heightCm = height ? (imperial ? Number(height) * 2.54 : Number(height)) : undefined;
        observation = await createLog({
          ...base,
          measurement: {
            height_cm: heightCm,
            leaf_count: leafCount ? Number(leafCount) : undefined,
            soil_moisture_percent: soilMoisture ? Number(soilMoisture) : undefined,
            health_score: healthScore ? Number(healthScore) : undefined,
          },
        });
      } else {
        observation = await createLog(base);
      }
      // The entry is saved; weather context is best-effort on top of it.
      try {
        await enrichObservationWeather({
          userId,
          plantId,
          observationId: observation.$id,
          observedAt: observedAtIso,
          location,
        });
      } catch (enrichError) {
        console.warn('weather enrichment failed', enrichError);
      }
      clearLogDraft(localStorage, draftKey);
      onLogged();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-slate-900/40" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-lg"
      >
        <div className="mx-auto max-w-md space-y-4">
          <div className="mx-auto h-1 w-10 rounded-full bg-leaf-100" />
          <h2 className="text-lg font-semibold text-slate-800">Log care</h2>
          {restored && (
            <p className="rounded-lg bg-leaf-50 px-3 py-2 text-xs text-leaf-700">
              Draft restored from your last unsaved entry.
            </p>
          )}
          <Segmented
            label="What happened?"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'water', label: '💧 Water' },
              { value: 'care', label: '🌿 Care' },
              { value: 'measure', label: '📏 Measure' },
              { value: 'note', label: '📝 Note' },
            ]}
          />
          {mode === 'water' && (
            <>
              <TextField
                label="Amount (ml)"
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <SelectField
                label="Method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {waterMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </SelectField>
            </>
          )}
          {mode === 'care' && (
            <>
              <SelectField
                label="Care type"
                value={careType}
                onChange={(e) => setCareType(e.target.value as TreatmentType)}
              >
                {careTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Product (optional)"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. balanced 10-10-10"
                maxLength={128}
              />
            </>
          )}
          {mode === 'measure' && (
            <>
              <TextField
                label={imperial ? 'Height (in)' : 'Height (cm)'}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Leaf count"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={leafCount}
                  onChange={(e) => setLeafCount(e.target.value)}
                />
                <TextField
                  label="Soil moisture %"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={soilMoisture}
                  onChange={(e) => setSoilMoisture(e.target.value)}
                />
              </div>
              <SelectField
                label="Health score"
                value={healthScore}
                onChange={(e) => setHealthScore(e.target.value)}
              >
                <option value="">—</option>
                <option value="5">5 · Thriving</option>
                <option value="4">4 · Healthy</option>
                <option value="3">3 · Okay</option>
                <option value="2">2 · Struggling</option>
                <option value="1">1 · Critical</option>
              </SelectField>
            </>
          )}
          <TextField
            label={mode === 'note' ? 'Note *' : 'Note (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering"
            required={mode === 'note'}
          />
          <TextField
            label="When"
            type="datetime-local"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
            required
          />
          <CheckboxField
            label="Contribute to open dataset"
            hint="Anonymized care/outcome data only, released as open data (CC BY 4.0, draft) — never notes, photos, or location details."
            checked={contribute}
            onChange={(e) => setContribute(e.target.checked)}
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">
              {busy ? 'Saving…' : 'Save entry'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
