import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  MailConnectionError,
  MailConnectionRepository,
  type MailBatch,
  type MailConnectionView,
  type MailGrant,
  type MailImportClaim,
  type PrivateMailItem,
} from "@repo/core/connections";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { MailSecrets } from "../security/mail-secrets.js";

/** Database-only connection shape; no caller may serialize this credential-bearing record. */
interface ConnectionRow {
  owner_id: string;
  revision: number;
  oauth_revision: number;
  status: MailConnectionView["status"];
  email: string | null;
  grant_ciphertext: string | null;
  label_id: string | null;
  label_name: string | null;
  requested: boolean;
  last_imported_at: Date | null;
  error: string | null;
  lease_token: string | null;
  scan_after: string | null;
  scan_before: string | null;
  cursor: string | null;
}

/** Owns transactions, bounded leases, encryption and account isolation for Gmail imports. */
export class PostgresMailConnectionRepository extends MailConnectionRepository {
  /** Receives the native database and optional vault; disabled integrations can still return safe status. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly secrets: MailSecrets | null,
  ) {
    super();
  }

  /** Reads only this owner's live connection and unexpired evidence; revoked content is not returned. */
  async read(ownerId: string) {
    return this.db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        const row = (
          await sql<ConnectionRow>`SELECT *,CASE WHEN requested AND pages_today>=100 AND budget_day=(now() AT TIME ZONE 'UTC')::date THEN 'import_daily_limit' ELSE error END AS error FROM mail_connections WHERE owner_id=${ownerId}::uuid`.execute(
            tx,
          )
        ).rows[0];
        const connection: MailConnectionView = {
          status: row?.status ?? "disconnected",
          email: row?.email ?? null,
          label: row?.label_id
            ? { id: row.label_id, name: row.label_name! }
            : null,
          importing: row?.requested ?? false,
          lastImportedAt: row?.last_imported_at?.toISOString() ?? null,
          error: row?.error ?? null,
        };
        if (!row || row.status === "disconnected" || !this.secrets) {
          return { connection, items: [] };
        }
        const items = await sql<{
          external_id: string;
          content_ciphertext: string;
        }>`SELECT external_id,content_ciphertext FROM private_mail_items WHERE owner_id=${ownerId}::uuid AND expires_at>now() ORDER BY received_at DESC,external_id LIMIT 20`.execute(
          tx,
        );
        return {
          connection,
          items: items.rows.map((item) =>
            this.vault().open<PrivateMailItem>(
              item.content_ciphertext,
              `mail-item:${ownerId}:${item.external_id}`,
            ),
          ),
        };
      });
  }

  /** Serializes new consent for the owner and replaces previous pending state without interrupting existing imports. */
  async begin(ownerId: string, browser: string) {
    const vault = this.vault();
    const state = vault.random();
    const verifier = vault.random();
    const hash = vault.digest(state);
    await this.db.transaction().execute(async (tx) => {
      await sql`INSERT INTO mail_connections(owner_id) VALUES(${ownerId}::uuid) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      const row = (
        await sql<{
          oauth_revision: number;
        }>`UPDATE mail_connections SET oauth_revision=oauth_revision+1 WHERE owner_id=${ownerId}::uuid RETURNING oauth_revision`.execute(
          tx,
        )
      ).rows[0]!;
      await sql`DELETE FROM mail_oauth_states WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
      await sql`INSERT INTO mail_oauth_states(state_hash,owner_id,browser_hash,revision,verifier_ciphertext,expires_at) VALUES(${hash},${ownerId}::uuid,${vault.digest(browser)},${row.oauth_revision},${vault.seal(verifier, `mail-state:${ownerId}:${hash}`)},now()+interval '10 minutes')`.execute(
        tx,
      );
    });
    return { state, verifier };
  }

  /** Atomically consumes the exact owner/browser state; wrong-owner attempts leave the valid state untouched. */
  async consume(ownerId: string, browser: string, state: string) {
    const vault = this.vault();
    const hash = vault.digest(state);
    const row = (
      await sql<{
        verifier_ciphertext: string;
        revision: number;
      }>`DELETE FROM mail_oauth_states WHERE state_hash=${hash} AND owner_id=${ownerId}::uuid AND browser_hash=${vault.digest(browser)} AND expires_at>now() RETURNING verifier_ciphertext,revision`.execute(
        this.db,
      )
    ).rows[0];
    if (!row) {
      throw new MailConnectionError("invalid_connection_state");
    }
    return {
      verifier: vault.open<string>(
        row.verifier_ciphertext,
        `mail-state:${ownerId}:${hash}`,
      ),
      revision: row.revision,
    };
  }

  /** Fences late consent, drops the old scope and requires label selection before any content import. */
  async connect(
    ownerId: string,
    revision: number,
    grant: MailGrant,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const changed =
        await sql`UPDATE mail_connections SET status='connected',revision=revision+1,email=${grant.email},grant_ciphertext=${this.vault().seal(grant, `mail-grant:${ownerId}`)},label_id=NULL,label_name=NULL,requested=false,lease_token=NULL,lease_until=NULL,cursor=NULL,checkpoint=NULL,scan_after=NULL,scan_before=NULL,last_imported_at=NULL,error=NULL,failures=0 WHERE owner_id=${ownerId}::uuid AND oauth_revision=${revision} RETURNING owner_id`.execute(
          tx,
        );
      if (!changed.rows.length) {
        throw new MailConnectionError("connection_changed");
      }
      await sql`DELETE FROM private_mail_items WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
    });
  }

  /** Exposes the decrypted grant only through the internal application port. */
  async credentials(ownerId: string) {
    const row = (
      await sql<ConnectionRow>`SELECT * FROM mail_connections WHERE owner_id=${ownerId}::uuid AND status='connected'`.execute(
        this.db,
      )
    ).rows[0];
    if (!row?.grant_ciphertext) {
      throw new MailConnectionError("reconnect_required");
    }
    return {
      revision: row.revision,
      grant: this.vault().open<MailGrant>(
        row.grant_ciphertext,
        `mail-grant:${ownerId}`,
      ),
    };
  }

  /** Changes the consent scope and invalidates in-flight imports in the same transaction as deleting old evidence. */
  async selectLabel(
    ownerId: string,
    revision: number,
    label: { id: string; name: string },
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const result =
        await sql`UPDATE mail_connections SET revision=revision+1,label_id=${label.id},label_name=${label.name},requested=false,lease_token=NULL,lease_until=NULL,cursor=NULL,checkpoint=NULL,scan_after=NULL,scan_before=NULL,last_imported_at=NULL,error=NULL,failures=0 WHERE owner_id=${ownerId}::uuid AND revision=${revision} AND status='connected' RETURNING owner_id`.execute(
          tx,
        );
      if (!result.rows.length) {
        throw new MailConnectionError("connection_changed");
      }
      await sql`DELETE FROM private_mail_items WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
    });
  }

  /** Starts a scan idempotently; an active scan retains its frozen window, cursor and admission budget. */
  async requestImport(ownerId: string): Promise<void> {
    const row =
      await sql`UPDATE mail_connections SET requested=true,error=NULL,cursor=CASE WHEN requested THEN cursor ELSE NULL END,scan_after=CASE WHEN requested THEN scan_after ELSE NULL END,scan_before=CASE WHEN requested THEN scan_before ELSE NULL END,failures=CASE WHEN requested THEN failures ELSE 0 END,next_attempt=CASE WHEN requested THEN next_attempt ELSE now() END WHERE owner_id=${ownerId}::uuid AND status='connected' AND label_id IS NOT NULL RETURNING owner_id`.execute(
        this.db,
      );
    if (!row.rows.length) {
      throw new MailConnectionError("invalid_label");
    }
  }

  /** Uses SKIP LOCKED for cross-process admission, bounded cleanup and a non-refundable 100-page UTC daily allowance. */
  async claim(): Promise<MailImportClaim | null> {
    if (!this.secrets) {
      return null;
    }
    return this.db.transaction().execute(async (tx) => {
      await sql`DELETE FROM mail_oauth_states WHERE state_hash IN (SELECT state_hash FROM mail_oauth_states WHERE expires_at<=now() LIMIT 200)`.execute(
        tx,
      );
      await sql`DELETE FROM private_mail_items WHERE (owner_id,external_id) IN (SELECT owner_id,external_id FROM private_mail_items WHERE expires_at<=now() LIMIT 200)`.execute(
        tx,
      );
      const row = (
        await sql<ConnectionRow>`WITH candidate AS (
        SELECT owner_id FROM mail_connections WHERE requested AND status='connected' AND label_id IS NOT NULL AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<=now()) AND (budget_day<(now() AT TIME ZONE 'UTC')::date OR pages_today<100) ORDER BY next_attempt,owner_id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE mail_connections c SET lease_token=${randomUUID()}::uuid,lease_until=now()+interval '2 minutes',
        scan_after=coalesce(scan_after,extract(epoch FROM now())::bigint-90*86400),
        scan_before=coalesce(scan_before,extract(epoch FROM now())::bigint),
        pages_today=CASE WHEN budget_day=(now() AT TIME ZONE 'UTC')::date THEN pages_today+1 ELSE 1 END,budget_day=(now() AT TIME ZONE 'UTC')::date
        FROM candidate WHERE c.owner_id=candidate.owner_id RETURNING c.*`.execute(
          tx,
        )
      ).rows[0];
      if (!row) {
        return null;
      }
      return {
        ownerId: row.owner_id,
        lease: row.lease_token!,
        revision: row.revision,
        grant: this.vault().open<MailGrant>(
          row.grant_ciphertext!,
          `mail-grant:${row.owner_id}`,
        ),
        labelId: row.label_id!,
        after: Number(row.scan_after),
        before: Number(row.scan_before),
        cursor: row.cursor,
      };
    });
  }

  /** Accepts only live scoped work and encrypts source text; replay is idempotent and private data never reaches shared tables. */
  async complete(claim: MailImportClaim, batch: MailBatch): Promise<void> {
    if (
      batch.items.length > 5 ||
      (batch.next === claim.cursor && batch.next !== null)
    ) {
      throw new Error("Invalid mail batch");
    }
    await this.db.transaction().execute(async (tx) => {
      const held =
        await sql`SELECT owner_id FROM mail_connections WHERE owner_id=${claim.ownerId}::uuid AND revision=${claim.revision} AND lease_token=${claim.lease}::uuid AND lease_until>now() AND status='connected' FOR UPDATE`.execute(
          tx,
        );
      if (!held.rows.length) {
        return;
      }
      for (const item of batch.items) {
        await sql`INSERT INTO private_mail_items(owner_id,external_id,content_ciphertext,received_at) VALUES(${claim.ownerId}::uuid,${item.id},${this.vault().seal(item, `mail-item:${claim.ownerId}:${item.id}`)},${item.receivedAt}::timestamptz) ON CONFLICT(owner_id,external_id) DO UPDATE SET content_ciphertext=excluded.content_ciphertext,received_at=excluded.received_at`.execute(
          tx,
        );
      }
      await sql`UPDATE mail_connections SET cursor=${batch.next},requested=${batch.next !== null},checkpoint=CASE WHEN ${batch.next}::text IS NULL THEN scan_before ELSE checkpoint END,scan_after=CASE WHEN ${batch.next}::text IS NULL THEN NULL ELSE scan_after END,scan_before=CASE WHEN ${batch.next}::text IS NULL THEN NULL ELSE scan_before END,lease_token=NULL,lease_until=NULL,next_attempt=now()+interval '10 seconds',last_imported_at=now(),failures=0,error=${batch.skipped ? "some_messages_skipped" : null} WHERE owner_id=${claim.ownerId}::uuid`.execute(
        tx,
      );
    });
  }

  /** Failed requests retain admission cost; five consecutive failures stop a scan until the user retries. */
  async fail(claim: MailImportClaim, reconnect: boolean): Promise<void> {
    await sql`UPDATE mail_connections SET status=CASE WHEN ${reconnect} THEN 'reconnect' ELSE status END,requested=CASE WHEN ${reconnect} OR failures>=4 THEN false ELSE requested END,error=${reconnect ? "reconnect_required" : "import_unavailable"},failures=failures+1,lease_token=NULL,lease_until=NULL,next_attempt=now()+interval '5 minutes' WHERE owner_id=${claim.ownerId}::uuid AND revision=${claim.revision} AND lease_token=${claim.lease}::uuid`.execute(
      this.db,
    );
  }

  /** Commits local revocation and erasure before returning a grant for provider revocation; late callbacks/imports cannot restore access. */
  async disconnect(ownerId: string): Promise<MailGrant | null | "unavailable"> {
    return this.db.transaction().execute(async (tx) => {
      const row = (
        await sql<{
          grant_ciphertext: string | null;
        }>`SELECT grant_ciphertext FROM mail_connections WHERE owner_id=${ownerId}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      const grant = this.revocationGrant(
        ownerId,
        row?.grant_ciphertext ?? null,
      );
      await sql`UPDATE mail_connections SET status='disconnected',revision=revision+1,oauth_revision=oauth_revision+1,email=NULL,grant_ciphertext=NULL,label_id=NULL,label_name=NULL,requested=false,lease_token=NULL,lease_until=NULL,cursor=NULL,checkpoint=NULL,scan_after=NULL,scan_before=NULL,last_imported_at=NULL,error=NULL WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
      await sql`DELETE FROM mail_oauth_states WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
      await sql`DELETE FROM private_mail_items WHERE owner_id=${ownerId}::uuid`.execute(
        tx,
      );
      return grant;
    });
  }

  /** Local erasure must still succeed after a lost key; the caller reports that remote revocation remains unconfirmed. */
  private revocationGrant(
    ownerId: string,
    ciphertext: string | null,
  ): MailGrant | null | "unavailable" {
    if (!ciphertext) {
      return null;
    }
    try {
      return this.vault().open<MailGrant>(ciphertext, `mail-grant:${ownerId}`);
    } catch {
      return "unavailable";
    }
  }

  /** Refuses secret-dependent work when integration encryption is unavailable. */
  private vault(): MailSecrets {
    if (!this.secrets) {
      throw new MailConnectionError("connection_unavailable");
    }
    return this.secrets;
  }
}
