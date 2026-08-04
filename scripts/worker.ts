import { loadEnvConfig } from "@next/env";

import { getEnv, resolveQueueDriverKind } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { UserModel } from "@/lib/server/models/user";
import { closeQueueDriver, getQueueDriver } from "@/lib/server/queue";
import { startSyncReconciler } from "@/lib/server/queue/reconciler";
import { getSidhRuntime, resetSidhRuntimeForTests } from "@/lib/server/queue/sidh-runtime";
import { getPermissionsForRoles } from "@/lib/server/rbac";
import {
  processQueuedBatchSyncJobs,
  processQueuedEnrollmentSyncJobs,
  startBatchSyncWorker,
  startEnrollmentSyncWorker,
} from "@/lib/server/services/batches";
import {
  processQueuedSyncJobs,
  startCandidateSyncWorker,
} from "@/lib/server/services/candidate-sync-worker";
import { serializeUser } from "@/lib/server/services/session";

loadEnvConfig(process.cwd());

type WorkerCliOptions = {
  once: boolean;
  limit: number;
};

function clampInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function parseOptions(): WorkerCliOptions {
  const args = process.argv.slice(2);
  let once = false;
  let limit = 25;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument) {
      continue;
    }

    if (argument === "--once") {
      once = true;
      continue;
    }

    if (argument === "--limit") {
      limit = clampInteger(args[index + 1], limit, 5_000);
      index += 1;
      continue;
    }

    if (argument.startsWith("--limit=")) {
      limit = clampInteger(argument.split("=")[1], limit, 5_000);
    }
  }

  return { limit, once };
}

async function resolveWorkerActor() {
  const env = getEnv();
  await connectToDatabase();

  const preferredUser = await UserModel.findOne({
    email: env.SEED_ADMIN_EMAIL.trim().toLowerCase(),
    status: "active",
  });
  const workerUser = preferredUser ?? (await UserModel.findOne({ roles: "platform_admin", status: "active" }));

  if (!workerUser) {
    throw new Error("No active platform admin is available to run the sync worker");
  }

  return {
    permissions: getPermissionsForRoles(workerUser.roles),
    sessionId: `worker_${Date.now()}`,
    user: serializeUser(workerUser),
  };
}

async function runOnce(actor: Awaited<ReturnType<typeof resolveWorkerActor>>, limit: number) {
  const env = getEnv();
  const runtime = getSidhRuntime();
  const deps = {
    circuitBreaker: runtime.circuitBreaker,
    concurrency: env.SIDH_PUSH_CONCURRENCY,
    connector: runtime.connector,
    rateLimiter: runtime.rateLimiter,
  };

  const [candidate, batch, enrollment] = await Promise.all([
    processQueuedSyncJobs(actor, { limit, requestId: `worker-once-candidate-${Date.now()}` }, deps),
    processQueuedBatchSyncJobs(actor, { limit, requestId: `worker-once-batch-${Date.now()}` }, deps),
    processQueuedEnrollmentSyncJobs(actor, { limit, requestId: `worker-once-enrollment-${Date.now()}` }, deps),
  ]);

  return { batch, candidate, enrollment };
}

async function main() {
  const options = parseOptions();
  const env = getEnv();
  const actor = await resolveWorkerActor();
  // Warm the runtime so the first claim does not pay cold-start auth latency.
  getSidhRuntime();
  const driver = getQueueDriver();

  if (options.once) {
    const result = await runOnce(actor, options.limit);
    console.log(JSON.stringify(result, null, 2));
    await closeQueueDriver();
    resetSidhRuntimeForTests();
    return;
  }

  const handles = [
    startCandidateSyncWorker(actor, { requestIdPrefix: "worker-candidate" }),
    startBatchSyncWorker(actor, { concurrency: Math.max(1, Math.floor(env.SIDH_PUSH_CONCURRENCY / 2)), requestIdPrefix: "worker-batch" }),
    startEnrollmentSyncWorker(actor, { concurrency: Math.max(1, Math.floor(env.SIDH_PUSH_CONCURRENCY / 2)), requestIdPrefix: "worker-enrollment" }),
  ];
  const reconciler = startSyncReconciler({ intervalMs: 60_000 });

  console.log(
    JSON.stringify(
      {
        concurrency: env.SIDH_PUSH_CONCURRENCY,
        driver: resolveQueueDriverKind(env),
        mode: "always-on",
        queues: ["candidate-sync", "batch-sync", "enrollment-sync"],
        rateLimitPerSec: env.SIDH_RATE_LIMIT_PER_SEC,
        reconcilerIntervalMs: 60_000,
      },
      null,
      2,
    ),
  );

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(JSON.stringify({ event: "worker.shutdown", signal, at: new Date().toISOString() }));

    await Promise.allSettled([
      ...handles.map((handle) => handle.close()),
      reconciler.close(),
      driver.close(),
      closeQueueDriver(),
    ]);

    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
