import { digestWindow } from "@repo/core/notifications";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresIntelligenceRepository,
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresOpportunityCatalogRepository,
} from "@repo/adapters/scouting";
import { PostgresOpportunityDeliveryRepository } from "@repo/adapters/notifications";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import { ActivateScout, ReviewSearchDraft } from "@repo/core/onboarding";
import {
  EvaluateCandidates,
  IntelligenceProvider,
  ScoutOpportunities,
  type IntelligenceTask,
  type IntelligenceResult,
  type RunContext,
  fitReviewRequest,
  researchFacts,
  type PostingAnalysis,
} from "@repo/core/scouting";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

const usage = {
  model: "fixture",
  inputTokens: 100,
  outputTokens: 50,
  durationMs: 1,
  responseId: "fixture",
};
const result: IntelligenceResult & { kind: "extraction" } = {
  kind: "extraction",
  analysis,
  usage,
};
/** Deterministic provider only for persistence/orchestration failure tests, never used by app composition. */
class FixtureProvider extends IntelligenceProvider {
  readonly configuration = "fixture-v1";
  calls = 0;

  /** Supplies known evidence for transaction and replay checks. */
  async extract(): Promise<IntelligenceResult & { kind: "extraction" }> {
    this.calls++;

    return result;
  }

  /** Supplies known private criteria for owner isolation checks. */
  async assess(): Promise<IntelligenceResult & { kind: "fit" }> {
    this.calls++;

    return { kind: "fit", fit, usage };
  }
}

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "intelligence persistence and bounded execution",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let context: RunContext;
    const schema = `intelligence_${randomUUID().replaceAll("-", "")}`;
    const task: IntelligenceTask = {
      kind: "extraction",
      posting,
      configuration: "fixture-v1",
    };
    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
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
      const scout = await activation.execute(ownerId, "synthetic-browser", {
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
      context = {
        request: {
          ownerId,
          scoutId: scout.id,
          version: 1,
          runId: randomUUID(),
        },
        search,
      };
      const sources = new PostgresSourceRepository(db);
      const token = await sources.claim(posting.source, new Date());
      await sources.publish(
        {
          source: posting.source,
          checkedAt: new Date().toISOString(),
          postings: [posting],
        },
        token!,
      );
    });
    afterAll(async () => {
      await db?.destroy();

      if (admin && /^intelligence_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }

      await admin?.destroy();
    });
    it("fences duplicate shared attempts and reuses public extraction", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const claims = await Promise.all([
        repository.claim(task),
        repository.claim(task),
      ]);
      expect(claims.map((item) => item.status).sort()).toEqual([
        "claimed",
        "waiting",
      ]);
      const acquired = claims.find((item) => item.status === "claimed")!;

      if (acquired.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await repository.complete(acquired.token, result);
      expect((await repository.claim(task)).status).toBe("ready");
    });

    it.each([
      "required",
      "failed_required",
      "failed_audit",
      "expired_required",
    ])(
      "persists and fences a %s review without retries or unsafe publication",
      async (mode) => {
        const sourceId = `selective-${mode}`;
        const condition = "Applicants must reside in Canada.";
        const candidate = {
          ...posting,
          id: `${sourceId}:1`,
          source: sourceId,
          fingerprint: sourceId,
          text:
            mode === "failed_audit"
              ? posting.text
              : `${posting.text}\n${condition}`,
        };
        const source = new PostgresSourceRepository(db);
        const lease = await source.claim(sourceId, new Date());
        await source.publish(
          {
            source: sourceId,
            checkedAt: new Date().toISOString(),
            postings: [candidate],
          },
          lease!,
        );
        const run = {
          ...context,
          request: { ...context.request, runId: randomUUID() },
        };
        await new PostgresScoutingRepository(db).begin(run.request);
        const records = new PostgresIntelligenceRepository(db, 1000);
        let miniCalls = 0;
        let expertCalls = 0;
        const evaluator = new EvaluateCandidates(
          records,
          {
            configuration: sourceId,
            /** Authored public extraction avoids network requests in the persistence check. */
            async extract() {
              miniCalls++;
              return result;
            },
            /** The authored mini verdict deliberately misses the added country condition. */
            async assess() {
              miniCalls++;
              return { kind: "fit" as const, fit, usage };
            },
          },
          undefined,
          {
            configuration: `${sourceId}-expert`,
            /** Simulates a correction, terminal failure or late response after the worker loses its lease. */
            async review() {
              expertCalls++;
              if (mode.startsWith("failed")) {
                throw new Error("fixture_unavailable");
              }
              if (mode === "expired_required") {
                await sql`UPDATE intelligence_tasks SET lease_until=now()-interval '1 second' WHERE posting_id=${candidate.id} AND review_of IS NOT NULL`.execute(
                  db,
                );
              }
              return {
                kind: "fit" as const,
                usage,
                fit: {
                  criteria: fit.criteria.map((item) =>
                    item.criterion === "location"
                      ? {
                          ...item,
                          status: "conflicts" as const,
                          quotes: [condition],
                          briefQuotes: [search.workLocations],
                        }
                      : item,
                  ),
                },
              };
            },
          },
          mode === "failed_audit" ? 100 : 0,
        );
        let state: Awaited<ReturnType<EvaluateCandidates["evaluate"]>> =
          "progress";
        for (let step = 0; step < 8 && typeof state === "string"; step++) {
          state = await evaluator.evaluate(run, [candidate]);
        }
        expect(state).toHaveLength(mode === "failed_audit" ? 1 : 0);
        expect(miniCalls).toBe(2);
        expect(expertCalls).toBe(1);
        const saved = await sql<{
          configuration: string;
          status: string;
          attempts: number;
          review_of: string;
        }>`SELECT configuration,status,attempts,review_of FROM intelligence_tasks WHERE posting_id=${candidate.id} AND review_of IS NOT NULL`.execute(
          db,
        );
        expect(saved.rows).toHaveLength(1);
        expect(saved.rows[0]!.attempts).toBe(1);
        expect(saved.rows[0]!.status).toBe(
          mode === "required"
            ? "ready"
            : mode === "expired_required"
              ? "running"
              : "failed",
        );
        const next = {
          ...run,
          request: { ...run.request, runId: randomUUID() },
        };
        await new PostgresScoutingRepository(db).begin(next.request);
        expect(
          (await records.plan(next, [candidate], saved.rows[0]!.configuration))
            .selected,
        ).toEqual([]);
        expect(await evaluator.evaluate(next, [candidate])).toHaveLength(
          mode === "failed_audit" ? 1 : 0,
        );
        expect(expertCalls).toBe(1);
        const review = fitReviewRequest(
          candidate,
          analysis,
          fit,
          mode === "failed_audit" ? "sample_audit" : "conditional_requirements",
        );
        expect(
          (
            await records.claim({
              kind: "fit",
              posting: candidate,
              analysis,
              configuration: saved.rows[0]!.configuration,
              review,
              context: {
                ...run,
                request: { ...run.request, ownerId: randomUUID() },
              },
            })
          ).status,
        ).toBe("unavailable");
        await sql`UPDATE opportunity_postings SET open=false WHERE id=${candidate.id}`.execute(
          db,
        );
      },
    );
    it("rejects foreign private cache reads and stale revisions", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const privateTask = { ...task, kind: "fit" as const, context, analysis };
      expect(
        (
          await repository.claim({
            ...privateTask,
            context: {
              ...context,
              request: { ...context.request, ownerId: randomUUID() },
            },
          })
        ).status,
      ).toBe("unavailable");
      expect(
        (
          await repository.claim({
            ...privateTask,
            context: {
              ...context,
              request: { ...context.request, version: 2 },
            },
          })
        ).status,
      ).toBe("unavailable");
    });
    it.each(["ordinary", "completed_expert", "pending_expert"])(
      "reuses %s fit only after equivalent research is freshly checked, preserving legacy receipts",
      async (mode) => {
        const configuration = `refresh-${mode}`;
        const repository = new PostgresIntelligenceRepository(db, 100);
        const oldId = randomUUID();
        const freshId = randomUUID();
        const legacyId = randomUUID();
        const checkedAt = new Date().toISOString();
        const fresh: PostingAnalysis = {
          ...analysis,
          research: {
            checkedAt,
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            documents: [
              {
                url: posting.url,
                text: posting.text,
                fingerprint: "research-1",
                checkedAt,
              },
            ],
            findings: researchFacts.map((fact) => ({
              fact,
              status: "unresolved",
              applicability: "unclear",
              value: "",
              explanation: "Not established.",
              quotes: [],
              sourceUrl: null,
            })),
          },
        };
        const stale = structuredClone(fresh);
        stale.research!.checkedAt = new Date(
          Date.now() - 20 * 60_000,
        ).toISOString();
        stale.research!.expiresAt = new Date(
          Date.now() - 5 * 60_000,
        ).toISOString();
        stale.research!.documents[0]!.checkedAt = stale.research!.checkedAt;
        for (const [id, evidence] of [
          [oldId, stale],
          [freshId, fresh],
        ] as const) {
          await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,status,result) VALUES(${id},'research',${configuration},${posting.id},${posting.version},'ready',${JSON.stringify({ kind: "research", analysis: evidence, usage })}::jsonb)`.execute(
            db,
          );
        }
        const review =
          mode === "ordinary"
            ? {}
            : {
                review: {
                  status: mode === "completed_expert" ? "completed" : "pending",
                  reason: "conditional_requirements",
                },
              };
        await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,owner_id,scout_id,scout_version,analysis_task_id,status,result) VALUES(${legacyId},'fit',${configuration},${posting.id},${posting.version},${context.request.ownerId}::uuid,${context.request.scoutId}::uuid,${context.request.version},${oldId},'ready',${JSON.stringify({ kind: "fit", fit, usage, ...review })}::jsonb)`.execute(
          db,
        );
        const request: IntelligenceTask = {
          kind: "fit",
          posting,
          configuration,
          context,
          analysis: fresh,
        };
        const firstRun = {
          ...context,
          request: { ...context.request, runId: randomUUID() },
        };
        await new PostgresScoutingRepository(db).begin(firstRun.request);
        expect(
          (await repository.plan(firstRun, [posting], configuration)).selected,
        ).toEqual([posting.id]);
        expect(
          (await repository.claim({ ...request, analysis: stale })).status,
        ).toBe("unavailable");
        const claims = await Promise.all([
          repository.claim(request),
          repository.claim(request),
        ]);
        if (mode === "pending_expert") {
          expect(claims.map((claim) => claim.status).sort()).toEqual([
            "claimed",
            "waiting",
          ]);
          const admitted = claims.find((claim) => claim.status === "claimed")!;
          await repository.complete(admitted.token, {
            kind: "fit",
            fit,
            usage,
          });
          return;
        }
        expect(claims.map((claim) => claim.status)).toEqual(["ready", "ready"]);
        expect(
          (
            await repository.claim({
              ...request,
              context: {
                ...context,
                request: { ...context.request, ownerId: randomUUID() },
              },
            })
          ).status,
        ).toBe("unavailable");
        expect(
          (
            await repository.claim({
              ...request,
              context: {
                ...context,
                search: {
                  ...context.search,
                  background: "Different private brief",
                },
              },
            })
          ).status,
        ).toBe("unavailable");
        const attempts =
          await sql`SELECT 1 FROM intelligence_attempts a JOIN intelligence_tasks t ON t.id=a.task_id WHERE t.configuration=${configuration}`.execute(
            db,
          );
        expect(attempts.rows).toHaveLength(0);
        const nextRun = {
          ...context,
          request: { ...context.request, runId: randomUUID() },
        };
        await new PostgresScoutingRepository(db).begin(nextRun.request);
        const cached = await repository.plan(nextRun, [posting], configuration);
        expect(cached.selected).toEqual([]);
        expect(cached.results[0]!.analysis).toEqual(fresh);
        const renewed = structuredClone(fresh);
        renewed.research!.checkedAt = new Date().toISOString();
        renewed.research!.documents[0]!.checkedAt = renewed.research!.checkedAt;
        renewed.research!.expiresAt = new Date(
          Date.now() + 20 * 60_000,
        ).toISOString();
        const renewedId = randomUUID();
        await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,status,result) VALUES(${renewedId},'research',${configuration},${posting.id},${posting.version},'ready',${JSON.stringify({ kind: "research", analysis: renewed, usage })}::jsonb)`.execute(
          db,
        );
        expect(
          (await repository.claim({ ...request, analysis: renewed })).status,
        ).toBe("ready");
        const renewedPlan = await repository.plan(
          nextRun,
          [posting],
          configuration,
        );
        expect(renewedPlan.results[0]!.analysis).toEqual(renewed);
        expect(
          (
            await sql`SELECT 1 FROM intelligence_attempts a JOIN intelligence_tasks t ON t.id=a.task_id WHERE t.configuration=${configuration}`.execute(
              db,
            )
          ).rows,
        ).toHaveLength(0);
        const retained = await sql<{
          analysis_task_id: string;
        }>`SELECT analysis_task_id FROM intelligence_tasks WHERE id=${legacyId}`.execute(
          db,
        );
        expect(retained.rows[0]!.analysis_task_id).toBe(oldId);
        const changed = structuredClone(fresh);
        changed.research!.documents[0]!.fingerprint = "research-2";
        const changedId = randomUUID();
        await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,status,result) VALUES(${changedId},'research',${configuration},${posting.id},${posting.version},'ready',${JSON.stringify({ kind: "research", analysis: changed, usage })}::jsonb)`.execute(
          db,
        );
        const changedClaim = await repository.claim({
          ...request,
          analysis: changed,
        });
        expect(changedClaim.status).toBe("claimed");
        if (changedClaim.status !== "claimed") {
          throw new Error("missing_changed_evidence_lease");
        }
        await repository.complete(changedClaim.token, {
          kind: "fit",
          fit,
          usage,
        });
      },
    );
    it("publishes evidence-linked fit and includes the same conclusions in eligible digest contents", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const provider = new FixtureProvider();
      const matching = new ScoutOpportunities(
        new PostgresScoutingRepository(db),
        new EvaluateCandidates(repository, provider),
      );
      expect(await matching.execute(context.request)).toBe("progress");
      expect(await matching.execute(context.request)).toBe("done");
      expect(provider.calls).toBe(1); // shared extraction was reused
      const feed = await new PostgresOpportunityCatalogRepository(db).list(
        context.request.ownerId,
      );
      expect(feed[0]?.detail?.criteria).toHaveLength(7);
      expect(feed[0]?.assessmentScout).toBe(search.name);
      const delivery = new PostgresOpportunityDeliveryRepository(db);
      const candidates = await delivery.candidates();
      const prepared = await delivery.prepare(
        context.request.ownerId,
        digestWindow(candidates[0]!.alerts, new Date())!,
        candidates,
      );
      expect(prepared?.opportunities[0]?.detail?.assessedBy).toBe("ai");
      const again = await new EvaluateCandidates(repository, provider).evaluate(
        context,
        [posting],
      );
      expect(again).toHaveLength(1);
      expect(provider.calls).toBe(1);
    });
    it("does not publish a late response after its lease expires or a source version changes", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const changed = { ...task, configuration: "fencing" };
      const first = await repository.claim(changed);

      if (first.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await sql`UPDATE intelligence_tasks SET lease_until=now()-interval '1 second' WHERE lease_token=${first.token}::uuid`.execute(
        db,
      );
      const second = await repository.claim(changed);

      if (second.status !== "claimed") {
        throw new Error("missing replacement lease");
      }

      await repository.complete(first.token, result);
      expect((await repository.claim(changed)).status).toBe("waiting");
      await sql`UPDATE opportunity_postings SET version=version+1 WHERE id=${posting.id}`.execute(
        db,
      );
      await repository.complete(second.token, result);
      expect((await repository.claim(changed)).status).toBe("unavailable");
      await sql`UPDATE opportunity_postings SET version=1 WHERE id=${posting.id}`.execute(
        db,
      );
      await repository.fail(second.token, "provider_unavailable");
    });
    it("retains a failure cooldown and enforces a shared daily request budget", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const failedTask = { ...task, configuration: "failure" };
      const claim = await repository.claim(failedTask);

      if (claim.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await repository.fail(claim.token, "provider_unavailable");
      expect((await repository.claim(failedTask)).status).toBe("unavailable");
      const limited = new PostgresIntelligenceRepository(db, 1);
      expect(
        (await limited.claim({ ...task, configuration: "over-budget" })).status,
      ).toBe("unavailable");
    });
  },
);
