import { getEnv } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchSyncStateModel } from "@/lib/server/models/batch-sync-state";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { notifyBatchSyncQueue, notifyEnrollmentSyncQueue } from "@/lib/server/services/batches";
import { notifyCandidateSyncQueue } from "@/lib/server/services/candidate-sync-worker";
import { writeSyncEvent } from "@/lib/server/services/sync-events";
import { extractRemoteBatchId, extractRemoteCandidateId } from "@/lib/server/services/sidh-connector";

export type ReconcileResult = {
  backstopNotified: {
    batch: number;
    candidate: number;
    enrollment: number;
  };
  leasesReleased: {
    batch: number;
    candidate: number;
    enrollment: number;
  };
  outcomesRecovered: {
    batch: number;
    candidate: number;
  };
};

const BACKSTOP_LIMIT = 500;

async function recoverCandidateOutcomesFromTransactions(now: Date) {
  const stuckJobs = await SyncJobModel.find({
    entityType: "candidate",
    lockedAt: { $lte: new Date(now.getTime() - getEnv().SIDH_LEASE_TTL_MS) },
    status: "processing",
  })
    .sort({ lockedAt: 1 })
    .limit(100);

  let recovered = 0;

  for (const job of stuckJobs) {
    const successTxn = await SidhApiTransactionModel.findOne({
      operation: "candidate.register",
      success: true,
      syncJobId: job.syncJobId,
    }).sort({ createdAt: -1 });

    if (!successTxn) {
      continue;
    }

    const remoteCandidateId = extractRemoteCandidateId(successTxn.responsePayload);
    if (!remoteCandidateId) {
      continue;
    }

    job.latestRemoteCandidateId = remoteCandidateId;
    job.lockId = null;
    job.lockedAt = null;
    job.set("nextRunAt", null);
    job.status = "succeeded";
    await job.save();

    await writeSyncEvent({
      entityId: job.candidateId,
      entityType: "candidate",
      eventType: "succeeded",
      metadata: { recoveredFrom: "sidh_api_transaction", remoteCandidateId, transactionId: successTxn.transactionId },
      syncJobId: job.syncJobId,
    });

    recovered += 1;
  }

  return recovered;
}

async function recoverBatchOutcomesFromTransactions(now: Date) {
  const leaseCutoff = new Date(now.getTime() - getEnv().SIDH_LEASE_TTL_MS);
  const stuckStates = await BatchSyncStateModel.find({
    "batchSync.lockedAt": { $lte: leaseCutoff },
    "batchSync.status": "processing",
  })
    .sort({ "batchSync.lockedAt": 1 })
    .limit(100);

  let recovered = 0;

  for (const state of stuckStates) {
    const syncJobId = state.batchSync?.lastJobId ?? state.batchSyncStateId;
    const successTxn = await SidhApiTransactionModel.findOne({
      operation: "batch.create",
      success: true,
      syncJobId,
    }).sort({ createdAt: -1 });

    if (!successTxn) {
      continue;
    }

    const remoteBatchId = extractRemoteBatchId(successTxn.responsePayload);
    if (!remoteBatchId) {
      continue;
    }

    state.sidhBatchId = remoteBatchId;
    state.batchSync = {
      ...(state.batchSync ?? {}),
      lastFailureCode: null,
      lastFailureMessage: null,
      lastSuccessAt: now,
      lockId: null,
      lockedAt: null,
      nextRunAt: null,
      remoteStatus: "active",
      status: "synced",
    };
    await state.save();

    await writeSyncEvent({
      entityId: state.batchId,
      entityType: "batch",
      eventType: "succeeded",
      metadata: { recoveredFrom: "sidh_api_transaction", remoteBatchId, transactionId: successTxn.transactionId },
      syncJobId,
    });

    recovered += 1;
  }

  return recovered;
}

async function releaseExpiredCandidateLeases(now: Date) {
  const leaseCutoff = new Date(now.getTime() - getEnv().SIDH_LEASE_TTL_MS);
  const result = await SyncJobModel.updateMany(
    {
      entityType: "candidate",
      lockedAt: { $lte: leaseCutoff },
      status: "processing",
    },
    {
      $set: {
        lockId: null,
        lockedAt: null,
        nextRunAt: now,
        status: "queued",
      },
    },
  );

  if (result.modifiedCount > 0) {
    await notifyCandidateSyncQueue();
  }

  return result.modifiedCount;
}

async function releaseExpiredBatchLeases(now: Date, key: "batchSync" | "enrollmentSync") {
  const leaseCutoff = new Date(now.getTime() - getEnv().SIDH_LEASE_TTL_MS);
  const result = await BatchSyncStateModel.updateMany(
    {
      [`${key}.lockedAt`]: { $lte: leaseCutoff },
      [`${key}.status`]: "processing",
    },
    {
      $set: {
        [`${key}.lockId`]: null,
        [`${key}.lockedAt`]: null,
        [`${key}.nextRunAt`]: now,
        [`${key}.status`]: "queued",
      },
    },
  );

  if (result.modifiedCount > 0) {
    if (key === "batchSync") {
      await notifyBatchSyncQueue();
    } else {
      await notifyEnrollmentSyncQueue();
    }
  }

  return result.modifiedCount;
}

async function notifyCandidateBackstop(now: Date) {
  const readyCount = await SyncJobModel.countDocuments({
    entityType: "candidate",
    nextRunAt: { $lte: now },
    status: "queued",
  });

  if (readyCount > 0) {
    await notifyCandidateSyncQueue();
  }

  return Math.min(readyCount, BACKSTOP_LIMIT);
}

async function notifyBatchBackstop(now: Date, key: "batchSync" | "enrollmentSync") {
  const readyCount = await BatchSyncStateModel.countDocuments({
    [`${key}.nextRunAt`]: { $lte: now },
    [`${key}.status`]: "queued",
  });

  if (readyCount > 0) {
    if (key === "batchSync") {
      await notifyBatchSyncQueue();
    } else {
      await notifyEnrollmentSyncQueue();
    }
  }

  return Math.min(readyCount, BACKSTOP_LIMIT);
}

/**
 * Periodic reconciler that keeps Mongo as the source of truth:
 * 1. Recover remote IDs from SidhApiTransaction when a worker crashed after SIDH succeeded
 * 2. Release expired processing leases back to queued
 * 3. Notify queue drivers about any ready queued work (covers Redis flush / missed notifies)
 */
export async function runSyncReconciler(now = new Date()): Promise<ReconcileResult> {
  await connectToDatabase();

  const [candidateOutcomes, batchOutcomes] = await Promise.all([
    recoverCandidateOutcomesFromTransactions(now),
    recoverBatchOutcomesFromTransactions(now),
  ]);

  const [candidateLeases, batchLeases, enrollmentLeases] = await Promise.all([
    releaseExpiredCandidateLeases(now),
    releaseExpiredBatchLeases(now, "batchSync"),
    releaseExpiredBatchLeases(now, "enrollmentSync"),
  ]);

  const [candidateBackstop, batchBackstop, enrollmentBackstop] = await Promise.all([
    notifyCandidateBackstop(now),
    notifyBatchBackstop(now, "batchSync"),
    notifyBatchBackstop(now, "enrollmentSync"),
  ]);

  return {
    backstopNotified: {
      batch: batchBackstop,
      candidate: candidateBackstop,
      enrollment: enrollmentBackstop,
    },
    leasesReleased: {
      batch: batchLeases,
      candidate: candidateLeases,
      enrollment: enrollmentLeases,
    },
    outcomesRecovered: {
      batch: batchOutcomes,
      candidate: candidateOutcomes,
    },
  };
}

export function startSyncReconciler(options: { intervalMs?: number } = {}) {
  const intervalMs = Math.max(15_000, options.intervalMs ?? 60_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  const tick = async () => {
    if (stopped) {
      return;
    }

    try {
      const result = await runSyncReconciler();
      const activity =
        result.leasesReleased.candidate +
        result.leasesReleased.batch +
        result.leasesReleased.enrollment +
        result.outcomesRecovered.candidate +
        result.outcomesRecovered.batch;

      if (activity > 0) {
        console.log(JSON.stringify({ reconciler: result, at: new Date().toISOString() }));
      }
    } catch (error) {
      console.error("[reconciler] tick failed", error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          inFlight = tick();
        }, intervalMs);
        timer.unref?.();
      }
    }
  };

  inFlight = tick();

  return {
    async close() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      await inFlight;
    },
  };
}
