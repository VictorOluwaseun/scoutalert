import { Redis } from "ioredis";

/** Creates a bounded Redis connection for temporary identity limits, without logging private keys. */
export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  client.on("error", () => {
    console.error("ScoutAlert Redis connection failed.");
  });

  return client;
}
