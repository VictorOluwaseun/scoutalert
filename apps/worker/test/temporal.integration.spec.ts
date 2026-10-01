import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

const enabled = process.env.TEMPORAL_INTEGRATION === "1";
const namespace = `scoutalert-test-${randomUUID()}`;
const workflowsPath = new URL(
  "../../../packages/workflows/dist/scouting/public.js",
  import.meta.url,
).pathname;

describe.skipIf(!enabled)(
  "finite Temporal execution and deployment replay",
  () => {
    let env: TestWorkflowEnvironment;
    beforeAll(async () => {
      const connection = await Connection.connect({
        address: "127.0.0.1:7233",
      });
      try {
        await connection.workflowService.registerNamespace({
          namespace,
          workflowExecutionRetentionPeriod: { seconds: 86400 },
        });
      } finally {
        await connection.close();
      }
      env = await TestWorkflowEnvironment.createFromExistingServer({
        address: "127.0.0.1:7233",
        namespace,
      });
    }, 20_000);
    afterAll(async () => {
      await env?.teardown();
    });

    it("recovers an admitted run after the workflow worker stops, retries activity failure, and replays saved history", async () => {
      const workflowId = `recovery-${randomUUID()}`;
      const workflow = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        workflowsPath,
        taskQueue: "test-workflow",
        shutdownGraceTime: "1 second",
      });
      let attempts = 0;
      const matching = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        taskQueue: "scout-matching-v1",
        activities: {
          scout: async () => {
            attempts++;
            if (attempts === 1) throw new Error("simulated_activity_outage");
            return "done";
          },
          failRun: async () => undefined,
        },
      });
      const input = {
        scoutId: randomUUID(),
        ownerId: randomUUID(),
        version: 1,
        runId: randomUUID(),
      };
      const handle = await env.client.workflow.start("scoutWorkflow", {
        taskQueue: "test-workflow",
        workflowId,
        args: [input],
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      await workflow.runUntil(async () => {
        for (let poll = 0; poll < 20; poll++) {
          const history = await handle.fetchHistory();
          if (
            (history.events ?? []).some(
              (event) => event.activityTaskScheduledEventAttributes,
            )
          )
            return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("activity_not_scheduled");
      });
      const restarted = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        workflowsPath,
        taskQueue: "test-workflow",
      });
      await Promise.all([
        matching.runUntil(handle.result()),
        restarted.runUntil(handle.result()),
      ]);
      expect(attempts).toBe(2);
      await expect(
        env.client.workflow.start("scoutWorkflow", {
          taskQueue: "test-workflow",
          workflowId,
          args: [input],
          workflowIdReusePolicy: "REJECT_DUPLICATE",
        }),
      ).rejects.toBeInstanceOf(WorkflowExecutionAlreadyStartedError);
      const history = await handle.fetchHistory();
      expect(history.events!.length).toBeLessThan(50);
      await Worker.runReplayHistory({ workflowsPath }, history, workflowId);
    }, 30_000);

    it("advances completed intelligence steps without a source-wait timer and replays the patched history", async () => {
      let attempts = 0;
      const workflow = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        workflowsPath,
        taskQueue: "test-intelligence",
      });
      const matching = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        taskQueue: "scout-matching-v1",
        activities: {
          scout: async () => (++attempts < 3 ? "progress" : "done"),
          failRun: async () => undefined,
        },
      });
      const handle = await env.client.workflow.start("scoutWorkflow", {
        taskQueue: "test-intelligence",
        workflowId: `intelligence-${randomUUID()}`,
        args: [
          {
            scoutId: randomUUID(),
            ownerId: randomUUID(),
            version: 1,
            runId: randomUUID(),
          },
        ],
      });
      await Promise.all([
        workflow.runUntil(handle.result()),
        matching.runUntil(handle.result()),
      ]);
      const history = await handle.fetchHistory();
      expect(attempts).toBe(3);
      expect(
        history.events?.some((event) => event.timerStartedEventAttributes),
      ).toBe(false);
      await Worker.runReplayHistory({ workflowsPath }, history);
    }, 20_000);

    it("cancels a waiting run and still executes non-cancellable failure bookkeeping", async () => {
      let attempts = 0;
      let recorded = 0;
      const workflow = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        workflowsPath,
        taskQueue: "test-cancellation",
      });
      const matching = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        taskQueue: "scout-matching-v1",
        activities: {
          scout: async () => {
            attempts++;
            return "waiting";
          },
          failRun: async () => {
            recorded++;
          },
        },
      });
      const handle = await env.client.workflow.start("scoutWorkflow", {
        taskQueue: "test-cancellation",
        workflowId: `cancel-${randomUUID()}`,
        args: [
          {
            scoutId: randomUUID(),
            ownerId: randomUUID(),
            version: 1,
            runId: randomUUID(),
          },
        ],
      });
      const work = (async () => {
        for (let poll = 0; poll < 30 && !attempts; poll++)
          await new Promise((resolve) => setTimeout(resolve, 100));
        expect(attempts).toBe(1);
        await handle.cancel();
        await expect(handle.result()).rejects.toThrow();
      })();
      await Promise.all([workflow.runUntil(work), matching.runUntil(work)]);
      expect(recorded).toBe(1);
    }, 20_000);

    it("measures bounded concurrent execution without claiming production capacity", async () => {
      const workflow = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        workflowsPath,
        taskQueue: "test-throughput",
        maxConcurrentWorkflowTaskExecutions: 8,
      });
      const matching = await Worker.create({
        connection: env.nativeConnection,
        namespace,
        taskQueue: "scout-matching-v1",
        maxConcurrentActivityTaskExecutions: 4,
        activities: {
          scout: async () => "done",
          failRun: async () => undefined,
        },
      });
      const started = performance.now();
      const complete = (async () => {
        const handles = await Promise.all(
          Array.from({ length: 100 }, () =>
            env.client.workflow.start("scoutWorkflow", {
              taskQueue: "test-throughput",
              workflowId: `load-${randomUUID()}`,
              args: [
                {
                  scoutId: randomUUID(),
                  ownerId: randomUUID(),
                  version: 1,
                  runId: randomUUID(),
                },
              ],
            }),
          ),
        );
        await Promise.all(handles.map((handle) => handle.result()));
      })();
      await Promise.all([
        workflow.runUntil(complete),
        matching.runUntil(complete),
      ]);
      const elapsedMs = Math.round(performance.now() - started);
      await writeFile(
        join(tmpdir(), "scoutalert-workflow-benchmark.json"),
        JSON.stringify({ runs: 100, activityConcurrency: 4, elapsedMs }),
      );
      expect(elapsedMs).toBeLessThan(30_000);
    }, 35_000);
  },
);
