import { useRef, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { uploadPhoto } from '../../lib/repo';
import type { Profile } from '../../lib/types';
import { Button } from '../../ui/Button';

export function PhotoButton({
  userId,
  plantId,
  profile,
  onUploaded,
  onError,
}: {
  userId: string;
  plantId: string;
  profile: Profile;
  onUploaded: () => void;
  onError: (message: string) => void;
}) {
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
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : '📷 Photo'}
      </Button>
    </>
  );
}
