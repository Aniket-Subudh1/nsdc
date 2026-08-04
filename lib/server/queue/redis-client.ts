import IORedis, { type Redis, type RedisOptions } from "ioredis";

import { type AppEnv, resolveRedisTlsEnabled } from "@/lib/server/env";

const globalRedis = globalThis as typeof globalThis & {
  __nsdcRedisConnection?: Redis;
};

function buildRedisOptions(env: AppEnv): RedisOptions {
  return {
    // Required by BullMQ for both Queue and Worker connections.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...(resolveRedisTlsEnabled(env) ? { tls: {} } : {}),
    retryStrategy(attempt: number) {
      return Math.min(attempt * 200, 5_000);
    },
  };
}

/**
 * Returns one shared ioredis connection for the whole process. BullMQ Queues and Workers
 * can all safely reuse it (Workers internally duplicate blocking connections as needed).
 * Reusing a single connection keeps ElastiCache Serverless connection counts, and
 * therefore cost, minimal even with many concurrent workers.
 */
export function getSharedRedisConnection(env: AppEnv): Redis {
  if (!globalRedis.__nsdcRedisConnection) {
    const connection = new IORedis(env.REDIS_URL, buildRedisOptions(env));

    connection.on("error", (error) => {
      console.error("[redis] connection error", error);
    });

    globalRedis.__nsdcRedisConnection = connection;
  }

  return globalRedis.__nsdcRedisConnection;
}

export async function closeSharedRedisConnection() {
  const connection = globalRedis.__nsdcRedisConnection;

  if (!connection) {
    return;
  }

  globalRedis.__nsdcRedisConnection = undefined;

  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}
