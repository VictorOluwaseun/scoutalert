import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import {
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresDiscoveryIntentRepository,
  PostgresOpportunityCatalogRepository,
} from "@repo/adapters/scouting";
import {
  PostgresOpportunityDeliveryRepository,
  createSmtpClient,
  SmtpEmailProvider,
} from "@repo/adapters/notifications";
import {
  ActivateScout,
  ReviewSearchDraft,
  type SearchDraft,
  type ScoutAlerts,
} from "@repo/core/onboarding";
import {
  ScoutOpportunities,
  type Posting,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import {
  DeliverOpportunityDigests,
  EmailProvider,
  EmailSubmissionError,
} from "@repo/core/notifications";
import { sql } from "kysely";

const enabled = process.env.SCOUTING_INTEGRATION === "1";
const search: SearchDraft = {
  goal: "Find remote product design jobs",
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
const alerts: ScoutAlerts = {
  frequency: "daily",
  timezone: "UTC",
  deliveryTime: "00:00",
  weekday: "Monday",
  promptAlerts: false,
  consent: true,
  consentVersion: "opportunity-alerts-v1",
};
const posting: Posting = {
  id: "example:1",
  source: "example",
  externalId: "1",
  familyId: "example:100",
  company: "Example",
  title: "Product Designer",
  location: "Remote",
  url: "https://example.com/job",
  text: "Product design opportunity",
  sourceUpdatedAt: "2026-10-01T00:00:00Z",
  fingerprint: "version-1",
  version: 1,
};

/** Simulates a provider whose acceptance acknowledgement is lost, to exercise the no-blind-resend rule. */
class AmbiguousEmail extends EmailProvider {
  calls = 0;
  /** Records an external attempt then reports ambiguity, never certainty of rejection. */
  async send(): Promise<never> {
    this.calls++;
    throw new EmailSubmissionError("unknown");
  }
}

describe.skipIf(!enabled)(
  "scouting transactions in an isolated test schema",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let activation: ActivateScout;
    let sources: PostgresSourceRepository;
    let records: PostgresScoutingRepository;
    let matching: ScoutOpportunities;
    const schema = `scouting_${randomUUID().replaceAll("-", "")}`;

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
      sources = new PostgresSourceRepository(db);
      records = new PostgresScoutingRepository(db);
      matching = new ScoutOpportunities(records);
    });
    afterAll(async () => {
      await db?.destroy();
      if (admin && /^scouting_[a-f0-9]{32}$/.test(schema))
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      await admin?.destroy();
    });

    /** Creates a verified synthetic owner and a real confirmed activation in this suite's private schema. */
    async function fixture(count = 1, draft = search, choices = alerts) {
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `scouting-${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const scouts = [];
      for (let index = 0; index < count; index++)
        scouts.push(
          await activation.execute(ownerId, "synthetic-browser", {
            key: randomUUID(),
            search: { ...draft, name: `Design scout ${index + 1}` },
            alerts: choices,
            confirmed: true,
          }),
        );
      return { ownerId, scouts };
    }

    /** Publishes one complete synthetic public snapshot through the same source lease as production. */
    async function snapshot(postings = [posting]) {
      await sql`UPDATE opportunity_sources SET checked_at=NULL WHERE id='example'`.execute(
        db,
      );
      const now = new Date();
      const lease = await sources.claim("example", now);
      expect(lease).not.toBeNull();
      await sources.publish(
        { source: "example", checkedAt: now.toISOString(), postings },
        lease!,
      );
    }

    /** Runs the real matching use case under a distinct logical identity. */
    async function run(
      ownerId: string,
      scoutId: string,
      version = 1,
    ): Promise<ScoutRunRequest> {
      const request = { ownerId, scoutId, version, runId: randomUUID() };
      expect(await matching.execute(request)).toBe("done");
      return request;
    }

    it("shares meaningful evidence versions, protects refresh leases, and retains postings during outages", async () => {
      await snapshot();
      expect(await sources.claim("example", new Date())).toBeNull();
      await snapshot();
      const unchanged = await sql<{
        version: number;
      }>`SELECT version FROM opportunity_postings WHERE id='example:1'`.execute(
        db,
      );
      expect(unchanged.rows[0]?.version).toBe(1);
      await snapshot([
        {
          ...posting,
          title: "Senior Product Designer",
          fingerprint: "version-2",
        },
      ]);
      expect(
        (
          await sql<{
            count: string;
          }>`SELECT count(*) FROM opportunity_evidence WHERE posting_id='example:1'`.execute(
            db,
          )
        ).rows[0]?.count,
      ).toBe("2");
      await sql`UPDATE opportunity_sources SET checked_at=NULL WHERE id='example'`.execute(
        db,
      );
      const lease = await sources.claim("example", new Date());
      await sources.fail("example", lease!);
      expect(
        (
          await sql<{
            open: boolean;
          }>`SELECT open FROM opportunity_postings WHERE id='example:1'`.execute(
            db,
          )
        ).rows[0]?.open,
      ).toBe(true);
      await expect(
        sources.publish(
          {
            source: "example",
            checkedAt: new Date().toISOString(),
            postings: [],
          },
          lease!,
        ),
      ).rejects.toThrow("source_lease_expired");
      await snapshot([]);
      expect(
        (
          await sql<{
            open: boolean;
          }>`SELECT open FROM opportunity_postings WHERE id='example:1'`.execute(
            db,
          )
        ).rows[0]?.open,
      ).toBe(false);
    });

    it("recovers dispatch leases, scopes results to owners, and rejects stale revisions at publication", async () => {
      await snapshot();
      const { ownerId, scouts } = await fixture();
      const scout = scouts[0]!;
      const intents = new PostgresDiscoveryIntentRepository(db);
      const first = await intents.claim();
      expect(first.length).toBeGreaterThan(0);
      expect(await intents.claim()).toEqual([]);
      await sql`UPDATE outbox_events SET lease_until=now()-interval '1 minute' WHERE id=${first[0]!.id}::uuid`.execute(
        db,
      );
      const recovered = await intents.claim();
      expect(recovered[0]?.id).toBe(first[0]?.id);
      await intents.acknowledge(first[0]!.id, first[0]!.lease);
      expect(
        (
          await db
            .selectFrom("outbox_events")
            .select("published_at")
            .where("id", "=", first[0]!.id)
            .executeTakeFirst()
        )?.published_at,
      ).toBeNull();
      await intents.acknowledge(recovered[0]!.id, recovered[0]!.lease);
      const request = await run(ownerId, scout.id);
      expect(await matching.execute(request)).toBe("done");
      const catalog = new PostgresOpportunityCatalogRepository(db);
      expect(await catalog.list(ownerId)).toHaveLength(1);
      expect(await catalog.list(randomUUID())).toEqual([]);
      const next = { ...request, runId: randomUUID() };
      const context = await records.begin(next);
      await sql`UPDATE scouts SET version=2 WHERE id=${scout.id}::uuid`.execute(
        db,
      );
      await records.complete(context!, []);
      expect(await catalog.list(ownerId)).toEqual([]);
      expect(
        await records.begin({ ...request, runId: randomUUID() }),
      ).toBeNull();
    });

    it("rejects changed evidence and waits for category-specific source evidence", async () => {
      await snapshot();
      const { ownerId, scouts } = await fixture();
      const request = {
        ownerId,
        scoutId: scouts[0]!.id,
        version: 1,
        runId: randomUUID(),
      };
      const context = await records.begin(request);
      const captured = (await records.candidates(context!))![0]!;
      await snapshot([
        { ...posting, fingerprint: "changed-during-assessment" },
      ]);
      await expect(
        records.complete(context!, [
          {
            posting: captured,
            assessment: {
              policy: "evidence-v1",
              reasons: ["Title"],
              uncertainties: ["Review"],
              rank: 2,
            },
          },
        ]),
      ).rejects.toThrow("evidence_changed");
      const service = await fixture(1, {
        ...search,
        category: "services",
        payPeriod: "project",
      });
      expect(
        await matching.execute({
          ownerId: service.ownerId,
          scoutId: service.scouts[0]!.id,
          version: 1,
          runId: randomUUID(),
        }),
      ).toBe("waiting");
      expect(
        (
          await db
            .selectFrom("scouts")
            .select("discovery_status")
            .where("id", "=", service.scouts[0]!.id)
            .executeTakeFirst()
        )?.discovery_status,
      ).toBe("searching");
    });

    it("groups overlapping scouts, submits once to Mailpit, and records provider acceptance", async () => {
      await snapshot();
      const { ownerId, scouts } = await fixture(2);
      for (const scout of scouts) await run(ownerId, scout.id);
      const ledger = new PostgresOpportunityDeliveryRepository(db);
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
      );
      try {
        await delivery.execute(new Date());
        await delivery.execute(new Date());
        await delivery.execute(new Date());
        const rows = await sql<{
          id: string;
          status: string;
          contents: { opportunities: { scouts: string[] }[] };
        }>`SELECT id,status,contents FROM opportunity_deliveries WHERE owner_id=${ownerId}::uuid`.execute(
          db,
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]!.status).toBe("accepted");
        expect(rows.rows[0]!.contents.opportunities[0]!.scouts).toHaveLength(2);
        const query = new URL("http://127.0.0.1:8025/api/v1/search");
        query.searchParams.set(
          "query",
          `message-id:${rows.rows[0]!.id}@scoutalert.test`,
        );
        const captured = (await fetch(query).then((response) =>
          response.json(),
        )) as { messages: unknown[] };
        expect(captured.messages).toHaveLength(1);
      } finally {
        smtp.close();
      }
    });

    it("reconciles orphaned runs and writes replay-safe refresh intents", async () => {
      const { ownerId, scouts } = await fixture();
      const request = {
        ownerId,
        scoutId: scouts[0]!.id,
        version: 1,
        runId: randomUUID(),
      };
      await records.begin(request);
      await sql`UPDATE discovery_runs SET started_at=now()-interval '21 minutes' WHERE id=${request.runId}::uuid`.execute(
        db,
      );
      await sql`UPDATE scouts SET discovery_requested_at=now()-interval '21 minutes' WHERE id=${request.scoutId}::uuid`.execute(
        db,
      );
      const epoch = randomUUID();
      await records.reconcile(epoch, new Date());
      expect(
        (
          await sql<{
            status: string;
          }>`SELECT status FROM discovery_runs WHERE id=${request.runId}::uuid`.execute(
            db,
          )
        ).rows[0]?.status,
      ).toBe("failed");
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("aggregate_id", "=", request.scoutId)
          .where("event_type", "=", "scout.refresh_requested")
          .execute(),
      ).toHaveLength(1);
      await records.reconcile(epoch, new Date());
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("aggregate_id", "=", request.scoutId)
          .where("event_type", "=", "scout.refresh_requested")
          .execute(),
      ).toHaveLength(1);
    });

    it("rechecks consent and holds ambiguous SMTP outcomes across retries", async () => {
      await snapshot();
      const { ownerId, scouts } = await fixture();
      await run(ownerId, scouts[0]!.id);
      const ledger = new PostgresOpportunityDeliveryRepository(db);
      await sql`UPDATE delivery_scan_cursor SET after_owner=NULL WHERE id=1`.execute(
        db,
      );
      const captured = (await ledger.candidates()).filter(
        (candidate) => candidate.ownerId === ownerId,
      );
      expect(captured.length).toBeGreaterThan(0);
      await sql`INSERT INTO consent_events (id,owner_id,scout_id,purpose,granted,wording_version,created_at) VALUES (${randomUUID()}::uuid,${ownerId}::uuid,${scouts[0]!.id}::uuid,'opportunity_alerts',false,'opportunity-alerts-v1',now()+interval '1 second')`.execute(
        db,
      );
      expect(
        await ledger.prepare(ownerId, "consent-check", captured),
      ).toBeNull();
      const ambiguous = await fixture();
      await run(ambiguous.ownerId, ambiguous.scouts[0]!.id);
      const email = new AmbiguousEmail();
      const delivery = new DeliverOpportunityDigests(ledger, email);
      await sql`UPDATE delivery_scan_cursor SET after_owner=NULL WHERE id=1`.execute(
        db,
      );
      await delivery.execute(new Date());
      await delivery.execute(new Date());
      await delivery.execute(new Date());
      expect(email.calls).toBe(1);
      expect(
        (
          await sql<{
            status: string;
          }>`SELECT status FROM opportunity_deliveries WHERE owner_id=${ambiguous.ownerId}::uuid`.execute(
            db,
          )
        ).rows[0]?.status,
      ).toBe("unknown");
    });
  },
);
