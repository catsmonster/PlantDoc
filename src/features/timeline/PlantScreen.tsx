import { useEffect, useState, useRef } from 'react';
import { errorMessage } from '../../lib/error';
import { createLog, createMoistureFeedback, getCareProfile, getPlantWithTimeline, photoUrl, setInsightFeedback, uploadPhoto, type MoistureFeedbackInput } from '../../lib/repo';
import type { LogInput } from '../../lib/log';
import type { Observation, Plant, Profile, TreatmentType, Units, InsightFeedback, SoilState, EstimateFeedback } from '../../lib/types';
import { moistureForPlant } from '../../lib/moisture-read';
import { moistureInsight, type WateringStatus } from '../../lib/moisture';
import { formatHeight, formatTemperature, formatVolume } from '../../lib/units';
import { Spinner } from '../../ui/Spinner';
import { useTheme } from '../theme/ThemeContext';
import { Icon, healthLabel, type IconName } from '../../ui/Icon';
import { LogSheet } from './LogSheet';
import { plantInsights } from '../../lib/insights';
import { careProfileForPlant, type SpeciesCareProfile } from '../../lib/knowledge/care-profiles';
import { CareProfilePanel } from '../knowledge/CareProfilePanel';
import { TrendsCard } from './TrendsCard';
import { ErrorText } from '../../ui/Field';
import {
  AI_PREVIEW_DAILY_LIMIT,
  AI_PREVIEW_IMAGE_MAX_BYTES,
  AI_PREVIEW_WARNING,
  buildPlantGeminiPreviewPayload,
  canUseAiPreview,
  readAiPreviewResponseBody,
  recordAiPreviewUse,
  type GeminiPreviewImage,
} from '../../lib/gemini-preview';



const treatmentLabels: Record<TreatmentType, string> = {
  watering: 'Watered',
  fertilizing: 'Fertilized',
  repotting: 'Repotted',
  pruning: 'Pruned',
  misting: 'Misted',
  pest_control: 'Pest control',
  cleaning: 'Cleaned leaves',
  relocation: 'Moved',
};

const soilStateLabels: Record<SoilState, string> = {
  dry: 'Dry',
  moist: 'Moist',
  wet: 'Wet',
};

// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for focused tests.
export function buildSoilCheckLogInput({
  userId,
  plantId,
  soilState,
  contribute,
  observedAt,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  observedAt: string;
}): LogInput {
  return {
    userId,
    plantId,
    observedAt,
    contribute,
    measurement: { soil_state: soilState },
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Submit helper exported for focused tests.
export async function submitSoilCheck({
  userId,
  plantId,
  soilState,
  contribute,
  now = () => new Date(),
  createLog: createLogFn = createLog,
  refresh,
}: {
  userId: string;
  plantId: string;
  soilState: SoilState;
  contribute: boolean;
  now?: () => Date;
  createLog?: (input: LogInput) => Promise<Observation>;
  refresh: () => void;
}): Promise<void> {
  await createLogFn(
    buildSoilCheckLogInput({
      userId,
      plantId,
      soilState,
      contribute,
      observedAt: now().toISOString(),
    }),
  );
  refresh();
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for focused tests.
export function buildMoistureFeedbackInput({
  plantId,
  estimateFeedback,
  magnitude,
  predictedMoisturePercent,
  observedAt,
}: {
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  observedAt: string;
}): MoistureFeedbackInput {
  return {
    plantId,
    observedAt,
    estimate_feedback: estimateFeedback,
    magnitude: estimateFeedback === 'correct' ? null : magnitude,
    predicted_moisture_percent: predictedMoisturePercent,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Submit helper exported for focused tests.
export async function submitMoistureFeedback({
  userId,
  plantId,
  estimateFeedback,
  magnitude,
  predictedMoisturePercent,
  now = () => new Date(),
  createMoistureFeedback: createMoistureFeedbackFn = createMoistureFeedback,
  refresh,
}: {
  userId: string;
  plantId: string;
  estimateFeedback: EstimateFeedback;
  magnitude: number | null;
  predictedMoisturePercent: number;
  now?: () => Date;
  createMoistureFeedback?: (userId: string, input: MoistureFeedbackInput) => Promise<unknown>;
  refresh: () => void;
}): Promise<void> {
  await createMoistureFeedbackFn(
    userId,
    buildMoistureFeedbackInput({
      plantId,
      estimateFeedback,
      magnitude,
      predictedMoisturePercent,
      observedAt: now().toISOString(),
    }),
  );
  refresh();
}

function getIconName(obs: Observation): IconName {
  if (obs.observation_type === 'treatment') {
    const tType = obs.treatments?.[0]?.treatment_type;
    const map: Record<string, IconName> = {
      watering: 'droplet',
      fertilizing: 'leaf',
      repotting: 'pot',
      pruning: 'scissors',
      misting: 'mist',
      pest_control: 'sparkle',
      cleaning: 'leaf',
      relocation: 'pin',
    };
    return map[tType ?? ''] || 'leaf';
  }
  const map: Record<string, IconName> = {
    measurement: 'ruler',
    photo: 'camera',
    note: 'note',
    environment: 'thermometer',
    health_check: 'heart',
  };
  return map[obs.observation_type] || 'note';
}

// eslint-disable-next-line react-refresh/only-export-components -- Timeline detail helper exported for focused tests.
export function detailLine(obs: Observation, units: Units): string | null {
  if (obs.observation_type === 'treatment') {
    const t = obs.treatments?.[0];
    if (!t) return 'Care';
    const parts = [treatmentLabels[t.treatment_type]];
    if (t.amount_value != null) {
      parts.push(
        t.amount_unit === 'ml'
          ? formatVolume(t.amount_value, units)
          : `${t.amount_value} ${t.amount_unit ?? ''}`.trim(),
      );
    }
    if (t.method) parts.push(t.method);
    if (t.product_name) parts.push(t.product_name);
    return parts.join(' · ');
  }
  if (obs.observation_type === 'measurement') {
    const m = obs.measurements?.[0];
    if (!m) return 'Measured';
    const parts: string[] = [];
    if (m.height_cm != null) parts.push(formatHeight(m.height_cm, units));
    if (m.leaf_count != null) parts.push(`${m.leaf_count} leaves`);
    if (m.soil_moisture_percent != null) parts.push(`soil ${m.soil_moisture_percent}%`);
    if (m.soil_state) parts.push(`soil ${m.soil_state}`);
    if (m.health_score != null) parts.push(`health ${m.health_score}/5`);
    return parts.length ? parts.join(' · ') : 'Measured';
  }
  if (obs.observation_type === 'photo') return 'Photo';
  if (obs.observation_type === 'note') return null;
  return obs.observation_type.replace('_', ' ');
}

function environmentLine(obs: Observation, units: Units): string | null {
  const snapshot = obs.environment_snapshots?.[0];
  if (!snapshot) return null;
  const parts: string[] = [];
  if (snapshot.outdoor_temperature_c != null) {
    parts.push(formatTemperature(snapshot.outdoor_temperature_c, units));
  }
  if (snapshot.relative_humidity_percent != null) {
    parts.push(`${Math.round(snapshot.relative_humidity_percent)}% RH`);
  }
  if (snapshot.weather_summary) parts.push(snapshot.weather_summary);
  return parts.length ? parts.join(' · ') : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function moistureStatusColor(status: WateringStatus, isDark: boolean): string {
  const dark: Record<WateringStatus, string> = {
    comfortable: '#C7F24A',
    drying: '#E0C56B',
    water_now: '#E0A36B',
    overwatered: '#7FC8E0',
  };
  const light: Record<WateringStatus, string> = {
    comfortable: '#3C7140',
    drying: '#A88A3C',
    water_now: '#B07F57',
    overwatered: '#3F7E91',
  };
  return (isDark ? dark : light)[status];
}

function getPlantTint(plantId: string): [string, string] {
  const tints: [string, string][] = [
    ['#3c7140', '#9cc49a'],
    ['#5a8f3c', '#cfe0a0'],
    ['#2f6f5e', '#a7d4c4'],
    ['#3f6b3a', '#b6c98a'],
    ['#2f5934', '#9cc49a'],
    ['#3c7140', '#c7b78f'],
  ];
  let hash = 0;
  for (let i = 0; i < plantId.length; i++) {
    hash = plantId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % tints.length;
  return tints[index];
}

interface PhotoButtonProps {
  userId: string;
  plantId: string;
  profile: Profile;
  onUploaded: () => void;
  onError: (msg: string) => void;
  isDark: boolean;
}

function PhotoButton({ userId, plantId, profile, onUploaded, onError, isDark }: PhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      await uploadPhoto(
        {
          userId,
          plantId,
          observedAt: new Date().toISOString(),
          contribute: profile.public_contribution_default,
        },
        file,
      );
      onUploaded();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={isDark ? 'b-tap' : 'a-tap'}
        style={{
          width: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDark ? '#19231B' : '#FFFDF8',
          color: isDark ? '#F2F6EF' : '#3C7140',
          border: isDark ? '1px solid rgba(255,255,255,.09)' : '1px solid #E7E0D2',
          borderRadius: isDark ? 15 : 16,
          cursor: 'pointer',
        }}
      >
        <Icon name="camera" size={21} stroke={2} />
      </button>
    </>
  );
}

function SoilCheckAction({
  isDark,
  open,
  busy,
  onToggle,
  onSubmit,
}: {
  isDark: boolean;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSubmit: (soilState: SoilState) => void;
}) {
  const states: SoilState[] = ['dry', 'moist', 'wet'];
  const border = isDark ? '1px solid rgba(255,255,255,.09)' : '1px solid #E7E0D2';
  const background = isDark ? '#19231B' : '#FFFDF8';
  const color = isDark ? '#F2F6EF' : '#3C7140';
  const activeBackground = isDark ? '#243024' : '#EBF1E7';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: open ? 1.25 : '0 0 auto', minWidth: open ? 180 : 0 }}>
      <button
        type="button"
        className={isDark ? 'b-tap' : 'a-tap'}
        disabled={busy}
        aria-expanded={open}
        aria-controls={`soil-check-${isDark ? 'dark' : 'light'}`}
        onClick={onToggle}
        style={{
          minHeight: 52,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background,
          color,
          border,
          borderRadius: isDark ? 15 : 16,
          padding: '0 13px',
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name="ruler" size={17} stroke={2.2} />
        Check soil
      </button>
      {open && (
        <div
          id={`soil-check-${isDark ? 'dark' : 'light'}`}
          role="group"
          aria-label="Choose soil state"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}
        >
          {states.map((state) => (
            <button
              key={state}
              type="button"
              className={isDark ? 'b-tap' : 'a-tap'}
              disabled={busy}
              onClick={() => onSubmit(state)}
              style={{
                minHeight: 40,
                border,
                borderRadius: 12,
                background: activeBackground,
                color,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {soilStateLabels[state]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const estimateFeedbackLabels: Record<EstimateFeedback, string> = {
  wetter: 'Wetter',
  correct: 'Spot-on',
  drier: 'Drier',
};

function MoistureFeedbackPrompt({
  isDark,
  predictedMoisturePercent,
  busy,
  onSubmit,
}: {
  isDark: boolean;
  predictedMoisturePercent: number;
  busy: boolean;
  onSubmit: (estimateFeedback: EstimateFeedback, magnitude: number | null) => void;
}) {
  const [selected, setSelected] = useState<'wetter' | 'drier' | null>(null);
  const border = isDark ? '1px solid rgba(255,255,255,.09)' : '1px solid #E7E0D2';
  const background = isDark ? '#111912' : '#FFFDF8';
  const muted = isDark ? '#9BAA98' : '#6B7568';
  const text = isDark ? '#F2F6EF' : '#23302A';
  const accent = isDark ? '#C7F24A' : '#3C7140';
  const activeBackground = isDark ? '#243024' : '#EBF1E7';

  const choices: EstimateFeedback[] = ['wetter', 'correct', 'drier'];

  const handleChoice = (choice: EstimateFeedback) => {
    if (choice === 'correct') {
      onSubmit('correct', null);
      return;
    }
    setSelected(choice);
  };

  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: isDark ? 14 : 16, border, background }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: text }}>Checked the soil?</p>
      <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.35, color: muted }}>
        We estimated ~{Math.round(predictedMoisturePercent)}% — how was it?
      </p>
      <div
        role="group"
        aria-label="How did our estimate compare?"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 10 }}
      >
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className={isDark ? 'b-tap' : 'a-tap'}
            disabled={busy}
            onClick={() => handleChoice(choice)}
            style={{
              minHeight: 40,
              border,
              borderRadius: 12,
              background: selected === choice ? activeBackground : background,
              color: text,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {estimateFeedbackLabels[choice]}
          </button>
        ))}
      </div>
      {selected && (
        <div
          role="group"
          aria-label="How far off?"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginTop: 8 }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={isDark ? 'b-tap' : 'a-tap'}
              disabled={busy}
              onClick={() => {
                onSubmit(selected, n);
                setSelected(null);
              }}
              style={{
                minHeight: 36,
                border,
                borderRadius: 10,
                background: activeBackground,
                color: accent,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface AiPreviewState {
  loading: boolean;
  text: string | null;
  error: string | null;
  imageIncluded: boolean;
  imageSkipped: string | null;
  remaining: number | null;
}

const initialAiPreview: AiPreviewState = {
  loading: false,
  text: null,
  error: null,
  imageIncluded: false,
  imageSkipped: null,
  remaining: null,
};

function bytesToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function canSendImageType(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

async function shrinkPreviewImage(blob: Blob): Promise<Blob | null> {
  if (blob.size <= AI_PREVIEW_IMAGE_MAX_BYTES && canSendImageType(blob.type)) return blob;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not load latest photo for AI preview.'));
      element.src = objectUrl;
    });
    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.72, 0.58, 0.45]) {
      const candidate = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (candidate && candidate.size <= AI_PREVIEW_IMAGE_MAX_BYTES) return candidate;
    }
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readGeminiPreviewImage(url: string): Promise<{
  image?: GeminiPreviewImage;
  skipped?: string;
}> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return { skipped: 'Latest photo could not be attached.' };
    const sourceBlob = await response.blob();
    if (!sourceBlob.type.startsWith('image/')) return { skipped: 'Latest file is not an image.' };
    const previewBlob = await shrinkPreviewImage(sourceBlob);
    if (!previewBlob) {
      const kb = Math.round(AI_PREVIEW_IMAGE_MAX_BYTES / 1000);
      return { skipped: `Latest photo was skipped to keep the preview under ${kb} KB.` };
    }
    return {
      image: {
        mimeType: previewBlob.type || 'image/jpeg',
        base64: await bytesToBase64(previewBlob),
        byteLength: previewBlob.size,
      },
    };
  } catch {
    return { skipped: 'Latest photo could not be attached.' };
  }
}

function AiPreviewBlock({
  isDark,
  state,
  onGenerate,
}: {
  isDark: boolean;
  state: AiPreviewState;
  onGenerate: () => void;
}) {
  const border = isDark ? '1px solid rgba(255,255,255,.09)' : '1px solid #E7E0D2';
  const background = isDark ? '#111912' : '#FFFDF8';
  const muted = isDark ? '#9BAA98' : '#6B7568';
  const text = isDark ? '#F2F6EF' : '#23302A';
  const accent = isDark ? '#C7F24A' : '#3C7140';
  const buttonDisabled = state.loading || state.remaining === 0;

  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: isDark ? 14 : 16, border, background }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: text }}>Gemini AI preview</p>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.35, color: muted }}>
            {AI_PREVIEW_WARNING}
          </p>
        </div>
        <button
          type="button"
          className={isDark ? 'b-tap' : 'a-tap'}
          disabled={buttonDisabled}
          onClick={onGenerate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            border: 'none',
            borderRadius: 12,
            padding: '9px 11px',
            background: buttonDisabled ? (isDark ? '#243024' : '#DDE5D7') : accent,
            color: isDark ? '#0E140F' : '#fff',
            cursor: buttonDisabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="sparkle" size={14} stroke={2.2} />
          {state.loading ? 'Checking' : 'Generate'}
        </button>
      </div>
      {state.text && (
        <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, color: text }}>
          {state.text}
        </p>
      )}
      {state.error && (
        <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.4, color: isDark ? '#E0A36B' : '#B07F57' }}>
          {state.error}
        </p>
      )}
      {(state.imageIncluded || state.imageSkipped || state.remaining != null) && (
        <p className="mono" style={{ margin: '9px 0 0', fontSize: 10, letterSpacing: '.05em', color: muted }}>
          {state.imageIncluded ? 'LATEST PHOTO INCLUDED' : state.imageSkipped ? state.imageSkipped.toUpperCase() : 'TEXT ONLY'}
          {state.remaining != null ? ` · ${state.remaining}/${AI_PREVIEW_DAILY_LIMIT} PREVIEWS LEFT TODAY` : ''}
        </p>
      )}
    </div>
  );
}

export function PlantScreen({
  plantId,
  userId,
  profile,
  onEdit,
  onBack,
}: {
  plantId: string;
  userId: string;
  profile: Profile;
  onEdit: (plant: Plant) => void;
  onBack: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [tableProfile, setTableProfile] = useState<{
    speciesId: string;
    profile: SpeciesCareProfile | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [soilCheckOpen, setSoilCheckOpen] = useState(false);
  const [soilCheckBusy, setSoilCheckBusy] = useState(false);
  const [moistureFeedbackBusy, setMoistureFeedbackBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [verdicts, setVerdicts] = useState<Map<string, InsightFeedback>>(new Map());
  const [aiPreview, setAiPreview] = useState<AiPreviewState>(initialAiPreview);

  const isDark = theme === 'dark';
  const [now, setNow] = useState(() => Date.now());
  const nowDate = new Date(now);

  // Refresh 'now' every hour so "X days ago" stays accurate while mounted
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPlantWithTimeline(plantId)
      .then((row) => {
        if (!cancelled) {
          setPlant(row);
          setVerdicts(new Map((row.insight_feedback ?? []).map((f) => [f.insight_kind, f])));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [plantId, reloadKey]);

  // Sourced reference facts (roadmap Phase 4A, slice 1): fetch the table-backed
  // care profile for a canonical species. The displayed profile is derived at
  // render (table-or-bundled), so the bundled editorial fallback shows instantly
  // and a free-text species needs no fetch.
  const speciesRowId =
    plant?.species_id && typeof plant.species_id === 'object'
      ? (plant.species_id as { $id?: string }).$id
      : typeof plant?.species_id === 'string'
        ? plant.species_id
        : undefined;
  useEffect(() => {
    if (!speciesRowId) return;
    let cancelled = false;
    getCareProfile(speciesRowId).then((profile) => {
      if (!cancelled) setTableProfile({ speciesId: speciesRowId, profile });
    });
    return () => {
      cancelled = true;
    };
  }, [speciesRowId]);

  const refresh = () => {
    setLogOpen(false);
    setSoilCheckOpen(false);
    setReloadKey((k) => k + 1);
  };

  const handleSoilCheck = async (soilState: SoilState) => {
    if (!plant || soilCheckBusy) return;
    setSoilCheckBusy(true);
    try {
      await submitSoilCheck({
        userId,
        plantId: plant.$id,
        soilState,
        contribute: profile.public_contribution_default,
        refresh,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSoilCheckBusy(false);
    }
  };

  const handleMoistureFeedback = async (estimateFeedback: EstimateFeedback, magnitude: number | null) => {
    if (!plant || !moisture || moistureFeedbackBusy) return;
    setMoistureFeedbackBusy(true);
    try {
      await submitMoistureFeedback({
        userId,
        plantId: plant.$id,
        estimateFeedback,
        magnitude,
        predictedMoisturePercent: Math.round(moisture.moisturePercent),
        refresh,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMoistureFeedbackBusy(false);
    }
  };

  const handleFeedback = (kind: string, helpful: boolean) => {
    if (!plant) return;
    const existing = verdicts.get(kind) ?? null;
    if (existing?.helpful === helpful) return;
    setInsightFeedback(userId, plant.$id, kind, helpful, existing)
      .then((saved) => {
        setVerdicts((prev) => new Map(prev).set(kind, saved));
      })
      .catch((e: unknown) => {
        console.warn('insight feedback failed', e);
      });
  };

  if (error) {
    return (
      <div className={isDark ? 'b-root bg-[#0E140F] min-h-dvh p-6 text-[#F2F6EF]' : 'a-root bg-[#F4EFE4] min-h-dvh p-6 text-[#23302A]'}>
        <div className="space-y-3 py-6">
          <ErrorText>{error}</ErrorText>
          <button
            onClick={onBack}
            className={isDark ? 'b-tap bg-[#C7F24A] text-[#0E140F] px-4 py-2 rounded-lg font-bold' : 'a-tap bg-[#3C7140] text-white px-4 py-2 rounded-lg font-bold'}
          >
            ← Back to plants
          </button>
        </div>
      </div>
    );
  }

  if (!plant) return <Spinner label="Loading timeline…" />;

  const observations = plant.observations ?? [];
  const speciesLine = plant.common_name ?? plant.species_id?.scientific_name ?? plant.species_text ?? '';

  // Get dynamic stats
  const measurements = observations.flatMap(o => o.measurements ?? []);
  const latestHeight = measurements.find(m => m.height_cm != null)?.height_cm ?? null;
  const latestLeaves = measurements.find(m => m.leaf_count != null)?.leaf_count ?? null;

  const waterings = observations.filter(
    o => o.observation_type === 'treatment' && o.treatments?.some(t => t.treatment_type === 'watering')
  );
  const latestWateredDate = waterings[0]?.observed_at;
  const lastWateredDays = latestWateredDate
    ? Math.round((now - Date.parse(latestWateredDate)) / (24 * 60 * 60 * 1000))
    : null;

  const wateringTimes = waterings.map(o => Date.parse(o.observed_at)).reverse();
  const cadenceDays = wateringTimes.length >= 3
    ? Math.round(median(wateringTimes.slice(1).map((t, i) => (t - wateringTimes[i]) / (24 * 60 * 60 * 1000))))
    : null;

  // Curated plant tint
  const tint = getPlantTint(plant.$id);

  // Compute insights
  const insights = plantInsights(plant, nowDate, profile.preferred_units);

  // Sourced reference facts: table-backed for this species once loaded, else the
  // bundled editorial fallback (also covers free-text species).
  const tableMatch =
    tableProfile && tableProfile.speciesId === speciesRowId ? tableProfile.profile : null;
  const careProfile = tableMatch ?? careProfileForPlant(plant);
  const moisture = moistureForPlant(plant, careProfile, plant.moisture_feedback ?? [], now);
  const moistureSpeciesName =
    careProfile?.scientificName ?? plant.species_id?.scientific_name ?? plant.common_name ?? null;
  const moistureIns = moisture
    ? moistureInsight(
        { moisturePercent: moisture.moisturePercent, confidence: moisture.confidence },
        moisture.recommendation,
        moistureSpeciesName,
        moisture.band,
      )
    : null;

  // Group timeline observations by day
  const groupedTimeline: [string, Observation[]][] = [];
  const dayGroups = new Map<string, Observation[]>();
  for (const obs of observations) {
    const day = new Date(obs.observed_at).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const list = dayGroups.get(day);
    if (list) list.push(obs);
    else dayGroups.set(day, [obs]);
  }
  for (const [day, list] of dayGroups.entries()) {
    groupedTimeline.push([day, list]);
  }

  // Hero photo URL
  const latestPhotoObs = observations.find((obs) => obs.photos && obs.photos.length > 0);
  const heroPhotoUrl = latestPhotoObs ? photoUrl(latestPhotoObs.photos![0].private_file_id) : null;

  const handleAiPreview = async () => {
    const quota = canUseAiPreview(localStorage, userId, plant.$id);
    if (!quota.allowed) {
      setAiPreview((prev) => ({
        ...prev,
        loading: false,
        error: 'AI preview limit reached for this plant today.',
        remaining: 0,
      }));
      return;
    }

    setAiPreview((prev) => ({ ...prev, loading: true, error: null }));
    const imageResult = heroPhotoUrl ? await readGeminiPreviewImage(heroPhotoUrl) : {};
    const payload = buildPlantGeminiPreviewPayload(
      plant,
      profile.preferred_units,
      imageResult.image,
    );
    recordAiPreviewUse(localStorage, userId, plant.$id);
    const afterRecord = canUseAiPreview(localStorage, userId, plant.$id);

    try {
      const response = await fetch('/api/gemini-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await readAiPreviewResponseBody(response);
      if (!response.ok || !body.text) {
        throw new Error(body.error ?? 'AI preview is unavailable right now.');
      }
      setAiPreview({
        loading: false,
        text: body.text,
        error: null,
        imageIncluded: Boolean(imageResult.image),
        imageSkipped: imageResult.skipped ?? null,
        remaining: afterRecord.remaining,
      });
    } catch (e) {
      setAiPreview({
        loading: false,
        text: null,
        error: errorMessage(e),
        imageIncluded: Boolean(imageResult.image),
        imageSkipped: imageResult.skipped ?? null,
        remaining: afterRecord.remaining,
      });
    }
  };

  const heroBg = isDark
    ? `linear-gradient(160deg, ${tint[0]}, ${tint[1]}), radial-gradient(120% 80% at 75% 15%, rgba(255,255,255,.18), transparent 55%)`
    : `linear-gradient(150deg, ${tint[0]}22, ${tint[1]}3a 70%), radial-gradient(120% 90% at 78% 12%, ${tint[1]}33, transparent 60%)`;

  if (isDark) {
    // Direction B — Atlas (Dark Mode Detail)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <div className="b-scroll">
          {/* Hero Image */}
          <div style={{ position: 'relative', height: 380, background: heroBg }}>
            {heroPhotoUrl && (
              <img
                src={heroPhotoUrl}
                alt={plant.nickname}
                style={{ width: '100%', height: 380, objectFit: 'cover', display: 'block' }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0E140F 2%, rgba(14,20,15,.2) 45%, rgba(14,20,15,.35))', pointerEvents: 'none' }}></div>
            
            {/* Back Button */}
            <button type="button" aria-label="Back to plants" className="b-tap" onClick={onBack} style={{ position: 'absolute', top: 58, left: 18, width: 42, height: 42, borderRadius: 99, background: 'rgba(14,20,15,.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F2F6EF', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={22} stroke={2.4} />
            </button>

            {/* Edit Button & Theme Toggle */}
            <div style={{ position: 'absolute', top: 58, right: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="b-tap" onClick={() => onEdit(plant)} aria-label="Edit plant" style={{ width: 42, height: 42, borderRadius: 99, background: 'rgba(14,20,15,.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F2F6EF', cursor: 'pointer' }}>
                <Icon name="pencil" size={18} stroke={2} />
              </button>
              <button className="b-tap" onClick={toggleTheme} aria-label="Switch to light mode"
                style={{ width: 42, height: 42, borderRadius: 99, cursor: 'pointer',
                  background: 'rgba(14,20,15,.55)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,.09)', color: '#F2F6EF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sun" size={19} stroke={1.9} />
              </button>
            </div>

            {/* Plant Meta Details */}
            <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18 }}>
              <span className="b-kicker" style={{ color: 'rgba(255,255,255,.7)' }}>
                {plant.placement_label || plant.placement_type}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <h1 style={{ margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 0.92, color: '#fff' }}>
                  {plant.nickname}
                </h1>
                <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 7, background: '#C7F24A', color: '#0E140F', backdropFilter: 'blur(6px)' }}>
                  {healthLabel(measurements.find(m => m.health_score != null)?.health_score ?? 4)}
                </span>
              </div>
              <p className="mono" style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,.78)' }}>
                {speciesLine}
              </p>
            </div>
          </div>

          {/* Details Scroll Area Content */}
          <div style={{ padding: '22px 22px 130px' }}>
            {/* Stats list */}
            <div style={{ display: 'flex', gap: 10, paddingBottom: 22, borderBottom: '1px solid rgba(255,255,255,.09)' }}>
              {/* Height */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
                    {latestHeight != null ? formatHeight(latestHeight, profile.preferred_units) : '--'}
                  </span>
                </div>
                <p className="b-kicker" style={{ margin: '5px 0 0', fontSize: 10 }}>Height</p>
              </div>

              {/* Leaves */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
                    {latestLeaves != null ? latestLeaves : '--'}
                  </span>
                </div>
                <p className="b-kicker" style={{ margin: '5px 0 0', fontSize: 10 }}>Leaves</p>
              </div>

              {/* Watered Days */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
                    {lastWateredDays != null ? lastWateredDays : '--'}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: '#67766A' }}>d</span>
                </div>
                <p className="b-kicker" style={{ margin: '5px 0 0', fontSize: 10 }}>Watered</p>
              </div>

              {/* Cadence */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
                    {cadenceDays != null ? `~${cadenceDays}` : '--'}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: '#67766A' }}>d</span>
                </div>
                <p className="b-kicker" style={{ margin: '5px 0 0', fontSize: 10 }}>Cadence</p>
              </div>

              {moisture && (
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: moistureStatusColor(moisture.recommendation.status, true) }}>
                      {Math.round(moisture.moisturePercent)}
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: '#67766A' }}>%</span>
                  </div>
                  <p className="b-kicker" style={{ margin: '5px 0 0', fontSize: 10 }}>Moisture</p>
                </div>
              )}
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="b-tap" onClick={() => setLogOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: '#C7F24A', color: '#0E140F', border: 'none', borderRadius: 15, padding: '15px 0', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 700 }}>
                <Icon name="droplet" size={19} stroke={2.4} /> Log care
              </button>
              <SoilCheckAction
                isDark
                open={soilCheckOpen}
                busy={soilCheckBusy}
                onToggle={() => setSoilCheckOpen((open) => !open)}
                onSubmit={(soilState) => void handleSoilCheck(soilState)}
              />
              <PhotoButton userId={userId} plantId={plant.$id} profile={profile} onUploaded={refresh} onError={setError} isDark />
            </div>

            {/* Species care guide — sourced reference facts */}
            {careProfile && (
              <CareProfilePanel profile={careProfile} units={profile.preferred_units} isDark />
            )}

            {/* Growth & health trends — charted from the user's own measurements */}
            <TrendsCard plant={plant} units={profile.preferred_units} isDark />

            {/* Care Insights */}
            {observations.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span className="b-kicker">Care insights</span>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.09)' }}></span>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', color: '#0E140F', background: '#E0A36B', padding: '3px 7px', borderRadius: 5 }}>EXPERIMENTAL</span>
                </div>
                {moistureIns && moisture && (
                  <div className="b-rise" style={{ borderLeft: '2px solid ' + (moistureIns.severity === 'warning' ? '#E0A36B' : '#C7F24A'), paddingLeft: 14, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="droplet" size={15} stroke={2.2} style={{ color: moistureIns.severity === 'warning' ? '#E0A36B' : '#C7F24A' }} />
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F2F6EF' }}>{moistureIns.title}</p>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: '#9BAA98' }}>{moistureIns.detail}</p>
                    <p className="mono" style={{ margin: '6px 0 0', fontSize: 10, color: '#67766A', letterSpacing: '.06em' }}>
                      ESTIMATED · {moisture.confidence.toUpperCase()} CONFIDENCE
                    </p>
                    <MoistureFeedbackPrompt
                      isDark
                      predictedMoisturePercent={moisture.moisturePercent}
                      busy={moistureFeedbackBusy}
                      onSubmit={(f, m) => void handleMoistureFeedback(f, m)}
                    />
                  </div>
                )}
                {insights.map((ins, i) => {
                  const warn = ins.severity === 'warning';
                  const verdict = verdicts.get(ins.kind);
                  return (
                    <div key={ins.kind} className="b-rise" style={{ animationDelay: 100 + i * 90 + 'ms', borderLeft: '2px solid ' + (warn ? '#E0A36B' : '#C7F24A'), paddingLeft: 14, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name={warn ? 'sun' : ins.kind.includes('growth') ? 'arrowUp' : 'droplet'} size={15} stroke={2.2} style={{ color: warn ? '#E0A36B' : '#C7F24A' }} />
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F2F6EF' }}>{ins.title}</p>
                        </div>
                        {/* Feedback 👍/👎 */}
                        <span className="shrink-0 space-x-1 mono ml-auto" style={{ fontSize: 12 }}>
                          <button
                            type="button"
                            className={`rounded px-1.5 py-0.5 transition-colors hover:bg-white/10 ${verdict?.helpful === true ? 'bg-white/20 text-[#C7F24A]' : 'text-white/40'}`}
                            onClick={() => handleFeedback(ins.kind, true)}
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            className={`rounded px-1.5 py-0.5 transition-colors hover:bg-white/10 ${verdict?.helpful === false ? 'bg-white/20 text-[#E0A36B]' : 'text-white/40'}`}
                            onClick={() => handleFeedback(ins.kind, false)}
                          >
                            👎
                          </button>
                        </span>
                      </div>
                      <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: '#9BAA98' }}>{ins.detail}</p>
                      <p className="mono" style={{ margin: '6px 0 0', fontSize: 10, color: '#67766A', letterSpacing: '.06em' }}>
                        FROM {ins.evidenceCount} {ins.evidenceCount === 1 ? 'ENTRY' : 'ENTRIES'} · COMPUTED
                      </p>
                    </div>
                  );
                })}
                <AiPreviewBlock isDark state={aiPreview} onGenerate={() => void handleAiPreview()} />
              </div>
            )}

            {/* Timeline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 18px' }}>
              <span className="b-kicker">Timeline</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.09)' }}></span>
            </div>

            {groupedTimeline.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#67766A', padding: '24px 0' }}>No entries yet.</p>
            ) : (
              <div>
                {groupedTimeline.map(([day, entries]) => (
                  <div key={day}>
                    <p className="mono" style={{ margin: '12px 0 14px', fontSize: 11, letterSpacing: '.12em', color: '#67766A', paddingLeft: 66 }}>
                      {day.toUpperCase()}
                    </p>
                    <div className="space-y-1">
                      {entries.map((obs, idx) => {
                        const icon = getIconName(obs);
                        const detail = detailLine(obs, profile.preferred_units);
                        const env = environmentLine(obs, profile.preferred_units);
                        const time = new Date(obs.observed_at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const isLast = idx === entries.length - 1;

                        return (
                          <div key={obs.$id} className="b-rise" style={{ display: 'flex', gap: 14 }}>
                            {/* Time column */}
                            <div style={{ width: 52, flexShrink: 0, textAlign: 'right', paddingTop: 9 }}>
                              <span className="mono" style={{ fontSize: 11.5, color: '#9BAA98' }}>{time}</span>
                            </div>
                            
                            {/* Icon & connecting vertical line */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                              <span style={{ width: 34, height: 34, borderRadius: 10, background: '#19231B', border: '1px solid rgba(255,255,255,.09)', color: '#C7F24A', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                                <Icon name={icon} size={17} stroke={2} />
                              </span>
                              {!isLast && <span style={{ flex: 1, width: 1.5, background: 'rgba(255,255,255,.09)', margin: '4px 0' }}></span>}
                            </div>

                            {/* Entry Content details */}
                            <div style={{ flex: 1, paddingBottom: 18, minWidth: 0 }}>
                              <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700, color: '#F2F6EF' }}>
                                {detail ?? 'Note'}
                              </p>
                              {obs.notes_private && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: '#9BAA98', lineHeight: 1.5 }}>“{obs.notes_private}”</p>}
                              {env && (
                                <p className="mono" style={{ margin: '7px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#67766A', letterSpacing: '.04em' }}>
                                  🌤️ {env.toUpperCase()}
                                </p>
                              )}
                              {obs.photos?.[0] && (
                                <div style={{ marginTop: 10, width: 120 }}>
                                  <img
                                    src={photoUrl(obs.photos[0].private_file_id)}
                                    alt="Observation"
                                    style={{ width: '100%', height: '120px', borderRadius: '12px', objectFit: 'cover' }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Log sheet care dialog */}
        {logOpen && (
          <LogSheet
            userId={userId}
            plantId={plant.$id}
            profile={profile}
            location={typeof plant.location_id === 'object' ? plant.location_id : null}
            onClose={() => setLogOpen(false)}
            onLogged={refresh}
          />
        )}
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Detail)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <div className="a-scroll">
        {/* Hero Image */}
        <div style={{ position: 'relative', height: 300, background: heroBg }}>
          {heroPhotoUrl && (
            <img
              src={heroPhotoUrl}
              alt={plant.nickname}
              style={{ width: '100%', height: 300, objectFit: 'cover', display: 'block' }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,28,22,.62), rgba(20,28,22,.05) 55%)', pointerEvents: 'none' }}></div>
          
          {/* Back button */}
          <button type="button" aria-label="Back to plants" className="a-tap" onClick={onBack} style={{ position: 'absolute', top: 56, left: 18, width: 42, height: 42, borderRadius: 99, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#23302A', cursor: 'pointer' }}>
            <Icon name="chevronLeft" size={22} stroke={2.4} />
          </button>

          {/* Edit & Theme Toggle Buttons */}
          <div style={{ position: 'absolute', top: 56, right: 18, display: 'flex', gap: 8 }}>
            <button className="a-tap" onClick={() => onEdit(plant)} aria-label="Edit plant" style={{ width: 42, height: 42, borderRadius: 99, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#23302A', cursor: 'pointer' }}>
              <Icon name="pencil" size={18} stroke={2} />
            </button>
            <button
              type="button"
              className="a-tap"
              onClick={toggleTheme}
              aria-label="Switch to dark mode"
              style={{
                width: 42,
                height: 42,
                borderRadius: 99,
                cursor: 'pointer',
                background: 'rgba(255,255,255,.85)',
                backdropFilter: 'blur(8px)',
                border: 'none',
                color: '#23302A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="moon" size={18} stroke={2} />
            </button>
          </div>

          {/* Nicnkname Header Overlay */}
          <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18, color: '#fff' }}>
            <h1 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', textShadow: '0 2px 14px rgba(0,0,0,.3)' }}>
              {plant.nickname}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 15, fontStyle: 'italic', fontFamily: "'Spectral',serif", opacity: 0.92 }}>
              {speciesLine}
            </p>
          </div>
        </div>

        {/* Scroll Content Area */}
        <div style={{ padding: '16px 22px 130px' }}>
          {/* Tags row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="a-chip" style={{ background: '#EBF1E7', color: '#3C7140' }}>
              <Icon name="pin" size={13} stroke={2} /> {plant.placement_label || plant.placement_type}
            </span>
            <span className="a-chip" style={{ background: '#EBF1E7', color: '#3C7140' }}>
              {plant.status}
            </span>
            <span className="a-chip" style={{ background: '#F1E7DC', color: '#B07F57' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: '#B07F57', marginRight: 5 }}></span>
              {healthLabel(measurements.find(m => m.health_score != null)?.health_score ?? 4)}
            </span>
          </div>

          {/* Quick Actions Row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="a-tap" onClick={() => setLogOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: '#3C7140', color: '#fff', border: 'none', borderRadius: 16, padding: '15px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15.5, fontWeight: 600, boxShadow: '0 10px 22px -10px rgba(60,113,64,.7)' }}>
              <Icon name="droplet" size={19} stroke={2.2} /> Log care
            </button>
            <SoilCheckAction
              isDark={false}
              open={soilCheckOpen}
              busy={soilCheckBusy}
              onToggle={() => setSoilCheckOpen((open) => !open)}
              onSubmit={(soilState) => void handleSoilCheck(soilState)}
            />
            <PhotoButton userId={userId} plantId={plant.$id} profile={profile} onUploaded={refresh} onError={setError} isDark={false} />
          </div>

          {/* Stats Cards Box */}
          <div className="a-card a-rise" style={{ marginTop: 16, borderRadius: 22, padding: '16px 18px', display: 'flex' }}>
            {/* Height */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: '#23302A' }}>
                  {latestHeight != null ? formatHeight(latestHeight, profile.preferred_units) : '--'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9AA294', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>Height</p>
            </div>

            {/* Leaves */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: '#23302A' }}>
                  {latestLeaves != null ? latestLeaves : '--'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9AA294', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>Leaves</p>
            </div>

            {/* Watered Days */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: '#23302A' }}>
                  {lastWateredDays != null ? `${lastWateredDays}d` : '--'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9AA294', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>Watered</p>
            </div>

            {/* Cadence */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: '#23302A' }}>
                  {cadenceDays != null ? `~${cadenceDays}d` : '--'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9AA294', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>Every</p>
            </div>

            {moisture && (
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: moistureStatusColor(moisture.recommendation.status, false) }}>
                    {Math.round(moisture.moisturePercent)}%
                  </span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9AA294', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>Moisture</p>
              </div>
            )}
          </div>

          {/* Species care guide — sourced reference facts */}
          {careProfile && (
            <CareProfilePanel profile={careProfile} units={profile.preferred_units} isDark={false} />
          )}

          {/* Growth & health trends — charted from the user's own measurements */}
          <TrendsCard plant={plant} units={profile.preferred_units} isDark={false} />

          {/* Care Insights Panel */}
          {observations.length > 0 && (
            <div className="a-card a-rise" style={{ animationDelay: '60ms', marginTop: 16, borderRadius: 22, padding: '6px 18px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 0 4px' }}>
                <Icon name="sparkle" size={18} stroke={2} style={{ color: '#B07F57' }} />
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#23302A' }}>Care insights</h3>
                <span className="a-chip" style={{ background: '#F1E7DC', color: '#B07F57', padding: '3px 8px', fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 700 }}>Experimental</span>
              </div>
              {moistureIns && moisture && (
                <div className="a-rise" style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: 'none' }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: moistureIns.severity === 'warning' ? '#F1E7DC' : '#EBF1E7', color: moistureIns.severity === 'warning' ? '#B07F57' : '#3C7140' }}>
                    <Icon name="droplet" size={18} stroke={2} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#23302A' }}>{moistureIns.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5, color: '#6B7568' }}>{moistureIns.detail}</p>
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9AA294' }}>Estimated · {moisture.confidence} confidence</p>
                    <MoistureFeedbackPrompt
                      isDark={false}
                      predictedMoisturePercent={moisture.moisturePercent}
                      busy={moistureFeedbackBusy}
                      onSubmit={(f, m) => void handleMoistureFeedback(f, m)}
                    />
                  </div>
                </div>
              )}
              {insights.map((ins, i) => {
                const warn = ins.severity === 'warning';
                const verdict = verdicts.get(ins.kind);
                return (
                  <div key={ins.kind} className="a-rise" style={{ animationDelay: 80 + i * 80 + 'ms', display: 'flex', gap: 12, padding: '14px 0', borderTop: (i || moistureIns) ? '1px solid #E7E0D2' : 'none' }}>
                    <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: warn ? '#F1E7DC' : '#EBF1E7', color: warn ? '#B07F57' : '#3C7140' }}>
                      <Icon name={warn ? 'sun' : ins.kind.includes('growth') ? 'arrowUp' : 'droplet'} size={18} stroke={2} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#23302A' }}>{ins.title}</p>
                        {/* Feedback 👍/👎 */}
                        <span className="shrink-0 space-x-1 ml-auto" style={{ fontSize: 12 }}>
                          <button
                            type="button"
                            className={`rounded px-1.5 py-0.5 transition-colors hover:bg-slate-100 ${verdict?.helpful === true ? 'bg-slate-200' : ''}`}
                            onClick={() => handleFeedback(ins.kind, true)}
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            className={`rounded px-1.5 py-0.5 transition-colors hover:bg-slate-100 ${verdict?.helpful === false ? 'bg-slate-200' : ''}`}
                            onClick={() => handleFeedback(ins.kind, false)}
                          >
                            👎
                          </button>
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5, color: '#6B7568' }}>{ins.detail}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9AA294' }}>From {ins.evidenceCount} {ins.evidenceCount === 1 ? 'entry' : 'entries'} · computed, not predicted</p>
                    </div>
                  </div>
                );
              })}
              <AiPreviewBlock isDark={false} state={aiPreview} onGenerate={() => void handleAiPreview()} />
            </div>
          )}

          {/* Timeline Title */}
          <h3 className="serif" style={{ margin: '26px 0 14px', fontSize: 20, fontWeight: 600, color: '#23302A' }}>Timeline</h3>

          {groupedTimeline.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6B7568', padding: '24px 0' }}>No entries yet.</p>
          ) : (
            <div className="space-y-4">
              {groupedTimeline.map(([day, entries]) => (
                <div key={day}>
                  <p style={{ margin: '6px 0 10px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9AA294' }}>
                    {day}
                  </p>
                  <div className="space-y-3">
                    {entries.map((obs, idx) => {
                      const icon = getIconName(obs);
                      const detail = detailLine(obs, profile.preferred_units);
                      const env = environmentLine(obs, profile.preferred_units);
                      const time = new Date(obs.observed_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isLast = idx === entries.length - 1;

                      return (
                        <div key={obs.$id} className="a-rise" style={{ display: 'flex', gap: 14, position: 'relative' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ width: 38, height: 38, borderRadius: 12, background: '#EBF1E7', color: '#3C7140', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                              <Icon name={icon} size={19} stroke={2} />
                            </span>
                            {!isLast && <span style={{ flex: 1, width: 2, background: '#E7E0D2', margin: '4px 0' }}></span>}
                          </div>
                          
                          <div className="a-card" style={{ flex: 1, borderRadius: 18, padding: '12px 14px', marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#23302A' }}>
                                {detail ?? 'Note'}
                              </p>
                              <span style={{ fontSize: 12, color: '#9AA294', flexShrink: 0 }}>{time}</span>
                            </div>
                            {obs.notes_private && (
                              <p style={{ margin: '5px 0 0', fontSize: 13.5, color: '#6B7568', lineHeight: 1.5, fontStyle: 'italic', fontFamily: "'Spectral',serif" }}>
                                “{obs.notes_private}”
                              </p>
                            )}
                            {env && (
                              <p style={{ margin: '7px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#9AA294' }}>
                                🌤️ {env}
                              </p>
                            )}
                            {obs.photos?.[0] && (
                              <div style={{ marginTop: 10, width: 110 }}>
                                <img
                                  src={photoUrl(obs.photos[0].private_file_id)}
                                  alt="Observation"
                                  style={{ width: '100%', height: '110px', borderRadius: '14px', objectFit: 'cover' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Log Care sheet */}
        {logOpen && (
          <LogSheet
            userId={userId}
            plantId={plant.$id}
            profile={profile}
            location={typeof plant.location_id === 'object' ? plant.location_id : null}
            onClose={() => setLogOpen(false)}
            onLogged={refresh}
          />
        )}
      </div>
    </div>
  );
}
