import { createPostgresClient, migrateDatabase } from '@repo/adapters/database';
import { loadLocalEnvironment } from '../config/environment.js';
import { readIdentityConfiguration } from '../config/identity.configuration.js';

/** Runs explicit versioned migrations before deployment; API startup never silently changes schemas. */
async function migrate(): Promise<void> {
  loadLocalEnvironment();
  const db = createPostgresClient(readIdentityConfiguration().DATABASE_URL);
  try {
    await migrateDatabase(db);
    console.info('ScoutAlert migrations completed.');
  } finally {
    await db.destroy();
  }
}
await migrate();
