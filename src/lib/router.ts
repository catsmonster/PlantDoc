/**
 * Pure URL <-> view mapping for the signed-in app. The app navigates with the
 * History API (clean paths, no hash) — wrangler's `not_found_handling:
 * "single-page-application"` serves index.html for these paths on refresh, so
 * deep links survive a reload in production.
 *
 * Kept framework-free and side-effect-free so it can be unit-tested in the
 * node test environment. The React wiring lives in features/router/useRouter.
 */

export type Route =
  | { name: 'plants' }
  | { name: 'add-plant' }
  | { name: 'plant'; plantId: string }
  | { name: 'edit-plant'; plantId: string }
  | { name: 'locations' };

/** Path segment that marks the add-plant form, reserved so it can never be
 * read as a plant id. */
const NEW_PLANT_SEGMENT = 'new';

function segments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/** Map a URL pathname to a route. Unknown paths fall back to the dashboard so a
 * stale or hand-edited URL always lands somewhere valid. */
export function parseRoute(pathname: string): Route {
  const parts = segments(pathname);

  if (parts.length === 0) return { name: 'plants' };

  if (parts.length === 1 && parts[0] === 'locations') return { name: 'locations' };

  if (parts[0] === 'plants') {
    if (parts.length === 2 && parts[1] === NEW_PLANT_SEGMENT) return { name: 'add-plant' };
    if (parts.length === 2) return { name: 'plant', plantId: decodeURIComponent(parts[1]) };
    if (parts.length === 3 && parts[2] === 'edit') {
      return { name: 'edit-plant', plantId: decodeURIComponent(parts[1]) };
    }
  }

  return { name: 'plants' };
}

/** Canonical pathname for a route — the inverse of `parseRoute`. */
export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'plants':
      return '/';
    case 'add-plant':
      return `/plants/${NEW_PLANT_SEGMENT}`;
    case 'plant':
      return `/plants/${encodeURIComponent(route.plantId)}`;
    case 'edit-plant':
      return `/plants/${encodeURIComponent(route.plantId)}/edit`;
    case 'locations':
      return '/locations';
  }
}
