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
import { createLog, updatePlant, type PlantInput } from '../../lib/repo';
import type { Profile, SubstrateType, TreatmentType, UserLocation } from '../../lib/types';
import {
  normalizeWaterAmountText,
  parseWaterAmountMl,
  WATER_AMOUNT_MAX_ML,
  WATER_AMOUNT_MIN_ML,
  WATER_AMOUNT_STEP_ML,
  waterAmountSliderValue,
} from '../../lib/water-amount';
import { ErrorText } from '../../ui/Field';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';

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

function buildRepotPlantUpdate(
  repotDiameter: string,
  repotHeight: string,
  repotSubstrate: SubstrateType | '',
): Partial<PlantInput> {
  const potUpdate: Partial<PlantInput> = {};
  if (repotDiameter.trim() && Number.isFinite(Number(repotDiameter))) {
    potUpdate.pot_diameter_cm = Number(repotDiameter);
  }
  if (repotHeight.trim() && Number.isFinite(Number(repotHeight))) {
    potUpdate.pot_height_cm = Number(repotHeight);
  }
  if (repotSubstrate) potUpdate.substrate_type = repotSubstrate;
  return potUpdate;
}

function nowLocal(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function WaterAmountField({
  amount,
  setAmount,
  busy,
  tone,
}: {
  amount: string;
  setAmount: (value: string) => void;
  busy: boolean;
  tone: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const labelStyle = dark
    ? { display: 'block', marginBottom: 8 }
    : { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 };
  const hintColor = dark ? '#67766A' : '#6B7568';
  const unitColor = dark ? '#9BAA98' : '#6B7568';

  return (
    <label style={{ display: 'block' }}>
      <span className={dark ? 'b-kicker' : undefined} style={labelStyle}>
        Amount
      </span>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            aria-label="Water amount in milliliters"
            className={dark ? 'b-input' : 'a-input'}
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            onBlur={() => setAmount(normalizeWaterAmountText(amount))}
            type="number"
            inputMode="decimal"
            min={WATER_AMOUNT_MIN_ML}
            max={WATER_AMOUNT_MAX_ML}
            step="any"
            placeholder="250"
            disabled={busy}
            style={{ paddingRight: 52 }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 15,
              top: '50%',
              transform: 'translateY(-50%)',
              color: unitColor,
              fontSize: 13,
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            ml
          </span>
        </div>
        <input
          aria-label="Water amount slider"
          type="range"
          value={waterAmountSliderValue(amount)}
          min={WATER_AMOUNT_MIN_ML}
          max={WATER_AMOUNT_MAX_ML}
          step={WATER_AMOUNT_STEP_ML}
          onChange={(e) => setAmount(e.currentTarget.value)}
          disabled={busy}
          style={{ width: '100%', accentColor: dark ? '#C7F24A' : '#3C7140' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: hintColor,
            fontSize: 11.5,
            fontWeight: dark ? 700 : 600,
          }}
        >
          <span>{WATER_AMOUNT_MIN_ML} ml</span>
          <span>{WATER_AMOUNT_MAX_ML} ml</span>
        </div>
      </div>
    </label>
  );
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
  const { theme } = useTheme();
  const imperial = profile.preferred_units === 'imperial';
  const draftKey = logDraftKey(userId, plantId);
  const draft = useMemo(() => loadLogDraft(localStorage, draftKey), [draftKey]);
  const [mode, setMode] = useState<Mode>(draft?.mode ?? 'water');
  const [observedAt, setObservedAt] = useState(nowLocal());
  const [contribute, setContribute] = useState(
    draft?.contribute ?? profile.public_contribution_default,
  );
  const [note, setNote] = useState(draft?.note ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [method, setMethod] = useState(draft?.method ?? waterMethods[0]);
  const [careType, setCareType] = useState<TreatmentType>(
    (draft?.careType as TreatmentType) ?? 'fertilizing',
  );
  const [productName, setProductName] = useState(draft?.productName ?? '');
  const [repotDiameter, setRepotDiameter] = useState('');
  const [repotHeight, setRepotHeight] = useState('');
  const [repotSubstrate, setRepotSubstrate] = useState<SubstrateType | ''>('');
  const [height, setHeight] = useState(draft?.height ?? '');
  const [leafCount, setLeafCount] = useState(draft?.leafCount ?? '');
  const [soilMoisture, setSoilMoisture] = useState(draft?.soilMoisture ?? '');
  const [healthScore, setHealthScore] = useState(draft?.healthScore ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restored = draft !== null;

  const isDark = theme === 'dark';

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
        const parsedAmount = parseWaterAmountMl(amount);
        observation = await createLog({
          ...base,
          treatment: {
            treatment_type: 'watering',
            amount_value: parsedAmount ?? null,
            amount_unit: parsedAmount === undefined ? undefined : 'ml',
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
        if (careType === 'repotting') {
          const potUpdate = buildRepotPlantUpdate(repotDiameter, repotHeight, repotSubstrate);
          if (Object.keys(potUpdate).length > 0) await updatePlant(plantId, potUpdate);
        }
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

  if (isDark) {
    // Direction B — Atlas (Dark Mode Log Sheet)
    return (
      <div className="b-root b-sheet-wrap">
        <div className="b-backdrop" onClick={onClose}></div>
        <form onSubmit={handleSubmit} className="b-sheet" onClick={(e) => e.stopPropagation()}>
          {/* Sheet Handle */}
          <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
            <span style={{ width: 42, height: 5, borderRadius: 99, background: 'rgba(255,255,255,.2)' }}></span>
          </div>

          <div style={{ overflowY: 'auto', padding: '8px 22px 28px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={{ margin: '8px 0 2px', fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: '#F2F6EF' }}>Log care</h2>
              <span className="mono" style={{ fontSize: 11.5, color: '#67766A', letterSpacing: '.06em' }}>LOG ENTRY</span>
            </div>

            {restored && (
              <p className="mono" style={{ margin: '8px 0', fontSize: 11, color: '#C7F24A', letterSpacing: '.04em' }}>
                DRAFT RESTORED FROM LAST UNSAVED ENTRY
              </p>
            )}

            {/* Mode Select Segments */}
            <div className="b-seg" style={{ marginTop: 16 }}>
              {(
                [
                  { key: 'water', label: 'Water', icon: 'droplet' },
                  { key: 'care', label: 'Care', icon: 'leaf' },
                  { key: 'measure', label: 'Measure', icon: 'ruler' },
                  { key: 'note', label: 'Note', icon: 'note' },
                ] as const
              ).map((m) => (
                <button key={m.key} type="button" className={'b-segbtn' + (mode === m.key ? ' on' : '')} onClick={() => setMode(m.key)} disabled={busy}>
                  <Icon name={m.icon} size={20} stroke={2} /> {m.label}
                </button>
              ))}
            </div>

            {/* Inputs Block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
              {mode === 'water' && (
                <>
                  <WaterAmountField amount={amount} setAmount={setAmount} busy={busy} tone="dark" />
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Method</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {waterMethods.map((v) => (
                        <button key={v} type="button" className="b-tap" onClick={() => setMethod(v)} disabled={busy} style={{ flex: 1, padding: '11px 0', borderRadius: 13, border: '1px solid ' + (method === v ? '#C7F24A' : 'rgba(255,255,255,.09)'), background: method === v ? 'rgba(199,242,74,.12)' : '#19231B', color: method === v ? '#C7F24A' : '#9BAA98', fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 11, letterSpacing: '.04em', cursor: 'pointer', textTransform: 'uppercase' }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </label>
                </>
              )}

              {mode === 'care' && (
                <>
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Care type</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {careTypes.map((t) => (
                        <button key={t.value} type="button" className="b-tap" onClick={() => setCareType(t.value)} disabled={busy} style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid ' + (careType === t.value ? '#C7F24A' : 'rgba(255,255,255,.09)'), background: careType === t.value ? 'rgba(199,242,74,.12)' : '#19231B', color: careType === t.value ? '#C7F24A' : '#9BAA98', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Product (optional)</span>
                    <input className="b-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. balanced 10-10-10" disabled={busy} maxLength={128} />
                  </label>
                  {careType === 'repotting' && (
                    <>
                      <label style={{ display: 'block' }}>
                        <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>New pot size (optional)</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <input className="b-input" type="number" inputMode="decimal" min={1} max={200} value={repotDiameter} onChange={(e) => setRepotDiameter(e.target.value)} placeholder="Width 12 cm" disabled={busy} aria-label="New pot diameter in centimetres" />
                          <input className="b-input" type="number" inputMode="decimal" min={1} max={200} value={repotHeight} onChange={(e) => setRepotHeight(e.target.value)} placeholder="Height 10 cm" disabled={busy} aria-label="New pot height in centimetres" />
                        </div>
                      </label>
                      <label style={{ display: 'block' }}>
                        <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>New substrate (optional)</span>
                        <select className="b-input" value={repotSubstrate} onChange={(e) => setRepotSubstrate(e.target.value as SubstrateType | '')} disabled={busy}>
                          <option value="">— Unchanged —</option>
                          <option value="standard">Standard potting mix</option>
                          <option value="succulent_gritty">Succulent / cactus (gritty)</option>
                          <option value="chunky_aroid">Chunky aroid mix</option>
                          <option value="peat_seedling">Peat / seedling mix</option>
                        </select>
                      </label>
                    </>
                  )}
                </>
              )}

              {mode === 'measure' && (
                <>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ flex: 1, display: 'block' }}>
                      <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>{imperial ? 'Height (in)' : 'Height (cm)'}</span>
                      <input className="b-input" value={height} onChange={(e) => setHeight(e.target.value)} type="number" inputMode="decimal" min={0} step="0.1" disabled={busy} />
                    </label>
                    <label style={{ flex: 1, display: 'block' }}>
                      <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Leaf count</span>
                      <input className="b-input" value={leafCount} onChange={(e) => setLeafCount(e.target.value)} type="number" inputMode="numeric" min={0} disabled={busy} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ flex: 1, display: 'block' }}>
                      <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Soil moisture %</span>
                      <input className="b-input" value={soilMoisture} onChange={(e) => setSoilMoisture(e.target.value)} type="number" inputMode="numeric" min={0} max={100} disabled={busy} />
                    </label>
                    <label style={{ flex: 1, display: 'block' }}>
                      <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Health score</span>
                      <select className="b-input" value={healthScore} onChange={(e) => setHealthScore(e.target.value)} disabled={busy}>
                        <option value="">—</option>
                        <option value="5">5 · Thriving</option>
                        <option value="4">4 · Healthy</option>
                        <option value="3">3 · Okay</option>
                        <option value="2">2 · Struggling</option>
                        <option value="1">1 · Critical</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {/* Note field */}
              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>{mode === 'note' ? 'Note *' : 'Note (optional)'}</span>
                <textarea className="b-input" rows={mode === 'note' ? 4 : 2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" required={mode === 'note'} style={{ resize: 'none' }} disabled={busy} />
              </label>

              {/* Date observed field */}
              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>When</span>
                <input className="b-input" type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} required disabled={busy} />
              </label>

              {/* Contribution open data checkbox */}
              <button
                type="button"
                onClick={() => setContribute(!contribute)}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  background: '#19231B',
                  border: '1px solid rgba(255,255,255,.09)',
                  borderRadius: 15,
                  padding: 14,
                  cursor: 'pointer',
                  fontFamily: "'Space Grotesk',sans-serif",
                  color: '#F2F6EF',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    flexShrink: 0,
                    marginTop: 1,
                    background: contribute ? '#C7F24A' : 'transparent',
                    border: '1px solid ' + (contribute ? '#C7F24A' : 'rgba(255,255,255,.09)'),
                    color: '#0E140F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all .2s',
                  }}
                >
                  {contribute && <Icon name="check" size={16} stroke={3} />}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Contribute to open dataset</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9BAA98', lineHeight: 1.45, marginTop: 2 }}>
                    Anonymized care data only — never notes, photos, or location.
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Action Row */}
          {error && (
            <div style={{ padding: '0 22px 10px' }}>
              <ErrorText>{error}</ErrorText>
            </div>
          )}
          <div style={{ padding: '14px 22px calc(22px + env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,.09)', display: 'flex', gap: 10, background: '#141C16' }}>
            <button type="button" className="b-tap" onClick={onClose} disabled={busy} style={{ width: 96, borderRadius: 14, border: '1px solid rgba(255,255,255,.09)', background: 'transparent', color: '#9BAA98', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" className="b-tap" disabled={busy} style={{ flex: 1, borderRadius: 14, border: 'none', background: '#C7F24A', color: '#0E140F', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {busy ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Log Sheet)
  return (
    <div className="a-root a-sheet-wrap">
      <div className="a-backdrop" onClick={onClose}></div>
      <form onSubmit={handleSubmit} className="a-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Sheet Handle */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 42, height: 5, borderRadius: 99, background: '#E7E0D2' }}></span>
        </div>

        <div style={{ overflowY: 'auto', padding: '6px 22px 30px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 className="serif" style={{ margin: '6px 0 2px', fontSize: 24, fontWeight: 600, color: '#23302A', whiteSpace: 'nowrap' }}>Log care</h2>
            <span style={{ fontSize: 13, color: '#9AA294', fontWeight: 600 }}>LOG ENTRY</span>
          </div>

          {restored && (
            <p style={{ margin: '8px 0', fontSize: 12, color: '#3C7140', fontWeight: 600 }}>
              Draft restored from your last unsaved entry.
            </p>
          )}

          {/* Mode Selector */}
          <div className="a-seg" style={{ marginTop: 14 }}>
            {(
              [
                { key: 'water', label: 'Water', icon: 'droplet' },
                { key: 'care', label: 'Care', icon: 'leaf' },
                { key: 'measure', label: 'Measure', icon: 'ruler' },
                { key: 'note', label: 'Note', icon: 'note' },
              ] as const
            ).map((m) => (
              <button key={m.key} type="button" className={'a-segbtn' + (mode === m.key ? ' on' : '')} onClick={() => setMode(m.key)} disabled={busy}>
                <Icon name={m.icon} size={20} stroke={2} /> {m.label}
              </button>
            ))}
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            {mode === 'water' && (
              <>
                <WaterAmountField amount={amount} setAmount={setAmount} busy={busy} tone="light" />
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Method</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {waterMethods.map((v) => (
                      <button key={v} type="button" className="a-tap" onClick={() => setMethod(v)} disabled={busy} style={{ flex: 1, padding: '11px 0', borderRadius: 14, border: '1px solid ' + (method === v ? '#3C7140' : '#E7E0D2'), background: method === v ? '#EBF1E7' : '#fff', color: method === v ? '#3C7140' : '#6B7568', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textTransform: 'capitalize' }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </label>
              </>
            )}

            {mode === 'care' && (
              <>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Care type</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {careTypes.map((t) => (
                      <button key={t.value} type="button" className={'a-pillopt a-tap' + (careType === t.value ? ' on' : '')} onClick={() => setCareType(t.value)} disabled={busy}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Product (optional)</span>
                  <input className="a-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. balanced 10-10-10" disabled={busy} maxLength={128} />
                </label>
                {careType === 'repotting' && (
                  <>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>New pot size (optional)</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input className="a-input" type="number" inputMode="decimal" min={1} max={200} value={repotDiameter} onChange={(e) => setRepotDiameter(e.target.value)} placeholder="Width 12 cm" disabled={busy} aria-label="New pot diameter in centimetres" />
                        <input className="a-input" type="number" inputMode="decimal" min={1} max={200} value={repotHeight} onChange={(e) => setRepotHeight(e.target.value)} placeholder="Height 10 cm" disabled={busy} aria-label="New pot height in centimetres" />
                      </div>
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>New substrate (optional)</span>
                      <select className="a-input" value={repotSubstrate} onChange={(e) => setRepotSubstrate(e.target.value as SubstrateType | '')} disabled={busy}>
                        <option value="">— Unchanged —</option>
                        <option value="standard">Standard potting mix</option>
                        <option value="succulent_gritty">Succulent / cactus (gritty)</option>
                        <option value="chunky_aroid">Chunky aroid mix</option>
                        <option value="peat_seedling">Peat / seedling mix</option>
                      </select>
                    </label>
                  </>
                )}
              </>
            )}

            {mode === 'measure' && (
              <>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ flex: 1, display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>{imperial ? 'Height (in)' : 'Height (cm)'}</span>
                    <input className="a-input" value={height} onChange={(e) => setHeight(e.target.value)} type="number" inputMode="decimal" min={0} step="0.1" disabled={busy} />
                  </label>
                  <label style={{ flex: 1, display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Leaf count</span>
                    <input className="a-input" value={leafCount} onChange={(e) => setLeafCount(e.target.value)} type="number" inputMode="numeric" min={0} disabled={busy} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ flex: 1, display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Soil moisture %</span>
                    <input className="a-input" value={soilMoisture} onChange={(e) => setSoilMoisture(e.target.value)} type="number" inputMode="numeric" min={0} max={100} disabled={busy} />
                  </label>
                  <label style={{ flex: 1, display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Health score</span>
                    <select className="a-input" value={healthScore} onChange={(e) => setHealthScore(e.target.value)} disabled={busy}>
                      <option value="">—</option>
                      <option value="5">5 · Thriving</option>
                      <option value="4">4 · Healthy</option>
                      <option value="3">3 · Okay</option>
                      <option value="2">2 · Struggling</option>
                      <option value="1">1 · Critical</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            {/* Note Input */}
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>{mode === 'note' ? 'Note *' : 'Note (optional)'}</span>
              <textarea className="a-input" rows={mode === 'note' ? 4 : 2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" required={mode === 'note'} style={{ resize: 'none' }} disabled={busy} />
            </label>

            {/* Date Input */}
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>When</span>
              <input className="a-input" type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} required disabled={busy} />
            </label>

            {/* Dataset Contribution Row */}
            <button
              type="button"
              onClick={() => setContribute(!contribute)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                textAlign: 'left',
                background: '#EBF1E7',
                border: '1px solid #E7E0D2',
                borderRadius: 16,
                padding: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: '#23302A',
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  flexShrink: 0,
                  marginTop: 1,
                  background: contribute ? '#3C7140' : '#fff',
                  border: '1px solid ' + (contribute ? '#3C7140' : '#E7E0D2'),
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all .2s',
                }}
              >
                {contribute && <Icon name="check" size={16} stroke={3} />}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Contribute to open dataset</span>
                <span style={{ display: 'block', fontSize: 12, color: '#6B7568', lineHeight: 1.45, marginTop: 2 }}>
                  Anonymized care data only — never notes, photos, or location.
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Submit Actions */}
        {error && (
          <div style={{ padding: '0 22px 10px' }}>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <div style={{ padding: '14px 22px calc(22px + env(safe-area-inset-bottom))', borderTop: '1px solid #E7E0D2', display: 'flex', gap: 10, background: '#FFFDF8' }}>
          <button type="button" className="a-tap" onClick={onClose} disabled={busy} style={{ width: 100, borderRadius: 16, border: '1px solid #E7E0D2', background: '#fff', color: '#6B7568', padding: '15px 0', fontFamily: 'inherit', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" className="a-tap" disabled={busy} style={{ flex: 1, borderRadius: 16, border: 'none', background: '#3C7140', color: '#fff', padding: '15px 0', fontFamily: 'inherit', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {busy ? 'Saving...' : 'Save entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
