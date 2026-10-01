import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import {
  createPostgresClient,
  migrateDatabase,
} from "../../packages/adapters/dist/database/public.js";
const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
export const { sql } = await import(require.resolve("kysely"));

/** Runs only in a disposable schema in scoutalert_test; never modifies a user's scouts or sends email. */
export async function withEvaluationDatabase(action) {
  loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/scoutalert_test";
  const schema = `evaluation_${randomUUID().replaceAll("-", "")}`;
  const admin = createPostgresClient(url.toString());
  let db;
  let cleanupPromise;
  /** Serializes cleanup across normal completion and interruption, touching only this generated test schema. */
  function cleanup() {
    cleanupPromise ??= (async () => {
      await db?.destroy();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(admin);
      await admin.destroy();
    })();
    return cleanupPromise;
  }
  /** Allows interrupted paid checks to release their disposable database resources before exiting. */
  function interrupt() {
    void cleanup().finally(() => process.exit(130));
  }
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
    url.searchParams.set("options", `-c search_path=${schema}`);
    db = createPostgresClient(url.toString());
    await migrateDatabase(db, schema);
    return await action(db);
  } finally {
    await cleanup();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
