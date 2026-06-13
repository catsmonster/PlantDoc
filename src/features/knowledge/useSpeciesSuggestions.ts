/**
 * Species suggestions for the typeahead: instant local results from the curated
 * pack + bundled index + catalog, plus a debounced, abortable GBIF vernacular
 * fallback fired only on a local miss. All async lives here; the rest is pure.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  mergeSuggestions,
  shouldQueryRemote,
  suggestSpecies,
  type CatalogSpeciesLike,
  type SpeciesSuggestion,
} from '../../lib/knowledge/species-suggest';
import { searchGbifVernacular } from '../../lib/knowledge/gbif';

const DEBOUNCE_MS = 300;
const LIMIT = 6;

export function useSpeciesSuggestions(
  query: string,
  catalog: CatalogSpeciesLike[],
): { suggestions: SpeciesSuggestion[]; loading: boolean } {
  const local = useMemo(() => suggestSpecies(query, catalog), [query, catalog]);
  // GBIF results tagged with the query they were fetched for, so render can tell
  // whether they still apply — no need to sync state back inside the effect.
  const [remote, setRemote] = useState<{ query: string; results: SpeciesSuggestion[] }>({
    query: '',
    results: [],
  });

  const wantRemote = shouldQueryRemote(query, local);

  useEffect(() => {
    if (!shouldQueryRemote(query, local)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchGbifVernacular(query, (input, init) =>
        fetch(input, { ...init, signal: controller.signal }),
      ).then((results) => {
        if (!controller.signal.aborted) setRemote({ query, results });
      });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, local]);

  // The fetched results count only when we still want them and they match the
  // current query; otherwise we're either local-only or waiting (loading).
  const hasFreshRemote = wantRemote && remote.query === query;
  const suggestions = useMemo(
    () => mergeSuggestions(local, hasFreshRemote ? remote.results : [], LIMIT),
    [local, hasFreshRemote, remote.results],
  );
  const loading = wantRemote && !hasFreshRemote;
  return { suggestions, loading };
}
