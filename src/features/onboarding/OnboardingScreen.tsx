import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import { createProfile } from '../../lib/repo';
import type { Profile, Units } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { useAuth } from '../auth/auth-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';

export function OnboardingScreen({ onComplete }: { onComplete: (profile: Profile) => void }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [units, setUnits] = useState<Units>('metric');
  const [contribute, setContribute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDark = theme === 'dark';

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

  if (isDark) {
    // Direction B — Atlas (Dark Mode)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <form onSubmit={handleSubmit} className="b-scroll">
          {/* Header Area */}
          <div style={{ padding: '72px 22px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="b-kicker">Step 2 of 2</span>
                <h1 style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 0.95, color: '#F2F6EF' }}>
                  Almost
                  <br />
                  there
                </h1>
              </div>
              <button
                type="button"
                className="b-tap"
                onClick={toggleTheme}
                aria-label="Switch to light mode"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 99,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,.09)',
                  color: '#F2F6EF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="sun" size={17} stroke={1.9} />
              </button>
            </div>
            <div className="b-underline" style={{ height: 3, width: 56, background: '#C7F24A', marginTop: 16, borderRadius: 9 }}></div>
          </div>

          {/* Form Content */}
          <div style={{ padding: '20px 22px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Display Name Input */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>
                Display name
              </span>
              <input
                className="b-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we greet you?"
                disabled={busy}
              />
            </label>

            {/* Units Segmented Control */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>
                Units
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {(
                  [
                    { v: 'metric', l: 'Metric · cm, ml, °C' },
                    { v: 'imperial', l: 'Imperial · in, fl oz, °F' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={'b-pillopt b-tap' + (units === o.v ? ' on' : '')}
                    onClick={() => setUnits(o.v)}
                    style={{ flex: 1, textAlign: 'center', padding: '11px 0' }}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </label>

            {/* Contribute to Open Dataset Checkbox */}
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

            <ErrorText>{error}</ErrorText>

            {/* Submit Button */}
            <button
              type="submit"
              className="b-tap"
              disabled={busy}
              style={{
                borderRadius: 15,
                border: 'none',
                background: '#C7F24A',
                color: '#0E140F',
                padding: '15px 0',
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 700,
                fontSize: 15.5,
                cursor: busy ? 'default' : 'pointer',
                boxShadow: '0 14px 34px -10px rgba(199,242,74,.5)',
              }}
            >
              {busy ? 'Starting...' : 'Start tracking'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <form onSubmit={handleSubmit} className="a-scroll">
        {/* Header Area */}
        <div style={{ padding: '70px 24px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="serif" style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: '-.02em', color: '#23302A' }}>
                Almost there
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#6B7568' }}>A couple of preferences before you start.</p>
            </div>
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
                background: '#FFFDF8',
                border: '1px solid #E7E0D2',
                color: '#23302A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="moon" size={18} stroke={2} />
            </button>
          </div>
        </div>

        {/* Form Content Card */}
        <div style={{ padding: '14px 22px 40px' }}>
          <div className="a-card a-rise" style={{ borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Display Name Input */}
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>
                Display name
              </span>
              <input
                className="a-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we greet you?"
                disabled={busy}
              />
            </label>

            {/* Units Segmented Control */}
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>
                Units
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {(
                  [
                    { v: 'metric', l: 'Metric · cm, ml, °C' },
                    { v: 'imperial', l: 'Imperial · in, fl oz, °F' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={'a-pillopt a-tap' + (units === o.v ? ' on' : '')}
                    onClick={() => setUnits(o.v)}
                    style={{ flex: 1, textAlign: 'center', padding: '11px 0' }}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </label>

            {/* Contribute to Open Dataset Checkbox */}
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

            <ErrorText>{error}</ErrorText>

            {/* Submit Button */}
            <button
              type="submit"
              className="a-tap"
              disabled={busy}
              style={{
                borderRadius: 16,
                border: 'none',
                background: '#3C7140',
                color: '#fff',
                padding: '15px 0',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 15.5,
                cursor: busy ? 'default' : 'pointer',
                boxShadow: '0 10px 22px -10px rgba(60,113,64,.7)',
              }}
            >
              {busy ? 'Starting...' : 'Start tracking'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
