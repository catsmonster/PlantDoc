/**
 * Species name verification against the GBIF backbone taxonomy (roadmap Phase
 * 4A onboarding). When a plant's species is entered as free text, the user can
 * check it against GBIF and adopt the accepted scientific name. GBIF is used
 * only for taxonomy — never to infer care — and the lookup is explicit (a
 * button, not a keystroke) so we only call the third party when asked.
 *
 * The display logic lives in summarizeGbifMatch() (pure, unit-tested); this
 * component is a thin presenter, themed inline for the two design directions.
 */

import { useState } from 'react';
import { matchGbifSpecies, summarizeGbifMatch, type GbifNameSummary } from '../../lib/knowledge/gbif';
import { getSource } from '../../lib/knowledge/sources';

type ResolveState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string }
  | { kind: 'match'; query: string; summary: GbifNameSummary }
  | { kind: 'none'; query: string };

const MIN_QUERY_LENGTH = 3;
const GBIF = getSource('gbif');

export function SpeciesNameResolver({
  query,
  isDark,
  onAdopt,
}: {
  query: string;
  isDark: boolean;
  onAdopt: (canonicalName: string) => void;
}) {
  const [state, setState] = useState<ResolveState>({ kind: 'idle' });
  const trimmed = query.trim();
  const canCheck = trimmed.length >= MIN_QUERY_LENGTH;

  // A result only applies to the exact text it was fetched for; once the user
  // edits the field, the stale result collapses back to the idle (button) view.
  const view: ResolveState = state.kind !== 'idle' && state.query !== trimmed ? { kind: 'idle' } : state;

  async function check() {
    setState({ kind: 'loading', query: trimmed });
    const match = await matchGbifSpecies(trimmed);
    setState(
      match
        ? { kind: 'match', query: trimmed, summary: summarizeGbifMatch(trimmed, match) }
        : { kind: 'none', query: trimmed },
    );
  }

  const palette = isDark
    ? {
        muted: '#67766A',
        text: '#F2F6EF',
        subtle: '#9BAA98',
        accent: '#C7F24A',
        accentText: '#0E140F',
        cardBg: '#19231B',
        border: 'rgba(255,255,255,.09)',
        link: '#9BAA98',
      }
    : {
        muted: '#9AA294',
        text: '#23302A',
        subtle: '#6B7568',
        accent: '#3C7140',
        accentText: '#FFFFFF',
        cardBg: '#EBF1E7',
        border: '#E7E0D2',
        link: '#6B7568',
      };

  return (
    <div style={{ marginTop: -6, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {view.kind !== 'match' && (
        <button
          type="button"
          className={isDark ? 'b-tap' : 'a-tap'}
          onClick={() => void check()}
          disabled={!canCheck || view.kind === 'loading'}
          style={{
            alignSelf: 'flex-start',
            border: `1px solid ${palette.border}`,
            background: 'transparent',
            color: canCheck ? palette.subtle : palette.muted,
            borderRadius: 10,
            padding: '8px 12px',
            fontFamily: 'inherit',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: canCheck && view.kind !== 'loading' ? 'pointer' : 'default',
          }}
        >
          {view.kind === 'loading' ? 'Checking GBIF…' : 'Verify name with GBIF'}
        </button>
      )}

      {view.kind === 'none' && (
        <p style={{ margin: 0, fontSize: 12, color: palette.muted, lineHeight: 1.5 }}>
          No match in the GBIF backbone. You can keep the name as typed.
        </p>
      )}

      {view.kind === 'match' && (
        <div
          style={{
            border: `1px solid ${palette.border}`,
            background: palette.cardBg,
            borderRadius: 12,
            padding: '11px 13px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: palette.muted }}>
            {view.summary.headline}
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 600, fontStyle: 'italic', color: palette.text }}>
            {view.summary.canonicalName}
          </span>
          {view.summary.differsFromQuery ? (
            <button
              type="button"
              className={isDark ? 'b-tap' : 'a-tap'}
              onClick={() => onAdopt(view.summary.canonicalName)}
              style={{
                alignSelf: 'flex-start',
                marginTop: 2,
                border: 'none',
                background: palette.accent,
                color: palette.accentText,
                borderRadius: 9,
                padding: '7px 12px',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Use this name
            </button>
          ) : (
            <span style={{ fontSize: 12, color: palette.subtle }}>✓ Matches the GBIF backbone name.</span>
          )}
          {GBIF && (
            <a
              href={GBIF.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 10.5, color: palette.link, marginTop: 1 }}
            >
              {GBIF.attribution}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
