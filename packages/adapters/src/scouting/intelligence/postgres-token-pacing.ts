import { PostgresAccountTokenBudgetRepository } from "./postgres-account-token-budget.js";
import { sql, type Kysely } from "kysely";
import {
  refillTokenCredit,
  tokenPacingAvailability,
  tokenPacingCapacity,
  type ModelTokenBudgetPolicy,
  type ModelTokenBudgetPurpose,
  type ModelTokenBudgetSnapshot,
  type ModelTokenScope,
  type ModelTokenWork,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

type Db = Kysely<ScoutAlertDatabase>;
type Bucket = {
  purpose: "all" | ModelTokenBudgetPurpose;
  dailyLimit: number;
  capacity: number;
  credit: number;
};

/** Owns refill balances and short-lived demand behind the token ledger's family lock. It never changes daily counters or creates provider calls. */
export class PostgresTokenPacingRepository {
  /** Uses the configured deployment ceiling when deriving refill rates; model allocations remain independent. */
  constructor(private readonly globalLimit: number) {}

  /** Serializes the family across model aliases and midnight, including admission, refill and settlement. */
  async lock(db: Db, policy: ModelTokenBudgetPolicy): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`scoutalert-token-pacing:${policy.family}`},0))`.execute(
      db,
    );
  }

  /** Validates current scout attribution and records demand before the native input counter runs. Missing scope has one shared lane, never a bypass. */
  async prepare(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    purpose: ModelTokenBudgetPurpose,
    tokens: number,
    work: ModelTokenWork,
    scope?: ModelTokenScope,
  ): Promise<void> {
    if (!Number.isSafeInteger(tokens) || tokens < 1) {
      throw new Error("invalid_token_demand");
    }
    const owner = await new PostgresAccountTokenBudgetRepository().owner(
      db,
      scope,
    );
    const participant =
      policy.accountDailyLimit !== undefined
        ? (owner ?? "shared")
        : (scope?.scoutId ?? "shared");
    await this.initialize(db, policy);
    await sql`DELETE FROM intelligence_token_demand WHERE family=${policy.family} AND seen_at<clock_timestamp()-make_interval(mins=>${policy.pacing!.demandMinutes ?? 5})`.execute(
      db,
    );
    await sql`INSERT INTO intelligence_token_demand(family,purpose,participant,scout_id,scout_version,owner_id,work_class,requested_tokens)
      VALUES(${policy.family},${purpose},${participant},${scope?.scoutId ?? null}::uuid,${scope?.version ?? null},${owner}::uuid,${work},${tokens})
      ON CONFLICT(family,purpose,participant) DO UPDATE SET scout_id=excluded.scout_id,owner_id=excluded.owner_id,scout_version=excluded.scout_version,work_class=excluded.work_class,requested_tokens=excluded.requested_tokens,seen_at=clock_timestamp()`.execute(
      db,
    );
  }

  /** Seeds new pacing state conservatively from prior charged reservations; rollout, restart and midnight cannot mint fresh credit. */
  async initialize(db: Db, policy: ModelTokenBudgetPolicy): Promise<void> {
    for (const bucket of await this.buckets(db, policy)) {
      await sql`INSERT INTO intelligence_token_pacing(family,purpose,credit) VALUES(${policy.family},${bucket.purpose},${bucket.credit}) ON CONFLICT DO NOTHING`.execute(
        db,
      );
    }
  }

  /** Reads refill projections without writes. Fairness considers only affordable, current, recently waiting work. */
  async snapshot(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    dailyRemaining: number,
    purpose?: ModelTokenBudgetPurpose,
    participant: string | null = null,
    dailyAllocations: NonNullable<ModelTokenBudgetSnapshot["allocations"]> = [],
    paidCapacity = 0,
  ): Promise<Pick<ModelTokenBudgetSnapshot, "pacing">> {
    const buckets = await this.buckets(db, policy);
    const family = buckets.find((item) => item.purpose === "all")!;
    const allocation = purpose
      ? buckets.find((item) => item.purpose === purpose)!
      : family;
    const credit = Math.max(
      0,
      Math.floor(Math.min(dailyRemaining, family.credit, allocation.credit)),
    );
    const demandPurpose = purpose ?? "standard";
    const data = await this.demands(db, policy, demandPurpose, participant);
    const preferred = Math.floor(
      (((Math.min(this.globalLimit, policy.dailyLimit) *
        policy.pacing!.windowMinutes) /
        1440) *
        policy.pacing!.maintenancePercent) /
        100,
    );
    const availability = tokenPacingAvailability(
      Math.max(credit, paidCapacity),
      preferred,
      data.maintenance,
      data.waiting,
      participant,
      data.ownCommitted,
    );
    const required =
      data.waiting.find((item) => item.participant === participant)
        ?.requestedTokens ?? 1;
    const delays = [family, allocation].map((item) =>
      item.dailyLimit > 0
        ? (Math.max(0, Math.min(required, item.capacity) - item.credit) *
            86_400_000) /
          item.dailyLimit
        : 86_400_000,
    );
    const delay = Math.max(30_000, ...delays);
    return {
      pacing: {
        windowMinutes: policy.pacing!.windowMinutes,
        limit: family.capacity,
        maintenanceLimit: preferred,
        committedTokens: data.committed,
        maintenanceCommittedTokens: data.maintenance,
        ...availability,
        availableTokens: Math.min(credit, availability.availableTokens),
        maintenanceAvailableTokens: Math.min(
          credit,
          availability.maintenanceAvailableTokens,
        ),
        retryAt: new Date(data.now.getTime() + delay).toISOString(),
        refillTokensPerHour: family.dailyLimit / 24,
        allocations: buckets
          .filter((item) => item.purpose !== "all")
          .map((item) => ({
            purpose: item.purpose as ModelTokenBudgetPurpose,
            capacity: item.capacity,
            availableTokens: Math.max(
              0,
              Math.floor(
                Math.min(
                  family.credit,
                  item.credit,
                  dailyAllocations.find(
                    (entry) => entry.purpose === item.purpose,
                  )?.remainingTokens ?? dailyRemaining,
                ),
              ),
            ),
            refillTokensPerHour: item.dailyLimit / 24,
          })),
      },
    };
  }

  /** Debits projected balances only after daily admission succeeds; shared public work is charged once to its initiating scout. */
  async spend(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    purpose: ModelTokenBudgetPurpose,
    tokens: number,
    scope?: ModelTokenScope,
  ): Promise<void> {
    await this.adjust(db, policy, purpose, -tokens);
    await this.clearDemand(db, policy, purpose, scope);
  }

  /** Removes a serviced owner from the waiting set without debiting base credit for a paid call. */
  async clearDemand(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    purpose: ModelTokenBudgetPurpose,
    scope?: ModelTokenScope,
  ): Promise<void> {
    const owner = await new PostgresAccountTokenBudgetRepository().owner(
      db,
      scope,
    );
    const participant =
      policy.accountDailyLimit !== undefined
        ? (owner ?? "shared")
        : (scope?.scoutId ?? "shared");
    await sql`DELETE FROM intelligence_token_demand WHERE family=${policy.family} AND purpose=${purpose} AND participant=${participant}`.execute(
      db,
    );
  }

  /** Applies the unused part of a settled reservation once. Unknown outcomes never call this; overages become pacing debt. */
  async adjust(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    purpose: ModelTokenBudgetPurpose,
    delta: number,
  ): Promise<void> {
    for (const bucket of (await this.buckets(db, policy)).filter(
      (item) => item.purpose === "all" || item.purpose === purpose,
    )) {
      await sql`UPDATE intelligence_token_pacing SET credit=${Math.min(bucket.capacity, bucket.credit + delta)},updated_at=clock_timestamp() WHERE family=${policy.family} AND purpose=${bucket.purpose}`.execute(
        db,
      );
    }
  }

  /** Projects all-family and protected-purpose buckets using PostgreSQL time; sparse or legacy ledgers cannot reset an existing bucket. */
  private async buckets(
    db: Db,
    policy: ModelTokenBudgetPolicy,
  ): Promise<Bucket[]> {
    const audit = policy.auditTokens ?? 0;
    const definitions = (
      [
        ["all", policy.dailyLimit],
        ["standard", policy.dailyLimit - audit],
        ["audit", audit],
      ] as const
    ).map(([purpose, daily]) => ({
      purpose,
      dailyLimit: Math.min(this.globalLimit, daily),
    }));
    const rows = await sql<{
      purpose: string;
      credit: string;
      elapsed: number;
    }>`SELECT purpose,credit::text,extract(epoch FROM clock_timestamp()-updated_at)::double precision*1000 AS elapsed FROM intelligence_token_pacing WHERE family=${policy.family}`.execute(
      db,
    );
    const buckets: Bucket[] = [];
    for (const definition of definitions) {
      const capacity = tokenPacingCapacity(
        definition.dailyLimit,
        policy.pacing!,
      );
      const known = rows.rows.find((row) => row.purpose === definition.purpose);
      if (known) {
        buckets.push({
          ...definition,
          capacity,
          credit: refillTokenCredit(
            Number(known.credit),
            known.elapsed,
            definition.dailyLimit,
            capacity,
          ),
        });
        continue;
      }
      const minutes = definition.dailyLimit
        ? Math.ceil((capacity * 1440) / definition.dailyLimit)
        : 1440;
      const legacy = await sql<{
        committed: string;
      }>`SELECT coalesce(sum(CASE WHEN state='completed' THEN input_tokens+output_tokens ELSE reserved_tokens END),0)::text AS committed
        FROM intelligence_token_reservations WHERE funding='base' AND model IN (${sql.join(policy.models)}) AND created_at>now()-make_interval(mins=>${minutes}) AND (${definition.purpose}='all' OR purpose=${definition.purpose})`.execute(
        db,
      );
      buckets.push({
        ...definition,
        capacity,
        credit: Math.max(0, capacity - Number(legacy.rows[0]!.committed)),
      });
    }
    return buckets;
  }

  /** Joins pending demand to active scout revisions and daily charged usage; expired waiters and unaffordable work cannot hold another scout's turn. */
  private async demands(
    db: Db,
    policy: ModelTokenBudgetPolicy,
    purpose: ModelTokenBudgetPurpose,
    participant: string | null,
  ) {
    const rows = await sql<{
      participant: string;
      work: ModelTokenWork;
      requested: string;
      committed: string;
    }>`
      SELECT d.participant,d.work_class AS work,d.requested_tokens::text AS requested,
        coalesce((SELECT sum(CASE WHEN r.state='completed' THEN r.input_tokens+r.output_tokens ELSE r.reserved_tokens END)
          FROM intelligence_token_reservations r WHERE r.day=(now() AT TIME ZONE 'UTC')::date AND r.model IN (${sql.join(policy.models)}) AND (${policy.accountDailyLimit !== undefined} OR r.purpose=${purpose}) AND CASE WHEN ${policy.accountDailyLimit !== undefined} THEN coalesce(r.owner_id::text,'shared')=d.participant ELSE r.scout_id IS NOT DISTINCT FROM d.scout_id END),0)::text AS committed
      FROM intelligence_token_demand d WHERE d.family=${policy.family} AND d.purpose=${purpose}
        AND (${policy.accountDailyLimit === undefined} OR d.scout_id IS NULL OR d.participant=d.owner_id::text)
        AND d.seen_at>now()-make_interval(mins=>${policy.pacing!.demandMinutes ?? 5})
        AND (d.scout_id IS NULL OR EXISTS(SELECT 1 FROM scouts s WHERE s.id=d.scout_id AND s.version=d.scout_version AND s.status='active'))`.execute(
      db,
    );
    const sums = await sql<{
      committed: string;
      maintenance: string;
      own: string;
      now: Date;
    }>`SELECT now(),
      coalesce(sum(CASE WHEN state='completed' THEN input_tokens+output_tokens ELSE reserved_tokens END) FILTER(WHERE created_at>now()-make_interval(mins=>${policy.pacing!.windowMinutes})),0)::text AS committed,
      coalesce(sum(CASE WHEN state='completed' THEN input_tokens+output_tokens ELSE reserved_tokens END) FILTER(WHERE work_class='maintenance' AND created_at>now()-make_interval(mins=>${policy.pacing!.windowMinutes})),0)::text AS maintenance,
      coalesce(sum(CASE WHEN state='completed' THEN input_tokens+output_tokens ELSE reserved_tokens END) FILTER(WHERE day=(now() AT TIME ZONE 'UTC')::date AND (${policy.accountDailyLimit !== undefined} OR purpose=${purpose}) AND CASE WHEN ${policy.accountDailyLimit !== undefined} THEN coalesce(owner_id::text,'shared') ELSE coalesce(scout_id::text,'shared') END=${participant}),0)::text AS own
      FROM intelligence_token_reservations WHERE model IN (${sql.join(policy.models)}) AND (day=(now() AT TIME ZONE 'UTC')::date OR created_at>now()-make_interval(mins=>${policy.pacing!.windowMinutes}))`.execute(
      db,
    );
    const totals = sums.rows[0]!;
    return {
      now: totals.now,
      committed: Number(totals.committed),
      maintenance: Number(totals.maintenance),
      ownCommitted: Number(totals.own),
      waiting: rows.rows
        .filter((row) => {
          const limit =
            row.participant === "shared"
              ? policy.sharedDailyLimit
              : policy.accountDailyLimit;
          return (
            limit === undefined ||
            Number(row.requested) <= limit - Number(row.committed)
          );
        })
        .map((row) => ({
          participant: row.participant,
          work: row.work,
          requestedTokens: Number(row.requested),
          committedTokens: Number(row.committed),
        })),
    };
  }
}
