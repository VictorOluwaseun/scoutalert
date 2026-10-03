import type { ScoutRunRequest } from "../../scouting/domain/discovery.js";
import {
  SourceDocumentRepository,
  WebDiscoveryRepository,
} from "../domain/contracts.js";
import { SourceMonitoringRepository } from "../domain/source-monitoring.js";
import { monitoringKind, nextMonitorCheck } from "../domain/monitor-policy.js";

/** Learns bounded monitoring interests from reviewed evidence without sending personal information to sources. */
export class LearnSourceMonitoring {
  /** Receives only persistence contracts; source admission rules remain in the core. */
  constructor(private readonly records: SourceMonitoringRepository) {}

  /** Rechecks current evidence in persistence before enrolling each useful page or retiring rejected demand. */
  async execute(request: ScoutRunRequest): Promise<void> {
    for (const candidate of await this.records.candidates(request)) {
      await this.records.subscribe(
        request,
        candidate,
        monitoringKind(candidate, new Date()),
      );
    }
  }
}

/** Revisits one shared source at a time and hands changed evidence to the existing private scouting pipeline. */
export class MonitorSources {
  /** Reuses public retrieval, operation fencing and the global document budget instead of opening another data path. */
  constructor(
    private readonly records: SourceMonitoringRepository,
    private readonly operations: WebDiscoveryRepository,
    private readonly documents: SourceDocumentRepository,
    private readonly dailyDocuments: number,
    private readonly concurrency: number,
  ) {}

  /** Completes durable receipts before dispatch, so crashes can replay bookkeeping without repeating network work. */
  async execute(): Promise<"done" | "waiting" | "progress"> {
    await this.records.dispatch();
    const claim = await this.records.claim(
      this.dailyDocuments,
      this.concurrency,
    );
    if (claim.status === "observed") {
      await this.records.settle(
        claim,
        nextMonitorCheck(claim.monitor, claim.result),
      );
      await this.records.dispatch();
      return "progress";
    }
    if (claim.status !== "claimed") {
      return claim.status;
    }
    try {
      await this.operations.complete(
        claim.key,
        claim.token,
        await this.documents.read(claim.url),
      );
    } catch {
      await this.operations.fail(claim.key, claim.token);
    }
    return "progress";
  }
}
