import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import {
  PublicApiSnapshotRepository,
  type PublicApiSnapshot,
  type PublicApiSnapshotClaim,
} from "@repo/core/discovery";
import { discoveryKey } from "../persistence/discovery-identities.js";

const claimScript = `
local cached = redis.call('GET', KEYS[1])
if cached then return {'ready', cached} end
if redis.call('SET', KEYS[2], ARGV[1], 'EX', 30, 'NX') then return {'claimed', ARGV[1]} end
return {'busy', ''}`;
const completeScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('DEL', KEYS[2])
return 1`;
const failScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end return 1`;

/** Redis provides short-lived public feed reuse and single-flight fills; accepted evidence and budgets remain durable elsewhere. */
export class RedisPublicApiSnapshotRepository extends PublicApiSnapshotRepository {
  /** Receives a composed client; a namespace allows disposable integration checks without touching active caches. */
  constructor(
    private readonly redis: Redis,
    private readonly namespace = "scoutalert:public-api:v1",
  ) {
    super();
  }

  /** Atomically coalesces readers; keys share a cluster hash slot and a failed cache read never triggers an uncontrolled fill. */
  async claim(key: string): Promise<PublicApiSnapshotClaim> {
    const keys = this.keys(key);
    const result = (await this.redis.eval(
      claimScript,
      2,
      ...keys,
      randomUUID(),
    )) as [string, string];
    if (result[0] === "claimed") {
      return { status: "claimed", token: result[1] };
    }
    if (result[0] !== "ready") {
      return { status: "busy" };
    }
    const snapshot = JSON.parse(result[1]) as PublicApiSnapshot;
    const age = Date.now() - Date.parse(snapshot.checkedAt);
    if (
      typeof snapshot.body !== "string" ||
      !Number.isFinite(age) ||
      age < -1000 ||
      age >= 300_000
    ) {
      await this.redis.del(keys[0]!);
      return { status: "busy" };
    }
    return { status: "ready", snapshot };
  }

  /** Fences stale holders and expires content based on observation age, including time already spent processing the feed. */
  async complete(
    key: string,
    token: string,
    snapshot: PublicApiSnapshot,
  ): Promise<boolean> {
    const age = Date.now() - Date.parse(snapshot.checkedAt);
    if (
      !Number.isFinite(age) ||
      age < -1000 ||
      age >= 300_000 ||
      Buffer.byteLength(snapshot.body) > 6_000_000
    ) {
      return false;
    }
    const ttl = Math.max(1, Math.floor((300_000 - age) / 1000));
    return (
      Number(
        await this.redis.eval(
          completeScript,
          2,
          ...this.keys(key),
          token,
          JSON.stringify(snapshot),
          ttl,
        ),
      ) === 1
    );
  }

  /** Compare-and-delete prevents a late failure from releasing a replacement worker's lease. */
  async fail(key: string, token: string): Promise<void> {
    await this.redis.eval(failScript, 1, this.keys(key)[1]!, token);
  }

  /** Opaque provider-scoped identities avoid coupling public cache keys to accounts or private scout briefs. */
  private keys(key: string): [string, string] {
    const prefix = `${this.namespace}:{${discoveryKey(key)}}`;
    return [`${prefix}:snapshot`, `${prefix}:lease`];
  }
}
