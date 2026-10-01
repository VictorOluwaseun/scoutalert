import {
  CancellationScope,
  proxyActivities,
  patched,
  sleep,
} from "@temporalio/workflow";
import type { ScoutingActivities, ScoutRunInput } from "./contracts.js";
export type { ScoutingActivities, ScoutRunInput } from "./contracts.js";

const discovery = proxyActivities<
  Pick<ScoutingActivities, "scout" | "failRun" | "reconcile">
>({
  taskQueue: "scout-matching-v1",
  startToCloseTimeout: "1 minute",
  scheduleToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 4,
    initialInterval: "2 seconds",
    maximumInterval: "20 seconds",
  },
});
const source = proxyActivities<Pick<ScoutingActivities, "refreshSource">>({
  taskQueue: "scout-sources-v1",
  startToCloseTimeout: "1 minute",
  scheduleToCloseTimeout: "3 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5 seconds",
    maximumInterval: "30 seconds",
  },
});
const notifications = proxyActivities<
  Pick<ScoutingActivities, "deliverDigests">
>({
  taskQueue: "scout-delivery-v1",
  startToCloseTimeout: "5 minutes",
  scheduleToCloseTimeout: "6 minutes",
  retry: { maximumAttempts: 2 },
});

/** Finite run bounds history and source waiting; retry/replay always retains its logical business identity. */
export async function scoutWorkflow(input: ScoutRunInput): Promise<void> {
  try {
    const maximum = patched("scout-employer-research-v1") ? 32 : 20;
    for (let attempt = 0; attempt < maximum; attempt++) {
      const result = await discovery.scout(input);
      if (result === "done") return;
      if (patched("scout-intelligence-progress-v1") && result === "progress")
        continue;
      await sleep("30 seconds");
    }
    await discovery.failRun(input);
  } catch (error) {
    await CancellationScope.nonCancellable(() => discovery.failRun(input));
    throw error;
  }
}

/** One shared refresh per schedule action; collection concurrency is separate from matching and mail. */
export async function sourceWorkflow(board: string): Promise<void> {
  await source.refreshSource(board);
}

/** Native schedules create finite maintenance histories rather than an indefinitely growing timer loop. */
export async function maintenanceWorkflow(): Promise<void> {
  await discovery.reconcile(String(Math.floor(Date.now() / 60_000)));
  await notifications.deliverDigests();
}

const research = proxyActivities<
  Pick<ScoutingActivities, "researchAvailability">
>({
  taskQueue: "scout-research-v1",
  startToCloseTimeout: "90 seconds",
  scheduleToCloseTimeout: "3 minutes",
  retry: { maximumAttempts: 2 },
});

/** Independent finite schedule isolates research latency and outages from matching and email maintenance. */
export async function researchWorkflow(): Promise<void> {
  await research.researchAvailability();
}
