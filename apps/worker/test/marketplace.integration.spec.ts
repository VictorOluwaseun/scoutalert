import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "@repo/adapters/onboarding";
import { PostgresOpportunityFeedbackRepository } from "@repo/adapters/scouts";
import {
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresRelevanceFeedbackRepository,
  PostgresOpportunityCatalogRepository,
  PostgresAvailabilityRepository,
} from "@repo/adapters/scouting";
import { PostgresOpportunityDeliveryRepository } from "@repo/adapters/notifications";
import {
  ActivateScout,
  ReviewSearchDraft,
  type SearchDraft,
} from "@repo/core/onboarding";
import { ScoutOpportunities, type Posting } from "@repo/core/scouting";

const project: Posting = {
  id: "market:1",
  source: "market",
  kind: "client_request",
  externalId: "1",
  familyId: "market:1",
  company: "Unverified buyer",
  title: "Remote website design",
  text: "Client project: website design. Budget USD 1000 per project.",
  location: "Location eligibility unconfirmed",
  url: "https://www.freelancer.com/projects/design/example",
  sourceUpdatedAt: "2026-10-01T00:00:00Z",
  fingerprint: "p1",
  version: 1,
};
const search: SearchDraft = {
  goal: "Find website design projects",
  category: "services",
  target: "website design",
  name: "Web design",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Lagos",
  workLocations: "Worldwide",
  background: "Website design experience",
  minimumPay: "",
  currency: "USD",
  payPeriod: "project",
  unknownEligibility: "review",
  undisclosedPay: "include",
};

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "marketplace persistence and private feedback learning",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let sources: PostgresSourceRepository;
    let records: PostgresScoutingRepository;
    let feedback: PostgresOpportunityFeedbackRepository;
    let examples: PostgresRelevanceFeedbackRepository;
    let matching: ScoutOpportunities;
    const schema = `market_${randomUUID().replaceAll("-", "")}`;
    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      sources = new PostgresSourceRepository(db);
      records = new PostgresScoutingRepository(db);
      feedback = new PostgresOpportunityFeedbackRepository(db);
      examples = new PostgresRelevanceFeedbackRepository(db);
      matching = new ScoutOpportunities(records, undefined, examples);
    });
    afterAll(async () => {
      await db?.destroy();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(admin);
      await admin?.destroy();
    });

    /** Creates a synthetic confirmed scout; no real user or provider is involved. */
    async function fixture(draft = search) {
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const activate = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      const scout = await activate.execute(ownerId, "synthetic", {
        key: randomUUID(),
        search: draft,
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

      return { ownerId, scoutId: scout.id, version: 1, runId: randomUUID() };
    }

    /** Refreshes one bounded source window through its real fencing transaction. */
    async function publish(postings = [project]) {
      await sql`UPDATE opportunity_sources SET checked_at=NULL WHERE id='market'`.execute(
        db,
      );
      const now = new Date();
      const lease = await sources.claim("market", now);
      await sources.publish(
        {
          source: "market",
          scope: "window",
          kind: "client_request",
          checkedAt: now.toISOString(),
          postings,
        },
        lease!,
      );
    }

    it("retains absent window entries without renewing their freshness, and separates project retrieval from jobs", async () => {
      await publish();
      const request = await fixture();
      const context = await records.begin(request);
      expect((await records.candidates(context!))?.map((p) => p.id)).toContain(
        project.id,
      );
      await publish([]);
      expect(
        (await db
          .selectFrom("opportunity_postings")
          .select(["open", "version"])
          .where("id", "=", project.id)
          .executeTakeFirst())!,
      ).toEqual({ open: true, version: 1 });
      await sql`UPDATE opportunity_postings SET checked_at=now()-interval '31 minutes' WHERE id=${project.id}`.execute(
        db,
      );
      expect(await records.candidates(context!)).toEqual([]);
      await publish();
      const job = await fixture({
        ...search,
        category: "employment",
        payPeriod: "year",
      });
      expect(await matching.execute(job)).toBe("waiting");
    });

    it("retrieves partial service vocabulary for assessment while ranking exact matches first and preserving hiding and freshness", async () => {
      const variants = [
        {
          ...project,
          id: "market:react",
          externalId: "react",
          familyId: "market:react",
          title: "React dashboard",
          text: "We need TypeScript charts and API integrations.",
          fingerprint: "react",
        },
        {
          ...project,
          id: "market:exact",
          externalId: "exact",
          familyId: "market:exact",
          title: "Remote React TypeScript web development",
          fingerprint: "exact",
        },
        {
          ...project,
          id: "market:noise",
          externalId: "noise",
          familyId: "market:noise",
          title: "Kitchen renovation",
          text: "Carpentry required",
          fingerprint: "noise",
        },
      ];
      await publish(variants);
      const request = await fixture({
        ...search,
        target: "React TypeScript web development",
      });
      const context = (await records.begin(request))!;
      const retrieved = (await records.candidates(context))!;
      expect(retrieved.map((item) => item.id)).toEqual([
        "market:exact",
        "market:react",
      ]);
      // Retrieval broadening does not broaden the deterministic fallback's publication rules.
      expect(await matching.execute(request)).toBe("done");
      const catalog = new PostgresOpportunityCatalogRepository(db);
      expect(
        (await catalog.list(request.ownerId)).some(
          (item) => item.id === "market:react",
        ),
      ).toBe(false);
      await sql`UPDATE opportunity_postings SET checked_at=now()-interval '31 minutes' WHERE id='market:react'`.execute(
        db,
      );
      expect(
        (await records.candidates(context))?.map((item) => item.id),
      ).toEqual(["market:exact"]);
      await feedback.record(request.ownerId, "market:exact", {
        key: randomUUID(),
        version: 0,
        value: "hidden",
      });
      expect(await records.candidates(context)).toEqual([]);
    });

    it("reuses identical evidence, refreshes changed versions and reconciles client scouts", async () => {
      await publish();
      await publish();
      expect(
        (
          await db
            .selectFrom("opportunity_postings")
            .select("version")
            .where("id", "=", project.id)
            .executeTakeFirst()
        )?.version,
      ).toBe(1);
      await publish([
        {
          ...project,
          fingerprint: "p2",
          text: "Updated website design service request",
        },
      ]);
      expect(
        (
          await db
            .selectFrom("opportunity_postings")
            .select("version")
            .where("id", "=", project.id)
            .executeTakeFirst()
        )?.version,
      ).toBe(2);
      const request = await fixture();
      await matching.execute(request);
      await sql`UPDATE scouts SET discovery_requested_at=now()-interval '11 minutes' WHERE id=${request.scoutId}::uuid`.execute(
        db,
      );
      await records.reconcile(randomUUID(), new Date());
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("aggregate_id", "=", request.scoutId)
          .where("event_type", "=", "scout.refresh_requested")
          .execute(),
      ).toHaveLength(1);
    });

    it("learns only from this owner's current positives, does not amplify retries, and removes the boost on undo", async () => {
      await publish();
      const request = await fixture();
      const other = await fixture();
      await matching.execute(request);
      await matching.execute(other);
      const before = await db
        .selectFrom("scout_recommendations")
        .selectAll()
        .where("scout_id", "=", request.scoutId)
        .executeTakeFirstOrThrow();
      const input = {
        key: randomUUID(),
        version: 0,
        value: "relevant" as const,
      };
      await feedback.record(request.ownerId, project.id, input);
      await feedback.record(request.ownerId, project.id, input);
      expect(await examples.examples(request.ownerId)).toHaveLength(1);
      expect(await examples.examples(other.ownerId)).toEqual([]);
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("owner_id", "=", request.ownerId)
          .where("event_type", "=", "scout.refresh_requested")
          .execute(),
      ).toHaveLength(1);
      await matching.execute({ ...request, runId: randomUUID() });
      const learned = await db
        .selectFrom("scout_recommendations")
        .selectAll()
        .where("scout_id", "=", request.scoutId)
        .executeTakeFirstOrThrow();
      expect(learned.rank).toBe(before.rank + 1);
      expect(learned.assessment.reasons).toEqual(before.assessment.reasons);
      expect(
        (
          await db
            .selectFrom("scouts")
            .select("search")
            .where("id", "=", request.scoutId)
            .executeTakeFirst()
        )?.search,
      ).toEqual(search);
      await feedback.record(request.ownerId, project.id, {
        key: randomUUID(),
        version: 1,
        value: "none",
      });
      expect(await examples.examples(request.ownerId)).toEqual([]);
      await matching.execute({ ...request, runId: randomUUID() });
      expect(
        (
          await db
            .selectFrom("scout_recommendations")
            .select("rank")
            .where("scout_id", "=", request.scoutId)
            .executeTakeFirst()
        )?.rank,
      ).toBe(before.rank);
      await feedback.record(request.ownerId, project.id, {
        key: randomUUID(),
        version: 2,
        value: "hidden",
      });
      expect(await examples.examples(request.ownerId)).toEqual([]);
      expect(
        await new PostgresOpportunityCatalogRepository(db).list(
          request.ownerId,
        ),
      ).toEqual([]);
    });

    it("withholds project emails until individual availability is verified, then reserves delivery once", async () => {
      await publish();
      const request = await fixture();
      await matching.execute(request);
      const delivery = new PostgresOpportunityDeliveryRepository(db);
      await sql`UPDATE delivery_scan_cursor SET after_owner=NULL WHERE id=1`.execute(
        db,
      );
      const candidates = (await delivery.candidates()).filter(
        (item) => item.ownerId === request.ownerId,
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.opportunity.kind).toBe("client_request");
      const window = `digest:UTC:${new Date().toISOString().slice(0, 10)}:00:00`;
      expect(
        await delivery.prepare(request.ownerId, window, candidates),
      ).toBeNull();
      const availability = new PostgresAvailabilityRepository(db);
      const claim = await availability.claim();
      expect(claim?.posting.id).toBe(project.id);
      await availability.complete(claim!.token, {
        status: "available",
        checkedAt: new Date().toISOString(),
        sourceUrl: project.url,
        fingerprint: project.fingerprint,
      });
      const prepared = await delivery.prepare(
        request.ownerId,
        window,
        candidates,
      );
      expect(prepared?.opportunities[0]?.kind).toBe("client_request");
      expect(
        await delivery.prepare(request.ownerId, window, candidates),
      ).toBeNull();
    });
  },
);
