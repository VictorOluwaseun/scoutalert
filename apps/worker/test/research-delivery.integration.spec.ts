import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import {
  PostgresAvailabilityRepository,
  PostgresSourceRepository,
  PostgresScoutingRepository,
} from "@repo/adapters/scouting";
import {
  PostgresOpportunityDeliveryRepository,
  createSmtpClient,
  SmtpEmailProvider,
} from "@repo/adapters/notifications";
import {
  ActivateScout,
  ReviewSearchDraft,
  type ScoutAlerts,
} from "@repo/core/onboarding";
import {
  assessPersonalFit,
  type AvailabilityEvidence,
} from "@repo/core/scouting";
import {
  DeliverOpportunityDigests,
  promptWindow,
  digestWindow,
} from "@repo/core/notifications";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

const enabled = process.env.SCOUTING_INTEGRATION === "1";
const confirmedSearch = {
  ...search,
  authorizationLocations: "Nigeria",
  sponsorshipNeed: "not_needed" as const,
  authorizationConfirmed: true,
};
const choices: ScoutAlerts = {
  frequency: "daily",
  deliveryTime: "00:00",
  timezone: "UTC",
  weekday: "Monday",
  promptAlerts: true,
  consent: true,
  consentVersion: "opportunity-alerts-v1",
};

describe.skipIf(!enabled)(
  "research and prompt reservations in an isolated schema",
  () => {
    const schema = `research_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let now: Date;
    let research: PostgresAvailabilityRepository;
    let ledger: PostgresOpportunityDeliveryRepository;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      research = new PostgresAvailabilityRepository(db);
      ledger = new PostgresOpportunityDeliveryRepository(db, () => now);
    });
    beforeEach(async () => {
      await sql`TRUNCATE users,opportunity_sources CASCADE`.execute(db);
      await sql`UPDATE delivery_scan_cursor SET after_owner=NULL`.execute(db);
      now = new Date();
      now.setUTCHours(12, 0, 0, 0);
    });
    afterAll(async () => {
      await db?.destroy();

      if (admin && /^research_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }

      await admin?.destroy();
    });

    /** Creates actual activated scouts and shared source evidence, publishing a controlled grounded assessment. */
    async function fixture(count = 1) {
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `research-${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const source = new PostgresSourceRepository(db);
      const lease = await source.claim(posting.source, new Date());

      if (lease) {
        await source.publish(
          {
            source: posting.source,
            checkedAt: new Date().toISOString(),
            postings: [posting],
          },
          lease,
        );
      }

      const activation = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      const records = new PostgresScoutingRepository(db);
      const scouts = [];

      for (let index = 0; index < count; index++) {
        const scout = await activation.execute(ownerId, "synthetic-browser", {
          key: randomUUID(),
          search: { ...confirmedSearch, name: `Research ${index}` },
          alerts: choices,
          confirmed: true,
        });
        const context = await records.begin({
          scoutId: scout.id,
          ownerId,
          version: 1,
          runId: randomUUID(),
        });
        await records.complete(context!, [
          {
            posting,
            assessment: assessPersonalFit(confirmedSearch, analysis, fit)!,
          },
        ]);
        scouts.push(scout);
      }

      return { ownerId, scouts };
    }

    /** Completes one public research lease with a dated observation, preserving the real transaction path. */
    async function observe(
      status: AvailabilityEvidence["status"] = "available",
    ) {
      const claim = await research.claim();
      expect(claim).not.toBeNull();
      await research.complete(claim!.token, {
        status,
        fingerprint: posting.fingerprint,
        checkedAt: now.toISOString(),
        sourceUrl: "https://boards-api.greenhouse.io/v1/boards/example/jobs/1",
      });

      return claim!;
    }

    it("shares one claim across overlapping scouts, fences late writers and rejects superseded evidence", async () => {
      await fixture(2);
      const claims = await Promise.all([research.claim(), research.claim()]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const first = claims.find(Boolean)!;
      await sql`UPDATE posting_availability SET lease_until=now()-interval '1 second'`.execute(
        db,
      );
      const replacement = await observe();
      await research.complete(first.token, {
        status: "closed",
        checkedAt: now.toISOString(),
        sourceUrl: "https://boards-api.greenhouse.io/",
        fingerprint: null,
      });
      expect(
        (
          await sql<{
            status: string;
          }>`SELECT evidence->>'status' AS status FROM posting_availability`.execute(
            db,
          )
        ).rows[0]?.status,
      ).toBe("available");
      expect(await research.claim()).toBeNull();
      expect(
        (
          await sql`SELECT id FROM posting_availability_observations`.execute(
            db,
          )
        ).rows,
      ).toHaveLength(1);
      await sql`UPDATE posting_availability SET next_check_at=now(),lease_until=NULL`.execute(
        db,
      );
      const stale = await research.claim();
      await sql`UPDATE opportunity_postings SET version=version+1`.execute(db);
      await research.complete(stale!.token, {
        status: "closed",
        checkedAt: now.toISOString(),
        sourceUrl: "https://boards-api.greenhouse.io/",
        fingerprint: null,
      });
      expect(
        (
          await sql`SELECT id FROM posting_availability_observations`.execute(
            db,
          )
        ).rows,
      ).toHaveLength(1);
      expect(replacement.token).not.toBe(first.token);
    });

    it("rechecks research, assessment, quiet hours and consent after candidates were read", async () => {
      const { ownerId, scouts } = await fixture();
      await observe();
      const candidates = await ledger.candidates();
      const window = promptWindow(choices, now)!;
      await sql`UPDATE posting_availability SET evidence=jsonb_set(evidence,'{status}','"changed"')`.execute(
        db,
      );
      expect(await ledger.prepare(ownerId, window, candidates)).toBeNull();
      await sql`UPDATE posting_availability SET evidence=jsonb_set(evidence,'{status}','"available"')`.execute(
        db,
      );
      await sql`UPDATE scout_recommendations SET assessment=jsonb_set(assessment,'{detail,criteria,4,status}','"unknown"')`.execute(
        db,
      );
      expect(await ledger.prepare(ownerId, window, candidates)).toBeNull();
      await sql`UPDATE scout_recommendations SET assessment=${JSON.stringify(assessPersonalFit(confirmedSearch, analysis, fit))}::jsonb`.execute(
        db,
      );
      now.setUTCHours(21);
      expect(await ledger.prepare(ownerId, window, candidates)).toBeNull();
      now.setUTCHours(12);
      await sql`INSERT INTO consent_events(id,owner_id,scout_id,purpose,granted,wording_version,created_at) VALUES(${randomUUID()}::uuid,${ownerId}::uuid,${scouts[0]!.id}::uuid,'opportunity_alerts',false,'opportunity-alerts-v1',now()+interval '1 second')`.execute(
        db,
      );
      expect(await ledger.prepare(ownerId, window, candidates)).toBeNull();
    });

    it("blocks superseded AI policies for both prompts and digests until reassessment", async () => {
      const { ownerId } = await fixture();
      await observe();
      const candidates = await ledger.candidates();
      await sql`UPDATE scout_recommendations SET assessment=jsonb_set(assessment,'{detail,verificationPolicy}','"supported-criteria-v3"')`.execute(
        db,
      );
      expect(
        await ledger.prepare(ownerId, promptWindow(choices, now)!, candidates),
      ).toBeNull();
      expect(
        await ledger.prepare(ownerId, digestWindow(choices, now)!, candidates),
      ).toBeNull();
      expect(
        (await sql`SELECT id FROM opportunity_deliveries`.execute(db)).rows,
      ).toHaveLength(0);
      await sql`UPDATE scout_recommendations SET assessment=${JSON.stringify(assessPersonalFit(confirmedSearch, analysis, fit))}::jsonb`.execute(
        db,
      );
      expect(
        await ledger.prepare(ownerId, digestWindow(choices, now)!, candidates),
      ).not.toBeNull();
    });

    it("serializes competing prompt/digest reservations and limits prompts across scout/timezone windows", async () => {
      const { ownerId } = await fixture(2);
      await observe();
      const candidates = await ledger.candidates();
      const reservations = await Promise.all([
        ledger.prepare(ownerId, promptWindow(choices, now)!, candidates),
        ledger.prepare(ownerId, digestWindow(choices, now)!, candidates),
      ]);
      expect(reservations.filter(Boolean)).toHaveLength(1);
      expect(reservations.find(Boolean)!.opportunities[0]!.scouts).toHaveLength(
        2,
      );
      const reservation = reservations.find(Boolean)!;
      await ledger.finish(reservation.id, "unknown");
      expect(
        await ledger.prepare(ownerId, promptWindow(choices, now)!, candidates),
      ).toBeNull();
      // A separately accepted prompt consumes the rolling allowance even under a different local window.
      await sql`INSERT INTO opportunity_deliveries(id,owner_id,window_key,recipient,contents,status,created_at) VALUES(${randomUUID()}::uuid,${ownerId}::uuid,'prompt:Other:window','synthetic@scoutalert.test','{}','accepted',${now})`.execute(
        db,
      );
      await ledger.finish(reservation.id, "rejected");
      expect(
        await ledger.prepare(ownerId, promptWindow(choices, now)!, candidates),
      ).toBeNull();
    });

    it("delivers a strong-match alert to Mailpit once and prevents a digest replay of the same posting", async () => {
      const { ownerId } = await fixture(2);
      await observe();
      const smtp = createSmtpClient({
        host: "127.0.0.1",
        port: 1025,
        secure: false,
      });
      const delivery = new DeliverOpportunityDigests(
        ledger,
        new SmtpEmailProvider(smtp, {
          address: "no-reply@scoutalert.test",
          name: "ScoutAlert",
        }),
        () => now,
      );

      try {
        expect(await delivery.execute(now)).toBe(1);
        await sql`UPDATE delivery_scan_cursor SET after_owner=NULL`.execute(db);
        expect(await delivery.execute(now)).toBe(0);
        const sent = await db
          .selectFrom("opportunity_deliveries")
          .selectAll()
          .where("owner_id", "=", ownerId)
          .execute();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.window_key).toMatch(/^prompt:/);
        expect(sent[0]!.status).toBe("accepted");
        const query = new URL("http://127.0.0.1:8025/api/v1/search");
        query.searchParams.set(
          "query",
          `message-id:${sent[0]!.id}@scoutalert.test`,
        );
        const captured = (await fetch(query).then((response) =>
          response.json(),
        )) as { messages: { Subject: string }[] };
        expect(captured.messages).toHaveLength(1);
        expect(captured.messages[0]!.Subject).toContain("strong match");
      } finally {
        smtp.close();
      }
    });
  },
);
