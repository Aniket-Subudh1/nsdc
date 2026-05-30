import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";

import { getEnv } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { UserModel } from "@/lib/server/models/user";
import { getPermissionsForRoles } from "@/lib/server/rbac";
import { processQueuedBatchSyncJobs, processQueuedEnrollmentSyncJobs } from "@/lib/server/services/batches";
import { serializeUser } from "@/lib/server/services/session";

loadEnvConfig(process.cwd());

type WorkerCliOptions = {
  limit: number;
  once: boolean;
  pollIntervalMs: number;
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
  let limit = 5;
  let once = false;
  let pollIntervalMs = 5000;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument) {
      continue;
    }

    if (/^\d+$/.test(argument)) {
      limit = clampInteger(argument, limit, 25);
      continue;
    }

    if (argument === "--once") {
      once = true;
      continue;
    }

    if (argument === "--limit") {
      limit = clampInteger(args[index + 1], limit, 25);
      index += 1;
      continue;
    }

    if (argument.startsWith("--limit=")) {
      limit = clampInteger(argument.split("=")[1], limit, 25);
      continue;
    }

    if (argument === "--poll-interval-ms") {
      pollIntervalMs = clampInteger(args[index + 1], pollIntervalMs, 60000);
      index += 1;
      continue;
    }

    if (argument.startsWith("--poll-interval-ms=")) {
      pollIntervalMs = clampInteger(argument.split("=")[1], pollIntervalMs, 60000);
    }
  }

  return {
    limit,
    once,
    pollIntervalMs,
  };
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
    throw new Error("No active platform admin is available to run the batch sync worker");
  }

  return {
    permissions: getPermissionsForRoles(workerUser.roles),
    sessionId: `worker_${Date.now()}`,
    user: serializeUser(workerUser),
  };
}

async function runIteration(actor: Awaited<ReturnType<typeof resolveWorkerActor>>, requestIdPrefix: string, limit: number) {
  const [batchResult, enrollmentResult] = await Promise.all([
    processQueuedBatchSyncJobs(actor, {
      limit,
      requestId: `${requestIdPrefix}-batch`,
    }),
    processQueuedEnrollmentSyncJobs(actor, {
      limit,
      requestId: `${requestIdPrefix}-enrollment`,
    }),
  ]);

  return {
    batchResult,
    enrollmentResult,
    processedCount: batchResult.processedCount + enrollmentResult.processedCount,
  };
}

async function main() {
  const options = parseOptions();
  const actor = await resolveWorkerActor();
  const requestIdPrefix = `batch-worker-${Date.now()}`;

  if (options.once) {
    const result = await runIteration(actor, `${requestIdPrefix}-once`, options.limit);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  let keepRunning = true;

  const stopWorker = () => {
    keepRunning = false;
  };

  process.on("SIGINT", stopWorker);
  process.on("SIGTERM", stopWorker);

  console.log(
    JSON.stringify(
      {
        limit: options.limit,
        mode: "polling",
        pollIntervalMs: options.pollIntervalMs,
        workers: ["batchSync", "enrollmentSync"],
      },
      null,
      2,
    ),
  );

  while (keepRunning) {
    const result = await runIteration(actor, `${requestIdPrefix}-${Date.now()}`, options.limit);

    if (result.processedCount > 0) {
      console.log(
        JSON.stringify(
          {
            ...result,
            polledAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    }

    if (!keepRunning) {
      break;
    }

    await delay(options.pollIntervalMs);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});