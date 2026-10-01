import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NativeConnection, Worker } from "@temporalio/worker";
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
  const definitions = [
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
    await Promise.all(workers.map((worker) => worker.run()));
  } finally {
    stopping = true;
    await polling;
    await native.close();
    await resources.connection.close();
    resources.smtp.close();
    await resources.db.destroy();
    await app.close();
  }
}

await start();
