import { useCallback, useEffect, useState } from 'react';
import { parseRoute, routeToPath, type Route } from '../../lib/router';

export interface Router {
  route: Route;
  /** Push (default) or replace the URL and switch the active screen. */
  navigate: (next: Route, options?: { replace?: boolean }) => void;
}

/**
 * Drives the signed-in app from the URL. The browser/Android back button works
 * because every `navigate` pushes a History entry and `popstate` re-derives the
 * route from the URL. Deep links and refreshes work because the route is parsed
 * from `location.pathname` on mount (and SPA fallback serves index.html).
 */
export function useRouter(): Router {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback<Router['navigate']>((next, options) => {
    const path = routeToPath(next);
    if (path !== window.location.pathname) {
      if (options?.replace) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
    }
    setRoute(next);
  }, []);

  return { route, navigate };
}
