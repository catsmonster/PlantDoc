import { describe, expect, it } from 'vitest';
import { collectPrecacheUrls, injectPrecacheManifest } from '../../scripts/pwa-precache';

describe('PWA precache build helpers', () => {
  it('collects hashed Vite assets for service worker install-time caching', () => {
    expect(
      collectPrecacheUrls({
        'assets/index-abc123.js': { fileName: 'assets/index-abc123.js' },
        'assets/index-def456.css': { fileName: 'assets/index-def456.css' },
        'icons/icon-192.png': { fileName: 'icons/icon-192.png' },
      }),
    ).toEqual(['/assets/index-abc123.js', '/assets/index-def456.css']);
  });

  it('injects the precache URL list into the service worker source', () => {
    expect(
      injectPrecacheManifest(
        [
          'const BUILD_ASSETS = Array.isArray(self.__PLANTDOC_PRECACHE_URLS__)',
          '  ? self.__PLANTDOC_PRECACHE_URLS__',
          '  : [];',
        ].join('\n'),
        ['/assets/index-abc123.js', '/assets/index-def456.css'],
      ),
    ).toBe(
      [
        'const BUILD_ASSETS = Array.isArray(["/assets/index-abc123.js","/assets/index-def456.css"])',
        '  ? ["/assets/index-abc123.js","/assets/index-def456.css"]',
        '  : [];',
      ].join('\n'),
    );
  });
});
