import { IdentityRateLimits } from "@repo/core/identity";
import type { Redis } from "ioredis";

// Check every bucket first; reserve them together and set expiry only on the first increment.
const reserveScript = `
local retry = 0
for i, key in ipairs(KEYS) do
  local maximum = tonumber(ARGV[(i-1)*2+1])
  if tonumber(redis.call('GET', key) or '0') >= maximum then
    retry = math.max(retry, redis.call('TTL', key), 1)
  end
end
if retry > 0 then return retry end
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('EXPIRE', key, tonumber(ARGV[(i-1)*2+2])) end
end
return 0`;

/** Redis-backed atomic fixed-window abuse limits with bounded TTL and a ScoutAlert namespace. */
export class RedisIdentityRateLimits extends IdentityRateLimits {
  /** Receives a composed client and an isolated namespace; all keys contain only opaque digests. */
  constructor(
    private readonly client: Redis,
    private readonly namespace = "scoutalert:identity",
  ) {
    super();
  }
  /** Reserves all buckets atomically; Redis failure fails closed instead of bypassing protection. */
  async reserve(
    limits: readonly { key: string; maximum: number; windowSeconds: number }[],
  ): Promise<number | null> {
    const keys = limits.map(
      (limit) => `${this.namespace}:{limits}:${limit.key}`,
    );
    const args = limits.flatMap((limit) => [
      limit.maximum,
      limit.windowSeconds,
    ]);
    const retry = Number(
      await this.client.eval(reserveScript, keys.length, ...keys, ...args),
    );
    return retry > 0 ? retry : null;
  }
}
