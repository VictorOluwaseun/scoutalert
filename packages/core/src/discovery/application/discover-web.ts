import type { ScoutRunRequest } from "../../scouting/domain/discovery.js";
import { PlanScoutSearch } from "./plan-scout-search.js";
import { ReviewDiscoveryLeads } from "./review-discovery-leads.js";
import { planDiscovery } from "./plan-discovery.js";
import { planExploration } from "./plan-exploration.js";
import {
  SourceDocumentRepository,
  WebDiscoveryRepository,
  WebSearchProvider,
  type DiscoveryLimits,
} from "../domain/contracts.js";

/** Advances a finite discovery case one durable operation at a time, independently of existing indexed matches. */
export class DiscoverWeb {
  /** Receives inward contracts and explicit runtime limits; all persistence and network access stay in adapters. */
  constructor(
    private readonly records: WebDiscoveryRepository,
    private readonly documents: SourceDocumentRepository,
    private readonly provider: WebSearchProvider | null,
    private readonly limits: DiscoveryLimits,
    private readonly planner?: PlanScoutSearch,
    private readonly reviews?: ReviewDiscoveryLeads,
  ) {}

  /** Reuses public work, rejects superseded revisions and never refunds an uncertain external attempt. */
  async execute(
    request: ScoutRunRequest,
  ): Promise<"done" | "waiting" | "progress"> {
    const search = await this.records.context(request);

    if (!search) {
      return "done";
    }

    const frozen = await this.records.preparedPlan(request);
    if (
      frozen?.origin === "source_monitor" ||
      frozen?.origin === "native_social"
    ) {
      return "done";
    }
    const baseline =
      frozen ??
      planDiscovery(
        search,
        request.version,
        this.limits.maximumDocuments,
        this.provider?.capability,
        true,
        this.limits.exploration,
      );
    const plan =
      !frozen && this.provider && this.planner
        ? await this.planner.prepare(request, baseline)
        : baseline;
    if (plan === "progress" || plan === "waiting") {
      return plan;
    }
    await this.records.open(request, plan, this.provider?.capability ?? null);
    const claim = await this.records.claim(request, this.limits);

    if (claim.status === "planning") {
      const reviewed =
        claim.snapshot.plan.policy === "public-intent-v3" && this.reviews
          ? await this.reviews.execute(request)
          : "done";
      if (reviewed !== "done") {
        return reviewed;
      }
      // Re-read after reviews: decisions must see the facts just accepted, not a stale snapshot.
      const current = await this.records.claim(request, this.limits);
      if (current.status !== "planning") {
        return "progress";
      }
      const decision =
        current.snapshot.plan.policy === "public-intent-v3" && this.planner
          ? await this.planner.next(request, current.snapshot)
          : planExploration(current.snapshot);
      if (decision === "progress" || decision === "waiting") {
        return decision;
      }
      await this.records.extend(request, current.snapshot, decision);
      return "progress";
    }

    if (claim.status !== "claimed") {
      return claim.status;
    }

    try {
      const result =
        claim.operation.kind === "search"
          ? await this.provider!.search(claim.operation.query)
          : await this.documents.read(claim.operation.url);
      await this.records.complete(claim.key, claim.token, result);
    } catch {
      await this.records.fail(claim.key, claim.token);
    }

    return "progress";
  }
}
