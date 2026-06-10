import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { listPlants } from '../../lib/repo';
import type { Plant } from '../../lib/types';
import { Button } from '../../ui/Button';
import { ErrorText } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';

const placementLabels: Record<Plant['placement_type'], string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  greenhouse: 'Greenhouse',
  balcony: 'Balcony',
};

function PlantCard({ plant, onSelect }: { plant: Plant; onSelect: () => void }) {
  const speciesLine = plant.common_name ?? plant.species_text;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-leaf-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-leaf-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800">{plant.nickname}</h3>
          {speciesLine && <p className="text-sm text-slate-500">{speciesLine}</p>}
        </div>
        {plant.status !== 'active' && (
          <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium capitalize text-clay-700">
            {plant.status}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-medium text-leaf-700">
          {placementLabels[plant.placement_type]}
        </span>
        {plant.placement_label && (
          <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs text-leaf-600">
            {plant.placement_label}
          </span>
        )}
      </div>
    </button>
  );
}

export function PlantsScreen({
  userId,
  onAdd,
  onSelect,
}: {
  userId: string;
  onAdd: () => void;
  onSelect: (plant: Plant) => void;
}) {
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPlants(userId)
      .then((rows) => {
        if (!cancelled) setPlants(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return (
      <div className="space-y-3 py-6">
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
  if (!plants) return <Spinner label="Loading your plants…" />;

  const visible = plants.filter((p) => (showArchived ? true : p.status === 'active'));
  const hiddenCount = plants.length - plants.filter((p) => p.status === 'active').length;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">My plants</h2>
        <Button onClick={onAdd}>+ Add plant</Button>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-leaf-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            {plants.length === 0
              ? 'No plants yet. Add your first plant to start tracking its care.'
              : 'No active plants. Toggle archived to see the rest.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((plant) => (
            <li key={plant.$id}>
              <PlantCard plant={plant} onSelect={() => onSelect(plant)} />
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="w-full text-center text-sm text-leaf-600 hover:underline"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Hide' : 'Show'} archived ({hiddenCount})
        </button>
      )}
    </div>
  );
}
