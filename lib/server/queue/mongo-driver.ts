import { setTimeout as delay } from "node:timers/promises";

import type { ClaimAndProcess, QueueDriver, QueueWorkerHandle, QueueWorkerOptions } from "@/lib/server/queue/types";

export function createMongoQueueDriver(): QueueDriver {
  return {
    kind: "mongo",

    async notify() {
    },

    runWorker(queueName: string, claimAndProcess: ClaimAndProcess, options: QueueWorkerOptions): QueueWorkerHandle {
      let running = true;
      const concurrency = Math.max(1, options.concurrency);
      const pollIntervalMs = Math.max(100, options.pollIntervalMs);

      const runLoop = async () => {
        while (running) {
          let didWork = false;

          try {
            didWork = await claimAndProcess();
          } catch (error) {
            console.error(`[queue:mongo:${queueName}] worker iteration failed`, error);
          }

          if (!running) {
            break;
          }

          if (!didWork) {
            await delay(pollIntervalMs);
          }
        }
      };

      const loops = Array.from({ length: concurrency }, () => runLoop());

      return {
        async close() {
          running = false;
          await Promise.all(loops);
        },
      };
    },

    async close() {

    },
  };
}
