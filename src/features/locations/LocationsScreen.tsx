import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { deleteLocation, listLocations } from '../../lib/repo';
import type { UserLocation } from '../../lib/types';
import { Button } from '../../ui/Button';
import { ErrorText } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { LocationForm } from './LocationForm';

function locationTitle(location: UserLocation): string {
  return location.label ?? location.city ?? location.region ?? location.country ?? 'Location';
}

export function LocationsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [locations, setLocations] = useState<UserLocation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLocations(userId)
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function remove(location: UserLocation) {
    setError(null);
    try {
      await deleteLocation(location.$id);
      setLocations((rows) => rows?.filter((r) => r.$id !== location.$id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (adding) {
    return (
      <LocationForm
        userId={userId}
        onSaved={(location) => {
          setLocations((rows) => [location, ...(rows ?? [])]);
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Locations</h2>
        <Button variant="ghost" onClick={onBack}>
          ← Plants
        </Button>
      </div>
      <p className="text-sm text-slate-500">
        Assign a location to a plant to get weather context on its timeline. Precision controls
        how much geography can ever appear in shared open data.
      </p>
      {locations === null && !error && <Spinner />}
      {locations?.length === 0 && (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-500">No locations yet.</p>
      )}
      <ul className="space-y-2">
        {locations?.map((location) => (
          <li
            key={location.$id}
            className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
          >
            <div>
              <p className="font-medium text-slate-800">{locationTitle(location)}</p>
              <p className="text-xs text-slate-500">
                {[location.city, location.region, location.country].filter(Boolean).join(', ')}
                {location.climate_zone ? ` · ${location.climate_zone}` : ''}
                {` · ${location.location_precision}`}
              </p>
            </div>
            <Button variant="ghost" className="text-clay-700" onClick={() => void remove(location)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" onClick={() => setAdding(true)}>
        + Add location
      </Button>
    </div>
  );
}
