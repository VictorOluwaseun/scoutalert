import { Module } from "@nestjs/common";
import { createPostgresClient } from "@repo/adapters/database";
import {
  GreenhouseSourceConnector,
  FreelancerSourceConnector,
  FreelancerAvailabilitySource,
  SourceConnectorRouter,
  AvailabilitySourceRouter,
  PostgresRelevanceFeedbackRepository,
  PostgresEmployerEvidenceRepository,
  OpenAIEmployerResearchProvider,
  GreenhouseAvailabilitySource,
  PostgresAvailabilityRepository,
  OpenAIIntelligenceProvider,
  createIntelligenceClient,
  PostgresIntelligenceRepository,
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresDiscoveryIntentRepository,
} from "@repo/adapters/scouting";
import {
  createSmtpClient,
  SmtpEmailProvider,
  PostgresOpportunityDeliveryRepository,
} from "@repo/adapters/notifications";
import { DeliverOpportunityDigests } from "@repo/core/notifications";
import {
  RefreshSource,
  ResearchAvailability,
  ScoutOpportunities,
  EvaluateCandidates,
} from "@repo/core/scouting";
import { Client, Connection } from "@temporalio/client";
import {
  employerPolicyPages,
  greenhouseBoards,
  readWorkerConfiguration,
} from "../config.js";
import { ScoutingActivityHost } from "../activities/scouting-activities.js";
import { DiscoveryOutboxRelay } from "../dispatch/outbox-relay.js";

export const WORKER_RESOURCES = Symbol("WORKER_RESOURCES");

/** Composes native clients once; activities and use cases only receive inward contracts. */
@Module({
  providers: [
    {
      provide: WORKER_RESOURCES,
      useFactory: async () => {
        const config = readWorkerConfiguration();
        const connection = await Connection.connect({
          address: config.TEMPORAL_ADDRESS,
        });
        const temporal = new Client({
          connection,
          namespace: config.TEMPORAL_NAMESPACE,
        });
        const db = createPostgresClient(
          config.DATABASE_URL,
          "scoutalert-worker",
        );
        const smtp = createSmtpClient({
          host: config.MAILPIT_HOST,
          port: config.MAILPIT_SMTP_PORT,
          secure: false,
        });
        const records = new PostgresScoutingRepository(db);
        const greenhouse = new GreenhouseSourceConnector(greenhouseBoards);
        const greenhouseAvailability = new GreenhouseAvailabilitySource(
          greenhouseBoards,
        );
        const refresh = new RefreshSource(
          new PostgresSourceRepository(db),
          new SourceConnectorRouter({
            ...Object.fromEntries(
              Object.keys(greenhouseBoards).map((source) => [
                source,
                greenhouse,
              ]),
            ),
            freelancer: new FreelancerSourceConnector(),
          }),
        );
        const evaluator =
          config.SCOUT_AI_ENABLED === "true"
            ? new EvaluateCandidates(
                new PostgresIntelligenceRepository(
                  db,
                  config.SCOUT_AI_DAILY_REQUESTS,
                  Math.floor(config.SCOUT_AI_DAILY_USD * 1_000_000),
                ),
                new OpenAIIntelligenceProvider(
                  createIntelligenceClient(config.OPENAI_API_KEY!),
                  config.SCOUT_AI_EXTRACTION_MODEL,
                  config.SCOUT_AI_FIT_MODEL,
                ),
                new OpenAIEmployerResearchProvider(
                  createIntelligenceClient(config.OPENAI_API_KEY!),
                  config.SCOUT_AI_EXTRACTION_MODEL,
                  new PostgresEmployerEvidenceRepository(
                    db,
                    employerPolicyPages,
                  ),
                  "employer-pages-2026-10-01",
                ),
              )
            : undefined;
        const matching = new ScoutOpportunities(
          records,
          evaluator,
          new PostgresRelevanceFeedbackRepository(db),
        );
        const delivery = new DeliverOpportunityDigests(
          new PostgresOpportunityDeliveryRepository(db),
          new SmtpEmailProvider(smtp, {
            address: config.EMAIL_FROM_ADDRESS,
            name: config.EMAIL_FROM_NAME,
          }),
        );
        return {
          config,
          db,
          smtp,
          connection,
          temporal,
          activities: new ScoutingActivityHost(
            refresh,
            matching,
            records,
            delivery,
            new ResearchAvailability(
              new PostgresAvailabilityRepository(db),
              new AvailabilitySourceRouter({
                ...Object.fromEntries(
                  Object.keys(greenhouseBoards).map((source) => [
                    source,
                    greenhouseAvailability,
                  ]),
                ),
                freelancer: new FreelancerAvailabilitySource(),
              }),
            ),
          ),
          relay: new DiscoveryOutboxRelay(
            new PostgresDiscoveryIntentRepository(db),
            temporal,
          ),
        };
      },
    },
  ],
})
export class WorkerModule {}

export type WorkerResources = {
  config: ReturnType<typeof readWorkerConfiguration>;
  db: ReturnType<typeof createPostgresClient>;
  smtp: ReturnType<typeof createSmtpClient>;
  connection: Connection;
  temporal: Client;
  activities: ScoutingActivityHost;
  relay: DiscoveryOutboxRelay;
};
