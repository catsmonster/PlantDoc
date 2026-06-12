import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import {
  createPlant,
  listLocations,
  listSpecies,
  updatePlant,
  type PlantInput,
} from '../../lib/repo';
import type { PlacementType, Plant, PlantStatus, Species, UserLocation } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';
import { PlantImageSlot } from '../../ui/PlantImageSlot';

function speciesIdOf(plant: Plant | undefined): string {
  if (!plant?.species_id) return '';
  return typeof plant.species_id === 'string' ? plant.species_id : plant.species_id.$id;
}

function locationIdOf(plant: Plant | undefined): string {
  if (!plant?.location_id) return '';
  return typeof plant.location_id === 'string' ? plant.location_id : plant.location_id.$id;
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
  const { theme, toggleTheme } = useTheme();
  const [species, setSpecies] = useState<Species[]>([]);
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [locationId, setLocationId] = useState(locationIdOf(plant));
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

  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    listSpecies()
      .then((rows) => {
        if (!cancelled) setSpecies(rows);
      })
      .catch(() => {
        // Species catalog is optional
      });
    listLocations(userId)
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .catch(() => {
        // Locations are optional
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      location_id: locationId || null,
      ...(editing ? { status } : {}),
    });
  }

  const titleText = editing ? `Edit ${plant?.nickname}` : 'Add a plant';

  if (isDark) {
    // Direction B — Atlas (Dark Mode Form)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <form onSubmit={handleSubmit} className="b-scroll">
          {/* Top Bar */}
          <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="b-tap" onClick={onCancel} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#19231B', border: '1px solid rgba(255,255,255,.09)', color: '#F2F6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={22} stroke={2.4} />
            </button>
            <h2 style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#F2F6EF' }}>
              {titleText}
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

          <div style={{ padding: '10px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Form Image slot */}
            <div style={{ width: '100%', height: 150 }}>
              {plant ? (
                <PlantImageSlot plant={plant} height={150} radius={18} caption="Plant Photo" isDark />
              ) : (
                <div style={{ width: '100%', height: '150px', borderRadius: '18px', background: '#19231B', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#67766A', fontSize: '13px' }}>
                  Photo can be uploaded after adding
                </div>
              )}
            </div>

            {/* Nickname Input */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Nickname *</span>
              <input className="b-input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Window monstera" required disabled={busy} maxLength={128} />
            </label>

            {/* Common Name Input */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Common name</span>
              <input className="b-input" value={commonName} onChange={(e) => setCommonName(e.target.value)} placeholder="e.g. Swiss cheese plant" disabled={busy} maxLength={128} />
            </label>

            {/* Species Select catalog */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species</span>
              <select className="b-input" value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} disabled={busy}>
                <option value="">— Not sure / not listed —</option>
                {species.map((sp) => (
                  <option key={sp.$id} value={sp.$id}>
                    {sp.scientific_name}{sp.common_names.length > 0 ? ` (${sp.common_names[0]})` : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Free text species input */}
            {!speciesId && (
              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species (free text)</span>
                <input className="b-input" value={speciesText} onChange={(e) => setSpeciesText(e.target.value)} placeholder="Whatever the label said" disabled={busy} maxLength={255} />
              </label>
            )}

            {/* Placement Segment Options */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Placement</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { v: 'indoor', l: 'Indoor' },
                    { v: 'outdoor', l: 'Outdoor' },
                    { v: 'greenhouse', l: 'Greenhouse' },
                    { v: 'balcony', l: 'Balcony' },
                  ] as const
                ).map((o) => (
                  <button key={o.v} type="button" className={'b-pillopt b-tap' + (placementType === o.v ? ' on' : '')} onClick={() => setPlacementType(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                    {o.l}
                  </button>
                ))}
              </div>
            </label>

            {/* Spot label */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Spot label</span>
              <input className="b-input" value={placementLabel} onChange={(e) => setPlacementLabel(e.target.value)} placeholder="e.g. Living room, south window" disabled={busy} maxLength={128} />
            </label>

            {/* Acquired On Date */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Acquired on</span>
              <input className="b-input" type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} disabled={busy} />
            </label>

            {/* Location dropdown */}
            {locations.length > 0 && (
              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Location</span>
                <select className="b-input" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={busy}>
                  <option value="">— None —</option>
                  {locations.map((l) => (
                    <option key={l.$id} value={l.$id}>
                      {l.label ?? l.city ?? l.region ?? l.country ?? 'Location'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Status select (only when editing) */}
            {editing && (
              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Status</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(
                    [
                      { v: 'active', l: 'Active' },
                      { v: 'archived', l: 'Archived' },
                      { v: 'deceased', l: 'Deceased' },
                      { v: 'gifted', l: 'Gifted' },
                    ] as const
                  ).map((o) => (
                    <button key={o.v} type="button" className={'b-pillopt b-tap' + (status === o.v ? ' on' : '')} onClick={() => setStatus(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </label>
            )}

            <ErrorText>{error}</ErrorText>

            {/* Submit & Cancel Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="b-tap" onClick={onCancel} disabled={busy} style={{ width: 96, borderRadius: 14, border: '1px solid rgba(255,255,255,.09)', background: 'transparent', color: '#9BAA98', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !nickname.trim()} style={{ flex: 1, borderRadius: 14, border: 'none', background: nickname.trim() ? '#C7F24A' : '#1F2A21', color: nickname.trim() ? '#0E140F' : '#67766A', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15.5, cursor: nickname.trim() ? 'pointer' : 'default' }}>
                {busy ? 'Saving...' : editing ? 'Save changes' : 'Add plant'}
              </button>
            </div>

            {editing && status === 'active' && (
              <button type="button" className="b-tap" onClick={() => void save({ status: 'archived' })} disabled={busy} style={{ background: 'none', border: 'none', color: '#E0A36B', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 8, width: '100%', textAlign: 'center' }}>
                Archive this plant
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Form)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <form onSubmit={handleSubmit} className="a-scroll">
        {/* Top Bar */}
        <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12, background: '#F4EFE4' }}>
          <button type="button" className="a-tap" onClick={onCancel} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#FFFDF8', border: '1px solid #E7E0D2', color: '#23302A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chevronLeft" size={22} stroke={2.4} />
          </button>
          <h2 className="serif" style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#23302A' }}>
            {titleText}
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

        <div style={{ padding: '10px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Form Image slot */}
          <div style={{ width: '100%', height: 150 }}>
            {plant ? (
              <PlantImageSlot plant={plant} height={150} radius={20} caption="Plant Photo" />
            ) : (
              <div style={{ width: '100%', height: '150px', borderRadius: '20px', background: '#EBF1E7', border: '1px solid #E7E0D2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7568', fontSize: '13px' }}>
                Photo can be uploaded after adding
              </div>
            )}
          </div>

          {/* Nickname Input */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Nickname *</span>
            <input className="a-input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Window monstera" required disabled={busy} maxLength={128} />
          </label>

          {/* Common Name Input */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Common name</span>
            <input className="a-input" value={commonName} onChange={(e) => setCommonName(e.target.value)} placeholder="e.g. Swiss cheese plant" disabled={busy} maxLength={128} />
          </label>

          {/* Species Dropdown catalog */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species (from catalog)</span>
            <select className="a-input" value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} disabled={busy}>
              <option value="">— Not sure / not listed —</option>
              {species.map((sp) => (
                <option key={sp.$id} value={sp.$id}>
                  {sp.scientific_name}{sp.common_names.length > 0 ? ` (${sp.common_names[0]})` : ''}
                </option>
              ))}
            </select>
          </label>

          {/* Free text species input */}
          {!speciesId && (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species (free text)</span>
              <input className="a-input" value={speciesText} onChange={(e) => setSpeciesText(e.target.value)} placeholder="Whatever the label said" disabled={busy} maxLength={255} />
            </label>
          )}

          {/* Placement segment button option */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Placement</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(
                [
                  { v: 'indoor', l: 'Indoor' },
                  { v: 'outdoor', l: 'Outdoor' },
                  { v: 'greenhouse', l: 'Greenhouse' },
                  { v: 'balcony', l: 'Balcony' },
                ] as const
              ).map((o) => (
                <button key={o.v} type="button" className={'a-pillopt a-tap' + (placementType === o.v ? ' on' : '')} onClick={() => setPlacementType(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                  {o.l}
                </button>
              ))}
            </div>
          </label>

          {/* Spot label */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Spot label</span>
            <input className="a-input" value={placementLabel} onChange={(e) => setPlacementLabel(e.target.value)} placeholder="e.g. Living room, south window" disabled={busy} maxLength={128} />
          </label>

          {/* Acquired date input */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Acquired on</span>
            <input className="a-input" type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} disabled={busy} />
          </label>

          {/* Location select */}
          {locations.length > 0 && (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Location</span>
              <select className="a-input" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={busy}>
                <option value="">— None —</option>
                {locations.map((l) => (
                  <option key={l.$id} value={l.$id}>
                    {l.label ?? l.city ?? l.region ?? l.country ?? 'Location'}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Status select (only when editing) */}
          {editing && (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Status</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { v: 'active', l: 'Active' },
                    { v: 'archived', l: 'Archived' },
                    { v: 'deceased', l: 'Deceased' },
                    { v: 'gifted', l: 'Gifted' },
                  ] as const
                ).map((o) => (
                  <button key={o.v} type="button" className={'a-pillopt a-tap' + (status === o.v ? ' on' : '')} onClick={() => setStatus(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                    {o.l}
                  </button>
                ))}
              </div>
            </label>
          )}

          <ErrorText>{error}</ErrorText>

          {/* Submit & Cancel buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="a-tap" onClick={onCancel} disabled={busy} style={{ width: 100, borderRadius: 16, border: '1px solid #E7E0D2', background: '#fff', color: '#6B7568', padding: '15px 0', fontFamily: 'inherit', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !nickname.trim()} style={{ flex: 1, borderRadius: 16, border: 'none', background: nickname.trim() ? '#3C7140' : '#9CC49A', color: '#fff', padding: '15px 0', fontFamily: 'inherit', fontWeight: 700, fontSize: 15.5, cursor: nickname.trim() ? 'pointer' : 'default' }}>
              {busy ? 'Saving...' : editing ? 'Save changes' : 'Add plant'}
            </button>
          </div>

          {editing && status === 'active' && (
            <button type="button" className="a-tap" onClick={() => void save({ status: 'archived' })} disabled={busy} style={{ background: 'none', border: 'none', color: '#B07F57', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 8, width: '100%', textAlign: 'center' }}>
              Archive this plant
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
