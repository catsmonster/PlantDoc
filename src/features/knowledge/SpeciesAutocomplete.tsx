/**
 * Species typeahead for plant onboarding (roadmap Phase 4A). As the user types
 * a common or scientific name, it suggests species from the curated care pack
 * and the Appwrite catalog (see suggestSpecies). Picking a suggestion fills the
 * accepted scientific name — and the species_id relation when catalog-backed —
 * so "swiss cheese plant" becomes Monstera deliciosa. Themed for both design
 * directions; a thin presenter over the pure suggestSpecies ranking.
 */

import { useId, useState } from 'react';
import { type CatalogSpeciesLike, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';
import { useSpeciesSuggestions } from './useSpeciesSuggestions';
import { SpeciesSuggestionRow } from './SpeciesSuggestionRow';

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
  const { suggestions, loading } = useSpeciesSuggestions(value, catalog);

  // Hide the menu once the field already holds an exact suggestion (just picked).
  const exactlyMatchesTop = suggestions.length === 1 && suggestions[0].scientificName === value.trim();
  const showMenu = open && (suggestions.length > 0 || loading) && !exactlyMatchesTop;

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
            <SpeciesSuggestionRow key={s.scientificName} suggestion={s} isDark={isDark} onPick={() => pick(s)} />
          ))}
          {loading && (
            <li role="option" aria-selected={false} aria-disabled style={{ padding: '9px 10px', fontSize: 12, color: palette.sub }}>
              Searching…
            </li>
          )}
          {suggestions.some((s) => s.via === 'gbif') && (
            <li aria-hidden style={{ padding: '5px 10px 3px', fontSize: 10.5, color: palette.sub }}>
              Matches via GBIF · CC BY
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
