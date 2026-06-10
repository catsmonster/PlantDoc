import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppwriteEnv } from '../../scripts/appwrite/env';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('appwrite env contract', () => {
  it('resolves VITE_-prefixed public vars with non-VITE precedence', () => {
    const env = resolveAppwriteEnv({
      VITE_APPWRITE_PROJECT_ID: 'p1',
      VITE_APPWRITE_ENDPOINT: 'https://x/v1',
      APPWRITE_API_KEY: 'k',
      APPWRITE_PROJECT_ID: 'override',
    });
    expect(env.projectId).toBe('override');
    expect(env.endpoint).toBe('https://x/v1');
    expect(env.apiKey).toBe('k');
  });

  it('rejects a VITE_-prefixed API key', () => {
    expect(() =>
      resolveAppwriteEnv({
        VITE_APPWRITE_PROJECT_ID: 'p',
        VITE_APPWRITE_ENDPOINT: 'https://x/v1',
        APPWRITE_API_KEY: 'k',
        VITE_APPWRITE_API_KEY: 'leaked',
      }),
    ).toThrow(/VITE_APPWRITE_API_KEY/);
  });

  it('throws a clear error listing missing variables, never values', () => {
    expect(() => resolveAppwriteEnv({})).toThrow(/APPWRITE_PROJECT_ID/);
    expect(() => resolveAppwriteEnv({})).toThrow(/APPWRITE_API_KEY/);
  });

  it('no src/ file references APPWRITE_API_KEY', () => {
    for (const file of walk('src')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/APPWRITE_API_KEY/);
    }
  });

  it('.env.example documents the contract without a VITE_ api key', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const key of [
      'VITE_APPWRITE_PROJECT_ID',
      'VITE_APPWRITE_ENDPOINT',
      'APPWRITE_API_KEY',
    ]) {
      expect(example).toContain(key);
    }
    expect(example).not.toMatch(/VITE_APPWRITE_API_KEY/);
  });
});
