import type {
  Assessment,
  DiscoverySummary,
  OpportunityView,
  Posting,
  RunContext,
  ScoutRunRequest,
  SourceSnapshot,
} from "../domain/discovery.js";

/** Publishes validated shared source evidence behind an inward persistence boundary. */
export abstract class SourceRepository {
  /** Claims a bounded source refresh lease; fresh snapshots can be reused across scouts. */
  abstract claim(source: string, now: Date): Promise<string | null>;
  /** Commits validated evidence with meaningful versions; only complete snapshots expire absent postings. */
  abstract publish(snapshot: SourceSnapshot, lease: string): Promise<void>;
  /** Records a source outage without expiring its last complete snapshot. */
  abstract fail(source: string, lease: string): Promise<void>;
}

/** Read-only public source access; applications receive normalized evidence rather than HTTP clients. */
export abstract class SourceConnector {
  /** Fetches bounded public evidence and explicitly distinguishes complete boards from rolling windows. */
  abstract read(source: string, now: Date): Promise<SourceSnapshot>;
}

/** Authoritative discovery transactions own version checks, publication, and reconciliation. */
export abstract class ScoutingRepository {
  /** Starts/replays a logical run only for its current owner and revision. */
  abstract begin(request: ScoutRunRequest): Promise<RunContext | null>;
  /** Returns null while no fresh source covers this category; limits retrieval independently of user count. */
  abstract candidates(context: RunContext): Promise<Posting[] | null>;
  /** Publishes current evidence assessments and completes a run atomically; stale revisions cannot publish. */
  abstract complete(
    context: RunContext,
    matches: { posting: Posting; assessment: Assessment }[],
    outcome?: "completed" | "coverage_unavailable",
  ): Promise<void>;
  /** Makes failure visible without replacing a newer run or revision. */
  abstract fail(request: ScoutRunRequest): Promise<void>;
  /** Enqueues bounded reconciliation work after shared source updates, preserving a durable dispatch intent. */
  abstract reconcile(epoch: string, now: Date): Promise<number>;
}

/** Dispatch intent leases permit concurrent hosts and recovery after lost workflow acknowledgements. */
export abstract class DiscoveryIntentRepository {
  /** Claims pending outbox rows with an expiring token rather than holding a database transaction over network I/O. */
  abstract claim(): Promise<
    { id: string; lease: string; request: ScoutRunRequest }[]
  >;
  /** Marks admission only for the current lease; workflow identity protects retry after an ambiguous acknowledgement. */
  abstract acknowledge(id: string, lease: string): Promise<void>;
}

/** Owner-scoped read model never returns another account's matching results. */
export abstract class OpportunityCatalogRepository {
  /** Returns at most twenty recent opportunities with only fresh current evidence and scout contributions. */
  abstract list(ownerId: string, hidden?: boolean): Promise<OpportunityView[]>;
  /** Returns source health and the latest run for each requested owner-scoped scout, plus delivery outcomes. */
  abstract summary(
    ownerId: string,
    scoutIds: string[],
  ): Promise<DiscoverySummary>;
}
