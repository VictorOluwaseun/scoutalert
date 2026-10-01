import type { ManagedScout } from "./manage-scout.js";

/** Stable ordering marker; an opaque transport cursor is encoded outside the business core. */
export interface ScoutCursor {
  activatedAt: string;
  id: string;
}

/** Owner-scoped scout reads independent of onboarding transport and persistence technology. */
export abstract class ScoutCatalogRepository {
  /** Returns at most limit records, ordered by activation time then ID descending, after the marker. */
  abstract list(
    ownerId: string,
    after: ScoutCursor | null,
    limit: number,
  ): Promise<ManagedScout[]>;
}

/** A bounded page of saved scouts and the marker for the next page, when one exists. */
export interface ScoutPage {
  items: ManagedScout[];
  next: ScoutCursor | null;
}

/** Retrieves saved scouts for a verified owner without executing discovery or altering their preferences. */
export class ListScouts {
  /** Receives the inward repository boundary; account verification belongs to the calling transport. */
  constructor(private readonly scouts: ScoutCatalogRepository) {}

  /** Reads one extra record to detect another page; concurrent newer inserts do not shift this cursor. */
  async execute(
    ownerId: string,
    after: ScoutCursor | null = null,
  ): Promise<ScoutPage> {
    const records = await this.scouts.list(ownerId, after, 21);
    const items = records.slice(0, 20);
    const last = items.at(-1);

    return {
      items,
      next:
        records.length > 20 && last
          ? { activatedAt: last.activatedAt, id: last.id }
          : null,
    };
  }
}
