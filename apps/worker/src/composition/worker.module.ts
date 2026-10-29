import { ImportPrivateMail } from "@repo/core/connections";
import {
  createGmailClient,
  GmailSourceRepository,
  MailSecrets,
  PostgresMailConnectionRepository,
  readGmailConfiguration,
} from "@repo/adapters/connections";
import { Module } from "@nestjs/common";
import {
  createPostgresClient,
  createRedisClient,
} from "@repo/adapters/database";
import {
  PostgresSourceMonitoringRepository,
  PostgresSocialDiscoveryRepository,
  XSocialProvider,
  PostgresDiscoveryReasoningRepository,
  OpenAIDiscoveryReasoningProvider,
  PostgresWebDiscoveryRepository,
  PublicSourceDocumentRepository,
  PublicHttpRepository,
  BrowserDocumentRepository,
  AshbySourceDocumentRepository,
  BlueskySourceDocumentRepository,
  SourceDocumentRouter,
  RedisPublicApiSnapshotRepository,
  SerperSearchProvider,
  PostgresLeadReviewRepository,
  PostgresWebAvailabilitySource,
  OpenAILeadReviewProvider,
} from "@repo/adapters/discovery";
import {
  LearnSourceMonitoring,
  DiscoverSocial,
  MonitorSources,
  DiscoverWeb,
  ReviewDiscoveryLeads,
  PlanScoutSearch,
} from "@repo/core/discovery";
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
  PostgresModelTokenBudgetRepository,
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
        const gmail = readGmailConfiguration(process.env);
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
        const intelligenceClient =
          config.SCOUT_AI_ENABLED === "true"
            ? createIntelligenceClient(config.OPENAI_API_KEY!, {
                repository: new PostgresModelTokenBudgetRepository(
                  db,
                  config.SCOUT_AI_DAILY_TOKENS,
                ),
                maximumOutputTokens: config.SCOUT_AI_MAX_OUTPUT_TOKENS,
              })
            : null;
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
        const webRecords = new PostgresWebDiscoveryRepository(db);
        const redis = config.REDIS_URL
          ? createRedisClient(config.REDIS_URL)
          : null;
        await redis?.connect();
        const http = new PublicHttpRepository();
        const sourceDocuments = new SourceDocumentRouter(
          new PublicSourceDocumentRepository(
            http,
            config.SCOUT_WEB_RENDER_ENABLED === "true"
              ? new BrowserDocumentRepository()
              : null,
          ),
          new AshbySourceDocumentRepository(
            http,
            redis ? new RedisPublicApiSnapshotRepository(redis) : null,
          ),
          new BlueskySourceDocumentRepository(http),
        );
        const monitors = new PostgresSourceMonitoringRepository(
          db,
          config.SCOUT_MONITOR_MAX_SOURCES,
        );
        const monitoringEnabled =
          config.SCOUT_WEB_ENABLED === "true" &&
          config.SCOUT_MONITOR_ENABLED === "true";
        const leadReviews = new ReviewDiscoveryLeads(
          new PostgresLeadReviewRepository(
            db,
            config.SCOUT_AI_DAILY_REQUESTS,
            Math.floor(config.SCOUT_AI_DAILY_USD * 1_000_000),
          ),
          config.SCOUT_AI_ENABLED === "true"
            ? new OpenAILeadReviewProvider(
                intelligenceClient!,
                config.SCOUT_AI_EXTRACTION_MODEL,
              )
            : null,
        );
        const planner =
          config.SCOUT_AI_ENABLED === "true"
            ? new PlanScoutSearch(
                new PostgresDiscoveryReasoningRepository(
                  db,
                  config.SCOUT_AI_DAILY_REQUESTS,
                  Math.floor(config.SCOUT_AI_DAILY_USD * 1_000_000),
                ),
                new OpenAIDiscoveryReasoningProvider(
                  intelligenceClient!,
                  config.SCOUT_AI_EXTRACTION_MODEL,
                ),
              )
            : undefined;
        const evaluator =
          config.SCOUT_AI_ENABLED === "true"
            ? new EvaluateCandidates(
                new PostgresIntelligenceRepository(
                  db,
                  config.SCOUT_AI_DAILY_REQUESTS,
                  Math.floor(config.SCOUT_AI_DAILY_USD * 1_000_000),
                ),
                new OpenAIIntelligenceProvider(
                  intelligenceClient!,
                  config.SCOUT_AI_EXTRACTION_MODEL,
                  config.SCOUT_AI_FIT_MODEL,
                ),
                new OpenAIEmployerResearchProvider(
                  intelligenceClient!,
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
          redis,
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
                "web-discovery": new PostgresWebAvailabilitySource(db),
                "web-client-requests": new PostgresWebAvailabilitySource(db),
              }),
            ),
            new DiscoverWeb(
              webRecords,
              sourceDocuments,
              config.SCOUT_WEB_ENABLED === "true"
                ? new SerperSearchProvider(config.SERPER_API_KEY!, {
                    language: config.SCOUT_WEB_LANGUAGE,
                    country: config.SCOUT_WEB_COUNTRY,
                    requestCostMicros: Math.ceil(
                      config.SCOUT_WEB_REQUEST_USD * 1_000_000,
                    ),
                  })
                : null,
              {
                dailySearchRequests: config.SCOUT_WEB_DAILY_REQUESTS,
                dailySearchMicros: Math.floor(
                  config.SCOUT_WEB_DAILY_USD * 1_000_000,
                ),
                dailyDocumentRequests: config.SCOUT_WEB_DAILY_DOCUMENTS,
                maximumDocuments: config.SCOUT_WEB_MAX_DOCUMENTS,
                exploration: {
                  maximumDepth: config.SCOUT_WEB_MAX_DEPTH,
                  maximumRounds: config.SCOUT_WEB_MAX_ROUNDS,
                  maximumSourcePages: config.SCOUT_WEB_MAX_SOURCE_PAGES,
                },
                maximumConcurrentSearches: config.SCOUT_WEB_CONCURRENCY,
              },
              planner,
              leadReviews,
            ),
            leadReviews,
            monitoringEnabled ? new LearnSourceMonitoring(monitors) : undefined,
            monitoringEnabled
              ? new MonitorSources(
                  monitors,
                  webRecords,
                  sourceDocuments,
                  config.SCOUT_WEB_DAILY_DOCUMENTS,
                  config.SCOUT_WEB_CONCURRENCY,
                )
              : undefined,
            new DiscoverSocial(
              new PostgresSocialDiscoveryRepository(
                db,
                config.SCOUT_AI_ENABLED === "true"
                  ? {
                      dailyRequests: config.SCOUT_AI_DAILY_REQUESTS,
                      dailyMicros: Math.floor(
                        config.SCOUT_AI_DAILY_USD * 1_000_000,
                      ),
                    }
                  : null,
              ),
              config.SCOUT_X_ENABLED === "true"
                ? new XSocialProvider(config.X_BEARER_TOKEN!)
                : null,
              {
                dailyRequests: config.SCOUT_X_DAILY_REQUESTS,
                dailyMicros: Math.floor(config.SCOUT_X_DAILY_USD * 1_000_000),
                postCostMicros: Math.ceil(config.SCOUT_X_POST_USD * 1_000_000),
                pageSize: config.SCOUT_X_PAGE_SIZE,
              },
            ),
          ),
          privateMail: gmail
            ? new ImportPrivateMail(
                new PostgresMailConnectionRepository(
                  db,
                  new MailSecrets(gmail.encryptionKey),
                ),
                new GmailSourceRepository(() => createGmailClient(gmail)),
              )
            : null,
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
  redis: ReturnType<typeof createRedisClient> | null;
  config: ReturnType<typeof readWorkerConfiguration>;
  db: ReturnType<typeof createPostgresClient>;
  smtp: ReturnType<typeof createSmtpClient>;
  connection: Connection;
  temporal: Client;
  activities: ScoutingActivityHost;
  relay: DiscoveryOutboxRelay;
  privateMail: ImportPrivateMail | null;
};
