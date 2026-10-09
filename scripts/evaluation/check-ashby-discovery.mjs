import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createRedisClient } from "../../packages/adapters/dist/database/public.js";
import {
  AshbySourceDocumentRepository,
  PublicHttpRepository,
  RedisPublicApiSnapshotRepository,
} from "../../packages/adapters/dist/discovery/public.js";

loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
const redis = createRedisClient(process.env.REDIS_URL);
await redis.connect();
const namespace = `scoutalert:diagnostic:ashby:${randomUUID()}`;
const start = performance.now();
try {
  const repository = new AshbySourceDocumentRepository(
    new PublicHttpRepository(),
    new RedisPublicApiSnapshotRepository(redis, namespace),
  );
  const board = await repository.read("https://jobs.ashbyhq.com/ashby");
  const url = board.links?.[0]?.url;
  const detail = url ? await repository.read(url) : null;
  const repeated = await repository.read(board.url);
  const report = {
    kind: "live-public-ashby-and-cache-smoke",
    recordedAt: new Date().toISOString(),
    board: {
      url: board.url,
      checkedAt: board.checkedAt,
      status: board.status,
      reason: board.reason,
      listedJobs: board.links?.length ?? 0,
      capture: board.capture,
      provenance: board.publicApi,
    },
    detail: detail
      ? {
          url: detail.url,
          checkedAt: detail.checkedAt,
          status: detail.status,
          reason: detail.reason,
          characters: detail.text?.length ?? 0,
          capture: detail.capture,
          sameObservation: detail.checkedAt === board.checkedAt,
          sourceTitle: board.links[0].text,
        }
      : null,
    repeated: {
      checkedAt: repeated.checkedAt,
      capture: repeated.capture,
      sameObservation: repeated.checkedAt === board.checkedAt,
    },
    totalProviderRequests:
      (board.capture?.requests ?? 0) +
      (detail?.capture?.requests ?? 0) +
      (repeated.capture?.requests ?? 0),
    milliseconds: Math.round(performance.now() - start),
    limits: {
      maximumResponseBytes: 6000000,
      cacheSeconds: 300,
      timeoutMilliseconds: 15000,
    },
    limitations:
      "One observed employer board and one detail, no search-provider discovery, AI assessment, private match, application or email. No independent relevance or coverage score.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--write")) {
    await writeFile(
      new URL(
        "../../evaluations/discovery/ashby-public-access-2026-10-04.json",
        import.meta.url,
      ),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  if (
    board.truncated ||
    !detail?.text ||
    detail.truncated ||
    report.totalProviderRequests !== 1 ||
    !report.repeated.sameObservation
  ) {
    process.exitCode = 1;
  }
} finally {
  const keys = await redis.keys(`${namespace}:*`);
  if (keys.length) {
    await redis.del(...keys);
  }
  redis.disconnect();
}
