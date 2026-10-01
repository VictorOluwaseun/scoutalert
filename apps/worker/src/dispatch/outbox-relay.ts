import {
  Client,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import { DiscoveryIntentRepository } from "@repo/core/scouting";

/** Bridges committed business intents to workflow admission, preserving identity after lost acknowledgements. */
export class DiscoveryOutboxRelay {
  /** Receives inward intent access and a native Temporal client at the transport boundary. */
  constructor(
    private readonly intents: DiscoveryIntentRepository,
    private readonly temporal: Client,
  ) {}
  /** Admits one leased batch; duplicate completed/running workflows are safe to acknowledge without restarting. */
  async dispatch(): Promise<void> {
    for (const intent of await this.intents.claim()) {
      try {
        await this.temporal.connection.withDeadline(Date.now() + 10_000, () =>
          this.temporal.workflow.start("scoutWorkflow", {
            taskQueue: "scout-workflows-v1",
            workflowId: `scout-run-${intent.id}`,
            args: [intent.request],
            workflowIdReusePolicy: "REJECT_DUPLICATE",
            workflowExecutionTimeout: "20 minutes",
          }),
        );
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError))
          throw error;
      }
      await this.intents.acknowledge(intent.id, intent.lease);
    }
  }
}
