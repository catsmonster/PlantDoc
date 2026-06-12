const PRECACHE_PLACEHOLDER = 'self.__PLANTDOC_PRECACHE_URLS__';

interface BundleEntry {
  fileName?: string;
}

export function collectPrecacheUrls(bundle: Record<string, BundleEntry>): string[] {
  return Object.values(bundle)
    .map((entry) => entry.fileName)
    .filter((fileName): fileName is string => typeof fileName === 'string')
    .filter((fileName) => fileName.startsWith('assets/'))
    .map((fileName) => `/${fileName.replaceAll('\\', '/')}`)
    .sort();
}

export function injectPrecacheManifest(source: string, urls: string[]): string {
  if (!source.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error(`Service worker is missing ${PRECACHE_PLACEHOLDER}.`);
  }

  return source.replaceAll(PRECACHE_PLACEHOLDER, JSON.stringify(urls));
}
