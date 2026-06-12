import { useEffect, useState, useRef } from 'react';
import { errorMessage } from '../../lib/error';
import { getPlantWithTimeline, photoUrl, setInsightFeedback, uploadPhoto } from '../../lib/repo';
import type { Observation, Plant, Profile, TreatmentType, Units, InsightFeedback } from '../../lib/types';
import { formatHeight, formatVolume } from '../../lib/units';
import { Spinner } from '../../ui/Spinner';
import { useTheme } from '../theme/ThemeContext';
import { Icon, healthLabel, type IconName } from '../../ui/Icon';
import { LogSheet } from './LogSheet';
import { plantInsights } from '../../lib/insights';
import { ErrorText } from '../../ui/Field';

const initialNow = Date.now();
const initialNowDate = new Date(initialNow);

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

function detailLine(obs: Observation, units: Units): string | null {
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
    if (m.health_score != null) parts.push(`health ${m.health_score}/5`);
    return parts.length ? parts.join(' · ') : 'Measured';
  }
  if (obs.observation_type === 'photo') return 'Photo';
  if (obs.observation_type === 'note') return null;
  return obs.observation_type.replace('_', ' ');
}

function environmentLine(obs: Observation): string | null {
  const snapshot = obs.environment_snapshots?.[0];
  if (!snapshot) return null;
  const parts: string[] = [];
  if (snapshot.outdoor_temperature_c != null) {
    parts.push(`${Math.round(snapshot.outdoor_temperature_c)}°C`);
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
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [verdicts, setVerdicts] = useState<Map<string, InsightFeedback>>(new Map());

  const isDark = theme === 'dark';
  const now = initialNow;
  const nowDate = initialNowDate;

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

  const refresh = () => {
    setLogOpen(false);
    setReloadKey((k) => k + 1);
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
            <button className="b-tap" onClick={onBack} style={{ position: 'absolute', top: 58, left: 18, width: 42, height: 42, borderRadius: 99, background: 'rgba(14,20,15,.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F2F6EF', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={22} stroke={2.4} />
            </button>

            {/* Edit Button, Theme Toggle & Health Dot */}
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
              <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 7, background: '#C7F24A', color: '#0E140F', backdropFilter: 'blur(6px)' }}>
                {healthLabel(measurements.find(m => m.health_score != null)?.health_score ?? 4)}
              </span>
            </div>

            {/* Plant Meta Details */}
            <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18 }}>
              <span className="b-kicker" style={{ color: 'rgba(255,255,255,.7)' }}>
                {plant.placement_label || plant.placement_type}
              </span>
              <h1 style={{ margin: '6px 0 0', fontSize: 44, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 0.92, color: '#fff' }}>
                {plant.nickname}
              </h1>
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
                    {latestHeight != null ? latestHeight : '--'}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: '#67766A' }}>cm</span>
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
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="b-tap" onClick={() => setLogOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: '#C7F24A', color: '#0E140F', border: 'none', borderRadius: 15, padding: '15px 0', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 700 }}>
                <Icon name="droplet" size={19} stroke={2.4} /> Log care
              </button>
              <PhotoButton userId={userId} plantId={plant.$id} profile={profile} onUploaded={refresh} onError={setError} isDark />
            </div>

            {/* Care Insights */}
            {insights.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span className="b-kicker">Care insights</span>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.09)' }}></span>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', color: '#0E140F', background: '#E0A36B', padding: '3px 7px', borderRadius: 5 }}>EXPERIMENTAL</span>
                </div>
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
                        const env = environmentLine(obs);
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
          <button className="a-tap" onClick={onBack} style={{ position: 'absolute', top: 56, left: 18, width: 42, height: 42, borderRadius: 99, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#23302A', cursor: 'pointer' }}>
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
            <PhotoButton userId={userId} plantId={plant.$id} profile={profile} onUploaded={refresh} onError={setError} isDark={false} />
          </div>

          {/* Stats Cards Box */}
          <div className="a-card a-rise" style={{ marginTop: 16, borderRadius: 22, padding: '16px 18px', display: 'flex' }}>
            {/* Height */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="serif" style={{ fontSize: 24, fontWeight: 600, color: '#23302A' }}>
                  {latestHeight != null ? latestHeight : '--'}
                </span>
                <span style={{ fontSize: 12, color: '#9AA294', fontWeight: 600 }}>cm</span>
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
          </div>

          {/* Care Insights Panel */}
          {insights.length > 0 && (
            <div className="a-card a-rise" style={{ animationDelay: '60ms', marginTop: 16, borderRadius: 22, padding: '6px 18px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 0 4px' }}>
                <Icon name="sparkle" size={18} stroke={2} style={{ color: '#B07F57' }} />
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#23302A' }}>Care insights</h3>
                <span className="a-chip" style={{ background: '#F1E7DC', color: '#B07F57', padding: '3px 8px', fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 700 }}>Experimental</span>
              </div>
              {insights.map((ins, i) => {
                const warn = ins.severity === 'warning';
                const verdict = verdicts.get(ins.kind);
                return (
                  <div key={ins.kind} className="a-rise" style={{ animationDelay: 80 + i * 80 + 'ms', display: 'flex', gap: 12, padding: '14px 0', borderTop: i ? '1px solid #E7E0D2' : 'none' }}>
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
                      const env = environmentLine(obs);
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
