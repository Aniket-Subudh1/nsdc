import { getEnv } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { UserModel } from "@/lib/server/models/user";
import { getPermissionsForRoles } from "@/lib/server/rbac";
import { processQueuedSyncJobs } from "@/lib/server/services/candidate-sync-worker";
import { serializeUser } from "@/lib/server/services/session";

function parseLimit() {
  const rawLimit = process.argv[2];

  if (!rawLimit) {
    return 5;
  }

  const limit = Number(rawLimit);
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 25) : 5;
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

async function main() {
  const actor = await resolveWorkerActor();
  const result = await processQueuedSyncJobs(actor, {
    limit: parseLimit(),
    requestId: `worker-${Date.now()}`,
  });

  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});