import { Client, Storage, TablesDB } from 'node-appwrite';
import { loadAppwriteEnv, type AppwriteEnv } from './env';

export interface AdminContext {
  tablesDB: TablesDB;
  storage: Storage;
  env: AppwriteEnv;
}

/** Builds an admin (API-key) context for setup/seed scripts. Server-side only. */
export async function createAdminContext(): Promise<AdminContext> {
  const env = await loadAppwriteEnv();
  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.projectId)
    .setKey(env.apiKey);
  return { tablesDB: new TablesDB(client), storage: new Storage(client), env };
}
