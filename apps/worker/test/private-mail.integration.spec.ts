import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { sql } from "kysely";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  MailSecrets,
  PostgresMailConnectionRepository,
} from "@repo/adapters/connections";
import type { MailImportClaim, PrivateMailItem } from "@repo/core/connections";

const enabled = process.env.PRIVATE_MAIL_INTEGRATION === "1";
describe.skipIf(!enabled)(
  "private mail PostgreSQL isolation and fencing",
  () => {
    let db: ReturnType<typeof createPostgresClient>;
    let records: PostgresMailConnectionRepository;
    const owners: string[] = [];
    const browser = "b".repeat(64);
    const grant = {
      refreshToken: "synthetic-private-refresh",
      email: "private@example.test",
    };
    const item: PrivateMailItem = {
      id: "abc123",
      subject: "Private project brief",
      sender: "Client",
      text: "Confidential synthetic project",
      receivedAt: new Date().toISOString(),
      truncated: false,
    };

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      db = createPostgresClient(url.toString(), "private-mail-test");
      await migrateDatabase(db);
      records = new PostgresMailConnectionRepository(
        db,
        new MailSecrets("a".repeat(64)),
      );
    });
    afterEach(async () => {
      for (const owner of owners.splice(0)) {
        await db.deleteFrom("users").where("id", "=", owner).execute();
      }
    });
    afterAll(async () => {
      await db?.destroy();
    });

    /** Creates a synthetic verified owner without touching any real account. */
    async function owner() {
      const id = randomUUID();
      owners.push(id);
      await db
        .insertInto("users")
        .values({
          id,
          email: `mail-test-${id}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      return id;
    }
    /** Connects a synthetic offline grant through the real single-use consent path. */
    async function connected(id: string) {
      const state = await records.begin(id, browser);
      const consent = await records.consume(id, browser, state.state);
      await records.connect(id, consent.revision, grant);
      const credentials = await records.credentials(id);
      await records.selectLabel(id, credentials.revision, {
        id: "Label_1",
        name: "ScoutAlert",
      });
    }
    /** Requires a real leased batch in tests that exercise completion. */
    async function claimed(): Promise<MailImportClaim> {
      const result = await records.claim();
      expect(result).not.toBeNull();
      return result!;
    }

    it("binds state to owner and browser, consumes it once and keeps credentials encrypted", async () => {
      const first = await owner();
      const second = await owner();
      const state = await records.begin(first, browser);
      await expect(
        records.consume(second, browser, state.state),
      ).rejects.toMatchObject({ code: "invalid_connection_state" });
      await expect(
        records.consume(first, "wrong-browser", state.state),
      ).rejects.toMatchObject({ code: "invalid_connection_state" });
      const pending = await records.consume(first, browser, state.state);
      await expect(
        records.consume(first, browser, state.state),
      ).rejects.toMatchObject({ code: "invalid_connection_state" });
      await records.connect(first, pending.revision, grant);
      const row = (
        await sql<{
          grant_ciphertext: string;
        }>`SELECT grant_ciphertext FROM mail_connections WHERE owner_id=${first}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      expect(row.grant_ciphertext).not.toContain(grant.refreshToken);
      expect((await records.credentials(first)).grant).toEqual(grant);
      expect((await records.read(second)).connection.status).toBe(
        "disconnected",
      );
      expect(JSON.stringify(await records.read(first))).not.toContain(
        "refreshToken",
      );
    });
    it("rejects expired state, superseded callbacks and late connect after disconnect", async () => {
      const id = await owner();
      const old = await records.begin(id, browser);
      await sql`UPDATE mail_oauth_states SET expires_at=now()-interval '1 second' WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      await expect(
        records.consume(id, browser, old.state),
      ).rejects.toMatchObject({ code: "invalid_connection_state" });
      const state = await records.begin(id, browser);
      const pending = await records.consume(id, browser, state.state);
      await records.begin(id, browser);
      await expect(
        records.connect(id, pending.revision, grant),
      ).rejects.toMatchObject({ code: "connection_changed" });
      const latest = await records.begin(id, browser);
      const latestPending = await records.consume(id, browser, latest.state);
      await records.disconnect(id);
      await expect(
        records.connect(id, latestPending.revision, grant),
      ).rejects.toMatchObject({ code: "connection_changed" });
    });
    it("requires explicit label selection and import request before claiming provider work", async () => {
      const id = await owner();
      const state = await records.begin(id, browser);
      const consent = await records.consume(id, browser, state.state);
      await records.connect(id, consent.revision, grant);
      await expect(records.requestImport(id)).rejects.toMatchObject({
        code: "invalid_label",
      });
      expect(await records.claim()).toBeNull();
      await records.selectLabel(id, (await records.credentials(id)).revision, {
        id: "Label_1",
        name: "ScoutAlert",
      });
      expect(await records.claim()).toBeNull();
      await records.requestImport(id);
      const claims = await Promise.all([records.claim(), records.claim()]);
      expect(claims.filter(Boolean)).toHaveLength(1);
    });
    it("stores private content only for its owner, deduplicates retries and hides expired imports", async () => {
      const id = await owner();
      const other = await owner();
      await connected(id);
      await records.requestImport(id);
      const claim = await claimed();
      await records.complete(claim, { items: [item], next: null, skipped: 0 });
      await records.complete(claim, {
        items: [{ ...item, text: "replayed stale replacement" }],
        next: null,
        skipped: 0,
      });
      expect((await records.read(id)).items).toEqual([item]);
      expect((await records.read(other)).items).toEqual([]);
      const stored = (
        await sql<{
          content_ciphertext: string;
        }>`SELECT content_ciphertext FROM private_mail_items WHERE owner_id=${id}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      expect(stored.content_ciphertext).not.toContain(item.text);
      await sql`UPDATE private_mail_items SET expires_at=now()-interval '1 second' WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      expect((await records.read(id)).items).toEqual([]);
    });
    it("fences label changes and disconnect against concurrent imports and erases prior evidence", async () => {
      const id = await owner();
      await connected(id);
      await records.requestImport(id);
      const first = await claimed();
      await records.selectLabel(id, first.revision, {
        id: "Label_2",
        name: "New label",
      });
      await records.complete(first, { items: [item], next: null, skipped: 0 });
      expect((await records.read(id)).items).toEqual([]);
      await records.requestImport(id);
      const second = await claimed();
      await records.disconnect(id);
      await records.complete(second, {
        items: [item],
        next: "more",
        skipped: 0,
      });
      expect(await records.claim()).toBeNull();
      expect((await records.read(id)).connection.status).toBe("disconnected");
      expect((await records.read(id)).items).toEqual([]);
      await expect(records.credentials(id)).rejects.toMatchObject({
        code: "reconnect_required",
      });
    });
    it("can erase a connection even after its encryption key becomes unavailable", async () => {
      const id = await owner();
      await connected(id);
      await records.requestImport(id);
      await records.complete(await claimed(), {
        items: [item],
        next: null,
        skipped: 0,
      });
      const disabled = new PostgresMailConnectionRepository(db, null);
      expect(await disabled.disconnect(id)).toBe("unavailable");
      expect((await records.read(id)).connection.status).toBe("disconnected");
      expect((await records.read(id)).items).toEqual([]);
    });
    it("rejects expired leases and repeats a complete 90-day window on a new manual import", async () => {
      const id = await owner();
      await connected(id);
      await records.requestImport(id);
      const stale = await claimed();
      await sql`UPDATE mail_connections SET lease_until=now()-interval '1 second' WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      await records.complete(stale, { items: [item], next: null, skipped: 0 });
      expect((await records.read(id)).items).toEqual([]);
      const fresh = await claimed();
      await records.complete(fresh, { items: [item], next: null, skipped: 0 });
      await records.requestImport(id);
      const repeat = await claimed();
      expect(repeat.before - repeat.after).toBe(90 * 86400);
      expect(repeat.cursor).toBeNull();
      await records.complete(repeat, { items: [item], next: null, skipped: 0 });
      expect((await records.read(id)).items).toHaveLength(1);
    });
    it("resumes pagination with the same scan window and retains daily admission after failures", async () => {
      const id = await owner();
      await connected(id);
      await records.requestImport(id);
      const first = await claimed();
      await records.complete(first, {
        items: [item],
        next: "next-page",
        skipped: 0,
      });
      await sql`UPDATE mail_connections SET next_attempt=now() WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      const second = await claimed();
      expect(second.cursor).toBe("next-page");
      expect(second.before).toBe(first.before);
      expect(second.after).toBe(first.after);
      await records.fail(second, false);
      const row = (
        await sql<{
          pages_today: number;
        }>`SELECT pages_today FROM mail_connections WHERE owner_id=${id}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      expect(row.pages_today).toBe(2);
      await sql`UPDATE mail_connections SET pages_today=100,next_attempt=now() WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      expect(await records.claim()).toBeNull();
      expect((await records.read(id)).connection.error).toBe(
        "import_daily_limit",
      );
      await sql`UPDATE mail_connections SET budget_day=(now() AT TIME ZONE 'UTC')::date-1 WHERE owner_id=${id}::uuid`.execute(
        db,
      );
      expect(await records.claim()).not.toBeNull();
    });
  },
);
