import { WebDiscoveryCatalogRepository } from "../domain/contracts.js";

/** Presents bounded discovery progress and unassessed leads for an authenticated account. */
export class ReadWebDiscovery {
  /** Receives an inward read contract; ownership filtering stays in the repository query. */
  constructor(private readonly catalog: WebDiscoveryCatalogRepository) {}

  /** The owner is supplied by the verified transport session, never by browser query parameters. */
  execute(ownerId: string) {
    return this.catalog.read(ownerId);
  }
}
