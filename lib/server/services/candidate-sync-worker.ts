import { bustDashboardCaches } from "@/lib/server/cache/invalidation";
import { getEnv } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CandidateModel } from "@/lib/server/models/candidate";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { canManageSync } from "@/lib/server/rbac";
import { calculateNextRunAt } from "@/lib/server/queue/backoff";
import { createInMemoryCircuitBreaker, type CircuitBreaker } from "@/lib/server/queue/circuit-breaker";
import { runConcurrentPool } from "@/lib/server/queue/concurrency";
import { getQueueDriver } from "@/lib/server/queue";
import { createInMemoryRateLimiter, type RateLimiter } from "@/lib/server/queue/rate-limiter";
import { getSidhRuntime } from "@/lib/server/queue/sidh-runtime";
import { createSidhConnector, extractRemoteCandidateId, type CandidateRegistrationPayload, SidhConnectorError } from "@/lib/server/services/sidh-connector";
import { parseUserDateInput, toSidhDate } from "@/lib/server/sidh-payload";
import { writeAuditLog } from "@/lib/server/services/audit";
import { writeSyncEvent } from "@/lib/server/services/sync-events";
import { type AuthSession } from "@/lib/server/services/session";

type SyncActor = AuthSession;

export const CANDIDATE_SYNC_QUEUE = "candidate-sync";

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BATCH_LIMIT = 5;
const DEFAULT_CONCURRENCY = 5;
/** Safe env-independent fallbacks used only when a caller does not inject a shared runtime. */
const FALLBACK_RATE_LIMITER_PER_SEC = 10;
const FALLBACK_CIRCUIT_BREAKER_OPTIONS = { cooldownMs: 30_000, failureThreshold: 0.5, minSamples: 10 };

type WorkerCandidate = {
  candidateId: string;
  centerId: string;
  communicationAddress: Record<string, unknown>;
  contactDetails?: never;
  countryCode?: string | null;
  dateOfBirth: Date | string;
  disability: boolean;
  domicileDistrict?: string | null;
  domicileState?: string | null;
  email?: string | null;
  fathersName?: string | null;
  fullName: string;
  gender?: string | null;
  guardiansName?: string | null;
  idNumber?: string | null;
  idType: string;
  mobileNumber: string;
  monthsOfPreviousExperience?: number | null;
  permanentAddress: Record<string, unknown>;
  previousExperienceSector?: string | null;
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
  sidhCandidateId?: string | null;
  syncState?: Record<string, unknown> | null;
  trainingStatus?: string | null;
  typeOfAlternateId?: string | null;
  employed?: string | null;
  employmentStatus?: string | null;
  employmentDetails?: string | null;
  heardAboutUs?: string | null;
  maritalStatus?: string | null;
  mothersName?: string | null;
  religion?: string | null;
  salutation?: string | null;
  typeOfDisability?: string | null;
  category?: string | null;
  educationLevel?: string | null;
  save?: () => Promise<void>;
};

type WorkerSyncJob = {
  attempts?: Iterable<unknown> | null;
  candidateId: string;
  createdAt?: Date;
  entityId: string;
  entityType: string;
  latestRemoteCandidateId?: string | null;
  lockId?: string | null;
  lockedAt?: Date | null;
  maxAttempts?: number;
  nextRunAt?: Date | null;
  payloadSnapshot?: Record<string, unknown>;
  retryCount: number;
  save?: () => Promise<void>;
  status: string;
  syncJobId: string;
};

type ProcessDependencies = {
  circuitBreaker?: CircuitBreaker;
  concurrency?: number;
  connector?: ReturnType<typeof createSidhConnector>;
  now?: () => Date;
  rateLimiter?: RateLimiter;
};

export type ProcessSyncJobsResult = {
  deadLetterCount: number;
  jobs: Array<{
    candidateId: string;
    message: string;
    remoteCandidateId: string | null;
    status: string;
    syncJobId: string;
  }>;
  manualReviewCount: number;
  processedCount: number;
  retryScheduledCount: number;
  succeededCount: number;
};

function ensureCanProcessSyncJobs(actor: SyncActor) {
  if (!canManageSync(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to process sync jobs");
  }
}

function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toRfc3339Seconds(value?: Date | string | null) {
  return toIsoDate(value)?.replace(/\.\d{3}Z$/, "Z") ?? null;
}

function buildCandidateSnapshot(candidate: WorkerCandidate) {
  return {
    candidateId: candidate.candidateId,
    centerId: candidate.centerId,
    countryCode: candidate.countryCode ?? "91",
    dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? null,
    fullName: candidate.fullName,
    fathersName: candidate.fathersName ?? null,
    guardiansName: candidate.guardiansName ?? null,
    mobileNumber: candidate.mobileNumber,
    programId: candidate.programId,
    registrationMode: candidate.registrationMode,
    salutation: candidate.salutation ?? null,
    sidhCandidateId: candidate.sidhCandidateId ?? null,
    syncState: candidate.syncState ?? null,
  };
}

function normalizeCountryCode(value?: string | null) {
  const digits = (value ?? "91").replace(/\D/g, "");
  return digits ? `+${digits}` : "+91";
}

function buildRegistrationPayload(candidate: WorkerCandidate): CandidateRegistrationPayload {
  return {
    ContactDetails: {
      CountryCode: normalizeCountryCode(candidate.countryCode),
      ...(candidate.email?.trim() ? { Email: candidate.email.trim().toLowerCase() } : {}),
      Phone: candidate.mobileNumber,
    },
    PersonalDetails: {
      DOB: toSidhDate(candidate.dateOfBirth),
      ...(candidate.fathersName?.trim() ? { FatherName: candidate.fathersName.trim() } : {}),
      FirstName: candidate.fullName,
      ...(candidate.gender?.trim() ? { Gender: candidate.gender.trim() } : {}),
      ...(candidate.guardiansName?.trim() ? { GuardianName: candidate.guardiansName.trim() } : {}),
      ...(candidate.salutation?.trim() ? { NamePrefix: candidate.salutation.trim() } : {}),
    },
  };
}

function classifyMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown sync failure";
}

async function claimNextSyncJob(now: Date) {
  return SyncJobModel.findOneAndUpdate(
    {
      entityType: "candidate",
      nextRunAt: { $lte: now },
      status: "queued",
    },
    {
      $set: {
        lockId: createPrefixedId("lock"),
        lockedAt: now,
        status: "processing",
      },
    },
    {
      new: true,
      sort: {
        createdAt: 1,
        nextRunAt: 1,
      },
    },
  );
}

async function loadCandidateContext(candidateId: string) {
  const candidate = (await CandidateModel.findOne({ candidateId })) as WorkerCandidate | null;
  return { candidate };
}

function setAttempt(job: WorkerSyncJob, attempt: Record<string, unknown>) {
  const attempts = Array.from(job.attempts ?? []) as Array<Record<string, unknown>>;
  attempts.push(attempt);
  job.attempts = attempts as never;
}

function updateLastAttempt(job: WorkerSyncJob, patch: Record<string, unknown>) {
  const attempts = Array.from(job.attempts ?? []) as Array<Record<string, unknown>>;
  const lastAttempt = attempts.at(-1);

  if (!lastAttempt) {
    return;
  }

  Object.assign(lastAttempt, patch);
  job.attempts = attempts as never;
}

async function persistProcessingState(candidate: WorkerCandidate, job: WorkerSyncJob, now: Date) {
  candidate.syncState = {
    ...(candidate.syncState ?? {}),
    lastAttemptAt: now,
    lastFailureCode: null,
    lastFailureMessage: null,
    lastJobId: job.syncJobId,
    retryCount: job.retryCount,
    status: "processing",
  } as never;
  await candidate.save?.();
}

async function finalizeSuccess(actor: SyncActor, candidate: WorkerCandidate, job: WorkerSyncJob, attemptId: string, now: Date, remoteCandidateId: string | null, requestId?: string) {
  const resolvedCandidateId = remoteCandidateId?.trim() || candidate.sidhCandidateId?.trim() || null;
  if (!resolvedCandidateId) {
    throw new SidhConnectorError({
      code: "SIDH_CANDIDATE_ID_MISSING",
      manualReview: true,
      message: "Cannot finalize candidate sync without a SIDH candidate ID",
    });
  }

  job.latestRemoteCandidateId = resolvedCandidateId;
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = null;
  job.retryCount = job.retryCount ?? 0;
  job.status = "succeeded";
  updateLastAttempt(job, {
    failureCode: null,
    failureMessage: null,
    finishedAt: now,
    remoteCandidateId: resolvedCandidateId,
    responseCode: 200,
    retryable: false,
    status: "succeeded",
  });
  await job.save?.();

  candidate.sidhCandidateId = resolvedCandidateId;
  candidate.syncState = {
    ...(candidate.syncState ?? {}),
    lastAttemptAt: now,
    lastFailureCode: null,
    lastFailureMessage: null,
    lastJobId: job.syncJobId,
    lastSuccessAt: now,
    retryCount: job.retryCount,
    status: "synced",
  } as never;
  await candidate.save?.();

  await writeAuditLog({
    action: "candidate.sync.succeeded",
    actorUserId: actor.user.id,
    entityId: job.syncJobId,
    entityType: "sync_job",
    metadata: {
      attemptId,
      candidateId: candidate.candidateId,
      remoteCandidateId: resolvedCandidateId,
    },
    requestId,
  });

  await bustDashboardCaches();
}

async function finalizeRetry(actor: SyncActor, candidate: WorkerCandidate, job: WorkerSyncJob, attemptId: string, now: Date, error: SidhConnectorError, requestId?: string) {
  const nextRetryCount = (job.retryCount ?? 0) + 1;
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = calculateNextRunAt(nextRetryCount, now);
  job.retryCount = nextRetryCount;
  job.status = "queued";
  updateLastAttempt(job, {
    failureCode: error.code,
    failureMessage: error.message,
    finishedAt: now,
    responseCode: error.status,
    retryable: true,
    status: "failed",
  });
  await job.save?.();

  candidate.syncState = {
    ...(candidate.syncState ?? {}),
    lastAttemptAt: now,
    lastFailureCode: error.code,
    lastFailureMessage: error.message,
    lastJobId: job.syncJobId,
    retryCount: nextRetryCount,
    status: "queued",
  } as never;
  await candidate.save?.();

  await writeAuditLog({
    action: "candidate.sync.retry_scheduled",
    actorUserId: actor.user.id,
    entityId: job.syncJobId,
    entityType: "sync_job",
    metadata: {
      attemptId,
      candidateId: candidate.candidateId,
      failureCode: error.code,
      nextRunAt: job.nextRunAt?.toISOString() ?? null,
    },
    requestId,
  });
}

async function finalizeManualReview(actor: SyncActor, candidate: WorkerCandidate | null, job: WorkerSyncJob, attemptId: string, now: Date, error: SidhConnectorError, requestId?: string, status: "manual_review" | "dead_letter" = "manual_review") {
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = null;
  job.status = status;
  updateLastAttempt(job, {
    failureCode: error.code,
    failureMessage: error.message,
    finishedAt: now,
    responseCode: error.status,
    retryable: false,
    status: status === "dead_letter" ? "failed" : "manual_review",
  });
  await job.save?.();

  if (candidate) {
    candidate.syncState = {
      ...(candidate.syncState ?? {}),
      lastAttemptAt: now,
      lastFailureCode: error.code,
      lastFailureMessage: error.message,
      lastJobId: job.syncJobId,
      retryCount: job.retryCount,
      status: status === "dead_letter" ? "failed" : "manual_review",
    } as never;
    await candidate.save?.();
  }

  await writeAuditLog({
    action: status === "dead_letter" ? "candidate.sync.dead_letter" : "candidate.sync.manual_review",
    actorUserId: actor.user.id,
    entityId: job.syncJobId,
    entityType: "sync_job",
    metadata: {
      attemptId,
      candidateId: candidate?.candidateId ?? job.candidateId,
      failureCode: error.code,
    },
    requestId,
  });
}

async function recoverRemoteCandidateIdFromTransactions(syncJobId: string) {
  const successTxn = await SidhApiTransactionModel.findOne({
    operation: "candidate.register",
    success: true,
    syncJobId,
  }).sort({ createdAt: -1 });

  if (!successTxn) {
    return null;
  }

  return extractRemoteCandidateId(successTxn.responsePayload);
}

async function processClaimedJob(
  actor: SyncActor,
  job: WorkerSyncJob,
  connector: ReturnType<typeof createSidhConnector>,
  now: Date,
  requestId: string | undefined,
  circuitBreaker: CircuitBreaker,
) {
  const attemptId = createPrefixedId("syncatt");
  setAttempt(job, {
    attemptId,
    startedAt: now,
    status: "processing",
  });

  await writeSyncEvent({
    entityId: job.candidateId,
    entityType: "candidate",
    eventType: "claimed",
    requestId,
    syncJobId: job.syncJobId,
  });

  const { candidate } = await loadCandidateContext(job.candidateId);

  if (!candidate) {
    const error = new SidhConnectorError({
      code: "CANDIDATE_NOT_FOUND",
      manualReview: true,
      message: "Candidate not found for sync job",
    });
    await finalizeManualReview(actor, null, job, attemptId, now, error, requestId, "dead_letter");
    await writeSyncEvent({
      entityId: job.candidateId,
      entityType: "candidate",
      eventType: "dead_lettered",
      metadata: { failureCode: error.code },
      requestId,
      syncJobId: job.syncJobId,
    });
    return {
      candidateId: job.candidateId,
      message: error.message,
      remoteCandidateId: null,
      status: "dead_letter",
      syncJobId: job.syncJobId,
    };
  }

  if (candidate.registrationMode === "existing_sidh_link") {
    const error = new SidhConnectorError({
      code: "SYNC_NOT_REQUIRED",
      manualReview: true,
      message: "Existing SIDH linked candidates do not require registration sync",
    });
    await finalizeManualReview(actor, candidate, job, attemptId, now, error, requestId);
    return {
      candidateId: candidate.candidateId,
      message: error.message,
      remoteCandidateId: candidate.sidhCandidateId ?? null,
      status: "manual_review",
      syncJobId: job.syncJobId,
    };
  }

  // Pre-flight idempotency: never re-register a candidate that already has a SIDH id.
  if (candidate.sidhCandidateId?.trim()) {
    await finalizeSuccess(actor, candidate, job, attemptId, now, candidate.sidhCandidateId.trim(), requestId);
    await writeSyncEvent({
      entityId: candidate.candidateId,
      entityType: "candidate",
      eventType: "succeeded",
      metadata: { recoveredFrom: "existing_sidh_candidate_id", remoteCandidateId: candidate.sidhCandidateId },
      requestId,
      syncJobId: job.syncJobId,
    });
    return {
      candidateId: candidate.candidateId,
      message: "Candidate already linked with Skill India",
      remoteCandidateId: candidate.sidhCandidateId,
      status: "succeeded",
      syncJobId: job.syncJobId,
    };
  }

  // Outcome verification: if a prior attempt already succeeded on SIDH but the worker crashed,
  // recover the remote id from SidhApiTransaction instead of creating a duplicate.
  const recoveredRemoteId = await recoverRemoteCandidateIdFromTransactions(job.syncJobId);
  if (recoveredRemoteId) {
    await finalizeSuccess(actor, candidate, job, attemptId, now, recoveredRemoteId, requestId);
    await writeSyncEvent({
      entityId: candidate.candidateId,
      entityType: "candidate",
      eventType: "succeeded",
      metadata: { recoveredFrom: "sidh_api_transaction", remoteCandidateId: recoveredRemoteId },
      requestId,
      syncJobId: job.syncJobId,
    });
    return {
      candidateId: candidate.candidateId,
      message: "Candidate recovered from prior SIDH transaction",
      remoteCandidateId: recoveredRemoteId,
      status: "succeeded",
      syncJobId: job.syncJobId,
    };
  }

  await persistProcessingState(candidate, job, now);
  await writeSyncEvent({
    entityId: candidate.candidateId,
    entityType: "candidate",
    eventType: "attempt_started",
    metadata: { attemptId },
    requestId,
    syncJobId: job.syncJobId,
  });

  const payload = buildRegistrationPayload(candidate);
  job.payloadSnapshot = {
    candidate: buildCandidateSnapshot(candidate),
    registrationPayload: payload,
  };

  try {
    const result = await connector.registerCandidate({
      attemptId,
      payload,
      syncJobId: job.syncJobId,
    });
    await circuitBreaker.recordSuccess();
    await finalizeSuccess(actor, candidate, job, attemptId, new Date(), result.remoteCandidateId, requestId);
    await writeSyncEvent({
      entityId: candidate.candidateId,
      entityType: "candidate",
      eventType: "succeeded",
      metadata: { attemptId, remoteCandidateId: result.remoteCandidateId },
      requestId,
      syncJobId: job.syncJobId,
    });

    return {
      candidateId: candidate.candidateId,
      message: "Candidate synced successfully",
      remoteCandidateId: result.remoteCandidateId,
      status: "succeeded",
      syncJobId: job.syncJobId,
    };
  } catch (error) {
    const connectorError =
      error instanceof SidhConnectorError
        ? error
        : new SidhConnectorError({
            code: "SYNC_PROCESSING_FAILED",
            message: classifyMessage(error),
            retryable: true,
          });

    if (connectorError.retryable) {
      await circuitBreaker.recordFailure();
    } else {
      await circuitBreaker.recordSuccess();
    }

    if (connectorError.code === "SIDH_CONFLICT" && connectorError.remoteCandidateId) {
      await finalizeSuccess(actor, candidate, job, attemptId, new Date(), connectorError.remoteCandidateId, requestId);
      await writeSyncEvent({
        entityId: candidate.candidateId,
        entityType: "candidate",
        eventType: "succeeded",
        metadata: { attemptId, recoveredFrom: "sidh_conflict", remoteCandidateId: connectorError.remoteCandidateId },
        requestId,
        syncJobId: job.syncJobId,
      });

      return {
        candidateId: candidate.candidateId,
        message: "Candidate reconciled from SIDH conflict response",
        remoteCandidateId: connectorError.remoteCandidateId,
        status: "succeeded",
        syncJobId: job.syncJobId,
      };
    }

    const currentRetryCount = job.retryCount ?? 0;
    const maxAttempts = Math.max(1, job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    job.maxAttempts = maxAttempts;

    if (connectorError.retryable && currentRetryCount + 1 < maxAttempts) {
      await finalizeRetry(actor, candidate, job, attemptId, new Date(), connectorError, requestId);
      await writeSyncEvent({
        entityId: candidate.candidateId,
        entityType: "candidate",
        eventType: "attempt_failed",
        metadata: { attemptId, failureCode: connectorError.code, retryScheduled: true },
        requestId,
        syncJobId: job.syncJobId,
      });
      return {
        candidateId: candidate.candidateId,
        message: connectorError.message,
        remoteCandidateId: null,
        status: "queued",
        syncJobId: job.syncJobId,
      };
    }

    const terminalStatus = connectorError.retryable ? "dead_letter" : "manual_review";
    await finalizeManualReview(
      actor,
      candidate,
      job,
      attemptId,
      new Date(),
      connectorError,
      requestId,
      terminalStatus,
    );
    await writeSyncEvent({
      entityId: candidate.candidateId,
      entityType: "candidate",
      eventType: terminalStatus === "dead_letter" ? "dead_lettered" : "attempt_failed",
      metadata: { attemptId, failureCode: connectorError.code },
      requestId,
      syncJobId: job.syncJobId,
    });

    return {
      candidateId: candidate.candidateId,
      message: connectorError.message,
      remoteCandidateId: connectorError.remoteCandidateId,
      status: terminalStatus,
      syncJobId: job.syncJobId,
    };
  }
}

const DEFERRED_CLAIM_DELAY_MS = 5_000;

async function deferClaimedSyncJob(job: WorkerSyncJob, now: Date) {
  job.lockId = null;
  job.lockedAt = null;
  job.status = "queued";
  job.nextRunAt = new Date(now.getTime() + DEFERRED_CLAIM_DELAY_MS);
  await job.save?.();
}

/**
 * Claims exactly one queued candidate sync job and fully processes it. Returns `null` when
 * there is nothing left to claim, or when the SIDH circuit breaker is currently open (in
 * which case the claimed job is released back to `queued` without penalty so it is retried
 * once SIDH recovers, instead of burning one of its limited retry attempts).
 */
async function claimAndProcessNextSyncJob(
  actor: SyncActor,
  connector: ReturnType<typeof createSidhConnector>,
  rateLimiter: RateLimiter,
  circuitBreaker: CircuitBreaker,
  now: () => Date,
  requestId?: string,
): Promise<ProcessSyncJobsResult["jobs"][number] | null> {
  const claimedJob = (await claimNextSyncJob(now())) as WorkerSyncJob | null;

  if (!claimedJob) {
    return null;
  }

  if (await circuitBreaker.isOpen()) {
    await deferClaimedSyncJob(claimedJob, now());
    return null;
  }

  await rateLimiter.acquire();

  return processClaimedJob(actor, claimedJob, connector, now(), requestId, circuitBreaker);
}

export async function processQueuedSyncJobs(actor: SyncActor, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessSyncJobs(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const rateLimiter = dependencies.rateLimiter ?? createInMemoryRateLimiter(FALLBACK_RATE_LIMITER_PER_SEC);
  const circuitBreaker = dependencies.circuitBreaker ?? createInMemoryCircuitBreaker(FALLBACK_CIRCUIT_BREAKER_OPTIONS);
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_BATCH_LIMIT, 5_000));
  const concurrency = Math.max(1, Math.min(dependencies.concurrency ?? DEFAULT_CONCURRENCY, limit));

  const jobs = await runConcurrentPool(limit, concurrency, () =>
    claimAndProcessNextSyncJob(actor, connector, rateLimiter, circuitBreaker, now, input.requestId),
  );

  return {
    deadLetterCount: jobs.filter((job) => job.status === "dead_letter").length,
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}

/**
 * Starts the always-on candidate sync worker for this process, driven by the active queue
 * driver (Redis/BullMQ in production, polling loops in dev). Used by scripts/worker.ts.
 */
export function startCandidateSyncWorker(actor: SyncActor, options: { concurrency?: number; requestIdPrefix?: string } = {}) {
  const env = getEnv();
  const runtime = getSidhRuntime();
  const driver = getQueueDriver();
  const concurrency = Math.max(1, options.concurrency ?? env.SIDH_PUSH_CONCURRENCY);

  return driver.runWorker(
    CANDIDATE_SYNC_QUEUE,
    async () => {
      const result = await claimAndProcessNextSyncJob(
        actor,
        runtime.connector,
        runtime.rateLimiter,
        runtime.circuitBreaker,
        () => new Date(),
        options.requestIdPrefix ? `${options.requestIdPrefix}-${createPrefixedId("cswrun")}` : undefined,
      );
      return result !== null;
    },
    {
      concurrency,
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    },
  );
}

/** Wakes up the candidate sync worker immediately instead of waiting for the next poll tick. */
export async function notifyCandidateSyncQueue() {
  await getQueueDriver().notify(CANDIDATE_SYNC_QUEUE);
}