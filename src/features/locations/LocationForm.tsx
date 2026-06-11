import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import type { LocationPrecision } from '../../lib/geo';
import { koppenZone } from '../../lib/koppen';
import { fetchClimateNormals, geocodeCity, type GeocodeResult } from '../../lib/openmeteo';
import { createLocation } from '../../lib/repo';
import type { UserLocation } from '../../lib/types';
import { Button } from '../../ui/Button';
import { ErrorText, SelectField, TextField } from '../../ui/Field';

const PRECISION_OPTIONS: { value: LocationPrecision; label: string }[] = [
  { value: 'exact', label: 'Exact (~1 km) — best weather accuracy' },
  { value: 'local', label: 'Local — city level' },
  { value: 'regional', label: 'Regional — region/state' },
  { value: 'climate', label: 'Climate zone (recommended)' },
  { value: 'country', label: 'Country only' },
];

const PRECISION_EXPORT_HINT: Record<LocationPrecision, string> = {
  exact: 'Shared data may include region, country, and climate zone — never your city or coordinates.',
  local: 'Shared data may include region, country, and climate zone — never your city.',
  regional: 'Shared data may include region, country, and climate zone.',
  climate: 'Shared data may include climate zone and country only.',
  country: 'Shared data may include country only.',
};

export function LocationForm({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string;
  onSaved: (location: UserLocation) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [label, setLabel] = useState('');
  const [precision, setPrecision] = useState<LocationPrecision>('climate');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setError(null);
    setBusy(true);
    try {
      const found = await geocodeCity(query.trim());
      setResults(found);
      if (found.length === 0) setError('No places found — try a different spelling.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const coords = { lat: selected.latitude, lon: selected.longitude };
      const normals = await fetchClimateNormals(coords);
      const zone = normals ? koppenZone(normals.tempC, normals.precipMm, coords.lat) : null;
      const location = await createLocation(userId, {
        label: label.trim() || null,
        country: selected.country,
        region: selected.region,
        city: selected.name,
        coords,
        location_precision: precision,
        climate_zone: zone,
      });
      onSaved(location);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 py-4">
      <h2 className="text-lg font-semibold text-slate-800">Add a location</h2>
      <p className="text-sm text-slate-500">
        City search and weather lookups use the free Open-Meteo API. Coordinates are rounded to
        about 11 km before any lookup and about 1 km before saving — your exact position is never
        stored or sent.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="City"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Lisbon"
            maxLength={128}
          />
        </div>
        <Button type="button" disabled={busy || !query.trim()} onClick={() => void search()}>
          Search
        </Button>
      </div>
      {results && results.length > 0 && (
        <ul className="space-y-1">
          {results.map((r, i) => {
            const active = selected === r;
            return (
              <li key={`${r.latitude},${r.longitude},${i}`}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    active
                      ? 'border-leaf-600 bg-leaf-50 text-leaf-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {r.name}
                  {r.region ? `, ${r.region}` : ''}
                  {r.country ? ` — ${r.country}` : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <>
          <TextField
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Home"
            maxLength={128}
          />
          <SelectField
            label="Location precision"
            value={precision}
            onChange={(e) => setPrecision(e.target.value as LocationPrecision)}
          >
            {PRECISION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <p className="text-xs text-slate-500">{PRECISION_EXPORT_HINT[precision]}</p>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !selected} className="flex-1">
          {busy ? 'Looking up climate…' : 'Save location'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
