import { getEnv, resolveQueueDriverKind } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchSyncStateModel } from "@/lib/server/models/batch-sync-state";
import { SyncEventModel } from "@/lib/server/models/sync-event";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { getSidhRuntime } from "@/lib/server/queue/sidh-runtime";
import { canManageSync } from "@/lib/server/rbac";
import { type AuthSession } from "@/lib/server/services/session";
import { writeSyncEvent } from "@/lib/server/services/sync-events";
import { notifyCandidateSyncQueue } from "@/lib/server/services/candidate-sync-worker";

function ensureCanManageSync(actor: AuthSession) {
  if (!canManageSync(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to sync health");
  }
}

export async function getSyncHealth(actor: AuthSession) {
  await connectToDatabase();
  ensureCanManageSync(actor);

  const env = getEnv();
  const runtime = getSidhRuntime();
  const oneMinuteAgo = new Date(Date.now() - 60_000);

  const [
    candidateQueued,
    candidateProcessing,
    candidateDeadLetter,
    candidateManualReview,
    batchQueued,
    batchProcessing,
    enrollmentQueued,
    enrollmentProcessing,
    succeededLastMinute,
    failedLastMinute,
  ] = await Promise.all([
    SyncJobModel.countDocuments({ entityType: "candidate", status: "queued" }),
    SyncJobModel.countDocuments({ entityType: "candidate", status: "processing" }),
    SyncJobModel.countDocuments({ entityType: "candidate", status: "dead_letter" }),
    SyncJobModel.countDocuments({ entityType: "candidate", status: "manual_review" }),
    BatchSyncStateModel.countDocuments({ "batchSync.status": "queued" }),
    BatchSyncStateModel.countDocuments({ "batchSync.status": "processing" }),
    BatchSyncStateModel.countDocuments({ "enrollmentSync.status": "queued" }),
    BatchSyncStateModel.countDocuments({ "enrollmentSync.status": "processing" }),
    SyncEventModel.countDocuments({ createdAt: { $gte: oneMinuteAgo }, eventType: "succeeded" }),
    SyncEventModel.countDocuments({
      createdAt: { $gte: oneMinuteAgo },
      eventType: { $in: ["attempt_failed", "dead_lettered"] },
    }),
  ]);

  const circuitOpen = await runtime.circuitBreaker.isOpen();
  const recentTotal = succeededLastMinute + failedLastMinute;
  const errorRate = recentTotal === 0 ? 0 : failedLastMinute / recentTotal;

  return {
    circuitOpen,
    concurrency: env.SIDH_PUSH_CONCURRENCY,
    driver: resolveQueueDriverKind(env),
    errorRateLastMinute: Number(errorRate.toFixed(4)),
    inFlight: {
      batch: batchProcessing,
      candidate: candidateProcessing,
      enrollment: enrollmentProcessing,
      total: candidateProcessing + batchProcessing + enrollmentProcessing,
    },
    queueDepth: {
      batch: batchQueued,
      candidate: candidateQueued,
      enrollment: enrollmentQueued,
      total: candidateQueued + batchQueued + enrollmentQueued,
    },
    rateLimitPerSec: env.SIDH_RATE_LIMIT_PER_SEC,
    terminal: {
      deadLetter: candidateDeadLetter,
      manualReview: candidateManualReview,
    },
    throughputPerMinute: {
      failed: failedLastMinute,
      succeeded: succeededLastMinute,
    },
  };
}

export async function replayDeadLetterSyncJobs(
  actor: AuthSession,
  input: { limit?: number; syncJobIds?: string[] },
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanManageSync(actor);

  const limit = Math.max(1, Math.min(input.limit ?? 100, 5_000));
  const filter =
    input.syncJobIds && input.syncJobIds.length > 0
      ? { syncJobId: { $in: input.syncJobIds }, status: { $in: ["dead_letter", "manual_review", "failed"] } }
      : { entityType: "candidate", status: "dead_letter" };

  const jobs = await SyncJobModel.find(filter).sort({ updatedAt: -1 }).limit(limit);
  const replayed: string[] = [];

  for (const job of jobs) {
    job.lockId = null;
    job.lockedAt = null;
    job.nextRunAt = new Date();
    job.retryCount = 0;
    job.status = "queued";
    await job.save();

    await writeSyncEvent({
      entityId: job.candidateId,
      entityType: "candidate",
      eventType: "replayed",
      requestId,
      syncJobId: job.syncJobId,
    });

    replayed.push(job.syncJobId);
  }

  if (replayed.length > 0) {
    await notifyCandidateSyncQueue();
  }

  return {
    replayedCount: replayed.length,
    syncJobIds: replayed,
  };
}
