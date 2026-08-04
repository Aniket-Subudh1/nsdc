import { getEnv, resolveQueueDriverKind } from "@/lib/server/env";
import { createMongoQueueDriver } from "@/lib/server/queue/mongo-driver";
import { createRedisQueueDriver } from "@/lib/server/queue/redis-driver";
import type { QueueDriver } from "@/lib/server/queue/types";

const globalDriver = globalThis as typeof globalThis & {
  __nsdcQueueDriver?: QueueDriver;
};


export function getQueueDriver(): QueueDriver {
  if (!globalDriver.__nsdcQueueDriver) {
    const env = getEnv();
    const kind = resolveQueueDriverKind(env);
    globalDriver.__nsdcQueueDriver = kind === "redis" ? createRedisQueueDriver(env) : createMongoQueueDriver();
  }

  return globalDriver.__nsdcQueueDriver;
}

export async function closeQueueDriver() {
  if (globalDriver.__nsdcQueueDriver) {
    await globalDriver.__nsdcQueueDriver.close();
    globalDriver.__nsdcQueueDriver = undefined;
  }
}

export function resetQueueDriverForTests() {
  globalDriver.__nsdcQueueDriver = undefined;
}

export type { ClaimAndProcess, QueueDriver, QueueWorkerHandle, QueueWorkerOptions } from "@/lib/server/queue/types";
