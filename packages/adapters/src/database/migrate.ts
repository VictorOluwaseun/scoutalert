import * as windowedDiscovery from "./migrations/20261001-windowed-discovery.js";
import * as verifiedResearch from "./migrations/20261001-verified-research.js";
import * as controls from "./migrations/20261001-user-controls.js";
import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import * as research from "./migrations/20261001-targeted-research.js";
import * as intelligence from "./migrations/20261001-scout-intelligence.js";
import * as initial from "./migrations/20260930-identity-and-activation.js";
import * as scouting from "./migrations/20261001-live-scouting.js";
import * as deliveryCursor from "./migrations/20261001-recipient-scan.js";
import type { ScoutAlertDatabase } from "./types/database.js";

/** Runs versioned migrations under Kysely's PostgreSQL migration lock; callers own client lifecycle. */
export async function migrateDatabase(
  db: Kysely<ScoutAlertDatabase>,
  migrationTableSchema?: string,
): Promise<void> {
  const migrator = new Migrator({
    db,
    migrationTableSchema,
    provider: {
      getMigrations: async () => ({
        "20260930-identity-and-activation": initial,
        "20261001-live-scouting": scouting,
        "20261001-recipient-scan": deliveryCursor,
        "20261001-scout-intelligence": intelligence,
        "20261001-targeted-research": research,
        "20261001-user-controls": controls,
        "20261001-verified-research": verifiedResearch,
        "20261001-windowed-discovery": windowedDiscovery,
      }),
    },
  });
  const result = await migrator.migrateToLatest();
  if (result.error)
    throw new Error("ScoutAlert database migration failed.", {
      cause: result.error,
    });
}
