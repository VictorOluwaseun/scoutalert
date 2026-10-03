import * as discoveryPerformance from "./migrations/20261003-yield-scheduling.js";
import * as monitorExpansionWindow from "./migrations/20261002-source-monitor-expansion-window.js";
import * as xDiscovery from "./migrations/20261002-x-discovery.js";
import * as xContext from "./migrations/20261003-x-context.js";
import * as sourceMonitoring from "./migrations/20261002-continuous-source-monitoring.js";
import * as strategyReasoning from "./migrations/20261001-worldwide-strategy-reasoning.js";
import * as reviewStatus from "./migrations/20261001-worldwide-review-status.js";
import * as sourceExploration from "./migrations/20261001-worldwide-source-exploration.js";
import * as windowedDiscovery from "./migrations/20261001-windowed-discovery.js";
import * as webDiscovery from "./migrations/20261001-worldwide-discovery.js";
import * as leadIntelligence from "./migrations/20261001-worldwide-lead-intelligence.js";
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
        "20261002-x-discovery": xDiscovery,
        "20261003-x-context": xContext,
        "20261003-yield-scheduling": discoveryPerformance,
        "20261002-continuous-source-monitoring": sourceMonitoring,
        "20261002-source-monitor-expansion-window": monitorExpansionWindow,
        "20260930-identity-and-activation": initial,
        "20261001-live-scouting": scouting,
        "20261001-recipient-scan": deliveryCursor,
        "20261001-scout-intelligence": intelligence,
        "20261001-targeted-research": research,
        "20261001-user-controls": controls,
        "20261001-verified-research": verifiedResearch,
        "20261001-windowed-discovery": windowedDiscovery,
        "20261001-worldwide-discovery": webDiscovery,
        "20261001-worldwide-lead-intelligence": leadIntelligence,
        "20261001-worldwide-review-status": reviewStatus,
        "20261001-worldwide-source-exploration": sourceExploration,
        "20261001-worldwide-strategy-reasoning": strategyReasoning,
      }),
    },
  });
  const result = await migrator.migrateToLatest();

  if (result.error) {
    throw new Error("ScoutAlert database migration failed.", {
      cause: result.error,
    });
  }
}
