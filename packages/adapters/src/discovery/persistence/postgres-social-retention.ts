import { sql, type Kysely } from "kysely";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Withdraws native evidence and its derived copies when content is inaccessible or its local retention period ends. */
export class PostgresSocialRetentionRepository {
  /** Runs under the source lock shared by public review and receipt completion. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Bounds each sweep; disabled provider access cannot leave native content retained indefinitely. */
  async expire(): Promise<void> {
    const rows = await sql<{
      lead_id: string;
    }>`SELECT lead_id FROM x_posts WHERE NOT unavailable AND expires_at<=now() ORDER BY expires_at,lead_id LIMIT 100 FOR UPDATE`.execute(
      this.tx,
    );
    await this.withdraw(rows.rows.map((row) => row.lead_id));
  }

  /** Retains identity and delivery audit, while removing source text, cited assessments and cached notification content. */
  async withdraw(leads: string[]): Promise<void> {
    if (!leads.length) {
      return;
    }
    const ids = await sql<{
      edit_ids: string[];
    }>`SELECT edit_ids FROM x_posts WHERE lead_id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
    await this.invalidateContext(ids.rows.flatMap((row) => row.edit_ids));
    await this.clearDerived(leads);
    await sql`UPDATE web_discovery_observations SET title=NULL,snippet=NULL WHERE lead_id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
    await sql`UPDATE web_discovery_leads SET title=NULL,snippet=NULL,document=NULL,content_status='unavailable',review_key=NULL WHERE id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
    await sql`UPDATE x_posts SET unavailable=true WHERE lead_id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
    await sql`DELETE FROM x_source_updates WHERE lead_id=ANY(${leads}::text[]) AND case_id IS NULL`.execute(
      this.tx,
    );
  }

  /** Removes dependent current and historical context copies before an edit, deletion or expiry can leave a stale assessment visible. */
  async invalidateContext(ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    const rows = await sql<{
      lead_id: string;
    }>`SELECT lead_id FROM x_context_dependencies WHERE post_id=ANY(${ids}::text[])
      UNION SELECT lead_id FROM web_lead_reviews WHERE input->'nativeContext'->'dependencies' ?| ${ids}::text[]`.execute(
      this.tx,
    );
    const leads = rows.rows.map((row) => row.lead_id);
    if (!leads.length) {
      return;
    }
    await this.clearDerived(leads);
    await sql`UPDATE web_discovery_leads SET review_key=NULL,document=(document-'nativeContext')||jsonb_build_object('truncated',true,'fingerprint','context-invalidated:'||md5(document->>'fingerprint')) WHERE id=ANY(${leads}::text[]) AND document IS NOT NULL`.execute(
      this.tx,
    );
    await sql`UPDATE x_posts SET context_due_at=now() WHERE lead_id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
  }

  /** Preserves source identities and delivery audit while removing derived content and fencing in-flight public/private work. */
  private async clearDerived(leads: string[]): Promise<void> {
    const rows = await sql<{
      posting_id: string;
    }>`SELECT id AS posting_id FROM opportunity_postings WHERE id=ANY(${leads.map((id) => `web:${id}`)}::text[]) OR id IN(SELECT posting_id FROM web_discovery_leads WHERE id=ANY(${leads}::text[]) AND posting_id IS NOT NULL) FOR UPDATE`.execute(
      this.tx,
    );
    const postings = rows.rows.map((row) => row.posting_id);
    await sql`UPDATE opportunity_postings SET open=false,content='',title='Unavailable post',company=NULL,location=NULL WHERE id=ANY(${postings}::text[])`.execute(
      this.tx,
    );
    await sql`DELETE FROM scout_recommendations WHERE posting_id=ANY(${postings}::text[])`.execute(
      this.tx,
    );
    await sql`DELETE FROM opportunity_evidence WHERE posting_id=ANY(${postings}::text[])`.execute(
      this.tx,
    );
    await sql`DELETE FROM intelligence_tasks WHERE posting_id=ANY(${postings}::text[])`.execute(
      this.tx,
    );
    await sql`UPDATE opportunity_deliveries d SET contents=jsonb_set(contents,'{opportunities}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(d.contents->'opportunities') WHERE NOT(value->>'id'=ANY(${postings}::text[]))),'[]'::jsonb)) WHERE EXISTS(SELECT 1 FROM opportunity_delivery_items i WHERE i.delivery_id=d.id AND i.posting_id=ANY(${postings}::text[]))`.execute(
      this.tx,
    );
    await sql`UPDATE web_lead_reviews SET input=jsonb_set(input-'nativeContext','{text}','""'::jsonb),result=NULL,state='failed',failure='source_unavailable',lease_token=NULL,lease_until=NULL WHERE lead_id=ANY(${leads}::text[])`.execute(
      this.tx,
    );
  }
}
