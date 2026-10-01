import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const localEnvironmentPath = new URL('../../.env', import.meta.url);

/** Loads optional API-local settings before composition reads process.env. */
export function loadLocalEnvironment(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (!existsSync(localEnvironmentPath)) return;

  loadEnvFile(localEnvironmentPath);
}
