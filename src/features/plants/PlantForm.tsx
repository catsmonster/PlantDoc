import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import { createPlant, listSpecies, updatePlant, type PlantInput } from '../../lib/repo';
import type { PlacementType, Plant, PlantStatus, Species } from '../../lib/types';
import { Button } from '../../ui/Button';
import { ErrorText, SelectField, TextField } from '../../ui/Field';

function speciesIdOf(plant: Plant | undefined): string {
  if (!plant?.species_id) return '';
  return typeof plant.species_id === 'string' ? plant.species_id : plant.species_id.$id;
}

export function PlantForm({
  userId,
  plant,
  onSaved,
  onCancel,
}: {
  userId: string;
  plant?: Plant;
  onSaved: (plant: Plant) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(plant);
  const [species, setSpecies] = useState<Species[]>([]);
  const [nickname, setNickname] = useState(plant?.nickname ?? '');
  const [commonName, setCommonName] = useState(plant?.common_name ?? '');
  const [speciesId, setSpeciesId] = useState(speciesIdOf(plant));
  const [speciesText, setSpeciesText] = useState(plant?.species_text ?? '');
  const [placementType, setPlacementType] = useState<PlacementType>(
    plant?.placement_type ?? 'indoor',
  );
  const [placementLabel, setPlacementLabel] = useState(plant?.placement_label ?? '');
  const [acquiredOn, setAcquiredOn] = useState(plant?.acquired_on?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<PlantStatus>(plant?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSpecies()
      .then((rows) => {
        if (!cancelled) setSpecies(rows);
      })
      .catch(() => {
        // Species catalog is optional; free-text species still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(input: PlantInput | Partial<PlantInput>) {
    setError(null);
    setBusy(true);
    try {
      const saved = plant
        ? await updatePlant(plant.$id, input)
        : await createPlant(userId, input as PlantInput);
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save({
      nickname: nickname.trim(),
      common_name: commonName.trim() || null,
      species_id: speciesId || null,
      species_text: speciesText.trim() || null,
      placement_type: placementType,
      placement_label: placementLabel.trim() || null,
      acquired_on: acquiredOn ? new Date(acquiredOn).toISOString() : null,
      ...(editing ? { status } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <h2 className="text-lg font-semibold text-slate-800">
        {editing ? `Edit ${plant?.nickname}` : 'Add a plant'}
      </h2>
      <TextField
        label="Nickname *"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="e.g. Window monstera"
        required
        maxLength={128}
      />
      <TextField
        label="Common name"
        value={commonName}
        onChange={(e) => setCommonName(e.target.value)}
        placeholder="e.g. Swiss cheese plant"
        maxLength={128}
      />
      <SelectField
        label="Species (from catalog)"
        value={speciesId}
        onChange={(e) => setSpeciesId(e.target.value)}
      >
        <option value="">— Not sure / not listed —</option>
        {species.map((s) => (
          <option key={s.$id} value={s.$id}>
            {s.scientific_name}
            {s.common_names.length > 0 ? ` (${s.common_names[0]})` : ''}
          </option>
        ))}
      </SelectField>
      {!speciesId && (
        <TextField
          label="Species (free text)"
          value={speciesText}
          onChange={(e) => setSpeciesText(e.target.value)}
          placeholder="Whatever the label said"
          maxLength={255}
        />
      )}
      <SelectField
        label="Placement"
        value={placementType}
        onChange={(e) => setPlacementType(e.target.value as PlacementType)}
      >
        <option value="indoor">Indoor</option>
        <option value="outdoor">Outdoor</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="balcony">Balcony</option>
      </SelectField>
      <TextField
        label="Spot label"
        value={placementLabel}
        onChange={(e) => setPlacementLabel(e.target.value)}
        placeholder="e.g. Living room, south window"
        maxLength={128}
      />
      <TextField
        label="Acquired on"
        type="date"
        value={acquiredOn}
        onChange={(e) => setAcquiredOn(e.target.value)}
      />
      {editing && (
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PlantStatus)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="deceased">Deceased</option>
          <option value="gifted">Gifted</option>
        </SelectField>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !nickname.trim()} className="flex-1">
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add plant'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      {editing && status === 'active' && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-clay-700"
          disabled={busy}
          onClick={() => void save({ status: 'archived' })}
        >
          Archive this plant
        </Button>
      )}
    </form>
  );
}
