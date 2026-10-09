import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createRedisClient } from "@repo/adapters/database";
import {
  RedisPublicApiSnapshotRepository,
  AshbySourceDocumentRepository,
  PublicHttpRepository,
} from "@repo/adapters/discovery";

const enabled = process.env.PUBLIC_API_CACHE_INTEGRATION === "1";
describe.skipIf(!enabled)(
  "shared public feed cache in an isolated Redis namespace",
  () => {
    let redis: ReturnType<typeof createRedisClient>;
    let cache: RedisPublicApiSnapshotRepository;
    const namespace = `scoutalert:test:public-api:${randomUUID()}`;
    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      redis = createRedisClient(process.env.REDIS_URL!);
      await redis.connect();
      cache = new RedisPublicApiSnapshotRepository(redis, namespace);
    });
    afterAll(async () => {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) {
        await redis.del(...keys);
      }
      redis.disconnect();
    });
    it("coalesces concurrent requests and rejects stale or forged fill completions", async () => {
      const claims = await Promise.all([
        cache.claim("board"),
        cache.claim("board"),
      ]);
      expect(claims.map((value) => value.status).sort()).toEqual([
        "busy",
        "claimed",
      ]);
      const lease = claims.find((value) => value.status === "claimed")!;
      if (lease.status !== "claimed") {
        throw new Error("fixture_missing_lease");
      }
      const snapshot = {
        body: "{}",
        checkedAt: new Date(Date.now() - 30_000).toISOString(),
      };
      expect(await cache.complete("board", "wrong-token", snapshot)).toBe(
        false,
      );
      await cache.fail("board", "wrong-token");
      expect((await cache.claim("board")).status).toBe("busy");
      expect(await cache.complete("board", lease.token, snapshot)).toBe(true);
      expect(await cache.claim("board")).toEqual({ status: "ready", snapshot });
      const keys = await redis.keys(`${namespace}:*:snapshot`);
      const ttls = await Promise.all(keys.map((key) => redis.ttl(key)));
      expect(ttls[0]).toBeLessThanOrEqual(270);
      expect(ttls[0]).toBeGreaterThan(250);
    });
    it("rejects aged observations and permits a fresh holder after a failed fill", async () => {
      const first = await cache.claim("failed-board");
      if (first.status !== "claimed") {
        throw new Error("fixture_missing_lease");
      }
      expect(
        await cache.complete("failed-board", first.token, {
          body: "{}",
          checkedAt: new Date(Date.now() - 301_000).toISOString(),
        }),
      ).toBe(false);
      await cache.fail("failed-board", first.token);
      const second = await cache.claim("failed-board");
      expect(second.status).toBe("claimed");
      expect(
        await cache.complete("failed-board", first.token, {
          body: "{}",
          checkedAt: new Date().toISOString(),
        }),
      ).toBe(false);
    });
    it("reuses one API observation for directory and job reads without caching unlisted jobs or refreshing evidence time", async () => {
      const board = "https://jobs.ashbyhq.com/cache-fixture";
      const url = `${board}/12345678-1234-1234-1234-123456789012`;
      const publicJob = {
        title: "Product designer",
        jobUrl: url,
        isListed: true,
        descriptionPlain:
          "Design products for clients. Remote EU applicants only.",
      };
      const read = vi
        .fn()
        .mockResolvedValue({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            apiVersion: "1",
            jobs: [
              publicJob,
              { ...publicJob, isListed: false, title: "UNLISTED FIXTURE" },
            ],
          }),
        });
      const repository = new AshbySourceDocumentRepository(
        { read } as unknown as PublicHttpRepository,
        cache,
      );
      const directory = await repository.read(board);
      const detail = await repository.read(url);
      const repeat = await repository.read(board);
      expect(directory.links).toHaveLength(1);
      expect(detail.checkedAt).toBe(directory.checkedAt);
      expect(repeat.checkedAt).toBe(directory.checkedAt);
      expect(detail.capture).toMatchObject({
        cacheHit: true,
        requests: 0,
        bytes: 0,
        complete: true,
      });
      expect(read).toHaveBeenCalledTimes(1);
      const snapshot = await cache.claim("ashby-public-v1:cache-fixture");
      expect(snapshot.status).toBe("ready");
      expect(JSON.stringify(snapshot)).not.toContain("UNLISTED FIXTURE");
    });
  },
);
