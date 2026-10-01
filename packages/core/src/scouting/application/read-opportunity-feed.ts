import { OpportunityCatalogRepository } from "./ports.js";

/** Composes bounded discovery reads for the authenticated dashboard without framework or data-source access. */
export class ReadOpportunityFeed {
  /** Receives the inward account-scoped read repository. */
  constructor(private readonly catalog: OpportunityCatalogRepository) {}

  /** Lists recent recommendations across scouts and run status for the current scout page. */
  async execute(ownerId: string, scoutIds: string[]) {
    if (scoutIds.length > 20) {
      throw new Error("invalid_scout_page");
    }

    const [opportunities, hiddenOpportunities, discovery] = await Promise.all([
      this.catalog.list(ownerId),
      this.catalog.list(ownerId, true),
      this.catalog.summary(ownerId, scoutIds),
    ]);

    return { opportunities, hiddenOpportunities, discovery };
  }
}
