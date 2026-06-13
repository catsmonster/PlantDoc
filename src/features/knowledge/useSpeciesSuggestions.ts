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
  const [remote, setRemote] = useState<SpeciesSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldQueryRemote(query, local)) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void searchGbifVernacular(query, (input, init) =>
        fetch(input, { ...init, signal: controller.signal }),
      ).then((results) => {
        if (!controller.signal.aborted) {
          setRemote(results);
          setLoading(false);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, local]);

  const suggestions = useMemo(() => mergeSuggestions(local, remote, LIMIT), [local, remote]);
  return { suggestions, loading };
}
