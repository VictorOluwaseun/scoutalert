/** Public provider payload with the original network observation time; reuse must never make evidence appear newer. */
export interface PublicApiSnapshot {
  body: string;
  checkedAt: string;
}

/** A temporary shared cache lease; durable document admissions and accepted evidence remain in PostgreSQL. */
export type PublicApiSnapshotClaim =
  | { status: "ready"; snapshot: PublicApiSnapshot }
  | { status: "claimed"; token: string }
  | { status: "busy" };

/** Shares only explicitly public API payloads across scouts, with expiring leases and bounded freshness. */
export abstract class PublicApiSnapshotRepository {
  /** Returns fresh evidence or one exclusive fill lease; callers must not fetch while another holder is filling. */
  abstract claim(key: string): Promise<PublicApiSnapshotClaim>;
  /** Publishes only under the exact live lease and retains the provider observation timestamp. */
  abstract complete(
    key: string,
    token: string,
    snapshot: PublicApiSnapshot,
  ): Promise<boolean>;
  /** Releases a failed live lease; the caller's durable attempt reservation is never refunded. */
  abstract fail(key: string, token: string): Promise<void>;
}
