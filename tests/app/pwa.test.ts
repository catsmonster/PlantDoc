import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
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
});
