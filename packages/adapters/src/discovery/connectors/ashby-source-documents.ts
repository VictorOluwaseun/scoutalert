import {
  SourceDocumentRepository,
  type SourceDocumentResult,
  type PublicApiSnapshotRepository,
} from "@repo/core/discovery";
import { PublicHttpRepository } from "./public-http.js";
import {
  ashbyTarget,
  parseAshbyPostings,
  ashbyDocument,
  type AshbyTarget,
} from "./ashby-postings.js";
import { discoveryKey } from "../persistence/discovery-identities.js";

/** Reads Ashby's documented unauthenticated jobs API; its explicit API capability is separate from generic HTML crawl admission. */
export class AshbySourceDocumentRepository extends SourceDocumentRepository {
  /** Injects pinned HTTPS and an optional public-only cache; generic documents cannot opt into this provider access path. */
  constructor(
    private readonly http: PublicHttpRepository,
    private readonly snapshots: PublicApiSnapshotRepository | null = null,
  ) {
    super();
  }

  /** Preserves requested identity and original feed observation time; missing jobs and provider failures never assert closure. */
  async read(url: string): Promise<SourceDocumentResult> {
    const empty: SourceDocumentResult = {
      kind: "document",
      url,
      checkedAt: new Date().toISOString(),
      status: "unavailable",
      reason: null,
      text: null,
      fingerprint: null,
      posting: null,
      hostDelaySeconds: 2,
    };
    const target = ashbyTarget(url);
    if (!target) {
      return { ...empty, status: "blocked", reason: "unsupported_ashby_url" };
    }
    const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${target.board}?includeCompensation=true`;
    let requests = 0;
    let bytes = 0;
    try {
      const feed = await this.feed(
        endpoint,
        target,
        () => {
          requests += 1;
        },
        (size) => {
          bytes += size;
        },
      );
      const parsed = parseAshbyPostings(feed.body, target);
      const document = ashbyDocument(
        url,
        target,
        parsed.jobs,
        parsed.incomplete,
      );
      return {
        ...empty,
        ...document,
        checkedAt: feed.checkedAt,
        status: "fetched",
        publicApi: {
          provider: "ashby",
          url: endpoint,
          snapshotFingerprint: discoveryKey(feed.body),
        },
        capture: {
          method: "public_api",
          requests,
          bytes,
          complete: !document.truncated,
          cacheHit: feed.cached,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      return {
        ...empty,
        reason: [
          "public_feed_busy",
          "ashby_posting_not_listed",
          "ashby_api_unavailable",
          "ashby_cache_lease_lost",
        ].includes(reason)
          ? reason
          : "ashby_capture_failed",
        capture: { method: "public_api", requests, bytes, complete: false },
      };
    }
  }

  /** Coalesces board reads for five minutes, with one bounded GET on cache miss and no application/authenticated endpoint calls. */
  private async feed(
    endpoint: string,
    target: AshbyTarget,
    attempt: () => void,
    received: (bytes: number) => void,
  ) {
    const key = `ashby-public-v1:${target.board}`;
    const claim = this.snapshots ? await this.snapshots.claim(key) : null;
    if (claim?.status === "ready") {
      return { ...claim.snapshot, cached: true };
    }
    if (claim?.status === "busy") {
      throw new Error("public_feed_busy");
    }
    try {
      attempt();
      const response = await this.http.read(
        endpoint,
        6_000_000,
        AbortSignal.timeout(15_000),
      );
      received(Buffer.byteLength(response.body));
      if (
        response.status !== 200 ||
        !/^application\/json(?:;|$)/iu.test(response.contentType)
      ) {
        throw new Error("ashby_api_unavailable");
      }
      const checkedAt = new Date().toISOString();
      const parsed = parseAshbyPostings(response.body, target);
      const body = JSON.stringify({
        apiVersion: "1",
        jobs: parsed.jobs,
        _captureIncomplete: parsed.incomplete,
      });
      const accepted =
        claim?.status === "claimed"
          ? await this.snapshots!.complete(key, claim.token, {
              body,
              checkedAt,
            })
          : true;
      if (!accepted) {
        throw new Error("ashby_cache_lease_lost");
      }
      return { body, checkedAt, cached: false };
    } catch (error) {
      await this.release(key, claim?.status === "claimed" ? claim.token : null);
      throw error;
    }
  }

  /** A failed fetch releases only its own cache lease; durable admission remains charged even if cleanup fails. */
  private async release(key: string, token: string | null): Promise<void> {
    if (token && this.snapshots) {
      await this.snapshots.fail(key, token).catch(() => undefined);
    }
  }
}
