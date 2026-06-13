/**
 * Species typeahead for plant onboarding (roadmap Phase 4A). As the user types
 * a common or scientific name, it suggests species from the curated care pack
 * and the Appwrite catalog (see suggestSpecies). Picking a suggestion fills the
 * accepted scientific name — and the species_id relation when catalog-backed —
 * so "swiss cheese plant" becomes Monstera deliciosa. Themed for both design
 * directions; a thin presenter over the pure suggestSpecies ranking.
 */

import { useEffect, useId, useRef, useState } from 'react';
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
  // -1 = no keyboard-active option; cleared on each new query (see onChange).
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const { suggestions, loading } = useSpeciesSuggestions(value, catalog);

  // Hide the menu once the field already holds an exact suggestion (just picked).
  const exactlyMatchesTop = suggestions.length === 1 && suggestions[0].scientificName === value.trim();
  const showMenu = open && (suggestions.length > 0 || loading) && !exactlyMatchesTop;

  // Effective active option, clamped to the live list so a stale index never
  // points past the end after the suggestions change.
  const active = activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // Keep the keyboard-active option scrolled into view within the menu.
  useEffect(() => {
    if (active < 0) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(suggestion: SpeciesSuggestion) {
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showMenu) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
      return;
    }
    if (e.key === 'ArrowUp') {
      if (!showMenu) return;
      e.preventDefault();
      setActiveIndex((i) => (i < 0 ? suggestions.length - 1 : Math.max(i - 1, 0)));
      return;
    }
    if (e.key === 'Home') {
      if (showMenu && suggestions.length) {
        e.preventDefault();
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === 'End') {
      if (showMenu && suggestions.length) {
        e.preventDefault();
        setActiveIndex(suggestions.length - 1);
      }
      return;
    }
    if (e.key === 'Enter' && showMenu && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    }
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
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={255}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showMenu && (
        <div
          // Keep focus on the input so the blur-close doesn't beat the click.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: palette.menuBg,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            boxShadow: '0 12px 28px rgba(0,0,0,.18)',
            overflow: 'hidden',
          }}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ margin: 0, padding: 4, listStyle: 'none', maxHeight: 244, overflowY: 'auto' }}
          >
            {suggestions.map((s, i) => (
              <SpeciesSuggestionRow
                key={s.scientificName}
                id={optionId(i)}
                active={i === active}
                suggestion={s}
                isDark={isDark}
                onPick={() => pick(s)}
              />
            ))}
          </ul>
          {loading && (
            <div role="status" aria-live="polite" style={{ padding: '9px 10px', fontSize: 12, color: palette.sub }}>
              Searching…
            </div>
          )}
          {suggestions.some((s) => s.via === 'gbif') && (
            <div style={{ padding: '5px 10px 7px', fontSize: 10.5, color: palette.sub }}>
              Matches via GBIF · CC BY
            </div>
          )}
        </div>
      )}
    </div>
  );
}
