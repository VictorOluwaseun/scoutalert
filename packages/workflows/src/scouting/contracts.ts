/** Serializable execution identity; business authorization is rechecked by each activity's core use case. */
export interface ScoutRunInput {
  scoutId: string;
  ownerId: string;
  version: number;
  runId: string;
}

/** Workflow/activity boundary carries IDs and small outcomes, never source snapshots or personal briefs. */
export interface ScoutingActivities {
  /** Refreshes shared evidence once under a repository lease. */
  refreshSource(source: string): Promise<void>;
  /** Attempts a bounded private matching pass on current authoritative inputs. */
  scout(input: ScoutRunInput): Promise<"done" | "waiting" | "progress">;
  /** Records a terminal run failure without replacing a newer revision. */
  failRun(input: ScoutRunInput): Promise<void>;
  /** Reconciles one fair, bounded batch of scouts into durable dispatch intents. */
  reconcile(epoch: string): Promise<number>;
  /** Checks a finite batch of public posting revisions with durable shared leases. */
  researchAvailability(): Promise<number>;
  /** Submits due recipient digests through the durable delivery ledger. */
  deliverDigests(): Promise<number>;
}
