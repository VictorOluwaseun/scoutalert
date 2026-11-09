/** Deployment admission policy; an account retains its seat when it pauses or replaces a scout. */
export interface BetaAccessPolicy {
  maximumAccounts: number;
  activeScoutsPerAccount: number;
}

/** Locked capacity observed inside the same transaction that activates or resumes a scout. */
export interface BetaCapacity {
  admitted: boolean;
  accounts: number;
  activeScouts: number;
}

/** Aggregate rollout checks avoid choosing or pausing existing scouts on an owner's behalf. */
export interface BetaReadiness {
  accounts: number;
  activeScouts: number;
  accountsOverScoutLimit: number;
}

/** Read-only deployment validation remains behind the persistence boundary. */
export abstract class BetaReadinessRepository {
  /** Includes existing seats and checks all current owners against the requested active-scout limit. */
  abstract read(policy: BetaAccessPolicy): Promise<BetaReadiness>;
}

/** Stops beta execution when legacy selections require an explicit owner decision. */
export function assertBetaReady(
  policy: BetaAccessPolicy,
  current: BetaReadiness,
): void {
  if (
    current.accounts > policy.maximumAccounts ||
    current.accountsOverScoutLimit > 0
  ) {
    throw new Error(
      `Beta rollout needs attention: ${current.accounts} accounts, ${current.accountsOverScoutLimit} accounts over the active-scout limit. Run the beta readiness check and choose which scouts remain active before enabling beta execution.`,
    );
  }
}

/** Transaction-bound admission records shared by activation and lifecycle commands. */
export interface BetaAdmissionRecords {
  /** Serializes cohort admission and counts other active scouts for this owner. */
  capacity(ownerId: string, excludingScoutId?: string): Promise<BetaCapacity>;
  /** Retains the owner's seat; retries and paused scouts never create a second seat. */
  admit(ownerId: string): Promise<void>;
}

/** Expected beta capacity failure, safe to display without exposing another account. */
export class BetaAccessError extends Error {
  /** Identifies whether the cohort or the account's active-scout allowance is full. */
  constructor(public readonly code: "beta_full" | "active_scout_limit") {
    super(code);
    this.name = "BetaAccessError";
  }
}

/** Enforces limits before any scout, consent or dispatch writes; existing seats survive a lower configured cohort limit. */
export async function admitBetaScout(
  records: BetaAdmissionRecords,
  policy: BetaAccessPolicy,
  ownerId: string,
  excludingScoutId?: string,
): Promise<void> {
  const capacity = await records.capacity(ownerId, excludingScoutId);
  if (capacity.activeScouts >= policy.activeScoutsPerAccount) {
    throw new BetaAccessError("active_scout_limit");
  }
  if (!capacity.admitted && capacity.accounts >= policy.maximumAccounts) {
    throw new BetaAccessError("beta_full");
  }
  await records.admit(ownerId);
}
