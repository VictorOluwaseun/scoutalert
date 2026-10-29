import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  NativeConnection,
  Worker,
  type WorkerOptions,
} from "@temporalio/worker";
import { ScheduleAlreadyRunning } from "@temporalio/client";
import {
  WorkerModule,
  WORKER_RESOURCES,
  type WorkerResources,
} from "./composition/worker.module.js";
import { discoverySourceIds } from "./config.js";

/** Creates stable native schedules; existing schedules retain history and are never blindly replaced on restart. */
async function ensureSchedules(resources: WorkerResources): Promise<void> {
  const definitions = [
    {
      id: "scout-social-discovery-v1",
      workflow: "socialDiscoveryWorkflow",
      args: [],
      interval: "1 minute",
    },
    {
      id: "scout-source-monitoring-v1",
      workflow: "sourceMonitorWorkflow",
      args: [],
      interval: "1 minute",
    },
    ...discoverySourceIds.map((board) => ({
      id: `scout-source-${board}-v1`,
      workflow: "sourceWorkflow",
      args: [board],
      interval: "5 minutes",
    })),
    {
      id: "scout-research-v1",
      workflow: "researchWorkflow",
      args: [],
      interval: "1 minute",
    },
    {
      id: "scout-maintenance-v1",
      workflow: "maintenanceWorkflow",
      args: [],
      interval: "1 minute",
    },
  ];

  if (resources.privateMail) {
    definitions.push({
      id: "scout-private-mail-v1",
      workflow: "privateMailWorkflow",
      args: [],
      interval: "1 minute",
    });
  }

  for (const definition of definitions) {
    try {
      const handle = await resources.temporal.schedule.create({
        scheduleId: definition.id,
        spec: { intervals: [{ every: definition.interval }] },
        action: {
          type: "startWorkflow",
          workflowType: definition.workflow,
          taskQueue: "scout-workflows-v1",
          args: definition.args,
          workflowExecutionTimeout: "10 minutes",
        },
        policies: { overlap: "SKIP", catchupWindow: "1 hour" },
      });
      await handle.trigger();
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) {
        throw error;
      }
    }
  }
}

/** Starts separately bounded source, matching and delivery pools; shutdown releases clients after workers drain. */
async function start(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const resources = app.get<WorkerResources>(WORKER_RESOURCES);
  const native = await NativeConnection.connect({
    address: resources.config.TEMPORAL_ADDRESS,
  });
  const host = resources.activities;
  const workflowPath = import.meta
    .resolve("@repo/workflows/scouting")
    .replace("file://", "");
  const definitions: Pick<
    WorkerOptions,
    | "taskQueue"
    | "workflowsPath"
    | "activities"
    | "maxConcurrentActivityTaskExecutions"
  >[] = [
    {
      taskQueue: "scout-workflows-v1",
      workflowsPath: workflowPath,
      activities: {},
      maxConcurrentActivityTaskExecutions: 1,
    },
    {
      taskQueue: "scout-sources-v1",
      activities: { refreshSource: host.refreshSource.bind(host) },
      maxConcurrentActivityTaskExecutions: 2,
    },
    {
      taskQueue: "scout-web-discovery-v1",
      activities: {
        discoverWeb: host.discoverWeb.bind(host),
        reviewDiscoveryLeads: host.reviewDiscoveryLeads.bind(host),
      },
      maxConcurrentActivityTaskExecutions:
        resources.config.SCOUT_WEB_CONCURRENCY,
    },
    {
      taskQueue: "scout-source-monitoring-v1",
      activities: { monitorSources: host.monitorSources.bind(host) },
      maxConcurrentActivityTaskExecutions: 2,
    },
    {
      taskQueue: "scout-social-discovery-v1",
      activities: { discoverSocial: host.discoverSocial.bind(host) },
      maxConcurrentActivityTaskExecutions: 1,
    },
    {
      taskQueue: "scout-matching-v1",
      activities: {
        scout: host.scout.bind(host),
        failRun: host.failRun.bind(host),
        reconcile: host.reconcile.bind(host),
      },
      maxConcurrentActivityTaskExecutions: 4,
    },
    {
      taskQueue: "scout-research-v1",
      activities: {
        researchAvailability: host.researchAvailability.bind(host),
      },
      maxConcurrentActivityTaskExecutions: 2,
    },
    {
      taskQueue: "scout-delivery-v1",
      activities: { deliverDigests: host.deliverDigests.bind(host) },
      maxConcurrentActivityTaskExecutions: 1,
    },
  ];
  definitions.push({
    taskQueue: "scout-private-mail-v1",
    activities: {
      importPrivateMail: async () => resources.privateMail?.execute() ?? false,
    },
    maxConcurrentActivityTaskExecutions: 2,
  });
  const workers = await Promise.all(
    definitions.map((definition) =>
      Worker.create({
        ...definition,
        connection: native,
        namespace: resources.config.TEMPORAL_NAMESPACE,
        shutdownGraceTime: "20 seconds",
      }),
    ),
  );
  let stopping = false;

  const stop = () => {
    stopping = true;
    workers.forEach((worker) => worker.shutdown());
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const polling = (async () => {
    while (!stopping) {
      try {
        await resources.relay.dispatch();
      } catch {
        console.error(
          "Discovery dispatch unavailable; committed requests will retry.",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  })();

  try {
    await ensureSchedules(resources);
    const running = Promise.all(workers.map((worker) => worker.run()));

    if (workers.every((worker) => worker.getState() === "RUNNING")) {
      Logger.log(
        `Mailpit inbox: ${resources.config.MAILPIT_HTTP_URL}`,
        "ScoutWorker",
      );
    }

    await running;
  } finally {
    stopping = true;
    await polling;
    await native.close();
    await resources.connection.close();
    resources.smtp.close();
    resources.redis?.disconnect();
    await resources.db.destroy();
    await app.close();
  }
}

await start();
