import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";

import { type AppEnv, resolveRedisKeyPrefix } from "@/lib/server/env";
import { getSharedRedisConnection } from "@/lib/server/queue/redis-client";
import type { ClaimAndProcess, QueueDriver, QueueWorkerHandle, QueueWorkerOptions } from "@/lib/server/queue/types";

const TRIGGER_JOB_NAME = "trigger";
const HEARTBEAT_JOB_NAME = "heartbeat";

function toClusterQueueName(queueName: string): string {
  if (queueName.includes("{") && queueName.includes("}")) {
    return queueName;
  }

  return `{${queueName}}`;
}

export function createRedisQueueDriver(env: AppEnv): QueueDriver {
  const connection = getSharedRedisConnection(env);
  const prefix = `${resolveRedisKeyPrefix(env)}bullmq`;
  const queues = new Map<string, Queue>();
  const workers: Worker[] = [];

  function getQueue(queueName: string): Queue {
    let queue = queues.get(queueName);

    if (!queue) {
      queue = new Queue(toClusterQueueName(queueName), { connection: connection as unknown as Redis, prefix });
      queues.set(queueName, queue);
    }

    return queue;
  }

  return {
    kind: "redis",

    async notify(queueName: string) {
      const queue = getQueue(queueName);

      try {
        await queue.add(TRIGGER_JOB_NAME, {}, { removeOnComplete: true, removeOnFail: { count: 50 } });
      } catch (error) {
        console.error(`[queue:redis:${queueName}] notify failed`, error);
      }
    },

    runWorker(queueName: string, claimAndProcess: ClaimAndProcess, options: QueueWorkerOptions): QueueWorkerHandle {
      const queue = getQueue(queueName);
      const concurrency = Math.max(1, options.concurrency);
      const pollIntervalMs = Math.max(1_000, options.pollIntervalMs);
      const clusterQueueName = toClusterQueueName(queueName);

      queue
        .upsertJobScheduler(
          `${queueName}-heartbeat`,
          { every: pollIntervalMs },
          { name: HEARTBEAT_JOB_NAME, data: {}, opts: { removeOnComplete: true, removeOnFail: { count: 10 } } },
        )
        .catch((error) => {
          console.error(`[queue:redis:${queueName}] failed to schedule heartbeat`, error);
        });

      const worker = new Worker(
        clusterQueueName,
        async () => {
          const didWork = await claimAndProcess();

          if (didWork) {
            await queue.add(TRIGGER_JOB_NAME, {}, { removeOnComplete: true, removeOnFail: { count: 50 } });
          }
        },
        {
          concurrency,
          connection: connection as unknown as Redis,
          prefix,
        },
      );

      worker.on("error", (error) => {
        console.error(`[queue:redis:${queueName}] worker error`, error);
      });

      workers.push(worker);

      return {
        async close() {
          await worker.close();
        },
      };
    },

    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(Array.from(queues.values()).map((queue) => queue.close()));
      queues.clear();
      workers.length = 0;
    },
  };
}
