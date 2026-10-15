import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
  PostgresSocialDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresWebDiscoveryCatalogRepository,
  PostgresWebAvailabilitySource,
} from "@repo/adapters/discovery";
import {
  socialQuery,
  SocialProviderError,
  ReviewDiscoveryLeads,
  type SocialIntent,
  type SocialResult,
  type SocialClaim,
} from "@repo/core/discovery";
import {
  ScoutOpportunities,
  EvaluateCandidates,
  ResearchAvailability,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import {
  PostgresScoutingRepository,
  PostgresIntelligenceRepository,
  PostgresAvailabilityRepository,
} from "@repo/adapters/scouting";
import { DeliverOpportunityDigests } from "@repo/core/notifications";
import {
  PostgresOpportunityDeliveryRepository,
  createSmtpClient,
  SmtpEmailProvider,
} from "@repo/adapters/notifications";
import {
  FixtureLeadProvider,
  FixtureWebFitProvider,
} from "./fixtures/lead-review.js";

const enabled = process.env.WEB_DISCOVERY_INTEGRATION === "1";
const limits = {
  paceAcrossDay: false,
  dailyRequests: 20,
  dailyMicros: 1_000_000,
  postCostMicros: 5000,
  pageSize: 10,
};
const policy = "x-public-demand-v1";
const brief: SearchDraft = {
  goal: "Find product designer jobs",
  category: "employment",
  target: "Product designer",
  name: "Synthetic scout",
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

/** Returns complete synthetic native evidence with real production shapes but no external provider or private user data. */
function response(nextToken: string | null = null, id = "101"): SocialResult {
  const checkedAt = new Date().toISOString();
  return {
    checkedAt,
    nextToken,
    partial: false,
    retryAfterSeconds: 0,
    unavailableIds: [],
    documents: [
      {
        kind: "document",
        url: `https://x.com/i/status/${id}`,
        checkedAt,
        status: "fetched",
        reason: null,
        text: "Product designer. Permanent remote employment. Apply through this page.",
        fingerprint: `post-${id}`,
        posting: null,
        hostDelaySeconds: 0,
        nativePost: {
          platform: "x",
          id,
          authorId: "20",
          publishedAt: checkedAt,
          conversationId: id,
          editIds: [id],
          references: [],
        },
      },
    ],
  };
}

describe.skipIf(!enabled)("native X durable discovery", () => {
  const schema = `social_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof createPostgresClient>;
  let db: ReturnType<typeof createPostgresClient>;
  let records: PostgresSocialDiscoveryRepository;
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
    await sql`TRUNCATE discovery_routes,users,opportunity_postings,web_discovery_operations,web_discovery_leads,intelligence_tasks,intelligence_daily_budget,web_discovery_usage,x_search_queries,x_context_requests CASCADE`.execute(
      db,
    );
    await sql`UPDATE x_access_state SET next_allowed_at=now(),reason=NULL`.execute(
      db,
    );
    records = new PostgresSocialDiscoveryRepository(db);
  });
  afterAll(async () => {
    await db?.destroy();
    if (admin && /^social_[a-f0-9]{32}$/.test(schema)) {
      await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
    }
    await admin?.destroy();
  });

  /** Activates an isolated verified synthetic account through the same onboarding transaction used by the API. */
  async function scout(target = brief.target): Promise<SocialIntent> {
    const search = { ...brief, target };
    const ownerId = randomUUID();
    await db
      .insertInto("users")
      .values({
        id: ownerId,
        email: `${ownerId}@scoutalert.test`,
        verified_at: new Date(),
      })
      .execute();
    const saved = await new ActivateScout(
      new ReviewSearchDraft(),
      new PostgresScoutActivationUnitOfWork(db),
      new NodeScoutActivationIdentity(),
      () => new Date(),
    ).execute(ownerId, "synthetic", {
      key: randomUUID(),
      search,
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
    const intent = { scoutId: saved.id, ownerId, version: 1, search };
    await records.subscribe(intent, policy, socialQuery(search));
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    return intent;
  }

  /** Narrows an admission for tests that need to complete or fail its exact lease. */
  async function claim(): Promise<Extract<SocialClaim, { status: "claimed" }>> {
    const result = await records.claim(limits);
    if (result.status !== "claimed") {
      throw new Error(`expected_claim_${result.status}`);
    }
    return result;
  }

  /** Advances fixture due times only; paid usage, cursor and owner/version fences are left intact. */
  async function due(): Promise<void> {
    await sql`UPDATE x_search_queries SET next_check_at=now()`.execute(db);
    await sql`UPDATE x_access_state SET next_allowed_at=now()`.execute(db);
  }

  /** Creates a reply whose source-declared parent must be captured before it is complete. */
  function reply(): SocialResult {
    const result = response();
    result.documents[0]!.nativePost.references = [
      { id: "201", type: "replied_to" },
    ];
    result.documents[0]!.nativePost.conversationId = "201";
    result.documents[0]!.truncated = true;
    return result;
  }

  /** Lets a finished synthetic discovery batch dispatch again without weakening source or budget fences. */
  async function nextBatch(): Promise<ScoutRunRequest> {
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=now()-interval '2 minutes'`.execute(
      db,
    );
    await records.maintain();
    return (
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases ORDER BY started_at DESC LIMIT 1`.execute(
        db,
      )
    ).rows[0]!;
  }

  /** Captures one public reply and parent through independently reserved native operations. */
  async function contextPair(): Promise<void> {
    await records.complete(await claim(), reply());
    await records.maintain();
    const context = await claim();
    expect(context.operation).toEqual({
      kind: "lookup",
      ids: ["201"],
      purpose: "context",
    });
    await records.complete(context, response(null, "201"));
    await records.maintain();
  }

  it("shares separately budgeted parent capture across scouts and exposes attributed context", async () => {
    const first = await scout();
    await scout();
    await records.complete(await claim(), reply());
    await records.maintain();
    const missing = await new PostgresWebDiscoveryCatalogRepository(db).read(
      first.ownerId,
    );
    expect(missing.leads[0]!.nativeContext?.missingIds).toEqual(["201"]);
    expect((await records.claim({ ...limits, dailyRequests: 1 })).status).toBe(
      "done",
    );
    const context = await claim();
    expect(context.operation).toEqual({
      kind: "lookup",
      ids: ["201"],
      purpose: "context",
    });
    const parent = response(null, "201");
    parent.documents[0]!.checkedAt = new Date(
      Date.now() - 90_000,
    ).toISOString();
    await records.complete(context, parent);
    await records.maintain();
    const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
      first.ownerId,
    );
    const root = view.leads.find((lead) => lead.nativePost?.id === "101")!;
    expect(root.nativeContext?.complete).toBe(true);
    expect(root.nativeContext?.posts.map((post) => post.id)).toEqual(["201"]);
    expect(root.content).toBe(reply().documents[0]!.text);
    const run = (
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases WHERE scout_id=${first.scoutId}::uuid ORDER BY started_at DESC LIMIT 1`.execute(
        db,
      )
    ).rows[0]!;
    const review = await new PostgresLeadReviewRepository(
      db,
      10,
      1_000_000,
    ).claim(run, "context-freshness-fixture");
    expect(review.status).toBe("claimed");
    if (review.status === "claimed") {
      expect(review.inputs[0]!.observedAt).toBe(parent.documents[0]!.checkedAt);
      expect(review.inputs[0]!.text).toBe(reply().documents[0]!.text);
    }
    const usage = (
      await sql<{
        requests: number;
        reserved: string;
      }>`SELECT requests,reserved_micros::text AS reserved FROM web_discovery_usage WHERE provider='x-api'`.execute(
        db,
      )
    ).rows[0];
    expect(usage).toEqual({ requests: 2, reserved: "55000" });
    expect(
      (await sql`SELECT 1 FROM x_query_posts WHERE is_context`.execute(db))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await sql`SELECT 1 FROM x_source_updates WHERE lead_id IN(SELECT lead_id FROM x_posts WHERE post_id='201')`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(2);
  });

  it("backs off inaccessible context and keeps the primary post incomplete", async () => {
    await scout();
    await records.complete(await claim(), reply());
    await records.maintain();
    await records.complete(await claim(), {
      ...response(),
      documents: [],
      unavailableIds: ["201"],
    });
    await records.maintain();
    expect((await records.claim(limits)).status).toBe("done");
    const row = (
      await sql<{
        truncated: boolean;
        missing: string[];
      }>`SELECT (document->>'truncated')::boolean AS truncated,document->'nativeContext'->'missingIds' AS missing FROM web_discovery_leads`.execute(
        db,
      )
    ).rows[0]!;
    expect(row).toEqual({ truncated: true, missing: ["201"] });
    expect(
      (
        await sql`SELECT 1 FROM x_context_requests WHERE state='unavailable' AND next_check_at>now()+interval '23 hours'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("withdraws dependent assessments on context deletion and can review restored evidence again", async () => {
    await scout();
    await contextPair();
    const run = await nextBatch();
    const provider = new FixtureLeadProvider();
    const review = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 100, 10_000_000),
      provider,
    );
    for (
      let step = 0;
      step < 8 && (await review.execute(run)) !== "done";
      step++
    ) {
      /* Drain the bounded public fixture batch. */
    }
    expect(
      (await sql`SELECT 1 FROM opportunity_postings WHERE open`.execute(db))
        .rows,
    ).toHaveLength(2);
    await sql`UPDATE x_posts SET next_check_at=now() WHERE post_id='201'`.execute(
      db,
    );
    const removal = await claim();
    await records.complete(removal, {
      ...response(),
      documents: [],
      unavailableIds: ["201"],
    });
    expect(
      (await sql`SELECT 1 FROM opportunity_postings WHERE open`.execute(db))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await sql`SELECT 1 FROM web_lead_reviews WHERE result IS NOT NULL OR input ? 'nativeContext'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(0);
    const primary = (
      await sql<{
        text: string;
      }>`SELECT document->>'text' AS text FROM web_discovery_leads WHERE url='https://x.com/i/status/101'`.execute(
        db,
      )
    ).rows[0]!;
    expect(primary.text).toBe(reply().documents[0]!.text);
    await sql`UPDATE x_context_requests SET next_check_at=now()`.execute(db);
    await records.complete(await claim(), response(null, "201"));
    const restored = await nextBatch();
    for (
      let step = 0;
      step < 8 && (await review.execute(restored)) !== "done";
      step++
    ) {
      /* Restoration needs a new cited review after old evidence was removed. */
    }
    expect(
      (await sql`SELECT 1 FROM opportunity_postings WHERE open`.execute(db))
        .rows,
    ).toHaveLength(2);
    expect(provider.calls).toBe(4);
  });

  it("fences a model response when its referenced source changes during assessment", async () => {
    await scout();
    await contextPair();
    const run = await nextBatch();
    const provider = new FixtureLeadProvider();
    const review = new PostgresLeadReviewRepository(db, 100, 10_000_000);
    let active = await review.claim(run, provider.configuration);
    if (active.status === "claimed" && !active.inputs[0]!.nativeContext) {
      await review.complete(active.token, await provider.review(active.inputs));
      active = await review.claim(run, provider.configuration);
    }
    if (active.status !== "claimed") {
      throw new Error("expected_context_review");
    }
    expect(active.inputs[0]!.nativeContext?.complete).toBe(true);
    const old = await provider.review(active.inputs);
    await sql`UPDATE x_posts SET next_check_at=now() WHERE post_id='201'`.execute(
      db,
    );
    const edited = response(null, "201");
    edited.documents[0]!.text = "This request is closed.";
    edited.documents[0]!.fingerprint = "changed-parent";
    await records.complete(await claim(), edited);
    await review.complete(active.token, old);
    expect(
      (
        await sql`SELECT 1 FROM opportunity_postings WHERE url='https://x.com/i/status/101' AND open`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql`SELECT 1 FROM web_lead_reviews WHERE input ? 'nativeContext'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("shares search and public extraction across owners, privately matches and delivers once", async () => {
    const started = performance.now();
    const first = await scout();
    const second = await scout();
    expect(
      (await sql`SELECT * FROM x_search_queries`.execute(db)).rows,
    ).toHaveLength(1);
    const a = await claim();
    expect((await records.claim(limits)).status).toBe("waiting");
    await records.complete(a, response());
    await records.complete(a, response());
    expect(await records.maintain()).toBe(2);
    expect(await records.maintain()).toBe(0);
    const runs =
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases WHERE provider='x-api'`.execute(
        db,
      );
    const provider = new FixtureLeadProvider();
    const review = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 100, 10_000_000),
      provider,
    );
    const fit = new FixtureWebFitProvider();
    const matching = new ScoutOpportunities(
      new PostgresScoutingRepository(db),
      new EvaluateCandidates(
        new PostgresIntelligenceRepository(db, 100, 10_000_000),
        fit,
      ),
    );
    for (const run of runs.rows) {
      for (
        let step = 0;
        step < 8 && (await review.execute(run)) !== "done";
        step++
      ) {
        /* Finite review progress. */
      }
      for (
        let step = 0;
        step < 12 && (await matching.execute(run)) !== "done";
        step++
      ) {
        /* Finite private assessment progress. */
      }
    }
    expect(provider.calls).toBe(1);
    expect(fit.calls).toBe(2);
    await new ResearchAvailability(
      new PostgresAvailabilityRepository(db),
      new PostgresWebAvailabilitySource(db),
    ).execute();
    const sent: string[] = [];
    const smtp =
      process.env.SOCIAL_MAILPIT === "1"
        ? createSmtpClient({ host: "127.0.0.1", port: 1025, secure: false })
        : null;
    const mail = smtp
      ? new SmtpEmailProvider(smtp, {
          address: "no-reply@scoutalert.test",
          name: "ScoutAlert native discovery check",
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
    if (process.env.SOCIAL_MAILPIT === "1") {
      await writeFile(
        new URL(
          "../../../evaluations/discovery/native-social-fixture.json",
          import.meta.url,
        ),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            protocol: "native-x-v1",
            source:
              "Authored X response and model fixtures; no live X or paid AI calls",
            scouts: 2,
            sharedNativeReads: 1,
            sharedExtractionCalls: provider.calls,
            privateFitCalls: fit.calls,
            acceptedMailpitMessages: sent.length,
            duplicateMessages: 0,
            messageIds,
            elapsedMs: Math.round(performance.now() - started),
            externalProviderSpendUsd: 0,
            independentRelevance: null,
            knownOpportunityRecall: null,
          },
          null,
          2,
        ) + "\n",
      );
    }
    expect(new Set(sent).size).toBe(2);
    const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
      first.ownerId,
    );
    expect(view.leads[0]!.nativePost?.platform).toBe("x");
    expect(
      (await new PostgresWebDiscoveryCatalogRepository(db).read(randomUUID()))
        .leads,
    ).toEqual([]);
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='x-api'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(1);
    await sql`UPDATE x_posts SET expires_at=now()-interval '1 second'`.execute(
      db,
    );
    await records.maintain();
    expect(
      (await sql`SELECT * FROM scout_recommendations`.execute(db)).rows,
    ).toHaveLength(0);
    expect(
      (await sql`SELECT * FROM intelligence_tasks`.execute(db)).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql<{
          document: unknown;
        }>`SELECT document FROM web_discovery_leads`.execute(db)
      ).rows[0]!.document,
    ).toBeNull();
    expect(
      (
        await sql<{
          contents: { opportunities: unknown[] };
        }>`SELECT contents FROM opportunity_deliveries`.execute(db)
      ).rows.every((row) => row.contents.opportunities.length === 0),
    ).toBe(true);
    expect(second.ownerId).not.toBe(first.ownerId);
  });

  it("persists exact pagination windows and advances coverage only after the last page", async () => {
    await scout();
    const first = await claim();
    await records.complete(first, response("page-2"));
    await due();
    records = new PostgresSocialDiscoveryRepository(db);
    const second = await claim();
    expect(second.operation).toEqual({
      ...first.operation,
      nextToken: "page-2",
    });
    await records.complete(second, response(null, "102"));
    const row = (
      await sql<{
        covered_until: Date;
        next_token: string | null;
        window_start: Date | null;
      }>`SELECT covered_until,next_token,window_start FROM x_search_queries`.execute(
        db,
      )
    ).rows[0]!;
    expect(row.next_token).toBeNull();
    expect(row.window_start).toBeNull();
    expect(row.covered_until.toISOString()).toBe(
      first.operation.kind === "search"
        ? first.operation.endTime
        : "unexpected",
    );
  });

  it("resumes budget-deferred native reviews without new source reads, stale freshness or obsolete subscriptions", async () => {
    const current = await scout();
    const paused = await scout();
    const edited = await scout();
    await records.complete(await claim(), response());
    const observedAt = new Date(Date.now() - 35 * 60_000).toISOString();
    await sql`UPDATE web_discovery_leads SET checked_at=${observedAt}::timestamptz,document=jsonb_set(document,'{checkedAt}',to_jsonb(${observedAt}::text))`.execute(
      db,
    );
    await sql`UPDATE x_source_updates SET observed_at=${observedAt}::timestamptz`.execute(
      db,
    );
    expect(await records.maintain()).toBe(3);

    await sql`INSERT INTO intelligence_daily_budget(day,requests,reserved_microusd) VALUES((now() AT TIME ZONE 'UTC')::date,1,75000)`.execute(
      db,
    );
    const provider = new FixtureLeadProvider();
    const blocked = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 1, 75_000),
      provider,
    );
    const runs =
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases WHERE provider='x-api'`.execute(
        db,
      );
    for (const run of runs.rows) {
      expect(await blocked.execute(run)).toBe("done");
    }
    expect(provider.calls).toBe(0);
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=now()-interval '2 minutes'`.execute(
      db,
    );
    await sql`UPDATE scouts SET status='paused' WHERE id=${paused.scoutId}::uuid`.execute(
      db,
    );
    await sql`UPDATE scouts SET version=2 WHERE id=${edited.scoutId}::uuid`.execute(
      db,
    );

    const limited = new PostgresSocialDiscoveryRepository(db, {
      dailyRequests: 1,
      dailyMicros: 75_000,
    });
    expect(await limited.maintain()).toBe(0);
    const raised = new PostgresSocialDiscoveryRepository(db, {
      dailyRequests: 2,
      dailyMicros: 150_000,
    });
    expect(await raised.maintain()).toBe(1);
    expect(await raised.maintain()).toBe(0);
    const resumed = (
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases WHERE scout_id=${current.scoutId}::uuid ORDER BY started_at DESC LIMIT 1`.execute(
        db,
      )
    ).rows[0]!;
    const review = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 2, 150_000),
      provider,
    );
    expect(await review.execute(resumed)).toBe("progress");
    expect(await review.execute(resumed)).toBe("done");
    expect(provider.calls).toBe(1);
    expect(
      (
        await sql<{
          requests: number;
          reserved: string;
        }>`SELECT requests,reserved_microusd::text AS reserved FROM intelligence_daily_budget`.execute(
          db,
        )
      ).rows[0],
    ).toEqual({ requests: 2, reserved: "150000" });
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='x-api'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(1);
    const posting = (
      await sql<{
        checked_at: Date;
      }>`SELECT checked_at FROM opportunity_postings WHERE source_id='web-discovery'`.execute(
        db,
      )
    ).rows[0]!;
    expect(posting.checked_at.toISOString()).toBe(observedAt);
    const fit = new FixtureWebFitProvider();
    const matching = new ScoutOpportunities(
      new PostgresScoutingRepository(db),
      new EvaluateCandidates(
        new PostgresIntelligenceRepository(db, 2, 150_000),
        fit,
      ),
    );
    expect(await matching.execute(resumed)).toBe("done");
    expect(fit.calls).toBe(0);
  });

  it("keeps an active public review from being superseded by a newer native batch", async () => {
    await scout();
    await records.complete(await claim(), response());
    expect(await records.maintain()).toBe(1);
    const run = (
      await sql<ScoutRunRequest>`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases WHERE provider='x-api'`.execute(
        db,
      )
    ).rows[0]!;
    const provider = new FixtureLeadProvider();
    const reviewRecords = new PostgresLeadReviewRepository(db, 10, 1_000_000);
    const reviewClaim = await reviewRecords.claim(
      run,
      `${provider.configuration}:deadline-evidence-v2:buyer-category-v1`,
    );
    if (reviewClaim.status !== "claimed") {
      throw new Error("expected_review_claim");
    }
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=now()-interval '2 minutes'`.execute(
      db,
    );
    await due();
    await records.complete(await claim(), response(null, "102"));
    expect(await records.maintain()).toBe(0);
    await reviewRecords.complete(
      reviewClaim.token,
      await provider.review(reviewClaim.inputs),
    );
    expect(
      await new ReviewDiscoveryLeads(reviewRecords, provider).execute(run),
    ).toBe("done");
    expect(await records.maintain()).toBe(1);
  });

  it("recovers a native batch replaced before review without another X read or a changed source timestamp", async () => {
    await scout();
    await records.complete(await claim(), response());
    const original = await nextBatch();
    await due();
    await records.complete(await claim(), response(null, "102"));
    const newer = await nextBatch();
    expect(newer.runId).not.toBe(original.runId);
    const provider = new FixtureLeadProvider();
    const reviews = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 10, 1_000_000),
      provider,
    );
    expect(await reviews.execute(original)).toBe("done");
    expect(await reviews.execute(newer)).toBe("progress");
    expect(await reviews.execute(newer)).toBe("done");
    const before = (
      await sql`SELECT lead_id,observed_at FROM x_source_updates ORDER BY lead_id`.execute(
        db,
      )
    ).rows;
    const recovery = new PostgresSocialDiscoveryRepository(db, {
      dailyRequests: 10,
      dailyMicros: 1_000_000,
    });
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=started_at-interval '2 minutes'`.execute(
      db,
    );
    expect(await recovery.maintain()).toBe(1);
    expect(await recovery.maintain()).toBe(0);
    const recovered = await nextBatch();
    expect(await reviews.execute(recovered)).toBe("progress");
    expect(await reviews.execute(recovered)).toBe("done");
    expect(provider.calls).toBe(2);
    expect(
      (
        await sql`SELECT lead_id,observed_at FROM x_source_updates ORDER BY lead_id`.execute(
          db,
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='x-api'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(2);
    expect(
      (
        await sql<{
          count: number;
        }>`SELECT count(*)::int AS count FROM web_lead_reviews WHERE state='ready'`.execute(
          db,
        )
      ).rows[0]!.count,
    ).toBe(2);
  });

  it("requeues due transient review failures once while retaining both attempt receipts and their spend", async () => {
    await scout();
    await records.complete(await claim(), response());
    const original = await nextBatch();
    const provider = new FixtureLeadProvider();
    const reviews = new PostgresLeadReviewRepository(db, 10, 1_000_000);
    const first = await reviews.claim(original, provider.configuration);
    if (first.status !== "claimed") {
      throw new Error("expected_first_review");
    }
    await reviews.fail(first.token, "provider_unavailable");
    expect((await reviews.claim(original, provider.configuration)).status).toBe(
      "done",
    );
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=started_at-interval '2 minutes'`.execute(
      db,
    );
    const recovery = new PostgresSocialDiscoveryRepository(db, {
      dailyRequests: 10,
      dailyMicros: 1_000_000,
    });
    expect(await recovery.maintain()).toBe(0);
    await sql`UPDATE web_lead_reviews SET retry_at=now()-interval '1 second'`.execute(
      db,
    );
    expect(await recovery.maintain()).toBe(1);
    const resumed = await nextBatch();
    const second = await reviews.claim(resumed, provider.configuration);
    if (second.status !== "claimed") {
      throw new Error("expected_retry_review");
    }
    await reviews.fail(second.token, "provider_unavailable");
    expect((await reviews.claim(resumed, provider.configuration)).status).toBe(
      "done",
    );
    await sql`UPDATE web_lead_reviews SET retry_at=now()-interval '1 second'`.execute(
      db,
    );
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=started_at-interval '2 minutes'`.execute(
      db,
    );
    expect(await recovery.maintain()).toBe(0);
    expect(
      (
        await sql<{
          count: number;
        }>`SELECT count(*)::int AS count FROM web_lead_review_attempts WHERE state='failed'`.execute(
          db,
        )
      ).rows[0]!.count,
    ).toBe(2);
    expect(
      (
        await sql<{
          requests: number;
          reserved: number;
        }>`SELECT requests,reserved_microusd::int AS reserved FROM intelligence_daily_budget`.execute(
          db,
        )
      ).rows[0],
    ).toEqual({ requests: 2, reserved: 150_000 });
  });

  it("recovers an expired review window after contention without replacing a live review lease", async () => {
    await scout();
    await records.complete(await claim(), response());
    const original = await nextBatch();
    const provider = new FixtureLeadProvider();
    const reviews = new PostgresLeadReviewRepository(db, 10, 1_000_000);
    const lease = await reviews.claim(original, provider.configuration);
    expect(lease.status).toBe("claimed");
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    await sql`UPDATE web_discovery_cases SET started_at=started_at-interval '2 minutes'`.execute(
      db,
    );
    await sql`UPDATE web_lead_review_cases SET deadline=now()-interval '1 second'`.execute(
      db,
    );
    const recovery = new PostgresSocialDiscoveryRepository(db, {
      dailyRequests: 10,
      dailyMicros: 1_000_000,
    });
    expect(await recovery.maintain()).toBe(0);
    await sql`UPDATE web_lead_reviews SET lease_until=now()-interval '1 second'`.execute(
      db,
    );
    expect(await recovery.maintain()).toBe(1);
    expect(await recovery.maintain()).toBe(0);
    expect(provider.calls).toBe(0);
  });

  it("lets a queued native batch review before the periodic full search can replace it", async () => {
    await scout();
    await records.complete(await claim(), response());
    await nextBatch();
    await sql`UPDATE scouts SET discovery_requested_at=now()-interval '1 hour'`.execute(
      db,
    );
    await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
    const matching = new PostgresScoutingRepository(db);
    expect(await matching.reconcile("native-review-guard", new Date())).toBe(0);
  });

  it("uses measured outcomes for native selection while reserving the oldest due query", async () => {
    await scout();
    const firstQuery = socialQuery(brief);
    for (let index = 0; index < 3; index++) {
      await due();
      await records.fail(
        await claim(),
        new SocialProviderError("provider_unavailable", 1),
      );
    }
    await scout("UX researcher");
    await sql`UPDATE x_search_queries SET next_check_at=now()-interval '1 hour' WHERE query=${firstQuery}`.execute(
      db,
    );
    const preferred = await claim();
    expect(preferred.operation).toMatchObject({
      kind: "search",
      query: socialQuery({ ...brief, target: "UX researcher" }),
    });
    await records.complete(preferred, { ...response(), documents: [] });
    await due();
    await records.complete(await claim(), { ...response(), documents: [] });
    await sql`UPDATE x_search_queries SET next_check_at=now()-interval '2 hours' WHERE query=${firstQuery}`.execute(
      db,
    );
    const exploration = await claim();
    expect(exploration.operation).toMatchObject({
      kind: "search",
      query: firstQuery,
    });
    expect(
      (
        await sql<{
          selection: string;
        }>`SELECT selection FROM discovery_route_attempts WHERE operation_key=${exploration.key}`.execute(
          db,
        )
      ).rows[0]?.selection,
    ).toBe("oldest_due");
  });

  it("paces after the startup burst and recalculates raised limits without resetting reservations", async () => {
    await scout();
    for (let index = 0; index < 3; index++) {
      await due();
      const attempt = await records.claim({ ...limits, paceAcrossDay: true });
      expect(attempt.status).toBe("claimed");
      if (attempt.status !== "claimed") {
        throw new Error("missing fixture admission");
      }
      await records.complete(attempt, { ...response(), documents: [] });
    }
    await due();
    expect(
      (await records.claim({ ...limits, paceAcrossDay: true })).status,
    ).toBe("done");
    expect(
      (
        await sql<{
          reason: string;
        }>`SELECT reason FROM x_search_queries`.execute(db)
      ).rows[0]?.reason,
    ).toBe("budget_pacing");
    await sql`UPDATE web_discovery_operations SET created_at=created_at-interval '2 seconds'`.execute(
      db,
    );
    expect(
      (
        await records.claim({
          ...limits,
          paceAcrossDay: true,
          dailyRequests: 1_000_000,
          dailyMicros: 100_000_000_000,
        })
      ).status,
    ).toBe("claimed");
    expect(
      (
        await sql<{
          requests: number;
          cost: number;
        }>`SELECT requests,reserved_micros::int AS cost FROM web_discovery_usage WHERE provider='x-api'`.execute(
          db,
        )
      ).rows[0],
    ).toEqual({ requests: 4, cost: 200_000 });
  });

  it("shares route measurements across scouts and cools repeated empty windows", async () => {
    await scout();
    await scout();
    for (let index = 0; index < 3; index++) {
      await due();
      const attempt = await claim();
      const result = { ...response(), documents: [] };
      await records.complete(attempt, result);
      await records.complete(attempt, result);
    }
    expect(
      (await sql`SELECT id FROM discovery_routes`.execute(db)).rows,
    ).toHaveLength(1);
    expect(
      (
        await sql`SELECT operation_key FROM discovery_route_attempts`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(3);
    expect(
      (
        await sql`SELECT 1 FROM x_search_queries WHERE next_check_at>now()+interval '14 minutes' AND next_check_at<now()+interval '16 minutes'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("slows unchanged native posts and immediately shortens the interval when evidence changes", async () => {
    await scout();
    const captured = response();
    await records.complete(await claim(), captured);
    for (let index = 0; index < 2; index++) {
      await sql`UPDATE x_posts SET next_check_at=now()`.execute(db);
      const next = await claim();
      expect(next.operation.kind).toBe("lookup");
      await records.complete(next, captured);
    }
    expect(
      (
        await sql`SELECT 1 FROM x_posts WHERE unchanged=2 AND next_check_at>now()+interval '59 minutes'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1);
    await sql`UPDATE x_posts SET next_check_at=now()`.execute(db);
    captured.documents[0]!.text += " Updated requirements.";
    captured.documents[0]!.fingerprint = "changed";
    await records.complete(await claim(), captured);
    expect(
      (
        await sql`SELECT 1 FROM x_posts WHERE unchanged=0 AND next_check_at<now()+interval '16 minutes'`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("retains usage through exhaustion and resumes under a raised native allowance", async () => {
    await scout();
    const first = await claim();
    await records.complete(first, response("next"));
    await due();
    expect((await records.claim({ ...limits, dailyRequests: 1 })).status).toBe(
      "done",
    );
    expect(
      (await records.claim({ ...limits, dailyMicros: 50_000 })).status,
    ).toBe("done");
    const next = await claim();
    expect(next.operation.kind).toBe("search");
    const row = (
      await sql<{
        requests: number;
        reserved_micros: string;
      }>`SELECT requests,reserved_micros::text FROM web_discovery_usage WHERE provider='x-api'`.execute(
        db,
      )
    ).rows[0]!;
    expect(row).toEqual({ requests: 2, reserved_micros: "100000" });
  });

  it("fences expired or forged receipts and preserves the search window after unknown outcomes", async () => {
    await scout();
    const first = await claim();
    await records.complete({ ...first, token: randomUUID() }, response());
    expect((await sql`SELECT * FROM x_posts`.execute(db)).rows).toHaveLength(0);
    await sql`UPDATE web_discovery_operations SET lease_until=now()-interval '1 second' WHERE key=${first.key}`.execute(
      db,
    );
    await records.complete(first, response());
    expect((await records.claim(limits)).status).toBe("done");
    await due();
    const next = await claim();
    expect(next.operation).toEqual(first.operation);
    expect(
      (
        await sql<{
          requests: number;
        }>`SELECT requests FROM web_discovery_usage WHERE provider='x-api'`.execute(
          db,
        )
      ).rows[0]!.requests,
    ).toBe(2);
  });

  it("rechecks subscriptions after pauses, edits and forged ownership", async () => {
    const first = await scout();
    const second = await scout();
    const admitted = await claim();
    await sql`UPDATE scouts SET status='paused' WHERE id=${first.scoutId}::uuid`.execute(
      db,
    );
    await sql`UPDATE scouts SET version=2 WHERE id=${second.scoutId}::uuid`.execute(
      db,
    );
    await records.subscribe(
      { ...first, ownerId: randomUUID() },
      policy,
      '"forged"',
    );
    await records.complete(admitted, response());
    expect(await records.maintain()).toBe(0);
    expect((await records.claim(limits)).status).toBe("done");
    expect(
      (await records.intents(policy)).map((value) => value.scoutId),
    ).toEqual([second.scoutId]);
  });

  it("retains partial-page progress and respects provider rate and access pauses", async () => {
    await scout();
    const first = await claim();
    await records.complete(first, { ...response(), partial: true });
    await due();
    const next = await claim();
    expect(next.operation).toEqual(first.operation);
    await records.fail(next, new SocialProviderError("rate_limited", 600));
    expect((await records.claim(limits)).status).toBe("done");
    expect(
      (
        await sql<{
          reason: string;
        }>`SELECT reason FROM x_access_state`.execute(db)
      ).rows[0]!.reason,
    ).toBe("rate_limited");
  });

  it("withdraws an inaccessible native post without fabricating absence from search results", async () => {
    await scout();
    const first = await claim();
    await records.complete(first, response());
    await sql`UPDATE x_posts SET next_check_at=now()`.execute(db);
    const lookup = await claim();
    expect(lookup.operation.kind).toBe("lookup");
    await records.complete(lookup, {
      ...response(),
      documents: [],
      unavailableIds: ["101"],
    });
    expect(
      (
        await sql<{
          unavailable: boolean;
        }>`SELECT unavailable FROM x_posts`.execute(db)
      ).rows[0]!.unavailable,
    ).toBe(true);
    expect(
      (
        await sql<{
          document: unknown;
        }>`SELECT document FROM web_discovery_leads`.execute(db)
      ).rows[0]!.document,
    ).toBeNull();
  });
});
