import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/error';
import { listPlants } from '../../lib/repo';
import { isPlantThirstyFromSummary } from '../../lib/insights';
import type { Plant, Profile } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';
import { PlantImageSlot } from '../../ui/PlantImageSlot';
import { useAuth } from '../auth/auth-context';



// Helper to format today's date like "Wednesday · 11 June"
function formatToday() {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  // Replacing " at " or comma formatting to " · "
  return new Date().toLocaleDateString(undefined, options).replace(',', ' ·');
}

export function PlantsScreen({
  userId,
  profile,
  onAdd,
  onSelect,
  onOpenLocations,
}: {
  userId: string;
  profile: Profile | null;
  onAdd: () => void;
  onSelect: (plant: Plant) => void;
  onOpenLocations: () => void;
}) {
  const { signOut } = useAuthRedirect();
  const { theme, toggleTheme } = useTheme();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const isDark = theme === 'dark';
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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
      <div className={isDark ? 'b-root bg-[#0E140F] min-h-dvh p-6 text-[#F2F6EF]' : 'a-root bg-[#F4EFE4] min-h-dvh p-6 text-[#23302A]'}>
        <div className="space-y-3 py-6">
          <ErrorText>{error}</ErrorText>
          <button
            onClick={() => window.location.reload()}
            className={isDark ? 'b-tap bg-[#C7F24A] text-[#0E140F] px-4 py-2 rounded-lg font-bold' : 'a-tap bg-[#3C7140] text-white px-4 py-2 rounded-lg font-bold'}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!plants) return <Spinner label="Loading your plants…" />;

  const activePlants = plants.filter((p) => p.status === 'active');
  const visible = plants.filter((p) => (showArchived ? true : p.status === 'active'));
  const hiddenCount = plants.length - activePlants.length;

  const thirsty = activePlants.filter((p) => isPlantThirstyFromSummary(p, now));

  // Get display name or default
  const displayName = profile?.display_name ?? 'there';

  if (isDark) {
    // Direction B — Atlas (Dark Mode Dashboard)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <div className="b-scroll">
          {/* Header */}
          <div style={{ padding: '64px 22px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="b-kicker">PlantDoc — {String(activePlants.length).padStart(2, '0')} plants</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
                <button
                  type="button"
                  className="b-tap"
                  onClick={onOpenLocations}
                  aria-label="Locations"
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
                  <Icon name="pin" size={17} stroke={1.9} />
                </button>
                <button
                  type="button"
                  className="b-tap"
                  onClick={signOut}
                  aria-label="Sign out"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 99,
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,.09)',
                    color: '#9BAA98',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                </button>
              </div>
            </div>
            <h1 style={{ margin: '14px 0 0', fontSize: 46, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 0.92, color: '#fff' }}>
              The
              <br />
              Collection
            </h1>
            <div className="b-underline" style={{ height: 3, width: 64, background: '#C7F24A', marginTop: 16, borderRadius: 9 }}></div>
          </div>

          {/* Thirsty list (Horizontal scrolling) */}
          {thirsty.length > 0 && (
            <div style={{ padding: '20px 0 4px' }}>
              <p className="b-kicker" style={{ padding: '0 22px 10px' }}>Needs water · {thirsty.length}</p>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 22px 4px' }}>
                {thirsty.map((p, i) => {
                  const lastWateredDays = p.last_watered_at
                    ? Math.max(0, Math.round((now.getTime() - Date.parse(p.last_watered_at)) / (24 * 60 * 60 * 1000)))
                    : 0;

                  return (
                    <button
                      key={p.$id}
                      className="b-tap b-rise"
                      onClick={() => onSelect(p)}
                      style={{
                        animationDelay: i * 90 + 'ms',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        background: '#19231B',
                        border: '1px solid rgba(255,255,255,.09)',
                        borderRadius: 16,
                        padding: '10px 16px 10px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 11, overflow: 'hidden' }}>
                        <PlantImageSlot plant={p} height={40} radius={11} caption=" " isDark />
                      </div>
                      <span style={{ textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#F2F6EF' }}>{p.nickname}</span>
                        <span className="mono" style={{ display: 'block', fontSize: 10.5, color: '#67766A', letterSpacing: '.05em' }}>
                          {p.last_watered_at ? `${lastWateredDays}D AGO` : 'NEVER'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plants Cards list */}
          <div style={{ padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {visible.map((p, i) => {
              const lastWateredDays = p.last_watered_at
                ? Math.max(0, Math.round((now.getTime() - Date.parse(p.last_watered_at)) / (24 * 60 * 60 * 1000)))
                : 0;
              const isThirsty = isPlantThirstyFromSummary(p, now);
              const speciesLine = p.common_name ?? p.species_text ?? '';

              return (
                <button
                  key={p.$id}
                  className="b-press b-rise"
                  onClick={() => onSelect(p)}
                  style={{
                    animationDelay: i * 80 + 'ms',
                    position: 'relative',
                    width: '100%',
                    height: 210,
                    border: 'none',
                    borderRadius: 22,
                    overflow: 'hidden',
                    padding: 0,
                    cursor: 'pointer',
                    background: '#19231B',
                    textAlign: 'left',
                  }}
                >
                  <PlantImageSlot plant={p} height={210} radius={22} caption=" " isDark />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,12,9,.85) 4%, rgba(8,12,9,.15) 48%, transparent)', pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 7, background: 'rgba(255,255,255,.12)', color: '#F2F6EF', backdropFilter: 'blur(6px)' }}>
                        {p.placement_label || p.placement_type}
                      </span>
                      {p.status !== 'active' && (
                        <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 7, background: 'rgba(255, 68, 68, 0.2)', color: '#FF6b6b', backdropFilter: 'blur(6px)' }}>
                          {p.status}
                        </span>
                      )}
                    </div>
                    {isThirsty && (
                      <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 7, background: '#C7F24A', color: '#0E140F', backdropFilter: 'blur(6px)' }}>
                        <Icon name="droplet" size={11} stroke={2.6} /> Water
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'absolute', left: 16, right: 16, bottom: 15 }}>
                    <h3 style={{ margin: 0, fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1, color: '#fff' }}>{p.nickname}</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 7 }}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'rgba(255,255,255,.78)', letterSpacing: '.02em' }}>{speciesLine}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>
                        {p.last_watered_at ? `${String(lastWateredDays).padStart(2, '0')}d` : '--'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {visible.length === 0 && (
              <p style={{ textAlign: 'center', color: '#67766A', padding: '24px 0' }}>No plants yet.</p>
            )}
          </div>

          {/* Manage menu links */}
          {hiddenCount > 0 && (
            <div style={{ padding: '0 22px 120px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="b-tap text-sm"
                onClick={() => setShowArchived((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '15px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,.09)',
                  borderRadius: 14,
                  cursor: 'pointer',
                  color: '#9BAA98',
                }}
              >
                <Icon name="clock" size={19} stroke={2} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600 }}>
                  {showArchived ? 'Hide' : 'Show'} archived ({hiddenCount})
                </span>
              </button>
            </div>
          )}
          {hiddenCount === 0 && <div style={{ height: 120 }}></div>}

          {/* Bottom FAB */}
          <button className="b-tap" onClick={onAdd} style={{ position: 'absolute', bottom: 28, left: 22, right: 22, height: 56, borderRadius: 18, background: '#C7F24A', color: '#0E140F', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, boxShadow: '0 14px 34px -10px rgba(199,242,74,.5)' }}>
            <Icon name="plus" size={22} stroke={2.6} /> Add a plant
          </button>
        </div>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Dashboard)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <div className="a-scroll">
        {/* Header */}
        <div style={{ padding: '62px 22px 6px', background: '#F4EFE4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, color: '#9AA294', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {formatToday()}
              </p>
              <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 32, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.05, color: '#23302A' }}>
                Good morning,
                <br />
                {displayName}
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              <button
                type="button"
                className="a-tap"
                onClick={onOpenLocations}
                aria-label="Locations"
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
                <Icon name="pin" size={18} stroke={2} />
              </button>
              <button
                type="button"
                className="a-tap"
                onClick={signOut}
                aria-label="Sign out"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 99,
                  cursor: 'pointer',
                  background: '#FFFDF8',
                  border: '1px solid #E7E0D2',
                  color: '#B07F57',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Thirsty Alert Card */}
        {thirsty.length > 0 && (
          <div style={{ padding: '14px 22px 0' }}>
            <div className="a-card a-rise" style={{ borderRadius: 26, padding: 18, background: 'linear-gradient(135deg, #2F5934, #3C7140)', border: 'none', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', opacity: 0.8 }}>Today</span>
                <Icon name="sun" size={20} stroke={1.8} style={{ opacity: 0.85 }} />
              </div>
              <p className="serif" style={{ margin: '8px 0 0', fontSize: 23, lineHeight: 1.25, fontWeight: 500 }}>
                {thirsty.length} {thirsty.length === 1 ? 'plant is' : 'plants are'} ready for a drink.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {thirsty.map((p) => (
                  <button
                    key={p.$id}
                    className="a-tap"
                    onClick={() => onSelect(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      background: 'rgba(255,255,255,.15)',
                      border: '1px solid rgba(255,255,255,.22)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '7px 12px 7px 7px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: 99, overflow: 'hidden' }}>
                      <PlantImageSlot plant={p} height={24} radius={99} caption=" " />
                    </div>
                    {p.nickname}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Section Title */}
        <div style={{ padding: '26px 22px 4px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 className="serif" style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#23302A', whiteSpace: 'nowrap' }}>My plants</h2>
          <span style={{ fontSize: 13, color: '#9AA294', fontWeight: 600 }}>{activePlants.length} growing</span>
        </div>

        {/* Plant Cards List */}
        <div style={{ padding: '8px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((p, i) => {
            const lastWateredDays = p.last_watered_at
              ? Math.max(0, Math.round((now.getTime() - Date.parse(p.last_watered_at)) / (24 * 60 * 60 * 1000)))
              : 0;
            const isThirsty = isPlantThirstyFromSummary(p, now);
            const speciesLine = p.common_name ?? p.species_text ?? '';

            return (
              <button
                key={p.$id}
                className="a-card a-press a-rise"
                onClick={() => onSelect(p)}
                style={{
                  animationDelay: i * 65 + 'ms',
                  display: 'flex',
                  gap: 14,
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #E7E0D2',
                  borderRadius: 22,
                  padding: 12,
                  alignItems: 'center',
                  background: '#FFFDF8',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ width: 72, height: 72, flexShrink: 0 }}>
                  <PlantImageSlot plant={p} height={72} radius={18} caption="photo" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className="serif" style={{ fontSize: 21, fontWeight: 600, color: '#23302A', margin: 0, letterSpacing: '-.01em' }}>
                      {p.nickname}
                    </h3>
                    {p.status !== 'active' && (
                      <span className="a-chip" style={{ background: '#F5ECE1', color: '#A06D3B', padding: '3px 8px', fontSize: 11.5 }}>
                        {p.status}
                      </span>
                    )}
                    {isThirsty && (
                      <span className="a-chip" style={{ background: '#EAF1F6', color: '#2E6E8E', padding: '3px 8px', fontSize: 11.5 }}>
                        <Icon name="droplet" size={12} stroke={2.4} /> Thirsty
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 13.5, color: '#6B7568', fontStyle: 'italic', fontFamily: "'Spectral',serif" }}>
                    {speciesLine}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 12.5, color: '#9AA294' }}>
                    <Icon name="pin" size={13} stroke={2} />
                    {p.placement_label || p.placement_type}
                    <span style={{ width: 3, height: 3, borderRadius: 9, background: '#9AA294', margin: '0 1px' }}></span>
                    <Icon name="droplet" size={13} stroke={2} />
                    {p.last_watered_at ? `${lastWateredDays}d ago` : 'never'}
                  </div>
                </div>
              </button>
            );
          })}

          {visible.length === 0 && (
            <p style={{ textAlign: 'center', color: '#6B7568', padding: '24px 0' }}>No plants yet.</p>
          )}
        </div>

        {/* Manage Links */}
        {hiddenCount > 0 && (
          <div style={{ padding: '18px 22px 120px' }}>
            <div className="a-card" style={{ borderRadius: 18, overflow: 'hidden' }}>
              <button
                className="a-tap"
                onClick={() => setShowArchived((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '15px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: '#6B7568',
                }}
              >
                <Icon name="clock" size={19} stroke={2} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600 }}>
                  {showArchived ? 'Hide' : 'Show'} archived ({hiddenCount})
                </span>
                <Icon name="chevronRight" size={18} stroke={2} style={{ color: '#9AA294' }} />
              </button>
            </div>
          </div>
        )}
        {hiddenCount === 0 && <div style={{ height: 120 }}></div>}

        {/* Floating Add Button */}
        <button className="a-tap" onClick={onAdd} style={{ position: 'absolute', bottom: 30, right: 22, height: 56, borderRadius: 999, background: '#3C7140', color: '#fff', border: 'none', boxShadow: '0 12px 30px -8px rgba(60,113,64,.6)', display: 'flex', alignItems: 'center', gap: 9, padding: '0 22px 0 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15.5, fontWeight: 600 }}>
          <Icon name="plus" size={22} stroke={2.4} /> Add plant
        </button>
      </div>
    </div>
  );
}

// Small helper hook to use auth redirect / signout functionality in this component
function useAuthRedirect() {
  const { signOut } = useAuth();
  return { signOut };
}
