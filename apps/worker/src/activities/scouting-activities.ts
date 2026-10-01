import {
  RefreshSource,
  ResearchAvailability,
  ScoutOpportunities,
  ScoutingRepository,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import { DeliverOpportunityDigests } from "@repo/core/notifications";

/** Thin activity host delegates business decisions to shared framework-independent use cases. */
export class ScoutingActivityHost {
  /** Receives use cases and an inward persistence contract through Nest composition. */
  constructor(
    private readonly refresh: RefreshSource,
    private readonly matching: ScoutOpportunities,
    private readonly records: ScoutingRepository,
    private readonly delivery: DeliverOpportunityDigests,
    private readonly research: ResearchAvailability,
  ) {}
  /** Refreshes one server-approved public board; the repository collapses duplicate attempts. */
  refreshSource(source: string) {
    return this.refresh.execute(source, new Date());
  }
  /** Executes a private bounded match attempt with current owner and version checks. */
  scout(input: ScoutRunRequest) {
    return this.matching.execute(input);
  }
  /** Records terminal failure, preserving newer revisions and runs. */
  failRun(input: ScoutRunRequest) {
    return this.records.fail(input);
  }
  /** Produces durable refresh intents for the least recently requested scouts. */
  async reconcile(epoch: string) {
    let total = 0;
    for (let batch = 0; batch < 10; batch++) {
      const processed = await this.records.reconcile(epoch, new Date());
      total += processed;
      if (processed < 500) return total;
    }
    return total;
  }
  /** Performs a bounded shared employer-source check without occupying the matching or mail pools. */
  researchAvailability() {
    return this.research.execute();
  }
  /** Evaluates current schedule and consent through the shared delivery use case. */
  deliverDigests() {
    return this.delivery.execute(new Date());
  }
}
