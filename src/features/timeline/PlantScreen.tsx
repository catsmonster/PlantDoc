import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { getPlantWithTimeline, photoUrl } from '../../lib/repo';
import type { Observation, Plant, Profile, TreatmentType, Units } from '../../lib/types';
import { formatHeight, formatVolume } from '../../lib/units';
import { Button } from '../../ui/Button';
import { ErrorText } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { LogSheet } from './LogSheet';
import { PhotoButton } from './PhotoButton';

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

const treatmentIcons: Record<TreatmentType, string> = {
  watering: '💧',
  fertilizing: '🌿',
  repotting: '🪴',
  pruning: '✂️',
  misting: '🌫️',
  pest_control: '🐛',
  cleaning: '🧽',
  relocation: '📦',
};

function observationIcon(obs: Observation): string {
  if (obs.observation_type === 'treatment') {
    const type = obs.treatments?.[0]?.treatment_type;
    return type ? treatmentIcons[type] : '🌿';
  }
  const icons: Record<string, string> = {
    measurement: '📏',
    photo: '📷',
    note: '📝',
    environment: '🌡️',
    health_check: '🩺',
  };
  return icons[obs.observation_type] ?? '📝';
}

/** One-line summary of the child row, e.g. "Watered · 250 ml · top water". */
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

function PhotoThumb({ fileId }: { fileId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-leaf-50 text-2xl">
        📷
      </div>
    );
  }
  return (
    <img
      src={photoUrl(fileId)}
      alt="Plant photo"
      loading="lazy"
      className="h-24 w-24 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function TimelineEntry({ obs, units }: { obs: Observation; units: Units }) {
  const detail = detailLine(obs, units);
  const time = new Date(obs.observed_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <li className="flex gap-3 rounded-xl border border-leaf-100 bg-white p-3 shadow-sm">
      <span className="text-xl" aria-hidden>
        {observationIcon(obs)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">{detail ?? 'Note'}</p>
          <span className="shrink-0 text-xs text-slate-400">{time}</span>
        </div>
        {obs.notes_private && (
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{obs.notes_private}</p>
        )}
        {obs.photos?.[0] && (
          <div className="mt-2">
            <PhotoThumb fileId={obs.photos[0].private_file_id} />
          </div>
        )}
      </div>
    </li>
  );
}

function groupByDay(observations: Observation[]): [string, Observation[]][] {
  const groups = new Map<string, Observation[]>();
  for (const obs of observations) {
    const day = new Date(obs.observed_at).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const list = groups.get(day);
    if (list) list.push(obs);
    else groups.set(day, [obs]);
  }
  return [...groups.entries()];
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
  const [plant, setPlant] = useState<Plant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPlantWithTimeline(plantId)
      .then((row) => {
        if (!cancelled) setPlant(row);
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

  if (error) {
    return (
      <div className="space-y-3 py-6">
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" onClick={onBack}>
          ← Back to plants
        </Button>
      </div>
    );
  }
  if (!plant) return <Spinner label="Loading timeline…" />;

  const speciesLine =
    plant.common_name ?? plant.species_id?.scientific_name ?? plant.species_text;
  const observations = plant.observations ?? [];

  return (
    <div className="space-y-4 py-4">
      <button type="button" className="text-sm text-leaf-600 hover:underline" onClick={onBack}>
        ← All plants
      </button>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{plant.nickname}</h2>
          {speciesLine && <p className="text-sm text-slate-500">{speciesLine}</p>}
          <div className="mt-1 flex gap-2">
            <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-medium capitalize text-leaf-700">
              {plant.placement_type}
            </span>
            {plant.placement_label && (
              <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs text-leaf-600">
                {plant.placement_label}
              </span>
            )}
            {plant.status !== 'active' && (
              <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium capitalize text-clay-700">
                {plant.status}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" onClick={() => onEdit(plant)}>
          Edit
        </Button>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setLogOpen(true)}>
          + Log care
        </Button>
        <PhotoButton
          userId={userId}
          plantId={plantId}
          profile={profile}
          onUploaded={refresh}
          onError={setError}
        />
      </div>
      {observations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-leaf-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No entries yet. Log a watering or snap a photo to start the timeline.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupByDay(observations).map(([day, entries]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {day}
              </h3>
              <ul className="space-y-2">
                {entries.map((obs) => (
                  <TimelineEntry key={obs.$id} obs={obs} units={profile.preferred_units} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {logOpen && (
        <LogSheet
          userId={userId}
          plantId={plantId}
          profile={profile}
          onClose={() => setLogOpen(false)}
          onLogged={refresh}
        />
      )}
    </div>
  );
}
