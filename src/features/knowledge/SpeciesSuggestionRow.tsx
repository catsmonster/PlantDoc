/**
 * One row in the species typeahead. Common name leads; scientific name is the
 * secondary italic line; a tag marks curated care guides ("Care guide") and
 * live GBIF fallback rows ("via GBIF"). Presentation only — pure logic in
 * suggestionRowView.
 */
import { suggestionRowView, type SpeciesSuggestion } from '../../lib/knowledge/species-suggest';

export function SpeciesSuggestionRow({
  suggestion,
  isDark,
  onPick,
}: {
  suggestion: SpeciesSuggestion;
  isDark: boolean;
  onPick: () => void;
}) {
  const view = suggestionRowView(suggestion);
  const palette = isDark
    ? { text: '#F2F6EF', sub: '#9BAA98', hover: '#22301F', care: '#C7F24A', careText: '#0E140F', gbifBorder: 'rgba(255,255,255,.16)', gbif: '#9BAA98' }
    : { text: '#23302A', sub: '#6B7568', hover: '#F1F5EC', care: '#3C7140', careText: '#FFFFFF', gbifBorder: '#D9D2C3', gbif: '#6B7568' };
  return (
    <li role="option" aria-selected={false}>
      <button
        type="button"
        className={isDark ? 'b-tap' : 'a-tap'}
        onClick={onPick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 9, padding: '9px 10px', cursor: 'pointer', color: palette.text, fontFamily: 'inherit' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = palette.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view.lead}
          </span>
          {view.sub && (
            <span style={{ display: 'block', fontSize: 12, fontStyle: 'italic', color: palette.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {view.sub}
            </span>
          )}
        </span>
        {view.tag === 'care' && (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', background: palette.care, color: palette.careText, padding: '3px 6px', borderRadius: 5 }}>
            Care guide
          </span>
        )}
        {view.tag === 'gbif' && (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', border: `1px solid ${palette.gbifBorder}`, color: palette.gbif, padding: '3px 6px', borderRadius: 5 }}>
            via GBIF
          </span>
        )}
      </button>
    </li>
  );
}
