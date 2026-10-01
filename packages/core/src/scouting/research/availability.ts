import type { Posting } from "../domain/discovery.js";

/** Public, time-bounded observation of a posting, never a claim about a person's eligibility. */
export interface AvailabilityEvidence {
  status: "available" | "closed" | "changed" | "unresolved";
  checkedAt: string;
  sourceUrl: string;
  fingerprint: string | null;
  validUntil?: string;
}

/** Shared research persistence; each lease captures one immutable posting revision. */
export abstract class AvailabilityRepository {
  /** Claims one due, currently recommended posting, fairly ordered and fenced across workers. */
  abstract claim(): Promise<{ token: string; posting: Posting } | null>;
  /** Saves an observation only while its lease and captured posting revision remain current. */
  abstract complete(
    token: string,
    evidence: AvailabilityEvidence,
  ): Promise<void>;
}

/** Allowlisted public employer-source access; implementations never receive personal briefs. */
export abstract class AvailabilitySource {
  /** Checks availability and meaningful content equality under a bounded network deadline. */
  abstract check(posting: Posting): Promise<AvailabilityEvidence>;
}

/** Runs finite public research separately from private matching and delivery. */
export class ResearchAvailability {
  /** Receives repository and source ports; network work is outside the claim/completion transactions. */
  constructor(
    private readonly records: AvailabilityRepository,
    private readonly source: AvailabilitySource,
  ) {}

  /** Four checks per activity bound network work; unavailable evidence stays unresolved and cannot authorize an alert. */
  async execute(): Promise<number> {
    let completed = 0;
    for (let index = 0; index < 4; index++) {
      const claim = await this.records.claim();
      if (!claim) return completed;
      const evidence = await this.source.check(claim.posting);
      await this.records.complete(claim.token, evidence);
      completed++;
    }
    return completed;
  }
}
