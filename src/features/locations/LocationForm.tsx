import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import type { LocationPrecision } from '../../lib/geo';
import { koppenZone } from '../../lib/koppen';
import { fetchClimateNormals, geocodeCity, type GeocodeResult } from '../../lib/openmeteo';
import { createLocation } from '../../lib/repo';
import type { UserLocation } from '../../lib/types';
import { ErrorText } from '../../ui/Field';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';

const SHARING_OPTIONS: { value: LocationPrecision; label: string }[] = [
  { value: 'regional', label: 'Region + climate zone' },
  { value: 'climate', label: 'Climate zone + country (recommended)' },
  { value: 'country', label: 'Country only' },
];

const SHARING_HINT: Record<LocationPrecision, string> = {
  exact: 'Shared data may include region, country, and climate zone — never your city or coordinates.',
  local: 'Shared data may include region, country, and climate zone — never your city.',
  regional: 'Shared data may include region, country, and climate zone — never your city or coordinates.',
  climate: 'Shared data may include climate zone and country only — never your region, city, or coordinates.',
  country: 'Shared data may include country only — never your region, city, or coordinates.',
};

function uniqueParts(parts: Array<string | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const cleaned = part?.trim();
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function resultLabel(r: GeocodeResult): string {
  const place = uniqueParts([r.name, r.subregion, r.region]).join(', ');
  return r.country ? `${place} — ${r.country}` : place;
}

export function LocationForm({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string;
  onSaved: (location: UserLocation) => void;
  onCancel: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [label, setLabel] = useState('');
  const [precision, setPrecision] = useState<LocationPrecision>('climate');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDark = theme === 'dark';

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

  const hint = SHARING_HINT[precision];

  if (isDark) {
    // Direction B — Atlas (Dark Mode Location Form)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <form onSubmit={save} className="b-scroll">
          {/* Top Bar */}
          <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="b-tap" onClick={onCancel} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#19231B', border: '1px solid rgba(255,255,255,.09)', color: '#F2F6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={22} stroke={2.4} />
            </button>
            <h2 style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#F2F6EF' }}>
              Add a location
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

          <div style={{ padding: '8px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#9BAA98', lineHeight: 1.5 }}>
              Search for a city, neighborhood, or municipality. Open-Meteo is tried first; OpenStreetMap helps with neighborhood matches. Do not enter a street address. Coordinates are rounded before storage and weather lookup.
            </p>

            {/* City search input row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>City, neighborhood, or municipality</span>
                  <input className="b-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Tlaquepaque, Jalisco" disabled={busy} maxLength={128} />
                </label>
              </div>
              <button type="button" className="b-tap" onClick={() => void search()} disabled={busy || !query.trim()} style={{ borderRadius: 13, border: 'none', background: query.trim() ? '#C7F24A' : '#19231B', color: query.trim() ? '#0E140F' : '#67766A', padding: '13px 18px', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14.5, cursor: query.trim() ? 'pointer' : 'default', height: '48px' }}>
                Search
              </button>
            </div>

            {/* Search results */}
            {results && results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((r, i) => {
                  const active = selected === r;
                  return (
                    <button key={i} type="button" className="b-tap" onClick={() => setSelected(r)} style={{ textAlign: 'left', borderRadius: 13, border: '1px solid ' + (active ? '#C7F24A' : 'rgba(255,255,255,.09)'), background: active ? 'rgba(199,242,74,.12)' : '#19231B', color: active ? '#C7F24A' : '#F2F6EF', padding: '13px 14px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
                      {resultLabel(r)}
                    </button>
                  );
                })}
              </div>
            )}

            {selected && (
              <>
                {/* Location label input */}
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Label</span>
                  <input className="b-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Home" disabled={busy} maxLength={128} />
                </label>

                {/* Public sharing select */}
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>Public sharing</span>
                  <select className="b-input" value={precision} onChange={(e) => setPrecision(e.target.value as LocationPrecision)} disabled={busy}>
                    {SHARING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p style={{ margin: '-6px 0 0', fontSize: 12, color: '#67766A', lineHeight: 1.45 }}>{hint}</p>
              </>
            )}

            <ErrorText>{error}</ErrorText>

            {/* Save & Cancel buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="b-tap" onClick={onCancel} disabled={busy} style={{ width: 96, borderRadius: 14, border: '1px solid rgba(255,255,255,.09)', background: 'transparent', color: '#9BAA98', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy || !selected} style={{ flex: 1, borderRadius: 14, border: 'none', background: selected ? '#C7F24A' : '#19231B', color: selected ? '#0E140F' : '#67766A', padding: '15px 0', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15.5, cursor: selected ? 'pointer' : 'default' }}>
                {busy ? 'Save location...' : 'Save location'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode Location Form)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <form onSubmit={save} className="a-scroll">
        {/* Top Bar */}
        <div style={{ padding: '56px 18px 6px', display: 'flex', alignItems: 'center', gap: 12, background: '#F4EFE4' }}>
          <button type="button" className="a-tap" onClick={onCancel} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 99, flexShrink: 0, background: '#FFFDF8', border: '1px solid #E7E0D2', color: '#23302A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chevronLeft" size={22} stroke={2.4} />
          </button>
          <h2 className="serif" style={{ flex: 1, margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#23302A' }}>
            Add a location
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

        <div style={{ padding: '8px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7568', lineHeight: 1.5 }}>
            Search for a city, neighborhood, or municipality. Open-Meteo is tried first; OpenStreetMap helps with neighborhood matches. Do not enter a street address. Coordinates are rounded before storage and weather lookup.
          </p>

          {/* City search input row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>City, neighborhood, or municipality</span>
                <input className="a-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Tlaquepaque, Jalisco" disabled={busy} maxLength={128} />
              </label>
            </div>
            <button type="button" className="a-tap" onClick={() => void search()} disabled={busy || !query.trim()} style={{ borderRadius: 14, border: 'none', background: query.trim() ? '#3C7140' : '#9CC49A', color: '#fff', padding: '13px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14.5, cursor: query.trim() ? 'pointer' : 'default', height: '48px' }}>
              Search
            </button>
          </div>

          {/* Search results */}
          {results && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((r, i) => {
                const active = selected === r;
                return (
                  <button key={i} type="button" className="a-tap" onClick={() => setSelected(r)} style={{ textAlign: 'left', borderRadius: 14, border: '1px solid ' + (active ? '#3C7140' : '#E7E0D2'), background: active ? '#EBF1E7' : '#fff', color: active ? '#3C7140' : '#23302A', padding: '13px 14px', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
                    {resultLabel(r)}
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <>
              {/* Location label input */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Label</span>
                <input className="a-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Home" disabled={busy} maxLength={128} />
              </label>

              {/* Public sharing select */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>Public sharing</span>
                <select className="a-input" value={precision} onChange={(e) => setPrecision(e.target.value as LocationPrecision)} disabled={busy}>
                  {SHARING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p style={{ margin: '-6px 0 0', fontSize: 12, color: '#9AA294', lineHeight: 1.45 }}>{hint}</p>
            </>
          )}

          <ErrorText>{error}</ErrorText>

          {/* Save & Cancel buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="a-tap" onClick={onCancel} disabled={busy} style={{ width: 100, borderRadius: 16, border: '1px solid #E7E0D2', background: '#fff', color: '#6B7568', padding: '15px 0', fontFamily: 'inherit', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy || !selected} style={{ flex: 1, borderRadius: 16, border: 'none', background: selected ? '#3C7140' : '#9CC49A', color: '#fff', padding: '15px 0', fontFamily: 'inherit', fontWeight: 700, fontSize: 15.5, cursor: selected ? 'pointer' : 'default' }}>
              {busy ? 'Save location...' : 'Save location'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
