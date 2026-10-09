import { createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "@repo/adapters/onboarding";
import {
  ActivateScout,
  ReviewSearchDraft,
  type SearchDraft,
} from "@repo/core/onboarding";
import {
  PostgresWebDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresSourceMonitoringRepository,
  parseFeedDocument,
  PostgresWebDiscoveryCatalogRepository,
} from "@repo/adapters/discovery";
import {
  DiscoverWeb,
  LearnSourceMonitoring,
  MonitorSources,
  ReviewDiscoveryLeads,
  LeadReviewProvider,
  planDiscovery,
  type LeadReviewInput,
  type LeadReviewResult,
  type SourceDocumentResult,
  type DiscoveryLimits,
  type SearchCapability,
  type WebSearchQuery,
} from "@repo/core/discovery";
import type { ScoutRunRequest } from "@repo/core/scouting";
import { demandReview, reviewUsage } from "./fixtures/lead-review.js";

const enabled = process.env.WEB_DISCOVERY_INTEGRATION === "1";
const origin = "https://feeds.example.org";
const feedUrl = `${origin}/feed`;
const brief: SearchDraft = {
  goal: "Find design jobs",
  category: "employment",
  target: "Product designer",
  name: "Design scout",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Lagos",
  workLocations: "Remote worldwide",
  background: "Product design",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const capability: SearchCapability = {
  id: "fixture",
  configuration: "feed-v1",
  access: "public_index",
  language: "en",
  country: null,
  requestCostMicros: 0,
};
const limits: DiscoveryLimits = {
  dailySearchRequests: 20,
  dailySearchMicros: 1000,
  dailyDocumentRequests: 100,
  maximumConcurrentSearches: 2,
  maximumDocuments: 3,
};

/** Cited detail-page fixture; receiving a feed here is a regression that wastes model admission. */
class DetailReview extends LeadReviewProvider {
  readonly configuration = "feed-fixture-v1";
  calls = 0;
  /** Explicitly fails if deterministic collection recognition sends feed content to a model. */
  async review(inputs: LeadReviewInput[]): Promise<LeadReviewResult> {
    if (inputs.some((input) => input.collection)) {
      throw new Error("feed_must_not_use_model");
    }
    this.calls++;
    return {
      usage: reviewUsage,
      reviews: inputs.map((input) => ({
        id: input.id,
        review: {
          ...demandReview(input),
          label: input.url === `${origin}/board` ? "directory" : "job_opening",
        },
      })),
    };
  }
}

/** Mirrors persisted public URL identity without introducing private account data. */
function identity(url: string): string {
  return createHash("sha256").update(JSON.stringify(url)).digest("hex");
}

describe.skipIf(!enabled)(
  "durable feed discovery and shared monitoring",
  () => {
    const schema = `feed_discovery_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let created = false;
    let records: PostgresWebDiscoveryRepository;
    let reviews: ReviewDiscoveryLeads;
    let registry: PostgresSourceMonitoringRepository;
    let learning: LearnSourceMonitoring;
    const provider = new DetailReview();
    const fetched: string[] = [];
    const searched: WebSearchQuery[] = [];
    let changed = false;
    let first: ScoutRunRequest;
    let second: ScoutRunRequest;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(
        process.env.FEED_TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
      );
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      created = true;
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      records = new PostgresWebDiscoveryRepository(db);
      reviews = new ReviewDiscoveryLeads(
        new PostgresLeadReviewRepository(db, 100, 10_000_000),
        provider,
      );
      registry = new PostgresSourceMonitoringRepository(db);
      learning = new LearnSourceMonitoring(registry);
    });
    afterAll(async () => {
      await db?.destroy();
      if (created && admin && /^feed_discovery_[a-f0-9]{32}$/u.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }
      await admin?.destroy();
    });

    /** Creates one isolated verified scout; no real accounts, providers or SMTP transports are used. */
    async function fixture(): Promise<ScoutRunRequest> {
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const activation = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      const scout = await activation.execute(ownerId, "synthetic", {
        key: randomUUID(),
        search: brief,
        confirmed: true,
        alerts: {
          frequency: "dashboard",
          timezone: "UTC",
          deliveryTime: "08:00",
          weekday: "Monday",
          promptAlerts: false,
          consent: false,
          consentVersion: "opportunity-alerts-v1",
        },
      });
      const request = {
        ownerId,
        scoutId: scout.id,
        version: 1,
        runId: randomUUID(),
      };
      const plan = planDiscovery(brief, 1, 3, capability, true, {
        maximumDepth: 3,
        maximumRounds: 6,
        maximumSourcePages: 2,
      });
      plan.policy = "public-intent-v3";
      plan.queries = plan.queries.slice(0, 1);
      plan.exploration!.maximumSearches = 1;
      await records.open(request, plan, capability);
      return request;
    }

    /** Supplies parsed feed structure and separate detail evidence; changed feed entries never inherit approval. */
    async function read(url: string): Promise<SourceDocumentResult> {
      fetched.push(url);
      const base: SourceDocumentResult = {
        kind: "document",
        url,
        checkedAt: new Date().toISOString(),
        status: "fetched",
        reason: null,
        posting: null,
        hostDelaySeconds: 2,
        text: "Product designer. Permanent remote employment. Apply through this page.",
        fingerprint: url,
      };
      if (url === feedUrl) {
        const items = ["42", ...(changed ? ["43"] : [])]
          .map(
            (id) =>
              `<item><title>Product designer needed</title><link>${origin}/jobs/${id}</link></item>`,
          )
          .join("");
        return {
          ...base,
          ...parseFeedDocument(
            `<rss version="2.0"><channel><title>Design roles</title>${items}</channel></rss>`,
            url,
          ),
        };
      }
      return url === `${origin}/board`
        ? { ...base, feeds: [{ url: feedUrl, text: "Design roles feed" }] }
        : base;
    }

    /** Runs finite discovery with current-scout checks and public reuse; only fixture host timing is advanced. */
    async function discover(request: ScoutRunRequest): Promise<void> {
      const discovery = new DiscoverWeb(
        records,
        { read },
        {
          capability,
          search: async (query) => {
            searched.push(query);
            return {
              kind: "search",
              checkedAt: new Date().toISOString(),
              completeness: "window",
              nextPage: null,
              observations: [
                {
                  url: `${origin}/board`,
                  title: "Product designer jobs",
                  snippet: "Remote hiring",
                  rank: 1,
                },
              ],
            };
          },
        },
        limits,
        undefined,
        reviews,
      );
      for (let step = 0; step < 40; step++) {
        await sql`UPDATE web_discovery_hosts SET next_allowed_at=now()`.execute(
          db,
        );
        const status = await discovery.execute(request);
        if (status === "done") {
          await review(request);
          await learning.execute(request);
          return;
        }
      }
      throw new Error("fixture_discovery_did_not_settle");
    }

    /** Finishes bounded review work without a provider call for feed directories. */
    async function review(request: ScoutRunRequest): Promise<void> {
      for (let step = 0; step < 8; step++) {
        if ((await reviews.execute(request)) === "done") {
          return;
        }
      }
      throw new Error("fixture_review_did_not_settle");
    }

    it("discovers a listing through a feed, preserves parents, and reuses all public work for a second owner", async () => {
      first = await fixture();
      await discover(first);
      second = await fixture();
      await discover(second);
      expect(searched).toHaveLength(1);
      expect(fetched).toEqual([
        `${origin}/board`,
        feedUrl,
        `${origin}/jobs/42`,
      ]);
      expect(provider.calls).toBe(2); // Board and detail only; feed structure costs no model request.
      const decisions = await sql<{
        parent: string;
        child: string;
      }>`SELECT p.input->>'url' AS parent,d.action->>'url' AS child FROM web_discovery_decisions d JOIN web_discovery_operations p ON p.key=d.parent_key WHERE d.case_id=${first.runId}::uuid AND d.action->>'kind'='document' ORDER BY d.round`.execute(
        db,
      );
      expect(decisions.rows).toContainEqual({
        parent: `${origin}/board`,
        child: feedUrl,
      });
      expect(decisions.rows).toContainEqual({
        parent: feedUrl,
        child: `${origin}/jobs/42`,
      });
      const feed = await sql<{
        posting_id: string | null;
        label: string;
        attempts: number;
      }>`SELECT l.posting_id,r.result->>'label' AS label,r.attempts FROM web_discovery_leads l JOIN web_lead_reviews r ON r.key=l.review_key WHERE l.url=${feedUrl}`.execute(
        db,
      );
      expect(feed.rows).toEqual([
        { posting_id: null, label: "directory", attempts: 0 },
      ]);
      const subscriptions = await sql<{
        owners: number;
      }>`SELECT count(DISTINCT owner_id)::int AS owners FROM web_source_interests WHERE monitor_id=${identity(feedUrl)}`.execute(
        db,
      );
      expect(subscriptions.rows[0]?.owners).toBe(2);
      const outsider = await new PostgresWebDiscoveryCatalogRepository(db).read(
        randomUUID(),
      );
      expect(outsider.leads).toEqual([]);
      const usage = await sql<{
        requests: number;
      }>`SELECT requests FROM intelligence_daily_budget`.execute(db);
      expect(usage.rows[0]?.requests).toBe(2);
    }, 30_000);

    it("shares one changed-feed read, learns its new entry without AI, and does not publish that entry before source review", async () => {
      changed = true;
      await sql`UPDATE web_discovery_cases SET started_at=now()-interval '10 minutes'`.execute(
        db,
      );
      await sql`UPDATE scouts SET monitoring_requested_at=now()-interval '10 minutes'`.execute(
        db,
      );
      await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
      await sql`UPDATE web_source_monitors SET next_check_at=now()+interval '1 day'`.execute(
        db,
      );
      await sql`UPDATE web_source_monitors SET next_check_at=now()-interval '1 minute' WHERE id=${identity(feedUrl)}`.execute(
        db,
      );
      await sql`UPDATE web_discovery_hosts SET next_allowed_at=now()`.execute(
        db,
      );
      // Seed the next synthetic window; actual admission, leasing and receipt handling still run through the repository.
      const key = randomUUID();
      await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},'public-documents','document',${JSON.stringify({ kind: "document", url: feedUrl })}::jsonb)`.execute(
        db,
      );
      await sql`UPDATE web_source_monitors SET pending_key=${key} WHERE id=${identity(feedUrl)}`.execute(
        db,
      );
      const monitoring = new MonitorSources(
        registry,
        records,
        { read },
        100,
        2,
      );
      await monitoring.execute();
      await monitoring.execute();
      const runs =
        await sql<ScoutRunRequest>`SELECT id AS "runId",owner_id AS "ownerId",scout_id AS "scoutId",scout_version AS version FROM web_discovery_cases WHERE plan->>'origin'='source_monitor'`.execute(
          db,
        );
      expect(runs.rows).toHaveLength(2);
      for (const run of runs.rows) {
        await review(run);
        await learning.execute(run);
      }
      expect(fetched.filter((url) => url === feedUrl)).toHaveLength(2);
      expect(provider.calls).toBe(2);
      const child = await sql<{
        kind: string;
        posting_id: string | null;
      }>`SELECT m.kind,l.posting_id FROM web_source_monitors m JOIN web_discovery_leads l ON l.id=m.id WHERE m.url=${`${origin}/jobs/43`}`.execute(
        db,
      );
      expect(child.rows).toEqual([{ kind: "probe", posting_id: null }]);
      const owners = await sql<{
        count: number;
      }>`SELECT count(*)::int AS count FROM web_source_interests WHERE monitor_id=${identity(`${origin}/jobs/43`)}`.execute(
        db,
      );
      expect(owners.rows[0]?.count).toBe(2);
    }, 30_000);
  },
);
