import {
  SourceConnector,
  AvailabilitySource,
  type Posting,
  type SourceSnapshot,
  type AvailabilityEvidence,
} from "@repo/core/scouting";

/** Dispatches collection only to composition-registered public source implementations. */
export class SourceConnectorRouter extends SourceConnector {
  /** Receives an explicit source-to-connector registry; source names are never URLs. */
  constructor(
    private readonly sources: Readonly<Record<string, SourceConnector>>,
  ) {
    super();
  }

  /** Refuses unsupported names before invoking network access. */
  async read(source: string, now: Date): Promise<SourceSnapshot> {
    if (!Object.hasOwn(this.sources, source)) {
      throw new Error("unsupported_source");
    }

    return this.sources[source]!.read(source, now);
  }
}

/** Routes public availability checks using the same composition-owned source identities. */
export class AvailabilitySourceRouter extends AvailabilitySource {
  /** Receives independently testable source adapters with bounded network policies. */
  constructor(
    private readonly sources: Readonly<Record<string, AvailabilitySource>>,
  ) {
    super();
  }

  /** Unknown sources remain unresolved and cannot qualify for a prompt alert. */
  async check(posting: Posting): Promise<AvailabilityEvidence> {
    if (!Object.hasOwn(this.sources, posting.source)) {
      return {
        status: "unresolved",
        checkedAt: new Date().toISOString(),
        fingerprint: null,
        sourceUrl: posting.url,
      };
    }

    return this.sources[posting.source]!.check(posting);
  }
}
