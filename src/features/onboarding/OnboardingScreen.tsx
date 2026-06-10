import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import { createProfile } from '../../lib/repo';
import type { Profile, Units } from '../../lib/types';
import { Button } from '../../ui/Button';
import { CheckboxField, ErrorText, Segmented, TextField } from '../../ui/Field';
import { useAuth } from '../auth/auth-context';

export function OnboardingScreen({ onComplete }: { onComplete: (profile: Profile) => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [units, setUnits] = useState<Units>('metric');
  const [contribute, setContribute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const profile = await createProfile(user.$id, {
        display_name: displayName.trim() || null,
        preferred_units: units,
        public_contribution_default: contribute,
      });
      onComplete(profile);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-leaf-50">
      <header className="bg-leaf-700 px-4 py-8 text-white">
        <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
        <p className="mt-1 text-sm text-leaf-100">A couple of preferences before you start.</p>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-leaf-100 bg-white p-5 shadow-sm"
        >
          <TextField
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we greet you?"
          />
          <Segmented
            label="Units"
            value={units}
            onChange={setUnits}
            options={[
              { value: 'metric', label: 'Metric (cm, ml, °C)' },
              { value: 'imperial', label: 'Imperial (in, fl oz, °F)' },
            ]}
          />
          <CheckboxField
            label="Share my plant-care logs with open research"
            hint="Sets the default for new log entries; you can change it per entry. Shared data is anonymized: no names, notes, photos, or precise locations ever leave your account — only coarse care and outcome data."
            checked={contribute}
            onChange={(e) => setContribute(e.target.checked)}
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Saving…' : 'Start tracking'}
          </Button>
        </form>
      </main>
    </div>
  );
}
