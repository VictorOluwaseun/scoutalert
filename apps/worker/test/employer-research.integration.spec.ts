import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresEmployerEvidenceRepository,
  PostgresIntelligenceRepository,
  PostgresSourceRepository,
} from "@repo/adapters/scouting";
import { posting, analysis } from "./fixtures/intelligence.js";

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "shared employer evidence and monetary admission",
  () => {
    const schema = `employer_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      const source = new PostgresSourceRepository(db);
      const lease = await source.claim(posting.source, new Date());
      await source.publish(
        {
          source: posting.source,
          checkedAt: new Date().toISOString(),
          postings: [posting],
        },
        lease!,
      );
    });
    afterAll(async () => {
      await db?.destroy();

      if (admin && /^employer_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }

      await admin?.destroy();
    });
    it("shares one refresh, rejects user URLs, and refreshes expired documents", async () => {
      const request = vi.fn(
        async () =>
          new Response(
            "<main><p>All roles require work authorization.</p></main><script>malicious()</script>",
            { headers: { "content-type": "text/html" } },
          ),
      );
      const repo = new PostgresEmployerEvidenceRepository(
        db,
        { example: ["https://www.figma.com/careers/"] },
        request,
      );
      const results = await Promise.all([
        repo.read(posting),
        repo.read({ ...posting, url: "http://localhost/secrets" }),
      ]);
      expect(request).toHaveBeenCalledTimes(1);
      expect(results.flat()).not.toHaveLength(0);
      expect((await repo.read(posting))[0]?.text).toBe(
        "All roles require work authorization.",
      );
      expect(request).toHaveBeenCalledTimes(1);
      expect(await repo.read({ ...posting, source: "unapproved" })).toEqual([]);
      await sql`UPDATE employer_evidence_documents SET next_check_at=now()-interval '1 second'`.execute(
        db,
      );
      await repo.read(posting);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenCalledWith(
        "https://www.figma.com/careers/",
        expect.objectContaining({ redirect: "error" }),
      );
    });
    it("does not treat provider errors or oversized HTML as usable evidence", async () => {
      for (const response of [
        new Response(null, { status: 503 }),
        new Response("x".repeat(2_000_001), {
          headers: { "content-type": "text/html" },
        }),
      ]) {
        await sql`UPDATE employer_evidence_documents SET next_check_at=now()-interval '1 second'`.execute(
          db,
        );
        const repo = new PostgresEmployerEvidenceRepository(
          db,
          { example: ["https://www.figma.com/careers/"] },
          async () => response,
        );
        expect(await repo.read(posting)).toEqual([]);
      }
    });
    it("admits public research under the same dollar lock and records measured cost", async () => {
      const repo = new PostgresIntelligenceRepository(db, 50, 75_000);
      const task = {
        kind: "research" as const,
        posting,
        analysis,
        configuration: "test-research",
        evidenceEpoch: "test",
      };
      const claim = await repo.claim(task);
      expect(claim.status).toBe("claimed");

      if (claim.status !== "claimed") {
        throw new Error("fixture claim missing");
      }

      await repo.complete(claim.token, {
        kind: "research",
        analysis,
        usage: {
          model: "gpt-5.4-mini-2026-03-17",
          inputTokens: 1000,
          cachedInputTokens: 800,
          outputTokens: 100,
          durationMs: 10,
          responseId: "fixture",
        },
      });
      expect((await repo.claim(task)).status).toBe("ready");
      expect(
        (await repo.claim({ ...task, configuration: "another" })).status,
      ).toBe("unavailable");
      const stats = await sql<{
        estimated_microusd: string;
        attempts: string;
      }>`SELECT * FROM intelligence_usage_daily`.execute(db);
      expect(stats.rows[0]?.estimated_microusd).toBe("660");
      expect(stats.rows[0]?.attempts).toBe("1");
      const row = await db
        .selectFrom("intelligence_tasks")
        .select(["owner_id", "scout_id"])
        .where("kind", "=", "research")
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ owner_id: null, scout_id: null });
    });
  },
);
