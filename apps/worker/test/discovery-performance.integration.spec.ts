import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresDiscoveryPerformanceRepository,
  queryRoute,
  sourceRoute,
} from "@repo/adapters/discovery";

describe.skipIf(process.env.WEB_DISCOVERY_INTEGRATION !== "1")(
  "durable discovery measurements",
  () => {
    const schema = `yield_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let records: PostgresDiscoveryPerformanceRepository;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      records = new PostgresDiscoveryPerformanceRepository(db);
    });

    beforeEach(async () => {
      await sql`TRUNCATE discovery_routes,web_discovery_operations,web_discovery_leads,web_lead_reviews CASCADE`.execute(
        db,
      );
    });

    afterAll(async () => {
      await db?.destroy();
      if (admin && /^yield_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }
      await admin?.destroy();
    });

    /** Creates a finished synthetic provider operation, without external requests or account records. */
    async function operation(state = "succeeded"): Promise<string> {
      const key = randomUUID();
      await sql`INSERT INTO web_discovery_operations(key,provider,kind,input,state) VALUES(${key},'fixture','search','{}'::jsonb,${state})`.execute(
        db,
      );
      return key;
    }

    it("counts replayed receipts once and canonical repeat URLs as repeat observations", async () => {
      const route = queryRoute("fixture", "product design jobs");
      const key = await operation();
      await db.transaction().execute(async (tx) => {
        const measurements = new PostgresDiscoveryPerformanceRepository(tx);
        await measurements.admit(key, route, 1000);
        await measurements.admit(key, route, 1000);
        await measurements.settle(
          key,
          [
            "https://example.com/jobs/1?utm_source=fixture",
            "https://example.com/jobs/1",
          ],
          true,
        );
        await measurements.settle(key, ["https://example.com/jobs/2"], true);
      });
      const next = await operation();
      await db.transaction().execute(async (tx) => {
        const measurements = new PostgresDiscoveryPerformanceRepository(tx);
        await measurements.admit(next, route, 1000);
        await measurements.settle(
          next,
          ["https://example.com/jobs/1", "https://example.com/jobs/2"],
          true,
        );
      });
      expect((await records.samples([route])).get(route.id)).toMatchObject({
        attempts: 2,
        successful: 2,
        observations: 3,
        novel: 2,
        reviewed: 0,
        noise: 0,
      });
      expect(
        (
          await sql<{
            cost: number;
          }>`SELECT sum(reserved_micros)::int AS cost FROM discovery_route_attempts`.execute(
            db,
          )
        ).rows[0]?.cost,
      ).toBe(2000);
    });

    it("rolls back measurements with admission and excludes unfinished operations", async () => {
      const route = queryRoute("fixture", "design projects");
      const key = await operation("running");
      await expect(
        db.transaction().execute(async (tx) => {
          await new PostgresDiscoveryPerformanceRepository(tx).admit(
            key,
            route,
            1000,
          );
          throw new Error("fixture rollback");
        }),
      ).rejects.toThrow("fixture rollback");
      expect((await records.samples([route])).get(route.id)?.attempts).toBe(0);
      await records.admit(key, route, 1000);
      expect((await records.samples([route])).get(route.id)?.attempts).toBe(0);
      await sql`UPDATE web_discovery_operations SET state='failed' WHERE key=${key}`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)).toMatchObject({
        attempts: 1,
        successful: 0,
        noise: 0,
      });
    });

    it("uses complete current source labels, excluding stale, truncated and unavailable evidence", async () => {
      const route = sourceRoute("fixture", "https://example.com/open");
      const key = await operation();
      await records.admit(key, route, 0);
      await db
        .transaction()
        .execute((tx) =>
          new PostgresDiscoveryPerformanceRepository(tx).settle(
            key,
            ["https://example.com/open"],
            true,
          ),
        );
      const lead = (
        await sql<{
          lead_id: string;
        }>`SELECT lead_id FROM discovery_route_leads`.execute(db)
      ).rows[0]!.lead_id;
      await sql`INSERT INTO web_discovery_leads(id,url,source,content_status,document,first_seen_at,last_seen_at) VALUES(${lead},'https://example.com/open','example.com','fetched','{"fingerprint":"v1"}'::jsonb,now(),now())`.execute(
        db,
      );
      await sql`INSERT INTO web_lead_reviews(key,lead_id,configuration,input,state,result) VALUES('fixture',${lead},'fixture','{"scope":"source","documentFingerprint":"v1","truncated":false}'::jsonb,'ready','{"label":"client_request"}'::jsonb)`.execute(
        db,
      );
      await sql`UPDATE web_discovery_leads SET review_key='fixture' WHERE id=${lead}`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)).toMatchObject({
        reviewed: 1,
        demand: 1,
        noise: 0,
      });
      await sql`UPDATE web_lead_reviews SET input=jsonb_set(input,'{truncated}','true')`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)?.reviewed).toBe(0);
      await sql`UPDATE web_lead_reviews SET input=jsonb_set(input,'{truncated}','false')`.execute(
        db,
      );
      await sql`UPDATE web_discovery_leads SET document='{"fingerprint":"v2"}'::jsonb`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)?.reviewed).toBe(0);
      await sql`UPDATE web_discovery_leads SET document='{"fingerprint":"v1"}'::jsonb,content_status='unavailable'`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)?.reviewed).toBe(0);
    });

    it("bounds attempt history and preserves provider and query locale boundaries", async () => {
      const query = {
        query: "designer",
        language: "en",
        country: "us",
        freshness: "month" as const,
        page: 1,
        limit: 10,
      };
      const route = queryRoute("fixture", query);
      expect(queryRoute("fixture", { ...query, page: 2 }).id).toBe(route.id);
      expect(queryRoute("fixture", { ...query, country: "ng" }).id).not.toBe(
        route.id,
      );
      expect(queryRoute("other", query).id).not.toBe(route.id);
      for (let index = 0; index < 25; index++) {
        await records.admit(await operation("failed"), route, 1000);
      }
      expect((await records.samples([route])).get(route.id)?.attempts).toBe(20);
      await sql`UPDATE discovery_route_attempts SET created_at=now()-interval '8 days'`.execute(
        db,
      );
      expect((await records.samples([route])).get(route.id)?.attempts).toBe(0);
    });
  },
);
