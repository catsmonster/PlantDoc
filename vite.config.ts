/// <reference types="vitest/config" />
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { collectPrecacheUrls, injectPrecacheManifest } from './scripts/pwa-precache';

function plantdocPwaPrecache(): Plugin {
  let config: ResolvedConfig;
  let precacheUrls: string[] = [];

  return {
    name: 'plantdoc-pwa-precache',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      precacheUrls = collectPrecacheUrls(bundle);
    },
    async closeBundle() {
      const serviceWorkerPath = resolve(config.root, config.build.outDir, 'sw.js');
      const source = await readFile(serviceWorkerPath, 'utf8');
      await writeFile(serviceWorkerPath, injectPrecacheManifest(source, precacheUrls));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plantdocPwaPrecache()],
  server: {
    proxy: {
      // /api routes live in the Cloudflare Worker (src/worker.ts), not Vite.
      // Run `npm run dev:worker` alongside `npm run dev` to serve them locally.
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
