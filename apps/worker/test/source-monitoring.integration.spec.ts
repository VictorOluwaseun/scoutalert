import { writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import {
  ActivateScout,
  ReviewSearchDraft,
  type SearchDraft,
} from "@repo/core/onboarding";
import {
  PostgresSourceMonitoringRepository,
  PostgresWebDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresWebDiscoveryCatalogRepository,
  PostgresWebAvailabilitySource,
} from "@repo/adapters/discovery";
import {
  LearnSourceMonitoring,
  MonitorSources,
  ReviewDiscoveryLeads,
  DiscoverWeb,
  LeadReviewProvider,
  nextMonitorCheck,
  type SourceDocumentResult,
  type LeadReviewInput,
  type LeadReviewResult,
} from "@repo/core/discovery";
import {
  EvaluateCandidates,
  ScoutOpportunities,
  ResearchAvailability,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import {
  PostgresIntelligenceRepository,
  PostgresScoutingRepository,
  PostgresOpportunityCatalogRepository,
  PostgresAvailabilityRepository,
} from "@repo/adapters/scouting";
import { DeliverOpportunityDigests } from "@repo/core/notifications";
import {
  PostgresOpportunityDeliveryRepository,
  createSmtpClient,
  SmtpEmailProvider,
} from "@repo/adapters/notifications";
import {
  demandReview,
  reviewUsage,
  FixtureWebFitProvider,
} from "./fixtures/lead-review.js";

const enabled = process.env.WEB_DISCOVERY_INTEGRATION === "1";
const brief: SearchDraft = {
  goal: "Find product design jobs",
  category: "employment",
  target: "Product designer",
  name: "Design scout",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Lagos",
  workLocations: "Remote worldwide",
  background: "Product design experience",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const sourceUrl = "https://example.org/careers";

/** Mirrors production URL identity for deterministic synthetic database fixtures. */
function identity(url: string): string {
  return createHash("sha256").update(JSON.stringify(url)).digest("hex");
}

/** Explicit fixture classifications exercise the pipeline without claiming independent model-quality measurement. */
class MonitorReviewProvider extends LeadReviewProvider {
  readonly configuration = "monitor-fixture-v1";
  calls = 0;
  /** Keeps directory collections outside the posting index and supplies cited posting facts for detail pages. */
  async review(inputs: LeadReviewInput[]): Promise<LeadReviewResult> {
    this.calls++;
    return {
      usage: reviewUsage,
      reviews: inputs.map((input) => ({
        id: input.id,
        review: {
          ...demandReview(input),
          label: input.text.startsWith("Directory:")
            ? "directory"
            : "job_opening",
        },
      })),
    };
  }
}

describe.skipIf(!enabled)("continuous shared source monitoring", () => {
  const schema = `source_monitor_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof createPostgresClient>;
  let db: ReturnType<typeof createPostgresClient>;
  let registry: PostgresSourceMonitoringRepository;
  let records: PostgresWebDiscoveryRepository;
  let learning: LearnSourceMonitoring;
  let provider: MonitorReviewProvider;
  let reviews: ReviewDiscoveryLeads;

  beforeAll(async () => {
    loadEnvFile(new URL("../../api/.env", import.meta.url));
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/scoutalert_test";
    admin = createPostgresClient(url.toString());
    await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
    url.searchParams.set("options", `-c search_path=${schema}`);
    db = createPostgresClient(url.toString());
    await migrateDatabase(db, schema);
  });
  beforeEach(async () => {
    await sql`TRUNCATE discovery_routes,users,opportunity_postings,web_discovery_operations,web_discovery_leads,web_source_monitors,intelligence_tasks,intelligence_daily_budget,web_discovery_usage,web_discovery_hosts CASCADE`.execute(
      db,
    );
    registry = new PostgresSourceMonitoringRepository(db);
    records = new PostgresWebDiscoveryRepository(db);
    learning = new LearnSourceMonitoring(registry);
    provider = new MonitorReviewProvider();
    reviews = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 100, 10_000_000),
      provider,
    );
  });
  afterAll(async () => {
    await db?.destroy();
    if (admin && /^source_monitor_[a-f0-9]{32}$/.test(schema)) {
      await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
    }
    await admin?.destroy();
  });

  /** Creates a synthetic verified owner and source review through the same use cases used by the worker. */
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
    const saved = await activation.execute(ownerId, "synthetic", {
      key: randomUUID(),
      search: brief,
      confirmed: true,
      alerts: {
        frequency: "daily",
        timezone: "UTC",
        deliveryTime: "00:00",
        weekday: "Monday",
        promptAlerts: false,
        consent: true,
        consentVersion: "opportunity-alerts-v1",
      },
    });
    const request = {
      ownerId,
      scoutId: saved.id,
      version: 1,
      runId: randomUUID(),
    };
    await records.open(
      request,
      {
        policy: "public-intent-v3",
        scoutVersion: 1,
        category: "employment",
        queries: [],
        maximumDocuments: 4,
        deadlineSeconds: 240,
        blockedReason: null,
        continuation: "explore_on_next_run",
      },
      {
        id: "fixture",
        configuration: "one",
        access: "public_index",
        country: null,
        language: "en",
        requestCostMicros: 0,
      },
    );
    const doc = document(sourceUrl, false);
    await sql`INSERT INTO web_discovery_leads(id,url,source,title,first_seen_at,last_seen_at,checked_at,content_status,document) VALUES(${identity(sourceUrl)},${sourceUrl},'example.org','Product designer jobs',now(),now(),now(),'fetched',${JSON.stringify(doc)}::jsonb) ON CONFLICT DO NOTHING`.execute(
      db,
    );
    await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${request.runId}::uuid,${identity(sourceUrl)})`.execute(
      db,
    );
    await sql`UPDATE web_discovery_cases SET status='completed',finished_at=now() WHERE id=${request.runId}::uuid`.execute(
      db,
    );
    await review(request);
    await learning.execute(request);
    return request;
  }

  /** Supplies a controlled directory update or a complete remote role without using real personal information. */
  function document(url: string, changed = true): SourceDocumentResult {
    const directory = url === sourceUrl;
    return {
      kind: "document",
      url,
      checkedAt: new Date().toISOString(),
      status: "fetched",
      reason: null,
      text: directory
        ? "Directory: Product designer opportunities. Browse current openings."
        : "Product designer. Permanent remote employment. Apply through this page.",
      fingerprint: directory ? "directory-text" : "posting-text",
      posting: null,
      hostDelaySeconds: 2,
      links: directory
        ? [
            {
              url: "https://example.org/jobs/old",
              text: "Product designer old",
            },
            ...(changed
              ? [
                  {
                    url: "https://example.org/jobs/new",
                    text: "Product designer new",
                  },
                ]
              : []),
          ]
        : [],
    };
  }

  /** Advances a bounded source review activity until its durable batch finishes. */
  async function review(request: ScoutRunRequest): Promise<void> {
    for (let step = 0; step < 8; step++) {
      if ((await reviews.execute(request)) === "done") {
        return;
      }
    }
    throw new Error("review_not_settled");
  }

  /** Advances only synthetic scheduling timestamps, keeping integration tests independent of wall-clock delays. */
  async function idle(): Promise<void> {
    await sql`UPDATE web_discovery_cases SET started_at=now()-interval '10 minutes'`.execute(
      db,
    );
    await sql`UPDATE scouts SET monitoring_requested_at=now()-interval '10 minutes'`.execute(
      db,
    );
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_hosts SET next_allowed_at=now()`.execute(db);
  }

  /** Makes the reviewed root due while leaving historical detail pages outside this scenario. */
  async function due(): Promise<void> {
    await sql`UPDATE web_source_monitors SET next_check_at=now()+interval '1 day'`.execute(
      db,
    );
    await sql`UPDATE web_source_monitors SET next_check_at=now()-interval '1 minute' WHERE id=${identity(sourceUrl)}`.execute(
      db,
    );
  }

  it("discovers a new linked posting, shares source review across owners, matches privately and sends each recipient once", async () => {
    const started = performance.now();
    const first = await fixture();
    const second = await fixture();
    expect(provider.calls).toBe(1);
    await idle();
    await due();
    const fetched: string[] = [];
    const monitoring = new MonitorSources(
      registry,
      records,
      {
        read: async (url) => {
          fetched.push(url);
          return document(url);
        },
      },
      100,
      2,
    );
    expect(await monitoring.execute()).toBe("progress");
    expect(await monitoring.execute()).toBe("progress");
    const directoryRuns =
      await sql<ScoutRunRequest>`SELECT c.id AS "runId",c.scout_id AS "scoutId",c.owner_id AS "ownerId",c.scout_version AS version FROM web_discovery_cases c WHERE c.plan->>'origin'='source_monitor'`.execute(
        db,
      );
    expect(directoryRuns.rows).toHaveLength(2);
    for (const run of directoryRuns.rows) {
      await review(run);
      await learning.execute(run);
    }
    expect(provider.calls).toBe(1); // Text unchanged: new destinations do not require another text extraction.
    await idle();
    expect(await monitoring.execute()).toBe("progress");
    expect(await monitoring.execute()).toBe("progress");
    expect(fetched).toEqual([sourceUrl, "https://example.org/jobs/new"]);
    const postingRuns =
      await sql<ScoutRunRequest>`SELECT c.id AS "runId",c.scout_id AS "scoutId",c.owner_id AS "ownerId",c.scout_version AS version FROM web_discovery_cases c JOIN web_discovery_case_leads cl ON cl.case_id=c.id WHERE cl.lead_id=${identity("https://example.org/jobs/new")}`.execute(
        db,
      );
    expect(postingRuns.rows).toHaveLength(2);
    const fit = new FixtureWebFitProvider();
    const matching = new ScoutOpportunities(
      new PostgresScoutingRepository(db),
      new EvaluateCandidates(
        new PostgresIntelligenceRepository(db, 100, 10_000_000),
        fit,
      ),
    );
    for (const run of postingRuns.rows) {
      const bypass = new DiscoverWeb(
        records,
        {
          read: async () => {
            throw new Error("unexpected_refetch");
          },
        },
        null,
        {
          dailySearchRequests: 0,
          dailySearchMicros: 0,
          dailyDocumentRequests: 0,
          maximumDocuments: 0,
          maximumConcurrentSearches: 1,
        },
      );
      expect(await bypass.execute(run)).toBe("done");
      await review(run);
      await learning.execute(run);
      for (
        let step = 0;
        step < 12 && (await matching.execute(run)) !== "done";
        step++
      ) {
        /* Bounded private matching progress. */
      }
    }
    expect(provider.calls).toBe(2);
    expect(fit.calls).toBe(2);
    const catalog = new PostgresOpportunityCatalogRepository(db);
    expect((await catalog.list(first.ownerId)).map((p) => p.url)).toContain(
      "https://example.org/jobs/new",
    );
    expect((await catalog.list(second.ownerId)).map((p) => p.url)).toContain(
      "https://example.org/jobs/new",
    );
    await new ResearchAvailability(
      new PostgresAvailabilityRepository(db),
      new PostgresWebAvailabilitySource(db),
    ).execute();
    const sent: string[] = [];
    const smtp =
      process.env.MONITOR_MAILPIT === "1"
        ? createSmtpClient({ host: "127.0.0.1", port: 1025, secure: false })
        : null;
    const mail = smtp
      ? new SmtpEmailProvider(smtp, {
          address: "no-reply@scoutalert.test",
          name: "ScoutAlert verification",
        })
      : null;
    const messageIds: string[] = [];
    const delivery = new DeliverOpportunityDigests(
      new PostgresOpportunityDeliveryRepository(db),
      {
        send: async (message) => {
          sent.push(message.recipient);
          const receipt = mail
            ? await mail.send(message)
            : { status: "accepted" as const, providerMessageId: message.id };
          messageIds.push(receipt.providerMessageId);
          return receipt;
        },
      },
    );
    try {
      expect(await delivery.execute(new Date())).toBe(2);
      expect(await delivery.execute(new Date())).toBe(0);
    } finally {
      smtp?.close();
    }
    if (process.env.MONITOR_MAILPIT === "1") {
      await writeFile(
        new URL(
          "../../../evaluations/discovery/continuous-monitoring.json",
          import.meta.url,
        ),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            protocol: "continuous-monitoring-v1",
            source: "controlled fixture; no public network fetch or paid AI",
            storage: "disposable PostgreSQL schema",
            clock: "fixture due times advanced explicitly",
            elapsedMs: Math.round(performance.now() - started),
            scouts: 2,
            sourceDocumentCalls: fetched.length,
            directoryReviews: 1,
            postingReviews: 1,
            privateFitCalls: fit.calls,
            sourceChecksSharedAcrossScouts: true,
            acceptedMailpitDigests: sent.length,
            duplicateDigests: 0,
            messageIds,
            externalProviderSpendUsd: 0,
            independentRelevance: null,
            knownOpportunityRecall: null,
            limitations: [
              "Authored fixtures verify scheduling, source expansion, evidence sharing and delivery mechanics.",
              "This does not establish organic source yield, ranking quality, multilingual discovery, or global scale.",
            ],
          },
          null,
          2,
        ) + "\n",
      );
    }
    expect(new Set(sent).size).toBe(2);
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(2);
    expect(await registry.dispatch()).toBe(0);
    const unrelated = randomUUID();
    expect(
      (await new PostgresWebDiscoveryCatalogRepository(db).read(unrelated))
        .leads,
    ).toEqual([]);
  });

  it("keeps a slow source capture admissible through completion and preserves its crawl delay", async () => {
    await fixture();
    await due();
    const claim = await registry.claim(100, 2);
    if (claim.status !== "claimed") {
      throw new Error("expected_slow_source_claim");
    }
    // Move both leases forward by a simulated 46-second elapsed capture without changing the production clock.
    await sql`UPDATE web_discovery_operations SET lease_until=lease_until-interval '46 seconds' WHERE key=${claim.key}`.execute(
      db,
    );
    await sql`UPDATE web_discovery_hosts SET lease_until=lease_until-interval '46 seconds' WHERE lease_token=${claim.token}::uuid`.execute(
      db,
    );
    await records.complete(claim.key, claim.token, {
      ...document(sourceUrl),
      hostDelaySeconds: 30,
    });
    const operation = await sql<{
      state: string;
    }>`SELECT state FROM web_discovery_operations WHERE key=${claim.key}`.execute(
      db,
    );
    expect(operation.rows[0]!.state).toBe("succeeded");
    const host = await sql<{
      released: boolean;
      paced: boolean;
    }>`SELECT lease_token IS NULL AND lease_until IS NULL AS released,next_allowed_at>now()+interval '29 seconds' AS paced FROM web_discovery_hosts WHERE hostname='example.org'`.execute(
      db,
    );
    expect(host.rows[0]).toEqual({ released: true, paced: true });
  });

  it("coalesces concurrent attempts, fences expired leases and preserves reservations after unknown outcomes", async () => {
    await fixture();
    await due();
    const claims = await Promise.all([
      registry.claim(100, 2),
      registry.claim(100, 2),
    ]);
    expect(claims.filter((c) => c.status === "claimed")).toHaveLength(1);
    const claim = claims.find((c) => c.status === "claimed")!;
    if (claim.status !== "claimed") {
      throw new Error("expected_claim");
    }
    await sql`UPDATE web_discovery_operations SET lease_until=now()-interval '1 second' WHERE key=${claim.key}`.execute(
      db,
    );
    await records.complete(claim.key, claim.token, document(sourceUrl));
    await sql`UPDATE web_source_monitors SET next_check_at=now()-interval '1 minute' WHERE id=${identity(sourceUrl)}`.execute(
      db,
    );
    const outcome = await registry.claim(100, 2);
    expect(outcome.status).toBe("observed");
    if (outcome.status !== "observed") {
      throw new Error("expected_observation");
    }
    expect(outcome.result).toBeNull();
    await registry.settle(
      outcome,
      nextMonitorCheck(outcome.monitor, outcome.result),
    );
    await registry.settle(
      outcome,
      nextMonitorCheck(outcome.monitor, outcome.result),
    );
    expect(
      (await sql`SELECT * FROM web_source_checks`.execute(db)).rows,
    ).toHaveLength(1);
    expect(
      (await sql`SELECT * FROM web_source_updates`.execute(db)).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(1);
  });

  it("requires active current interest and respects daily exhaustion before making a request", async () => {
    const request = await fixture();
    await due();
    await sql`UPDATE scouts SET status='paused' WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    expect((await registry.claim(100, 2)).status).toBe("done");
    await sql`UPDATE scouts SET status='active',version=version+1 WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    expect((await registry.claim(100, 2)).status).toBe("done");
    await sql`UPDATE scouts SET version=1 WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    expect((await registry.claim(0, 2)).status).toBe("done");
    expect(
      (
        await sql<{
          reason: string;
        }>`SELECT reason FROM web_source_monitors WHERE id=${identity(sourceUrl)}`.execute(
          db,
        )
      ).rows[0]!.reason,
    ).toBe("daily_budget_reached");
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(0);
  });

  it("resumes budget-only holds after a limit increase without resetting usage or bypassing current interest", async () => {
    const request = await fixture();
    await due();
    await sql`INSERT INTO web_discovery_usage(provider,day,requests) VALUES('public-documents',(now() AT TIME ZONE 'UTC')::date,2)`.execute(
      db,
    );
    await sql`UPDATE web_source_monitors SET status='deferred',reason='fetch_failed' WHERE id<>${identity(sourceUrl)}`.execute(
      db,
    );

    expect((await registry.claim(2, 2)).status).toBe("done");
    const held = await sql<{
      future: boolean;
      reason: string;
    }>`SELECT next_check_at>now() AS future,reason FROM web_source_monitors WHERE id=${identity(sourceUrl)}`.execute(
      db,
    );
    expect(held.rows[0]).toEqual({
      future: true,
      reason: "daily_budget_reached",
    });
    expect((await registry.claim(2, 2)).status).toBe("done");

    await sql`UPDATE scouts SET status='paused' WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    expect((await registry.claim(3, 2)).status).toBe("done");
    await sql`UPDATE scouts SET status='active',version=2 WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    expect((await registry.claim(3, 2)).status).toBe("done");
    await sql`UPDATE scouts SET version=1 WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );

    const claim = await registry.claim(3, 2);
    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") {
      throw new Error("expected_resumed_claim");
    }
    expect(claim.url).toBe(sourceUrl);
    const usage = await sql<{
      requests: number;
    }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents' AND day=(now() AT TIME ZONE 'UTC')::date`.execute(
      db,
    );
    expect(usage.rows[0]!.requests).toBe(3);

    await records.complete(claim.key, claim.token, document(sourceUrl, false));
    const observed = await registry.claim(3, 2);
    if (observed.status !== "observed") {
      throw new Error("expected_resumed_observation");
    }
    await registry.settle(
      observed,
      nextMonitorCheck(observed.monitor, observed.result),
    );
    expect((await registry.claim(4, 2)).status).toBe("done");
    const failure = await sql<{
      reason: string;
      future: boolean;
    }>`SELECT reason,next_check_at>now() AS future FROM web_source_monitors WHERE id<>${identity(sourceUrl)}`.execute(
      db,
    );
    expect(failure.rows).toEqual([{ reason: "fetch_failed", future: true }]);
  });

  it("bounds automatic expansion per scout and prevents forged ownership from enrolling sources", async () => {
    const request = await fixture();
    const candidates = await registry.candidates(request);
    expect(
      await registry.candidates({ ...request, ownerId: randomUUID() }),
    ).toEqual([]);
    await registry.subscribe(
      { ...request, ownerId: randomUUID() },
      candidates[0]!,
      "directory",
    );
    const interests = await sql`SELECT * FROM web_source_interests`.execute(db);
    expect(interests.rows).toHaveLength(2);
    await sql`DELETE FROM web_source_interests WHERE monitor_id<>${identity(sourceUrl)}`.execute(
      db,
    );
    await new LearnSourceMonitoring(
      new PostgresSourceMonitoringRepository(db, 1),
    ).execute(request);
    expect(
      (await sql`SELECT * FROM web_source_interests`.execute(db)).rows,
    ).toHaveLength(1);
  });
  it("suppresses downstream dispatch when the scout pauses during a source fetch", async () => {
    const request = await fixture();
    await idle();
    await due();
    const claim = await registry.claim(100, 2);
    if (claim.status !== "claimed") {
      throw new Error("expected_claim");
    }
    await sql`UPDATE scouts SET status='paused',version=version+1 WHERE id=${request.scoutId}::uuid`.execute(
      db,
    );
    await records.complete(claim.key, claim.token, document(sourceUrl));
    expect((await registry.claim(100, 2)).status).toBe("done");
    expect(await registry.dispatch()).toBe(0);
    expect(
      (await sql`SELECT * FROM web_source_updates`.execute(db)).rows,
    ).toEqual([]);
    expect(
      (
        await new PostgresWebDiscoveryCatalogRepository(db).read(
          request.ownerId,
        )
      ).monitors,
    ).toEqual([]);
  });

  it("shares document concurrency with ordinary discovery admission", async () => {
    const request = await fixture();
    await due();
    const claim = await registry.claim(100, 1);
    if (claim.status !== "claimed") {
      throw new Error("expected_claim");
    }
    const run = { ...request, runId: randomUUID() };
    await records.open(
      run,
      {
        policy: "public-intent-v3",
        scoutVersion: 1,
        category: "employment",
        queries: [],
        maximumDocuments: 4,
        deadlineSeconds: 240,
        blockedReason: null,
        continuation: "explore_on_next_run",
      },
      {
        id: "fixture",
        configuration: "one",
        access: "public_index",
        country: null,
        language: "en",
        requestCostMicros: 0,
      },
    );
    const key = "ordinary-concurrent-document";
    await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},'public-documents','document','{"kind":"document","url":"https://another.example.org/jobs/design"}'::jsonb)`.execute(
      db,
    );
    await sql`INSERT INTO web_discovery_steps(case_id,position,operation_key) VALUES(${run.runId}::uuid,0,${key})`.execute(
      db,
    );
    const limits = {
      dailySearchRequests: 100,
      dailySearchMicros: 1000000,
      dailyDocumentRequests: 100,
      maximumDocuments: 4,
      maximumConcurrentSearches: 1,
    };
    expect((await records.claim(run, limits)).status).toBe("waiting");
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(1);
    await records.complete(claim.key, claim.token, document(sourceUrl));
    expect((await records.claim(run, limits)).status).toBe("claimed");
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(2);
  });
  it("shares the four-link expansion allowance across subscribers and replay", async () => {
    const first = await fixture();
    const second = await fixture();
    const expanded = {
      ...document(sourceUrl),
      links: Array.from({ length: 12 }, (_, index) => ({
        url: `https://example.org/jobs/new-${index}`,
        text: `Product designer ${index}`,
      })),
    };
    await sql`UPDATE web_discovery_leads SET document=${JSON.stringify(expanded)}::jsonb WHERE id=${identity(sourceUrl)}`.execute(
      db,
    );
    await learning.execute(first);
    await learning.execute(second);
    await learning.execute(first);
    const parent = await sql<{
      expansion_count: number;
    }>`SELECT expansion_count FROM web_source_monitors WHERE id=${identity(sourceUrl)}`.execute(
      db,
    );
    expect(parent.rows[0]!.expansion_count).toBe(4);
    const links =
      await sql`SELECT * FROM web_source_monitor_links WHERE url LIKE 'https://example.org/jobs/new-%' AND child_id IS NOT NULL`.execute(
        db,
      );
    expect(links.rows).toHaveLength(4);
  });
});
