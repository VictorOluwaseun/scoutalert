import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { SourceDocumentResult } from "./contracts.js";

/** Public post identity is independent of search query, account and private fit. */
export interface NativePost {
  platform: "x";
  id: string;
  authorId: string;
  publishedAt: string;
  conversationId: string;
  editIds: string[];
  references: { id: string; type: "replied_to" | "quoted" | "retweeted" }[];
  /** Distinguishes incomplete post text from a referenced conversation that can be fetched separately. */
  textTruncated?: boolean;
}

/** A frozen recent-search window keeps pagination from skipping new posts between requests. */
export interface SocialSearchPage {
  kind: "search";
  query: string;
  startTime: string;
  endTime: string;
  nextToken: string | null;
  limit: number;
}

export type SocialOperation =
  SocialSearchPage | { kind: "lookup"; ids: string[]; purpose?: "context" };

/** Complete public posts and explicit inaccessible IDs; partial errors never imply exhaustive results. */
export interface SocialResult {
  documents: (SourceDocumentResult & { nativePost: NativePost })[];
  unavailableIds: string[];
  nextToken: string | null;
  partial: boolean;
  checkedAt: string;
  retryAfterSeconds: number;
}

/** Safe provider failure details exclude credentials, URLs containing tokens and raw response bodies. */
export class SocialProviderError extends Error {
  /** Distinguishes access, quota and transient failures while retaining admission reservations. */
  constructor(
    readonly reason:
      | "access_unavailable"
      | "rate_limited"
      | "invalid_cursor"
      | "provider_unavailable",
    readonly retryAfterSeconds = 300,
  ) {
    super(reason);
  }
}

/** Public-only native API boundary; network clients stay inside adapters. */
export abstract class SocialProvider {
  /** Reads exactly one admitted page or lookup batch, without hidden retries or private user context. */
  abstract read(operation: SocialOperation): Promise<SocialResult>;
}

export interface SocialIntent {
  scoutId: string;
  ownerId: string;
  version: number;
  search: SearchDraft;
}

export interface SocialLimits {
  /** Defaults to true; disabling pacing is intended for explicit controlled runs, never a budget bypass. */
  paceAcrossDay?: boolean;
  dailyRequests: number;
  dailyMicros: number;
  postCostMicros: number;
  pageSize: number;
}

export type SocialClaim =
  | { status: "done" | "waiting" }
  | {
      status: "claimed";
      key: string;
      token: string;
      operation: SocialOperation;
    };

/** Owns shared queries, current private subscriptions, durable cursors, admission and downstream outbox publication. */
export abstract class SocialDiscoveryRepository {
  /** Returns a bounded fair batch of active scouts needing the current query policy. */
  abstract intents(policy: string): Promise<SocialIntent[]>;
  /** Rechecks ownership and revision; a null query records unsupported public intent without retry loops. */
  abstract subscribe(
    intent: SocialIntent,
    policy: string,
    query: string | null,
  ): Promise<void>;
  /** Admits one shared operation under a retained daily ledger and provider-wide backoff. */
  abstract claim(limits: SocialLimits): Promise<SocialClaim>;
  /** Fences late replies and commits source evidence, cursor advancement and subscriber updates together. */
  abstract complete(
    claim: Extract<SocialClaim, { status: "claimed" }>,
    result: SocialResult,
  ): Promise<void>;
  /** Records an uncertain attempt without refunding its reservation or advancing search progress. */
  abstract fail(
    claim: Extract<SocialClaim, { status: "claimed" }>,
    error: SocialProviderError,
  ): Promise<void>;
  /** Dispatches current subscriber observations and expires retained native content in bounded batches. */
  abstract maintain(): Promise<number>;
}

/** Uses only the confirmed public target; private residence, background and mandatory constraints stay in private matching. */
export function socialQuery(search: SearchDraft): string | null {
  const target = search.target.trim().replace(/\s+/gu, " ");
  if (
    !target ||
    target.length > 160 ||
    /[@/:]|\d{6,}|[\r\n]/u.test(search.target)
  ) {
    return null;
  }
  const words = target
    .replace(/[^\p{L}\p{N} +#.-]/gu, " ")
    .trim()
    .toLowerCase();
  if (!/[\p{L}\p{N}]/u.test(words)) {
    return null;
  }
  // Keep arrangement and location out of retrieval: an otherwise useful post may omit both.
  return `"${words}" (hiring OR "looking for" OR "need a" OR "need an" OR seeking OR "paid project") -is:retweet`;
}
