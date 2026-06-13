/**
 * Species typeahead for plant onboarding (roadmap Phase 4A). As the user types
 * a common or scientific name, it suggests species from the curated care pack
 * and the Appwrite catalog (see suggestSpecies). Picking a suggestion fills the
 * accepted scientific name — and the species_id relation when catalog-backed —
 * so "swiss cheese plant" becomes Monstera deliciosa. Themed for both design
 * directions; a thin presenter over the pure suggestSpecies ranking.
 */

import { useId, useMemo, useState } from 'react';
import {
  suggestSpecies,
  type CatalogSpeciesLike,
  type SpeciesSuggestion,
} from '../../lib/knowledge/species-suggest';

export function SpeciesAutocomplete({
  value,
  catalog,
  isDark,
  disabled,
  placeholder,
  onTextChange,
  onSelect,
}: {
  value: string;
  catalog: CatalogSpeciesLike[];
  isDark: boolean;
  disabled?: boolean;
  placeholder?: string;
  onTextChange: (text: string) => void;
  onSelect: (suggestion: SpeciesSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const suggestions = useMemo(() => suggestSpecies(value, catalog), [value, catalog]);

  // Hide the menu once the field already holds an exact suggestion (just picked).
  const exactlyMatchesTop = suggestions.length === 1 && suggestions[0].scientificName === value.trim();
  const showMenu = open && suggestions.length > 0 && !exactlyMatchesTop;

  function pick(suggestion: SpeciesSuggestion) {
    onSelect(suggestion);
    setOpen(false);
  }

  const palette = isDark
    ? { menuBg: '#19231B', border: 'rgba(255,255,255,.12)', text: '#F2F6EF', sub: '#9BAA98', hover: '#22301F', tag: '#C7F24A', tagText: '#0E140F' }
    : { menuBg: '#FFFDF8', border: '#E7E0D2', text: '#23302A', sub: '#6B7568', hover: '#F1F5EC', tag: '#3C7140', tagText: '#FFFFFF' };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={isDark ? 'b-input' : 'a-input'}
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={255}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showMenu && (
        <ul
          id={listId}
          role="listbox"
          // Keep focus on the input so the blur-close doesn't beat the click.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: palette.menuBg,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            boxShadow: '0 12px 28px rgba(0,0,0,.18)',
            maxHeight: 244,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s) => (
            <li key={s.scientificName} role="option" aria-selected={false}>
              <button
                type="button"
                className={isDark ? 'b-tap' : 'a-tap'}
                onClick={() => pick(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 9,
                  padding: '9px 10px',
                  cursor: 'pointer',
                  color: palette.text,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = palette.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.scientificName}
                  </span>
                  {s.commonName && (
                    <span style={{ display: 'block', fontSize: 12, color: palette.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.commonName}
                    </span>
                  )}
                </span>
                {s.slug && (
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', background: palette.tag, color: palette.tagText, padding: '3px 6px', borderRadius: 5 }}>
                    Care guide
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
