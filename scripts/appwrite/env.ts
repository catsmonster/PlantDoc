/**
 * Appwrite admin script environment contract.
 *
 * Public client values (project id, name, endpoint) live in .env with VITE_
 * prefixes so the browser SDK can use them later; non-VITE_ variants take
 * precedence when both exist. The API key is server-only and must never be
 * VITE_-prefixed. Error messages name variables but never print values.
 */

export interface AppwriteEnv {
  projectId: string;
  projectName: string;
  endpoint: string;
  apiKey: string;
}

type EnvSource = Record<string, string | undefined>;

function pick(source: EnvSource, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return undefined;
}

export function resolveAppwriteEnv(source: EnvSource): AppwriteEnv {
  if (source.VITE_APPWRITE_API_KEY !== undefined) {
    throw new Error(
      'VITE_APPWRITE_API_KEY is set. The Appwrite API key is a server secret and must ' +
        'never carry a VITE_ prefix (Vite would bundle it into browser code). ' +
        'Rename it to APPWRITE_API_KEY and remove the VITE_ variant.',
    );
  }

  const projectId = pick(source, 'APPWRITE_PROJECT_ID', 'VITE_APPWRITE_PROJECT_ID');
  const projectName = pick(source, 'APPWRITE_PROJECT_NAME', 'VITE_APPWRITE_PROJECT_NAME');
  const endpoint = pick(source, 'APPWRITE_ENDPOINT', 'VITE_APPWRITE_ENDPOINT');
  const apiKey = pick(source, 'APPWRITE_API_KEY');

  const missing: string[] = [];
  if (!projectId) missing.push('APPWRITE_PROJECT_ID (or VITE_APPWRITE_PROJECT_ID)');
  if (!endpoint) missing.push('APPWRITE_ENDPOINT (or VITE_APPWRITE_ENDPOINT)');
  if (!apiKey) missing.push('APPWRITE_API_KEY');

  if (missing.length > 0 || !projectId || !endpoint || !apiKey) {
    throw new Error(
      `Missing required Appwrite environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values.',
    );
  }

  return { projectId, projectName: projectName ?? 'PlantDoc', endpoint, apiKey };
}

/** Loads .env into process.env (without overriding) and resolves the contract. */
export async function loadAppwriteEnv(): Promise<AppwriteEnv> {
  const { config } = await import('dotenv');
  config({ quiet: true });
  return resolveAppwriteEnv(process.env);
}
