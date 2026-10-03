import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import {
  PostgresDiscoveryReasoningRepository,
  PostgresWebDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresWebAvailabilitySource,
  PostgresWebDiscoveryCatalogRepository,
} from "@repo/adapters/discovery";
import {
  ActivateScout,
  ReviewSearchDraft,
  type SearchDraft,
} from "@repo/core/onboarding";
import {
  PlanScoutSearch,
  type DiscoveryReasoningInput,
  planDiscovery,
  planExploration,
  DiscoverWeb,
  ReviewDiscoveryLeads,
  type DiscoveryLimits,
  type SearchCapability,
  type WebSearchResult,
} from "@repo/core/discovery";
import type {
  EmployerResearch,
  PostingAnalysis,
  ScoutRunRequest,
} from "@repo/core/scouting";
import {
  PostgresEmployerEvidenceRepository,
  PostgresScoutingRepository,
  PostgresIntelligenceRepository,
  PostgresOpportunityCatalogRepository,
} from "@repo/adapters/scouting";
import { ScoutOpportunities, EvaluateCandidates } from "@repo/core/scouting";
import { parseFormalPosting } from "@repo/adapters/discovery";

import {
  FixtureLeadProvider,
  FixtureWebFitProvider,
  demandReview,
  reviewUsage,
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
const limits: DiscoveryLimits = {
  dailySearchRequests: 100,
  dailySearchMicros: 1000000,
  dailyDocumentRequests: 100,
  maximumConcurrentSearches: 2,
  maximumDocuments: 4,
};
const capability: SearchCapability = {
  id: "synthetic-search",
  configuration: "test-v1",
  access: "public_index",
  language: "en",
  country: "us",
  requestCostMicros: 1000,
};

describe.skipIf(!enabled)(
  "durable web discovery in an isolated PostgreSQL schema",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let activation: ActivateScout;
    let records: PostgresWebDiscoveryRepository;
    const schema = `web_discovery_${randomUUID().replaceAll("-", "")}`;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      activation = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      records = new PostgresWebDiscoveryRepository(db);
    });
    afterAll(async () => {
      await db?.destroy();

      if (admin && /^web_discovery_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }

      await admin?.destroy();
    });

    /** Creates a verified synthetic owner and confirmed scout; no real account records are used. */
    async function fixture(
      target = "Product designer",
    ): Promise<ScoutRunRequest> {
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const result = await activation.execute(ownerId, "synthetic-browser", {
        key: randomUUID(),
        search: { ...brief, target },
        alerts: {
          frequency: "daily",
          timezone: "UTC",
          deliveryTime: "00:00",
          weekday: "Monday",
          promptAlerts: false,
          consent: true,
          consentVersion: "opportunity-alerts-v1",
        },
        confirmed: true,
      });
      return { ownerId, scoutId: result.id, version: 1, runId: randomUUID() };
    }

    /** Freezes each test plan under an isolated provider identity where budgets must not overlap. */
    async function open(request: ScoutRunRequest, provider = capability) {
      const search = await records.context(request);
      expect(search).not.toBeNull();
      await records.open(
        request,
        planDiscovery(
          search!,
          request.version,
          limits.maximumDocuments,
          provider,
        ),
        provider,
      );
    }

    /** Settles an empty adaptive portfolio so tests can race, replay or invalidate its next decision. */
    async function explorationFixture() {
      const request = await fixture();
      const provider = { ...capability, id: randomUUID() };
      await records.open(
        request,
        planDiscovery(brief, 1, 4, provider, true),
        provider,
      );
      for (let step = 0; step < 12; step++) {
        const claim = await records.claim(request, limits);
        if (claim.status === "planning") {
          return { request, snapshot: claim.snapshot };
        }
        if (claim.status === "claimed") {
          await records.complete(claim.key, claim.token, {
            ...result(),
            observations: [],
          });
        }
      }
      throw new Error("adaptive_fixture_did_not_settle");
    }

    it("splits alternative goals and uses completed source reviews during the same discovery run", async () => {
      const target = "Product designer or UX designer";
      const request = await fixture(target);
      const reasoning = new PostgresDiscoveryReasoningRepository(
        db,
        1000,
        100_000_000,
      );
      const observed: DiscoveryReasoningInput[] = [];
      const listing = "https://planner.example.org/jobs/designer";
      const application = "https://apply.example.org/design";
      const model = {
        configuration: "fixture-planner-v1",
        /** Chooses a captured application link, then stops instead of repeating a low-yield query. */
        async reason(input: DiscoveryReasoningInput) {
          observed.push(input);
          if (input.kind === "strategy") {
            return {
              output: {
                kind: "strategy" as const,
                strategy: {
                  targets: ["Product designer", "UX designer"],
                  explanation: "Search the two stated alternatives separately.",
                },
              },
              usage: reviewUsage,
            };
          }
          const follow = input.choices.findIndex(
            (choice) =>
              choice.action?.kind === "document" &&
              choice.action.url === application,
          );
          const first = input.choices.findIndex(
            (choice) =>
              choice.action?.kind === "document" &&
              choice.action.url === listing,
          );
          const stop = input.choices.findIndex((choice) => !choice.action);
          return {
            output: {
              kind: "choice" as const,
              index: follow >= 0 ? follow : first >= 0 ? first : stop,
              explanation: "Check the observed application page, then stop.",
            },
            usage: reviewUsage,
          };
        },
      };
      const reviewer = new FixtureLeadProvider();
      const reviews = new ReviewDiscoveryLeads(
        new PostgresLeadReviewRepository(db, 1000, 100_000_000),
        reviewer,
      );
      const provider = {
        capability: { ...capability, id: randomUUID() },
        /** Exposes one public posting so additional work must come from evidence, not fabricated search results. */
        async search() {
          return result(listing);
        },
      };
      const documents = {
        /** Captures role evidence and one explicit outbound application link. */
        async read(url: string) {
          return {
            kind: "document" as const,
            url,
            checkedAt: new Date().toISOString(),
            status: "fetched" as const,
            reason: null,
            text:
              url === application
                ? "Product designer opening. Apply now. Apply by 2020-01-01."
                : "Product designer opening. Apply now.",
            fingerprint: url,
            posting: null,
            hostDelaySeconds: 2,
            links:
              url === listing ? [{ url: application, text: "Apply now" }] : [],
          };
        },
      };
      const discovery = new DiscoverWeb(
        records,
        documents,
        provider,
        limits,
        new PlanScoutSearch(reasoning, model),
        reviews,
      );
      let state = "progress";
      for (let step = 0; step < 60 && state !== "done"; step++) {
        state = await discovery.execute(request);
      }
      expect(state).toBe("done");
      const plan = await records.preparedPlan(request);
      expect(plan?.strategy?.targets).toEqual([
        "Product designer",
        "UX designer",
      ]);
      expect(plan?.queries.some((query) => query.query.includes(" or "))).toBe(
        false,
      );
      const decisions = observed.filter((input) => input.kind === "choice");
      expect(decisions.length).toBeGreaterThan(0);
      expect(
        decisions.some((decision) =>
          decision.evidence.some(
            (item) =>
              item.url === listing &&
              item.label === "job_opening" &&
              item.scope === "source",
          ),
        ),
      ).toBe(true);
      expect(
        decisions.at(-1)!.evidence.some((item) => item.url === application),
      ).toBe(true);
      expect(JSON.stringify(observed)).not.toContain(request.ownerId);
      expect(JSON.stringify(observed)).not.toContain("Lagos");
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        request.ownerId,
      );
      expect(view.cases[0]).toMatchObject({
        documentsChecked: 2,
        searchesCompleted: 4,
        status: "completed",
      });
      const posting = await db
        .selectFrom("opportunity_postings")
        .selectAll()
        .where("url", "=", listing)
        .executeTakeFirstOrThrow();
      const linked = await new PostgresEmployerEvidenceRepository(db, {}).read({
        id: posting.id,
        source: posting.source_id,
        externalId: posting.external_id,
        familyId: posting.family_id,
        title: posting.title,
        company: posting.company,
        location: posting.location,
        url: posting.url,
        sourceUpdatedAt: null,
        text: posting.content,
        fingerprint: posting.fingerprint,
        version: posting.version,
      });
      expect(linked.map((doc) => doc.url)).toEqual([application]);
      const evidence: EmployerResearch = {
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        documents: linked,
        findings: [
          ...(
            [
              "location",
              "authorization",
              "sponsorship",
              "requirements",
            ] as const
          ).map((fact) => ({
            fact,
            status: "unresolved" as const,
            applicability: "unclear" as const,
            value: "",
            explanation: "Not stated.",
            quotes: [],
            sourceUrl: null,
          })),
          {
            fact: "deadline",
            status: "resolved",
            applicability: "this_role",
            value: "2020-01-01",
            explanation: "The application deadline has passed.",
            quotes: ["Apply by 2020-01-01."],
            sourceUrl: application,
          },
        ],
      };
      const extraction = await sql<{
        analysis: PostingAnalysis;
      }>`SELECT r.result->'analysis' AS analysis FROM web_lead_reviews r WHERE r.posting_id=${posting.id} AND r.state='ready' LIMIT 1`.execute(
        db,
      );
      const publicPosting = {
        id: posting.id,
        source: posting.source_id,
        externalId: posting.external_id,
        familyId: posting.family_id,
        title: posting.title,
        company: posting.company,
        location: posting.location,
        url: posting.url,
        sourceUpdatedAt: null,
        text: posting.content,
        fingerprint: posting.fingerprint,
        version: posting.version,
      };
      const intelligence = new PostgresIntelligenceRepository(
        db,
        1000,
        100_000_000,
      );
      const claim = await intelligence.claim({
        kind: "research",
        posting: publicPosting,
        analysis: extraction.rows[0]!.analysis,
        configuration: "fixture-linked-deadline",
      });
      if (claim.status !== "claimed") {
        throw new Error("missing research fixture lease");
      }
      await intelligence.complete(claim.token, {
        kind: "research",
        analysis: { ...extraction.rows[0]!.analysis, research: evidence },
        usage: reviewUsage,
      });
      const availability = new PostgresWebAvailabilitySource(db);
      expect((await availability.check(publicPosting)).status).toBe("closed");
      // Advancing beyond the research TTL must not erase a known elapsed absolute deadline.
      evidence.checkedAt = new Date(Date.now() - 120_000).toISOString();
      evidence.expiresAt = new Date(Date.now() - 60_000).toISOString();
      evidence.documents = evidence.documents.map((document) => ({
        ...document,
        checkedAt: evidence.checkedAt,
      }));
      await sql`UPDATE intelligence_tasks SET result=jsonb_set(result,'{analysis,research}',${JSON.stringify(evidence)}::jsonb) WHERE lease_token=${claim.token}::uuid`.execute(
        db,
      );
      expect((await availability.check(publicPosting)).status).toBe("closed");
      const reviewCount = reviewer.calls;
      expect(await reviews.execute(request)).toBe("done");
      expect(reviewer.calls).toBe(reviewCount);
      const before = observed.length;
      expect(await discovery.execute(request)).toBe("done");
      expect(observed).toHaveLength(before);
      await sql`UPDATE opportunity_postings SET open=false WHERE url IN (${listing},${application})`.execute(
        db,
      );
    });

    it("shares public strategy across owners, fences leases and keeps all planning inside the common AI budget", async () => {
      const first = await fixture("Android engineer");
      const second = await fixture("Android engineer");
      const repository = new PostgresDiscoveryReasoningRepository(
        db,
        1000,
        100_000_000,
      );
      const input: DiscoveryReasoningInput = {
        kind: "strategy",
        intent: {
          target: "Android engineer",
          category: "employment",
          remote: true,
        },
      };
      const configuration = randomUUID();
      const claims = await Promise.all([
        repository.claim(first, "strategy", configuration, input),
        repository.claim(second, "strategy", configuration, input),
      ]);
      expect(claims.map((claim) => claim.status).sort()).toEqual([
        "claimed",
        "waiting",
      ]);
      const claimed = claims.find((claim) => claim.status === "claimed")!;
      await repository.complete(
        claimed.token,
        {
          kind: "strategy",
          strategy: {
            targets: ["Android engineer"],
            explanation: "One profession.",
          },
        },
        reviewUsage,
      );
      expect(
        (await repository.claim(second, "strategy", configuration, input))
          .status,
      ).toBe("ready");
      await sql`UPDATE scouts SET status='paused' WHERE id=${first.scoutId}::uuid`.execute(
        db,
      );
      expect(
        (await repository.claim(first, "strategy", configuration, input))
          .status,
      ).toBe("unavailable");
      const exhausted = new PostgresDiscoveryReasoningRepository(db, 0, 0);
      expect(
        (await exhausted.claim(second, "exhausted", randomUUID(), input))
          .status,
      ).toBe("unavailable");
      const expired = await repository.claim(
        second,
        "expired",
        randomUUID(),
        input,
      );
      expect(expired.status).toBe("claimed");
      if (expired.status !== "claimed") {
        throw new Error("missing fixture lease");
      }
      await sql`UPDATE web_reasoning_tasks SET lease_until=now()-interval '1 second' WHERE lease_token=${expired.token}::uuid`.execute(
        db,
      );
      await repository.complete(
        expired.token,
        {
          kind: "strategy",
          strategy: {
            targets: ["Android engineer"],
            explanation: "Late reply.",
          },
        },
        reviewUsage,
      );
      const task = await sql<{
        state: string;
        output: unknown;
        usage: unknown;
      }>`SELECT state,output,usage FROM web_reasoning_tasks WHERE lease_token=${expired.token}::uuid`.execute(
        db,
      );
      expect(task.rows[0]).toMatchObject({ state: "failed", output: null });
      expect(task.rows[0]!.usage).not.toBeNull();
    });

    it("executes adaptive source and application-link investigation through the use case with bounded public reuse", async () => {
      const request = await fixture();
      const requests: string[] = [];
      let searches = 0;
      const directory = "https://directory.example.org/design";
      const listing = "https://employer.example.net/jobs/42";
      const application = "https://applications.example.org/42";
      const provider = {
        capability: { ...capability, id: randomUUID() },
        /** Returns the same public directory so the policy must follow captured links to find demand. */
        async search() {
          searches++;
          return result(directory);
        },
      };
      const documents = {
        /** Supplies two observed cross-host links without redirects or invented destinations. */
        async read(url: string) {
          requests.push(url);
          const links =
            url === directory
              ? [{ url: listing, text: "Product designer" }]
              : url === listing
                ? [{ url: application, text: "Apply now" }]
                : [];
          return {
            kind: "document" as const,
            url,
            checkedAt: new Date().toISOString(),
            status: "fetched" as const,
            reason: null,
            text: "Product designer opening. Apply now.",
            fingerprint: url,
            posting: null,
            hostDelaySeconds: 2,
            links,
          };
        },
      };
      const useCase = new DiscoverWeb(records, documents, provider, limits);
      for (
        let step = 0;
        step < 40 && (await useCase.execute(request)) !== "done";
        step++
      ) {
        // Each call resumes one durable activity; the fixture never calls an external provider.
      }
      expect(requests).toEqual([directory, listing, application]);
      expect(searches).toBe(6);
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        request.ownerId,
      );
      expect(view.cases[0]).toMatchObject({
        status: "completed",
        documentsChecked: 3,
        searchesCompleted: 6,
        leadCount: 3,
      });
      expect(view.leads.every((lead) => lead.postingId === null)).toBe(true);
      const decisions = await sql<{
        reason: string;
        depth: number;
      }>`SELECT reason,depth FROM web_discovery_decisions WHERE case_id=${request.runId}::uuid ORDER BY round`.execute(
        db,
      );
      expect(decisions.rows.slice(0, 2)).toEqual([
        { reason: "follow_source_link", depth: 1 },
        { reason: "follow_source_link", depth: 2 },
      ]);
      const second = await fixture();
      for (
        let step = 0;
        step < 40 && (await useCase.execute(second)) !== "done";
        step++
      ) {
        // Public operations are reusable across owners; private associations remain separate.
      }
      expect(searches).toBe(6);
      expect(requests).toHaveLength(3);
      expect(
        (
          await new PostgresWebDiscoveryCatalogRepository(db).read(
            second.ownerId,
          )
        ).leads,
      ).toHaveLength(3);
    });

    it("fences concurrent adaptive decisions and rejects invented actions before spending or association", async () => {
      const { request, snapshot } = await explorationFixture();
      const decision = planExploration(snapshot);
      await records.extend(request, snapshot, {
        ...decision,
        action: { kind: "document", url: "https://example.com/invented" },
      });
      expect((await records.claim(request, limits)).status).toBe("planning");
      await Promise.all([
        records.extend(request, snapshot, decision),
        records.extend(request, snapshot, decision),
      ]);
      const count = await sql<{
        count: number;
      }>`SELECT count(*)::integer AS count FROM web_discovery_decisions WHERE case_id=${request.runId}::uuid`.execute(
        db,
      );
      expect(count.rows[0]!.count).toBe(1);
      const next = await records.claim(request, {
        ...limits,
        dailySearchRequests: 4,
      });
      expect(next.status).toBe("done");
      expect(
        (
          await new PostgresWebDiscoveryCatalogRepository(db).read(
            request.ownerId,
          )
        ).cases[0],
      ).toMatchObject({ status: "deferred", reason: "daily_budget_reached" });
    });

    it.each(["paused", "revised", "expired", "newer"])(
      "rejects adaptive decisions when the case becomes %s",
      async (change) => {
        const { request, snapshot } = await explorationFixture();
        if (change === "paused") {
          await sql`UPDATE scouts SET status='paused' WHERE id=${request.scoutId}::uuid`.execute(
            db,
          );
        }
        if (change === "revised") {
          await sql`UPDATE scouts SET version=version+1 WHERE id=${request.scoutId}::uuid`.execute(
            db,
          );
        }
        if (change === "expired") {
          await sql`UPDATE web_discovery_cases SET deadline=now()-interval '1 second' WHERE id=${request.runId}::uuid`.execute(
            db,
          );
        }
        if (change === "newer") {
          await open({ ...request, runId: randomUUID() });
        }
        await records.extend(request, snapshot, planExploration(snapshot));
        const count = await sql<{
          count: number;
        }>`SELECT count(*)::integer AS count FROM web_discovery_decisions WHERE case_id=${request.runId}::uuid`.execute(
          db,
        );
        expect(count.rows[0]!.count).toBe(0);
      },
    );

    /** Captures an intentionally partial public result, distinct from a fit recommendation. */
    function result(url = "https://example.com/job"): WebSearchResult {
      return {
        kind: "search",
        observations: [
          {
            url,
            title: "Product designer",
            snippet: "Looking for a designer",
            rank: 1,
          },
        ],
        checkedAt: new Date().toISOString(),
        completeness: "window",
        nextPage: null,
      };
    }

    /** Seeds public source evidence through a completed owned case, isolating review behavior from search provider mechanics. */
    async function reviewFixture(
      scope: "source" | "search_excerpt" = "source",
    ) {
      const request = await fixture();
      await open(request, { ...capability, id: randomUUID() });
      const id = randomUUID();
      const url = `https://example.org/openings/${id}`;
      const text =
        "Product designer. Permanent remote employment. Apply through this page.";
      const document =
        scope === "source"
          ? { text, checkedAt: new Date().toISOString(), fingerprint: id }
          : null;
      await sql`INSERT INTO web_discovery_leads(id,url,source,title,snippet,first_seen_at,last_seen_at,content_status,document) VALUES(${id},${url},'example.org','Product designer',${text},now(),now(),${scope === "source" ? "fetched" : "unfetched"},${JSON.stringify(document)}::jsonb)`.execute(
        db,
      );
      await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${request.runId}::uuid,${id})`.execute(
        db,
      );
      await sql`UPDATE web_discovery_cases SET status='completed',finished_at=now() WHERE id=${request.runId}::uuid`.execute(
        db,
      );
      return { request, id, document };
    }

    it("shares public reviews across owners while keeping excerpt facts out of the posting index", async () => {
      const a = await reviewFixture("search_excerpt");
      const b = await fixture();
      await open(b, { ...capability, id: randomUUID() });
      await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${b.runId}::uuid,${a.id})`.execute(
        db,
      );
      await sql`UPDATE web_discovery_cases SET status='completed' WHERE id=${b.runId}::uuid`.execute(
        db,
      );
      const provider = new FixtureLeadProvider();
      const reviews = new ReviewDiscoveryLeads(
        new PostgresLeadReviewRepository(db, 100, 10_000_000),
        provider,
      );
      expect(await reviews.execute(a.request)).toBe("progress");
      expect(await reviews.execute(b)).toBe("done");
      expect(provider.calls).toBe(1);
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        b.ownerId,
      );
      expect(view.leads[0]).toMatchObject({
        postingId: null,
        review: { scope: "search_excerpt", label: "job_opening" },
      });
    });

    it("bounds Unicode source excerpts for JavaScript transport without splitting emoji", async () => {
      const entry = await reviewFixture();
      await sql`UPDATE web_discovery_leads SET document=jsonb_set(document,'{text}',to_jsonb(${"a" + "🤝".repeat(10000)}::text)) WHERE id=${entry.id}`.execute(
        db,
      );
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        entry.request.ownerId,
      );
      expect(view.leads[0]!.content!.length).toBeLessThanOrEqual(16000);
      expect(view.leads[0]!.content!.endsWith("🤝")).toBe(true);
    });

    it("shares the AI request ceiling and concurrency slots, and rejects paused or changed public input", async () => {
      const a = await reviewFixture();
      const b = await reviewFixture();
      const c = await reviewFixture();
      const reviews = new PostgresLeadReviewRepository(db, 100, 10_000_000);
      const claims = await Promise.all([
        reviews.claim(a.request, "fixture-v1"),
        reviews.claim(b.request, "fixture-v1"),
        reviews.claim(c.request, "fixture-v1"),
      ]);
      expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(
        2,
      );
      expect(claims.filter((claim) => claim.status === "waiting")).toHaveLength(
        1,
      );
      const first = claims[0];
      if (first?.status !== "claimed") {
        throw new Error("expected_first_claim");
      }
      await sql`UPDATE web_discovery_leads SET document=jsonb_set(document,'{fingerprint}','"changed"'::jsonb) WHERE id=${a.id}`.execute(
        db,
      );
      await reviews.complete(first.token, {
        reviews: first.inputs.map((input) => ({
          id: input.id,
          review: demandReview(input),
        })),
        usage: reviewUsage,
      });
      expect(
        (
          await new PostgresWebDiscoveryCatalogRepository(db).read(
            a.request.ownerId,
          )
        ).leads[0]!.postingId,
      ).toBeNull();
      for (const claim of claims) {
        if (claim.status === "claimed") {
          await reviews.fail(claim.token, "provider_unavailable");
        }
      }
      await sql`UPDATE scouts SET status='paused' WHERE id=${c.request.scoutId}::uuid`.execute(
        db,
      );
      expect((await reviews.claim(c.request, "fixture-v1")).status).toBe(
        "done",
      );
      const limited = await reviewFixture();
      expect(
        (
          await new PostgresLeadReviewRepository(db, 0, 0).claim(
            limited.request,
            "fixture-v1",
          )
        ).status,
      ).toBe("done");
      const deferred = await new PostgresWebDiscoveryCatalogRepository(db).read(
        limited.request.ownerId,
      );
      expect(deferred.cases[0]).toMatchObject({
        reviewStatus: "deferred",
        reviewReason: "ai_budget_reached",
      });
    });

    it("reuses a fresh actionable capture without inventing a newer observation and withholds expired evidence", async () => {
      const entry = await reviewFixture();
      const reviews = new ReviewDiscoveryLeads(
        new PostgresLeadReviewRepository(db, 100, 10_000_000),
        new FixtureLeadProvider(),
      );
      expect(await reviews.execute(entry.request)).toBe("progress");
      const context = await new PostgresScoutingRepository(db).begin(
        entry.request,
      );
      const postings = await new PostgresScoutingRepository(db).candidates(
        context!,
      );
      const posting = postings!.find((item) =>
        item.externalId.endsWith(entry.id),
      )!;
      expect(posting).toMatchObject({
        company: null,
        location: null,
        sourceUpdatedAt: null,
      });
      const availability = new PostgresWebAvailabilitySource(db);
      expect(await availability.check(posting)).toMatchObject({
        status: "available",
        checkedAt: entry.document!.checkedAt,
        fingerprint: posting.fingerprint,
      });
      await sql`UPDATE web_discovery_leads SET document=jsonb_set(document,'{checkedAt}',to_jsonb((now()-interval '16 minutes')::text)) WHERE id=${entry.id}`.execute(
        db,
      );
      expect((await availability.check(posting)).status).toBe("unresolved");
    });

    it("publishes a source-grounded client request into the services index without fabricated organization or dates", async () => {
      const entry = await reviewFixture();
      const text =
        "Product designer needed for a one-off website project. Remote delivery. Apply through this page with your portfolio.";
      await sql`UPDATE web_discovery_leads SET document=jsonb_set(document,'{text}',to_jsonb(${text}::text)) WHERE id=${entry.id}`.execute(
        db,
      );
      const reviews = new PostgresLeadReviewRepository(db, 100, 10_000_000);
      const claim = await reviews.claim(entry.request, "fixture-client-v1");
      if (claim.status !== "claimed") {
        throw new Error("expected_client_claim");
      }
      const review = demandReview(claim.inputs[0]!);
      review.label = "client_request";
      review.analysis.facts.category = {
        status: "stated",
        value: "client_request",
        quotes: [text],
      };
      await reviews.complete(claim.token, {
        reviews: [{ id: entry.id, review }],
        usage: reviewUsage,
      });
      const posting = await sql<{
        kind: string;
        source: string;
        company: string | null;
        date: Date | null;
      }>`SELECT kind,source_id AS source,company,source_updated_at AS date FROM opportunity_postings WHERE id=${`web:${entry.id}`}`.execute(
        db,
      );
      expect(posting.rows[0]).toEqual({
        kind: "client_request",
        source: "web-client-requests",
        company: null,
        date: null,
      });
    });

    it("coalesces concurrent equivalent searches across owners, charges once, and isolates observations", async () => {
      const a = await fixture();
      const b = await fixture();
      const unrelated = await fixture("Accountant");
      await Promise.all([open(a), open(b)]);
      const claims = await Promise.all([
        records.claim(a, limits),
        records.claim(b, limits),
      ]);
      expect(claims.map((claim) => claim.status).sort()).toEqual([
        "claimed",
        "waiting",
      ]);
      const admitted = claims.find((claim) => claim.status === "claimed")!;
      expect(admitted.status).toBe("claimed");

      if (admitted.status !== "claimed") {
        throw new Error("expected_claim");
      }

      await records.complete(admitted.key, admitted.token, result());
      expect((await records.claim(a, limits)).status).toBe("progress");
      expect((await records.claim(b, limits)).status).toBe("progress");
      const catalog = new PostgresWebDiscoveryCatalogRepository(db);
      expect((await catalog.read(a.ownerId)).leads).toHaveLength(1);
      expect((await catalog.read(b.ownerId)).leads).toHaveLength(1);
      expect((await catalog.read(unrelated.ownerId)).leads).toEqual([]);
      const usage = await sql<{
        requests: number;
      }>`SELECT requests FROM web_discovery_usage WHERE provider=${capability.id}`.execute(
        db,
      );
      expect(usage.rows[0]!.requests).toBe(1);
    });

    it("fences stale attempts and never resends an operation after its lease expires", async () => {
      const request = await fixture("Illustrator");
      const provider = { ...capability, id: "lease-test" };
      await open(request, provider);
      const claim = await records.claim(request, limits);

      if (claim.status !== "claimed") {
        throw new Error("expected_claim");
      }

      await sql`UPDATE web_discovery_operations SET lease_until=now()-interval '1 second' WHERE key=${claim.key}`.execute(
        db,
      );
      await records.complete(
        claim.key,
        claim.token,
        result("https://example.com/late"),
      );
      expect((await records.claim(request, limits)).status).toBe("progress");
      expect((await records.claim(request, limits)).status).toBe("progress");
      const operation = await sql<{
        state: string;
        result: unknown;
      }>`SELECT state,result FROM web_discovery_operations WHERE key=${claim.key}`.execute(
        db,
      );
      expect(operation.rows[0]).toEqual({ state: "failed", result: null });
      const usage = await sql<{
        requests: number;
      }>`SELECT requests FROM web_discovery_usage WHERE provider=${provider.id}`.execute(
        db,
      );
      expect(usage.rows[0]!.requests).toBe(1);
    });

    it("enforces shared request and monetary ceilings before dispatch", async () => {
      const request = await fixture("Animator");
      await open(request, { ...capability, id: "budget-test" });
      expect(
        (await records.claim(request, { ...limits, dailySearchMicros: 999 }))
          .status,
      ).toBe("done");
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        request.ownerId,
      );
      expect(view.cases[0]).toMatchObject({
        status: "deferred",
        reason: "daily_budget_reached",
        searchesCompleted: 0,
      });
    });

    it("rejects paused and superseded briefs before admitting another operation", async () => {
      const request = await fixture("Copywriter");
      await open(request, { ...capability, id: "pause-test" });
      await sql`UPDATE scouts SET status='paused',version=version+1 WHERE id=${request.scoutId}::uuid`.execute(
        db,
      );
      expect((await records.claim(request, limits)).status).toBe("done");
      expect(
        (
          await new PostgresWebDiscoveryCatalogRepository(db).read(
            request.ownerId,
          )
        ).leads,
      ).toEqual([]);
    });

    it("reports disabled provider access honestly without admitting work", async () => {
      const request = await fixture("Editor");
      await records.open(request, planDiscovery(brief, 1, 4), null);
      expect((await records.claim(request, limits)).status).toBe("done");
      expect(
        (
          await new PostgresWebDiscoveryCatalogRepository(db).read(
            request.ownerId,
          )
        ).cases[0],
      ).toMatchObject({
        status: "unavailable",
        reason: "provider_not_configured",
      });
    });

    it("preserves incomplete leads, promotes evidence-backed jobs, and feeds existing matching without closing absent listings", async () => {
      const request = await fixture();
      await open(request, { ...capability, id: "pipeline-test" });
      const url = "https://jobs.example.org/design";
      let documentCalls = 0;

      for (let step = 0; step < 24; step++) {
        const claim = await records.claim(request, limits);

        if (claim.status === "done") {
          break;
        }
        if (claim.status !== "claimed") {
          continue;
        }
        if (claim.operation.kind === "search") {
          await records.complete(claim.key, claim.token, result(url));
          continue;
        }

        documentCalls++;
        const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Product designer", hiringOrganization: { name: "Example" }, description: "Remote product design opportunity", datePosted: "2026-09-30", jobLocationType: "TELECOMMUTE" })}</script>`;
        await records.complete(claim.key, claim.token, {
          kind: "document",
          url,
          checkedAt: new Date().toISOString(),
          status: "fetched",
          reason: null,
          text: "Product designer. Permanent remote employment. Apply through this page.",
          fingerprint: "page-v1",
          posting: parseFormalPosting(html, url, new Date()),
          hostDelaySeconds: 2,
        });
      }

      expect(documentCalls).toBe(1);
      const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
        request.ownerId,
      );
      expect(view.cases[0]).toMatchObject({
        status: "completed",
        searchesCompleted: 4,
        documentsChecked: 1,
        leadCount: 1,
      });
      expect(view.leads[0]!.postingId).toBeNull();
      const reviewer = new FixtureLeadProvider();
      const reviews = new ReviewDiscoveryLeads(
        new PostgresLeadReviewRepository(db, 100, 10_000_000),
        reviewer,
      );
      expect(await reviews.execute(request)).toBe("progress");
      expect(await reviews.execute(request)).toBe("done");
      expect(reviewer.calls).toBe(1);
      const reviewed = await new PostgresWebDiscoveryCatalogRepository(db).read(
        request.ownerId,
      );
      expect(reviewed.leads[0]!.review?.label).toBe("job_opening");
      expect(reviewed.leads[0]!.postingId).toBeTruthy();
      const matching = new ScoutOpportunities(
        new PostgresScoutingRepository(db),
      );
      expect(await matching.execute(request)).toBe("done");
      const opportunities = await new PostgresOpportunityCatalogRepository(
        db,
      ).list(request.ownerId);
      expect(opportunities.some((posting) => posting.url === url)).toBe(false);
      const provider = new FixtureWebFitProvider();
      const ai = new ScoutOpportunities(
        new PostgresScoutingRepository(db),
        new EvaluateCandidates(
          new PostgresIntelligenceRepository(db, 100, 10_000_000),
          provider,
        ),
      );
      const privateRun = { ...request, runId: randomUUID() };
      expect(await ai.execute(privateRun)).toBe("progress");
      for (
        let step = 0;
        step < 8 && (await ai.execute(privateRun)) !== "done";
        step++
      ) {
        // Shared public postings can serve several owners; each needs exactly one private assessment.
      }
      const matches = await new PostgresOpportunityCatalogRepository(db).list(
        request.ownerId,
      );
      expect(provider.calls).toBe(matches.length);
      expect(matches.find((item) => item.url === url)).toMatchObject({
        company: null,
        location: null,
        detail: { assessedBy: "ai" },
      });
    });

    it("retains immutable evidence across changed and unchanged page refreshes without inflating source totals", async () => {
      const request = await fixture("UX researcher");
      const url = "https://careers.example.net/research";

      for (const [index, description] of [
        "Research customer needs",
        "Research customer needs and lead interviews",
        "Research customer needs and lead interviews",
      ].entries()) {
        const run = { ...request, runId: randomUUID() };
        await open(run, { ...capability, id: `refresh-test-${index}` });
        // Advance through distinct discovery buckets without a wall-clock wait or external calls.
        await sql`UPDATE web_discovery_cases SET started_at=now()-make_interval(hours=>${2 - index}) WHERE id=${run.runId}::uuid`.execute(
          db,
        );
        await sql`UPDATE web_discovery_hosts SET next_allowed_at=now() WHERE hostname='careers.example.net'`.execute(
          db,
        );

        for (let step = 0; step < 24; step++) {
          const claim = await records.claim(run, limits);

          if (claim.status === "done") {
            break;
          }
          if (claim.status !== "claimed") {
            continue;
          }
          if (claim.operation.kind === "search") {
            await records.complete(claim.key, claim.token, result(url));
            continue;
          }

          const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "UX researcher", hiringOrganization: { name: "Example" }, description, datePosted: "2026-09-30", jobLocationType: "TELECOMMUTE" })}</script>`;
          await records.complete(claim.key, claim.token, {
            kind: "document",
            url,
            checkedAt: new Date().toISOString(),
            status: "fetched",
            reason: null,
            text: `UX researcher. Permanent remote employment. Apply through this page. ${description}`,
            fingerprint: description,
            posting: parseFormalPosting(html, url, new Date()),
            hostDelaySeconds: 2,
          });
        }
        const reviews = new ReviewDiscoveryLeads(
          new PostgresLeadReviewRepository(db, 100, 10_000_000),
          new FixtureLeadProvider(),
        );
        for (
          let step = 0;
          step < 8 && (await reviews.execute(run)) !== "done";
          step++
        ) {
          // Each activity advances one bounded review batch.
        }
      }

      const evidence = await sql<{
        version: number;
        snapshotVersion: number;
        text: string;
      }>`SELECT e.version,(e.snapshot->>'version')::integer AS "snapshotVersion",e.snapshot->>'text' AS text FROM opportunity_evidence e JOIN opportunity_postings p ON p.id=e.posting_id WHERE p.url=${url} ORDER BY e.version`.execute(
        db,
      );
      expect(
        evidence.rows.map(({ version, snapshotVersion }) => ({
          version,
          snapshotVersion,
        })),
      ).toEqual([
        { version: 1, snapshotVersion: 1 },
        { version: 2, snapshotVersion: 2 },
      ]);
      expect(evidence.rows[0]!.text).not.toContain("lead interviews");
      expect(evidence.rows[1]!.text).toContain("lead interviews");
      const totals = await sql<{
        reported: number;
        actual: number;
      }>`SELECT s.posting_count AS reported,(SELECT count(*)::integer FROM opportunity_postings WHERE source_id=s.id) AS actual FROM opportunity_sources s WHERE s.id='web-discovery'`.execute(
        db,
      );
      expect(totals.rows[0]!.reported).toBe(totals.rows[0]!.actual);
    });
  },
);
