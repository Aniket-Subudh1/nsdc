import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CandidateModel } from "@/lib/server/models/candidate";
import { ProgramModel } from "@/lib/server/models/program";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { canManageSync } from "@/lib/server/rbac";
import { createSidhConnector, type CandidateRegistrationPayload, SidhConnectorError } from "@/lib/server/services/sidh-connector";
import { writeAuditLog } from "@/lib/server/services/audit";
import { type AuthSession } from "@/lib/server/services/session";

type SyncActor = AuthSession;

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

type WorkerTrainingCenter = {
  centerId: string;
  centerName?: string | null;
  sidhTcId?: string | null;
  status?: string;
  verifiedForSidh?: boolean;
};

type WorkerProgram = {
  name?: string | null;
  programId: string;
  status?: string;
  syncToSidh?: boolean;
};

type ProcessDependencies = {
  connector?: ReturnType<typeof createSidhConnector>;
  now?: () => Date;
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

function buildCandidateSnapshot(candidate: WorkerCandidate) {
  return {
    candidateId: candidate.candidateId,
    centerId: candidate.centerId,
    countryCode: candidate.countryCode ?? "91",
    dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? null,
    fullName: candidate.fullName,
    mobileNumber: candidate.mobileNumber,
    programId: candidate.programId,
    registrationMode: candidate.registrationMode,
    sidhCandidateId: candidate.sidhCandidateId ?? null,
    syncState: candidate.syncState ?? null,
  };
}

function buildRegistrationPayload(candidate: WorkerCandidate, center: WorkerTrainingCenter, program: WorkerProgram): CandidateRegistrationPayload {
  return {
    candidate: {
      communicationAddress: candidate.communicationAddress,
      contactDetails: {
        countryCode: candidate.countryCode ?? "91",
        email: candidate.email ?? null,
        mobileNumber: candidate.mobileNumber,
      },
      domicile: {
        district: candidate.domicileDistrict ?? null,
        state: candidate.domicileState ?? null,
      },
      experience: {
        employed: candidate.employed ?? null,
        employmentDetails: candidate.employmentDetails ?? null,
        employmentStatus: candidate.employmentStatus ?? null,
        heardAboutUs: candidate.heardAboutUs ?? null,
        monthsOfPreviousExperience: candidate.monthsOfPreviousExperience ?? null,
        previousExperienceSector: candidate.previousExperienceSector ?? null,
        trainingStatus: candidate.trainingStatus ?? null,
      },
      identity: {
        idNumber: candidate.idNumber ?? null,
        idType: candidate.idType,
        typeOfAlternateId: candidate.typeOfAlternateId ?? null,
      },
      permanentAddress: candidate.permanentAddress,
      personalDetails: {
        category: candidate.category ?? null,
        dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? null,
        disability: candidate.disability,
        fathersName: candidate.fathersName ?? null,
        fullName: candidate.fullName,
        gender: candidate.gender ?? null,
        guardiansName: candidate.guardiansName ?? null,
        maritalStatus: candidate.maritalStatus ?? null,
        mothersName: candidate.mothersName ?? null,
        religion: candidate.religion ?? null,
        salutation: candidate.salutation ?? null,
        typeOfDisability: candidate.typeOfDisability ?? null,
      },
    },
    candidateReferenceId: candidate.candidateId,
    center: {
      centerId: center.centerId,
      centerName: center.centerName ?? null,
      sidhTcId: center.sidhTcId ?? null,
    },
    meta: {
      centerId: candidate.centerId,
      programId: candidate.programId,
      registrationMode: candidate.registrationMode,
    },
    tpId: program.syncToSidh === false ? "" : "configured-via-connector",
  };
}

function classifyMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown sync failure";
}

function calculateNextRunAt(retryCount: number, now: Date) {
  const delaySeconds = Math.min(5 * 2 ** Math.max(retryCount - 1, 0), 30);
  return new Date(now.getTime() + delaySeconds * 1000);
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

  if (!candidate) {
    return { candidate: null, center: null, program: null };
  }

  const [center, program] = await Promise.all([
    TrainingCenterModel.findOne({ centerId: candidate.centerId }).select({ centerId: 1, centerName: 1, sidhTcId: 1, status: 1, verifiedForSidh: 1 }),
    ProgramModel.findOne({ programId: candidate.programId }).select({ name: 1, programId: 1, status: 1, syncToSidh: 1 }),
  ]);

  return {
    candidate,
    center: center as WorkerTrainingCenter | null,
    program: program as WorkerProgram | null,
  };
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
  job.latestRemoteCandidateId = remoteCandidateId ?? job.latestRemoteCandidateId ?? null;
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = null;
  job.retryCount = job.retryCount ?? 0;
  job.status = "succeeded";
  updateLastAttempt(job, {
    failureCode: null,
    failureMessage: null,
    finishedAt: now,
    remoteCandidateId,
    responseCode: 200,
    retryable: false,
    status: "succeeded",
  });
  await job.save?.();

  candidate.sidhCandidateId = remoteCandidateId ?? candidate.sidhCandidateId ?? null;
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
      remoteCandidateId,
    },
    requestId,
  });
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

async function processClaimedJob(actor: SyncActor, job: WorkerSyncJob, connector: ReturnType<typeof createSidhConnector>, now: Date, requestId?: string) {
  const attemptId = createPrefixedId("syncatt");
  setAttempt(job, {
    attemptId,
    startedAt: now,
    status: "processing",
  });

  const { candidate, center, program } = await loadCandidateContext(job.candidateId);

  if (!candidate) {
    const error = new SidhConnectorError({
      code: "CANDIDATE_NOT_FOUND",
      manualReview: true,
      message: "Candidate not found for sync job",
    });
    await finalizeManualReview(actor, null, job, attemptId, now, error, requestId, "dead_letter");
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

  if (!center?.sidhTcId) {
    const error = new SidhConnectorError({
      code: "CENTER_SIDH_TC_ID_MISSING",
      manualReview: true,
      message: "Training center is missing SIDH TC metadata",
    });
    await finalizeManualReview(actor, candidate, job, attemptId, now, error, requestId);
    return {
      candidateId: candidate.candidateId,
      message: error.message,
      remoteCandidateId: null,
      status: "manual_review",
      syncJobId: job.syncJobId,
    };
  }

  if (!center?.verifiedForSidh) {
    const error = new SidhConnectorError({
      code: "CENTER_NOT_VERIFIED",
      manualReview: true,
      message: "Training center must be verified before SIDH registration sync",
    });
    await finalizeManualReview(actor, candidate, job, attemptId, now, error, requestId);
    return {
      candidateId: candidate.candidateId,
      message: error.message,
      remoteCandidateId: null,
      status: "manual_review",
      syncJobId: job.syncJobId,
    };
  }

  if (!program) {
    const error = new SidhConnectorError({
      code: "PROGRAM_NOT_FOUND",
      manualReview: true,
      message: "Program not found for sync job",
    });
    await finalizeManualReview(actor, candidate, job, attemptId, now, error, requestId, "dead_letter");
    return {
      candidateId: candidate.candidateId,
      message: error.message,
      remoteCandidateId: null,
      status: "dead_letter",
      syncJobId: job.syncJobId,
    };
  }

  await persistProcessingState(candidate, job, now);

  const payload = buildRegistrationPayload(candidate, center, program);
  payload.tpId = payload.tpId || "configured-via-connector";
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
    await finalizeSuccess(actor, candidate, job, attemptId, new Date(), result.remoteCandidateId, requestId);

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

    if (connectorError.code === "SIDH_CONFLICT" && connectorError.remoteCandidateId) {
      await finalizeSuccess(actor, candidate, job, attemptId, new Date(), connectorError.remoteCandidateId, requestId);

      return {
        candidateId: candidate.candidateId,
        message: "Candidate reconciled from SIDH conflict response",
        remoteCandidateId: connectorError.remoteCandidateId,
        status: "succeeded",
        syncJobId: job.syncJobId,
      };
    }

    const currentRetryCount = job.retryCount ?? 0;
    const maxAttempts = Math.max(1, Math.min(job.maxAttempts ?? 3, 3));
    job.maxAttempts = maxAttempts;

    if (connectorError.retryable && currentRetryCount + 1 < maxAttempts) {
      await finalizeRetry(actor, candidate, job, attemptId, new Date(), connectorError, requestId);
      return {
        candidateId: candidate.candidateId,
        message: connectorError.message,
        remoteCandidateId: null,
        status: "queued",
        syncJobId: job.syncJobId,
      };
    }

    await finalizeManualReview(
      actor,
      candidate,
      job,
      attemptId,
      new Date(),
      connectorError,
      requestId,
      connectorError.retryable ? "dead_letter" : "manual_review",
    );

    return {
      candidateId: candidate.candidateId,
      message: connectorError.message,
      remoteCandidateId: connectorError.remoteCandidateId,
      status: connectorError.retryable ? "dead_letter" : "manual_review",
      syncJobId: job.syncJobId,
    };
  }
}

export async function processQueuedSyncJobs(actor: SyncActor, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessSyncJobs(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? 5, 25));
  const jobs: ProcessSyncJobsResult["jobs"] = [];

  for (let index = 0; index < limit; index += 1) {
    const claimedJob = (await claimNextSyncJob(now())) as WorkerSyncJob | null;

    if (!claimedJob) {
      break;
    }

    jobs.push(await processClaimedJob(actor, claimedJob, connector, now(), input.requestId));
  }

  return {
    deadLetterCount: jobs.filter((job) => job.status === "dead_letter").length,
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}