const CACHE_NAME = 'plantdoc-shell-v1';
const BUILD_ASSETS = Array.isArray(self.__PLANTDOC_PRECACHE_URLS__)
  ? self.__PLANTDOC_PRECACHE_URLS__
  : [];
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  ...BUILD_ASSETS,
];
const RUNTIME_CACHE_PATHS = new Set(['/manifest.webmanifest']);
const RUNTIME_CACHE_PREFIXES = ['/assets/', '/icons/'];

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isRuntimeCacheableRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (isApiPath(url.pathname)) return false;

  return (
    RUNTIME_CACHE_PATHS.has(url.pathname) ||
    RUNTIME_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

function isShellNavigationRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  return url.origin === self.location.origin && !isApiPath(url.pathname);
}

function isStorableResponse(response) {
  const cacheControl = response.headers.get('Cache-Control') || '';
  return (
    response.status === 200 &&
    (response.type === 'basic' || response.type === 'default') &&
    !cacheControl.toLowerCase().includes('no-store')
  );
}

function isShellResponse(response) {
  const contentType = response.headers.get('Content-Type') || '';
  return isStorableResponse(response) && contentType.toLowerCase().includes('text/html');
}

function updateShellCache(request, response) {
  if (!isShellNavigationRequest(request) || !isShellResponse(response)) return Promise.resolve();

  const copy = response.clone();
  return caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
}

function updateRuntimeCache(request, response) {
  if (!isStorableResponse(response)) return Promise.resolve();

  const copy = response.clone();
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && isShellNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          event.waitUntil(updateShellCache(event.request, response));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (!isRuntimeCacheableRequest(event.request)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        event.waitUntil(updateRuntimeCache(event.request, response));
        return response;
      });
    }),
  );
});
