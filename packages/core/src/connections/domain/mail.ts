/** Safe account-owned connection status; credentials and provider cursors never enter this view. */
export interface MailConnectionView {
  status: "disconnected" | "connected" | "reconnect";
  email: string | null;
  label: { id: string; name: string } | null;
  importing: boolean;
  lastImportedAt: string | null;
  error: string | null;
}

/** Untrusted email evidence remains private and unassessed until a dedicated private matching path accepts it. */
export interface PrivateMailItem {
  id: string;
  subject: string;
  sender: string;
  text: string;
  receivedAt: string;
  truncated: boolean;
}

/** Refresh credentials are internal application values, never part of transport responses or shared discovery input. */
export interface MailGrant {
  refreshToken: string;
  email: string;
}

/** Frozen owner, label, cursor and authorization revision for one bounded, retryable import. */
export interface MailImportClaim {
  ownerId: string;
  lease: string;
  revision: number;
  grant: MailGrant;
  labelId: string;
  after: number;
  before: number;
  cursor: string | null;
}

/** Provider result never implies an opportunity is open, genuine or relevant to a scout. */
export interface MailBatch {
  items: PrivateMailItem[];
  next: string | null;
  skipped: number;
}

/** Public, bounded failure codes allow recovery without exposing tokens or message content. */
export class MailConnectionError extends Error {
  /** Carries a safe application code only. */
  constructor(
    public readonly code:
      | "connection_unavailable"
      | "connection_changed"
      | "invalid_connection_state"
      | "reconnect_required"
      | "invalid_label"
      | "import_limited",
  ) {
    super(code);
  }
}

/** Owns encrypted grants, single-use browser-bound consent state, private evidence and atomic import admission. */
export abstract class MailConnectionRepository {
  /** Returns only safe connection metadata and the latest private imports for this owner. */
  abstract read(
    ownerId: string,
  ): Promise<{ connection: MailConnectionView; items: PrivateMailItem[] }>;
  /** Replaces pending consent state; returns the opaque state and PKCE verifier, expiring after ten minutes. */
  abstract begin(
    ownerId: string,
    browser: string,
  ): Promise<{ state: string; verifier: string }>;
  /** Consumes only the current owner's state in its initiating browser; replay and expired state fail closed. */
  abstract consume(
    ownerId: string,
    browser: string,
    state: string,
  ): Promise<{ verifier: string; revision: number }>;
  /** Stores a grant only if no newer consent or disconnect superseded this state. */
  abstract connect(
    ownerId: string,
    revision: number,
    grant: MailGrant,
  ): Promise<void>;
  /** Returns an internal grant and revision for label discovery; never sends it to a browser. */
  abstract credentials(
    ownerId: string,
  ): Promise<{ grant: MailGrant; revision: number }>;
  /** Changes the selected label under optimistic concurrency and deletes imports from the previous scope. */
  abstract selectLabel(
    ownerId: string,
    revision: number,
    label: { id: string; name: string },
  ): Promise<void>;
  /** Durably requests an import; execution remains bounded and asynchronous. */
  abstract requestImport(ownerId: string): Promise<void>;
  /** Claims one due import across owners using a bounded exclusive lease and per-owner daily allowance. */
  abstract claim(): Promise<MailImportClaim | null>;
  /** Stores a batch only for the live grant revision and lease; disconnect and label changes fence stale work. */
  abstract complete(claim: MailImportClaim, batch: MailBatch): Promise<void>;
  /** Records a safe failure with backoff, retaining spent admission and forcing renewed consent when necessary. */
  abstract fail(claim: MailImportClaim, reconnect: boolean): Promise<void>;
  /** Removes grants, queued work, consent state and private imports before best-effort remote revocation. */
  abstract disconnect(
    ownerId: string,
  ): Promise<MailGrant | null | "unavailable">;
}

/** Isolates OAuth and label-scoped mailbox reads behind a provider repository. */
export abstract class MailSourceRepository {
  /** Generates a fixed-provider authorization URL with readonly scope and PKCE binding. */
  abstract authorization(state: string, verifier: string): string;
  /** Exchanges a one-time code and checks the actual granted scope before returning offline credentials. */
  abstract exchange(code: string, verifier: string): Promise<MailGrant>;
  /** Lists user-created labels, without reading email bodies. */
  abstract labels(grant: MailGrant): Promise<{ id: string; name: string }[]>;
  /** Reads one bounded page from the exact selected label and time window, excluding attachments, spam and trash. */
  abstract read(claim: MailImportClaim): Promise<MailBatch>;
  /** Revokes the provider grant; local access must already have been removed. */
  abstract revoke(grant: MailGrant): Promise<boolean>;
}
