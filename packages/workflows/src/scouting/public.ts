import {
  CancellationScope,
  proxyActivities,
  patched,
  sleep,
  isCancellation,
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

const web = proxyActivities<
  Pick<ScoutingActivities, "discoverWeb" | "reviewDiscoveryLeads">
>({
  taskQueue: "scout-web-discovery-v1",
  startToCloseTimeout: "60 seconds",
  scheduleToCloseTimeout: "75 seconds",
  retry: { maximumAttempts: 2, initialInterval: "2 seconds" },
});

/** Gives classification its own finite deadline; provider outages leave unreviewed leads and preserve indexed matching. */
async function reviewPublicLeads(input: ScoutRunInput): Promise<void> {
  const deadline = Date.now() + 180_000;
  try {
    for (let step = 0; step < 24 && Date.now() < deadline; step++) {
      const result = await web.reviewDiscoveryLeads(input);
      if (result === "done") {
        return;
      }
      if (result === "waiting") {
        await sleep("5 seconds");
      }
    }
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
  }
}

/** Bounds new web work by workflow time as well as durable case deadlines; provider outages preserve indexed matching. */
async function discoverPublicWeb(input: ScoutRunInput): Promise<void> {
  const deadline = Date.now() + 240_000;

  try {
    for (let step = 0; step < 64 && Date.now() < deadline; step++) {
      const result = await web.discoverWeb(input);

      if (result === "done") {
        return;
      }

      if (result === "waiting") {
        await sleep("5 seconds");
      }
    }
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
    // A failed external discovery path must not suppress existing indexed matches.
  }
}

/** Finite run bounds history and source waiting; retry/replay always retains its logical business identity. */
export async function scoutWorkflow(input: ScoutRunInput): Promise<void> {
  try {
    if (patched("scout-public-web-discovery-v1")) {
      await discoverPublicWeb(input);
    }
    if (patched("scout-lead-evidence-v1")) {
      await reviewPublicLeads(input);
    }

    const maximum = patched("scout-employer-research-v1") ? 32 : 20;

    for (let attempt = 0; attempt < maximum; attempt++) {
      const result = await discovery.scout(input);

      if (result === "done") {
        return;
      }

      if (patched("scout-intelligence-progress-v1") && result === "progress") {
        continue;
      }

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

const monitoring = proxyActivities<Pick<ScoutingActivities, "monitorSources">>({
  taskQueue: "scout-source-monitoring-v1",
  startToCloseTimeout: "60 seconds",
  scheduleToCloseTimeout: "75 seconds",
  retry: { maximumAttempts: 2, initialInterval: "2 seconds" },
});

/** A separate finite schedule sweeps due sources without growing histories or delaying broad search and mail. */
export async function sourceMonitorWorkflow(): Promise<void> {
  const deadline = Date.now() + 240_000;
  for (let step = 0; step < 24 && Date.now() < deadline; step++) {
    const result = await monitoring.monitorSources();
    if (result === "done") {
      return;
    }
    if (result === "waiting") {
      await sleep("5 seconds");
    }
  }
}

const social = proxyActivities<Pick<ScoutingActivities, "discoverSocial">>({
  taskQueue: "scout-social-discovery-v1",
  startToCloseTimeout: "40 seconds",
  scheduleToCloseTimeout: "50 seconds",
  retry: { maximumAttempts: 2, initialInterval: "2 seconds" },
});

/** Finite native discovery histories resume persisted cursors without changing existing scout workflow commands. */
export async function socialDiscoveryWorkflow(): Promise<void> {
  const deadline = Date.now() + 240_000;
  for (let step = 0; step < 24 && Date.now() < deadline; step++) {
    const result = await social.discoverSocial();
    if (result === "done") {
      return;
    }
    if (result === "waiting") {
      await sleep("5 seconds");
    }
  }
}

const privateMail = proxyActivities<{ importPrivateMail(): Promise<boolean> }>({
  taskQueue: "scout-private-mail-v1",
  startToCloseTimeout: "45 seconds",
  scheduleToCloseTimeout: "90 seconds",
  retry: { maximumAttempts: 2, initialInterval: "5 seconds" },
});

/** Imports finite private batches; neither account credentials nor email bodies enter workflow arguments or history. */
export async function privateMailWorkflow(): Promise<void> {
  for (let batch = 0; batch < 10; batch++) {
    const progressed = await privateMail.importPrivateMail();
    if (!progressed) {
      return;
    }
    await sleep("10 seconds");
  }
}
