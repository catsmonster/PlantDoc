import { Account, Client, Storage, TablesDB } from 'appwrite';

/**
 * Browser-side Appwrite client. Uses only public VITE_ values; the server
 * API key must never be referenced here (enforced by tests/appwrite/env-contract).
 */
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string;

if (!endpoint || !projectId) {
  throw new Error(
    'Missing VITE_APPWRITE_ENDPOINT or VITE_APPWRITE_PROJECT_ID. Copy .env.example to .env.',
  );
}

export const client = new Client().setEndpoint(endpoint).setProject(projectId);
export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);

export const DATABASE_ID = 'plantdoc_main';
export const PRIVATE_IMAGES_BUCKET = 'plant-private-images';
