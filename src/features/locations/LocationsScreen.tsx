import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { deleteLocation, listLocations } from '../../lib/repo';
import type { UserLocation } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { LocationForm } from './LocationForm';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';

function locationTitle(location: UserLocation): string {
  return location.label ?? location.city ?? location.region ?? location.country ?? 'Location';
}

export function LocationsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const [locations, setLocations] = useState<UserLocation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDark = theme === 'dark';

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

  if (isDark) {
    // Direction B — Atlas (Dark Mode Locations Screen)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <div className="b-scroll">
          {/* Top Bar */}
          <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="b-tap" onClick={onBack} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#19231B', border: '1px solid rgba(255,255,255,.09)', color: '#F2F6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={22} stroke={2.4} />
            </button>
            <h2 style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#F2F6EF' }}>
              Locations
            </h2>
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

          <div style={{ padding: '8px 22px 40px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#9BAA98', lineHeight: 1.5 }}>
              Assign a location to a plant for weather context. Sharing tier controls how much geography can ever appear in open data.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {locations === null && !error && <Spinner />}
              {locations?.map((l, i) => (
                <div key={l.$id} className="b-rise" style={{ animationDelay: i * 60 + 'ms', borderRadius: 16, padding: '14px 16px', background: '#19231B', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: '#1F2A21', color: '#C7F24A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="pin" size={20} stroke={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#F2F6EF' }}>{locationTitle(l)}</p>
                    <p className="mono" style={{ margin: '3px 0 0', fontSize: 11, color: '#67766A', letterSpacing: '.03em' }}>
                      {[l.city, l.region, l.country].filter(Boolean).join(', ').toUpperCase()}
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {l.climate_zone && (
                        <span className="mono" style={{ fontSize: 10, letterSpacing: '.06em', color: '#C7F24A', border: '1px solid rgba(255,255,255,.09)', borderRadius: 6, padding: '3px 7px' }}>
                          {l.climate_zone}
                        </span>
                      )}
                      <span className="mono" style={{ fontSize: 10, letterSpacing: '.06em', color: '#E0A36B', border: '1px solid rgba(255,255,255,.09)', borderRadius: 6, padding: '3px 7px', textTransform: 'uppercase' }}>
                        sharing: {l.location_precision}
                      </span>
                    </div>
                  </div>
                  <button className="b-tap" onClick={() => void remove(l)} aria-label="Delete" style={{ width: 36, height: 36, borderRadius: 10, background: 'transparent', border: 'none', color: '#67766A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={18} stroke={2.2} />
                  </button>
                </div>
              ))}
              {locations?.length === 0 && (
                <p style={{ textAlign: 'center', color: '#67766A', fontSize: 14, padding: '24px 0' }}>No locations yet.</p>
              )}
            </div>

            <ErrorText>{error}</ErrorText>

            <button className="b-tap" onClick={() => setAdding(true)} style={{ marginTop: 18, width: '100%', borderRadius: 15, border: 'none', background: '#C7F24A', color: '#0E140F', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <Icon name="plus" size={20} stroke={2.6} /> Add location
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Locations Screen)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <div className="a-scroll">
        {/* Top Bar */}
        <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12, background: '#F4EFE4' }}>
          <button type="button" className="a-tap" onClick={onBack} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#FFFDF8', border: '1px solid #E7E0D2', color: '#23302A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chevronLeft" size={22} stroke={2.4} />
          </button>
          <h2 className="serif" style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#23302A' }}>
            Locations
          </h2>
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

        <div style={{ padding: '8px 22px 40px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7568', lineHeight: 1.5 }}>
            Assign a location to a plant for weather context. Sharing tier controls how much geography can ever appear in open data.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {locations === null && !error && <Spinner />}
            {locations?.map((l, i) => (
              <div key={l.$id} className="a-card a-rise" style={{ animationDelay: i * 60 + 'ms', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: '#EBF1E7', color: '#3C7140', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="pin" size={20} stroke={2} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: '#23302A' }}>{locationTitle(l)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#9AA294' }}>
                    {[l.city, l.region, l.country].filter(Boolean).join(', ')}
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    {l.climate_zone && (
                      <span className="a-chip" style={{ background: '#EBF1E7', color: '#3C7140', padding: '3px 9px', fontSize: 11 }}>
                        {l.climate_zone}
                      </span>
                    )}
                    <span className="a-chip" style={{ background: '#F1E7DC', color: '#B07F57', padding: '3px 9px', fontSize: 11 }}>
                      sharing: {l.location_precision}
                    </span>
                  </div>
                </div>
                <button className="a-tap" onClick={() => void remove(l)} aria-label="Delete" style={{ width: 36, height: 36, borderRadius: 10, background: 'transparent', border: 'none', color: '#9AA294', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={18} stroke={2.2} />
                </button>
              </div>
            ))}
            {locations?.length === 0 && (
              <p style={{ textAlign: 'center', color: '#9AA294', fontSize: 14, padding: '24px 0' }}>No locations yet.</p>
            )}
          </div>

          <ErrorText>{error}</ErrorText>

          <button className="a-tap" onClick={() => setAdding(true)} style={{ marginTop: 18, width: '100%', borderRadius: 16, border: 'none', background: '#3C7140', color: '#fff', padding: '15px 0', fontFamily: 'inherit', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Icon name="plus" size={20} stroke={2.4} /> Add location
          </button>
        </div>
      </div>
    </div>
  );
}
