import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

interface RuntimeRequest {
  method: string;
  mode?: string;
  url: string;
}

interface FetchDispatchResult {
  response?: Promise<Response | undefined>;
  responded: boolean;
}

interface ServiceWorkerTestContext {
  dispatchFetch(request: RuntimeRequest): FetchDispatchResult;
  isRuntimeCacheableRequest(request: RuntimeRequest): boolean;
  isShellNavigationRequest(request: RuntimeRequest): boolean;
  isShellResponse(response: Response): boolean;
  isStorableResponse(response: Response): boolean;
}

function loadServiceWorker(): ServiceWorkerTestContext {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const context = createContext({
    URL,
    Response,
    caches: {
      match: () => Promise.resolve(new Response('<!doctype html>')),
    },
    fetch: () => Promise.reject(new Error('offline')),
    self: {
      clients: { claim: () => Promise.resolve() },
      location: { origin: 'https://plantdoc.test' },
      skipWaiting: () => Promise.resolve(),
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
    },
  });
  new Script(readText('public/sw.js')).runInContext(context);
  return Object.assign(context, {
    dispatchFetch(request: RuntimeRequest): FetchDispatchResult {
      let responded = false;
      let response: Promise<Response | undefined> | undefined;
      const event = {
        request,
        respondWith(nextResponse: Promise<Response | undefined>) {
          responded = true;
          response = nextResponse;
        },
      };
      for (const listener of listeners.get('fetch') ?? []) {
        listener(event);
      }
      return { responded, response };
    },
  }) as unknown as ServiceWorkerTestContext;
}

describe('PWA install surface', () => {
  it('links the web app manifest and mobile install metadata from the document head', () => {
    const html = readText('index.html');

    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-192.png" />');
  });

  it('provides an installable manifest with standalone display and required icon sizes', () => {
    const manifestPath = join(root, 'public', 'manifest.webmanifest');

    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      theme_color?: string;
      background_color?: string;
      icons?: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    expect(manifest.name).toBe('PlantDoc');
    expect(manifest.short_name).toBe('PlantDoc');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }),
      ]),
    );
    expect(manifest.icons?.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);
  });

  it('ships and registers a service worker with navigation fallback support', () => {
    const main = readText('src/main.tsx');
    const workerPath = join(root, 'public', 'sw.js');

    expect(main).toContain('registerServiceWorker');
    expect(existsSync(workerPath)).toBe(true);

    const worker = readFileSync(workerPath, 'utf8');
    expect(worker).toContain("self.addEventListener('install'");
    expect(worker).toContain("self.addEventListener('fetch'");
    expect(worker).toContain("event.request.mode === 'navigate'");
  });

  it('only runtime-caches static same-origin assets and never API requests', () => {
    const serviceWorker = loadServiceWorker();

    expect(
      serviceWorker.isRuntimeCacheableRequest({
        method: 'GET',
        url: 'https://plantdoc.test/assets/index.js',
      }),
    ).toBe(true);
    expect(
      serviceWorker.isRuntimeCacheableRequest({
        method: 'GET',
        url: 'https://plantdoc.test/icons/icon-192.png',
      }),
    ).toBe(true);
    expect(
      serviceWorker.isRuntimeCacheableRequest({
        method: 'GET',
        url: 'https://plantdoc.test/api/profile',
      }),
    ).toBe(false);
    expect(
      serviceWorker.isRuntimeCacheableRequest({
        method: 'GET',
        url: 'https://other.test/assets/index.js',
      }),
    ).toBe(false);
    expect(
      serviceWorker.isRuntimeCacheableRequest({
        method: 'POST',
        url: 'https://plantdoc.test/assets/index.js',
      }),
    ).toBe(false);
  });

  it('does not store no-store responses and refreshes the cached shell after navigation', () => {
    const serviceWorker = loadServiceWorker();
    const worker = readText('public/sw.js');

    expect(
      serviceWorker.isStorableResponse(
        new Response('private', { headers: { 'Cache-Control': 'no-store' } }),
      ),
    ).toBe(false);
    expect(serviceWorker.isStorableResponse(new Response('ok'))).toBe(true);
    expect(worker).toContain("cache.put('/', copy)");
  });

  it('refreshes the cached shell only for same-origin HTML navigations outside API routes', () => {
    const serviceWorker = loadServiceWorker();

    expect(
      serviceWorker.isShellNavigationRequest({
        method: 'GET',
        url: 'https://plantdoc.test/plants',
      }),
    ).toBe(true);
    expect(
      serviceWorker.isShellNavigationRequest({
        method: 'GET',
        url: 'https://plantdoc.test/api/profile',
      }),
    ).toBe(false);
    expect(
      serviceWorker.isShellNavigationRequest({
        method: 'GET',
        url: 'https://other.test/plants',
      }),
    ).toBe(false);

    expect(
      serviceWorker.isShellResponse(
        new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    ).toBe(true);
    expect(
      serviceWorker.isShellResponse(
        new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }),
      ),
    ).toBe(false);
  });

  it('does not intercept API navigations with the app shell fallback', () => {
    const serviceWorker = loadServiceWorker();

    expect(
      serviceWorker.dispatchFetch({
        method: 'GET',
        mode: 'navigate',
        url: 'https://plantdoc.test/plants',
      }).responded,
    ).toBe(true);
    expect(
      serviceWorker.dispatchFetch({
        method: 'GET',
        mode: 'navigate',
        url: 'https://plantdoc.test/api/profile',
      }).responded,
    ).toBe(false);
  });
});
