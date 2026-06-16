import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import {
  createPlant,
  listLocations,
  listSpecies,
  updatePlant,
  type PlantInput,
} from '../../lib/repo';
import type { LightLevel, PlacementType, Plant, PlantStatus, Species, SubstrateType, Units, UserLocation } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';
import { PlantImageSlot } from '../../ui/PlantImageSlot';
import { SpeciesNameResolver } from '../knowledge/SpeciesNameResolver';
import { SpeciesAutocomplete } from '../knowledge/SpeciesAutocomplete';
import { speciesCatalogLabel, speciesSelectionFromSuggestion, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';
import { potDimensionInitialValue, potDimensionToCm } from './plant-form-logic';

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
  units,
  onSaved,
  onCancel,
}: {
  userId: string;
  plant?: Plant;
  units: Units;
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
  const [editSpecies, setEditSpecies] = useState(false);
  const [placementType, setPlacementType] = useState<PlacementType>(
    plant?.placement_type ?? 'indoor',
  );
  const [placementLabel, setPlacementLabel] = useState(plant?.placement_label ?? '');
  const [acquiredOn, setAcquiredOn] = useState(plant?.acquired_on?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<PlantStatus>(plant?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [potDiameter, setPotDiameter] = useState(potDimensionInitialValue(plant?.pot_diameter_cm, units));
  const [potHeight, setPotHeight] = useState(potDimensionInitialValue(plant?.pot_height_cm, units));
  const [substrateType, setSubstrateType] = useState<SubstrateType | ''>(plant?.substrate_type ?? '');
  const [potDrains, setPotDrains] = useState<boolean>(plant?.pot_drains ?? true);
  const [lightLevel, setLightLevel] = useState<LightLevel | ''>(plant?.light_level ?? '');
  const [showPotDetails, setShowPotDetails] = useState(
    Boolean(plant?.substrate_type) || Boolean(plant?.light_level),
  );

  const isDark = theme === 'dark';
  const imperial = units === 'imperial';

  // When a catalog species is chosen, show its name from the catalog — or, while
  // editing before the catalog loads, from the plant's already-hydrated relation.
  const selectedSpecies =
    species.find((sp) => sp.$id === speciesId) ??
    (plant && plant.species_id && typeof plant.species_id === 'object' ? plant.species_id : null);
  const selectedSpeciesLabel = selectedSpecies ? speciesCatalogLabel(selectedSpecies) : 'Species selected';

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

  function applySpecies(suggestion: SpeciesSuggestion) {
    const next = speciesSelectionFromSuggestion(suggestion);
    setSpeciesId(next.speciesId);
    setSpeciesText(next.speciesText);
    setEditSpecies(false);
  }

  // From the Common-name field: fill the species, and adopt the row's common name
  // (keep the user's typed text when the row has none — a scientific-only entry).
  function handleSelectFromCommonName(suggestion: SpeciesSuggestion) {
    applySpecies(suggestion);
    if (suggestion.commonName) setCommonName(suggestion.commonName);
  }

  // From the Species field: fill the species, and back-fill an empty common name.
  function handleSelectFromSpecies(suggestion: SpeciesSuggestion) {
    applySpecies(suggestion);
    if (!commonName.trim() && suggestion.commonName) setCommonName(suggestion.commonName);
  }

  const hasSpecies = Boolean(speciesId) || Boolean(speciesText.trim());
  const speciesChipLabel = speciesId
    ? selectedSpeciesLabel
    : speciesText.trim() || 'Species selected';

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
      pot_diameter_cm: potDimensionToCm(potDiameter, units),
      pot_height_cm: potDimensionToCm(potHeight, units),
      substrate_type: substrateType || null,
      pot_drains: potDrains,
      light_level: lightLevel || null,
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

            {/* Common name — the novice entry point: typing suggests species and
                fills the Species chip below (see Option A). */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>What do you call it?</span>
              <SpeciesAutocomplete
                value={commonName}
                catalog={species}
                isDark
                disabled={busy}
                placeholder="e.g. basil, snake plant, monstera"
                onTextChange={setCommonName}
                onSelect={handleSelectFromCommonName}
              />
            </label>

            {/* Species — a derived result of the name above; editable via Change. */}
            {hasSpecies && !editSpecies ? (
              <div style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species · auto-filled</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#141d16', border: '1px solid rgba(199,242,74,.32)', borderRadius: 12, padding: '11px 13px' }}>
                  <Icon name="leaf" size={18} stroke={1.9} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, fontStyle: 'italic', color: '#F2F6EF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speciesChipLabel}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#67766A' }}>Filled from the name above</span>
                  </span>
                  <button type="button" className="b-tap" onClick={() => setEditSpecies(true)} disabled={busy} aria-label="Change species" style={{ flexShrink: 0, borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: '#C7F24A', padding: '7px 12px', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Species</span>
                  <SpeciesAutocomplete
                    value={speciesText}
                    catalog={species}
                    isDark
                    disabled={busy}
                    placeholder="e.g. Monstera deliciosa"
                    onTextChange={(t) => { setSpeciesId(''); setSpeciesText(t); }}
                    onSelect={handleSelectFromSpecies}
                  />
                </label>
                <SpeciesNameResolver query={speciesText} isDark onAdopt={setSpeciesText} />
              </div>
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

            {/* Pot size — the physics prior for the moisture model. The friendly
                numbers are placeholders only, so an untouched field stays unknown
                (no false confidence). */}
            <label style={{ display: 'block' }}>
              <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Pot size ({imperial ? 'in' : 'cm'})</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="b-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potDiameter} onChange={(e) => setPotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`Pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
                <input className="b-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potHeight} onChange={(e) => setPotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`Pot height in ${imperial ? 'inches' : 'centimetres'}`} />
              </div>
            </label>

            {/* Improve accuracy — optional details that sharpen the moisture estimate. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: showPotDetails ? 16 : 0 }}>
              <button type="button" className="b-tap" onClick={() => setShowPotDetails((v) => !v)} disabled={busy} aria-expanded={showPotDetails} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: '#C7F24A', padding: '2px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
                <Icon name={showPotDetails ? 'chevronDown' : 'chevronRight'} size={16} stroke={2.2} />
                Improve accuracy
              </button>
              {showPotDetails && (
                <>
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Soil / substrate</span>
                    <select className="b-input" value={substrateType} onChange={(e) => setSubstrateType(e.target.value as SubstrateType | '')} disabled={busy}>
                      <option value="">— Not sure —</option>
                      <option value="standard">Standard potting mix</option>
                      <option value="succulent_gritty">Succulent / cactus (gritty)</option>
                      <option value="chunky_aroid">Chunky aroid mix</option>
                      <option value="peat_seedling">Peat / seedling mix</option>
                    </select>
                  </label>
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Drainage</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {([{ v: true, l: 'Drainage hole' }, { v: false, l: 'No drainage' }] as const).map((o) => (
                        <button key={String(o.v)} type="button" className={'b-pillopt b-tap' + (potDrains === o.v ? ' on' : '')} onClick={() => setPotDrains(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label style={{ display: 'block' }}>
                    <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Light</span>
                    <select className="b-input" value={lightLevel} onChange={(e) => setLightLevel(e.target.value as LightLevel | '')} disabled={busy}>
                      <option value="">— Not sure —</option>
                      <option value="low">Low light</option>
                      <option value="medium">Medium light</option>
                      <option value="bright">Bright indirect</option>
                      <option value="direct_sun">Direct sun</option>
                    </select>
                  </label>
                </>
              )}
            </div>

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

          {/* Common name — novice entry point (Option A). */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>What do you call it?</span>
            <SpeciesAutocomplete
              value={commonName}
              catalog={species}
              isDark={false}
              disabled={busy}
              placeholder="e.g. basil, snake plant, monstera"
              onTextChange={setCommonName}
              onSelect={handleSelectFromCommonName}
            />
          </label>

          {/* Species — derived result, editable via Change. */}
          {hasSpecies && !editSpecies ? (
            <div style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species · auto-filled</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#EBF1E7', border: '1px solid #CFE0C2', borderRadius: 14, padding: '11px 13px' }}>
                <Icon name="leaf" size={18} stroke={1.9} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, fontStyle: 'italic', color: '#23302A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speciesChipLabel}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#9AA294' }}>Filled from the name above</span>
                </span>
                <button type="button" className="a-tap" onClick={() => setEditSpecies(true)} disabled={busy} aria-label="Change species" style={{ flexShrink: 0, borderRadius: 10, border: '1px solid #E7E0D2', background: '#fff', color: '#3C7140', padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Species</span>
                <SpeciesAutocomplete
                  value={speciesText}
                  catalog={species}
                  isDark={false}
                  disabled={busy}
                  placeholder="e.g. Monstera deliciosa"
                  onTextChange={(t) => { setSpeciesId(''); setSpeciesText(t); }}
                  onSelect={handleSelectFromSpecies}
                />
              </label>
              <SpeciesNameResolver query={speciesText} isDark={false} onAdopt={setSpeciesText} />
            </div>
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

          {/* Pot size — physics prior for the moisture model; friendly numbers are
              placeholders only, so an untouched field stays unknown (no false confidence). */}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Pot size ({imperial ? 'in' : 'cm'})</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="a-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potDiameter} onChange={(e) => setPotDiameter(e.target.value)} placeholder={imperial ? 'Width 5 in' : 'Width 12 cm'} disabled={busy} aria-label={`Pot diameter in ${imperial ? 'inches' : 'centimetres'}`} />
              <input className="a-input" type="number" inputMode="decimal" min={1} max={imperial ? 80 : 200} value={potHeight} onChange={(e) => setPotHeight(e.target.value)} placeholder={imperial ? 'Height 4 in' : 'Height 10 cm'} disabled={busy} aria-label={`Pot height in ${imperial ? 'inches' : 'centimetres'}`} />
            </div>
          </label>

          {/* Improve accuracy — optional details that sharpen the moisture estimate. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: showPotDetails ? 16 : 0 }}>
            <button type="button" className="a-tap" onClick={() => setShowPotDetails((v) => !v)} disabled={busy} aria-expanded={showPotDetails} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: '#3C7140', padding: '2px 0', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
              <Icon name={showPotDetails ? 'chevronDown' : 'chevronRight'} size={16} stroke={2.2} />
              Improve accuracy
            </button>
            {showPotDetails && (
              <>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Soil / substrate</span>
                  <select className="a-input" value={substrateType} onChange={(e) => setSubstrateType(e.target.value as SubstrateType | '')} disabled={busy}>
                    <option value="">— Not sure —</option>
                    <option value="standard">Standard potting mix</option>
                    <option value="succulent_gritty">Succulent / cactus (gritty)</option>
                    <option value="chunky_aroid">Chunky aroid mix</option>
                    <option value="peat_seedling">Peat / seedling mix</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Drainage</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {([{ v: true, l: 'Drainage hole' }, { v: false, l: 'No drainage' }] as const).map((o) => (
                      <button key={String(o.v)} type="button" className={'a-pillopt a-tap' + (potDrains === o.v ? ' on' : '')} onClick={() => setPotDrains(o.v)} style={{ flex: 1, textAlign: 'center' }}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Light</span>
                  <select className="a-input" value={lightLevel} onChange={(e) => setLightLevel(e.target.value as LightLevel | '')} disabled={busy}>
                    <option value="">— Not sure —</option>
                    <option value="low">Low light</option>
                    <option value="medium">Medium light</option>
                    <option value="bright">Bright indirect</option>
                    <option value="direct_sun">Direct sun</option>
                  </select>
                </label>
              </>
            )}
          </div>

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
