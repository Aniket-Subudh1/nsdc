import { createHash } from "node:crypto";

import { bustDashboardCaches } from "@/lib/server/cache/invalidation";
import { getEnv, getSidhBatchContext } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { calculateNextRunAt } from "@/lib/server/queue/backoff";
import { createInMemoryCircuitBreaker, type CircuitBreaker } from "@/lib/server/queue/circuit-breaker";
import { runConcurrentPool } from "@/lib/server/queue/concurrency";
import { getQueueDriver } from "@/lib/server/queue";
import { createInMemoryRateLimiter, type RateLimiter } from "@/lib/server/queue/rate-limiter";
import { getSidhRuntime } from "@/lib/server/queue/sidh-runtime";
import { readWorkbookSheetsFromArrayBuffer } from "@/lib/spreadsheet/node";
import { excelSerialToDate } from "@/lib/spreadsheet/shared";
import { parseUserDateInput } from "@/lib/server/sidh-payload";
import { AttendanceRecordModel } from "@/lib/server/models/attendance-record";
import { AttendanceUploadModel } from "@/lib/server/models/attendance-upload";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchDailySessionModel } from "@/lib/server/models/batch-daily-session";
import { BatchModel } from "@/lib/server/models/batch";
import { BatchSyncStateModel } from "@/lib/server/models/batch-sync-state";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CandidateTrainingStatusHistoryModel } from "@/lib/server/models/candidate-training-status-history";
import { CourseModel } from "@/lib/server/models/course";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import {
  canAccessCenters,
  canManageAttendance,
  canManageBatchSync,
  canManageBatches,
  getPermissionsForRoles,
} from "@/lib/server/rbac";
import { isTrainingPartnerId, resolveSidhBatchId } from "@/lib/server/sidh-payload";
import { assertValidBatchFee, buildSidhBatchPayload, resolveSidhBatchFieldSelection } from "@/lib/sidh-batch-payload";
import { writeAuditLog } from "@/lib/server/services/audit";
import { createSidhConnector, SidhConnectorError } from "@/lib/server/services/sidh-connector";
import { type AuthSession } from "@/lib/server/services/session";
import {
  type AddCandidatesToBatchInput,
  type AttendanceCommitInput,
  type BatchListQuery,
  type BatchSyncRequestInput,
  type CreateBatchInput,
  type EnrollmentSyncRequestInput,
  type UpdateBatchInput,
  attendanceImportRowSchema,
} from "@/lib/server/validation";

type PagedList<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type ServiceBatch = {
  assessmentDate?: Date | null;
  assessmentEligibilityThreshold: number;
  allowAssessmentBeforeBatchEnd?: boolean;
  allowCandidateOverlap?: boolean;
  batchCode: string;
  batchId: string;
  batchName?: string | null;
  batchSize?: number;
  candidateCount?: number;
  centerId: string;
  courseId: string;
  createdAt?: Date;
  endDate: Date;
  endTime?: string;
  fee?: number;
  sidhAssessmentMode?: string | null;
  sidhBatchId?: string | null;
  sidhBatchType?: string | null;
  sidhCategoryType?: string | null;
  sidhCreatedSource?: string | null;
  sidhFeePaidBy?: string | null;
  sidhTpId?: string | null;
  schemeId: string;
  startDate: Date;
  startTime?: string;
  status: string;
  syncEnabled: boolean;
  trainingHoursPerDay?: number;
  updatedAt?: Date;
  updatedByUserId?: string | null;
};

type ServiceCandidate = {
  candidateId: string;
  centerId: string;
  dateOfBirth: Date | string;
  fullName: string;
  mobileNumber: string;
  programId: string;
  registrationMode: string;
  sidhCandidateId?: string | null;
  syncState?: { status?: string | null } | null;
  trainingStatus?: string | null;
};

type ServiceCourse = {
  approvalStatus: string;
  associatedQpOrJobRole: string;
  courseId: string;
  courseName: string;
  minimumAge: number;
  nsqfLevel: number;
  programIds?: string[];
  qpCode: string;
  schemeIds?: string[];
  sidhCourseId: string;
  status: string;
  trainingHours: number;
  trainingPerDayHours?: number | null;
  validityEndDate: Date;
  validityStartDate: Date;
};

type ServiceScheme = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  beneficiaryType?: string | null;
  createdSource?: string | null;
  fundingType?: string | null;
  name: string;
  schemeId: string;
  sidhSchemeId?: string | null;
  sidhSchemeReferenceId?: string | null;
  sidhSchemeType?: string | null;
  status: string;
  syncEnabled: boolean;
  validFrom?: Date | null;
  validTo?: Date | null;
};

type ServiceProgram = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  createdSource?: string | null;
  feePaidBy?: string | null;
  name: string;
  programId: string;
  skillingCategoryId?: number | null;
  skillingCategoryName?: string | null;
  skillingCategoryScheme?: string | null;
};

type ServiceCenter = {
  centerCode?: string;
  centerId: string;
  centerName: string;
  programIds?: string[];
  sidhTcId?: string | null;
  status: string;
  verifiedForSidh?: boolean;
};

type ServiceBatchCandidate = {
  batchCandidateId: string;
  batchId: string;
  candidateId: string;
  createdAt?: Date;
  enrolledAt?: Date | null;
  enrollmentStatus: string;
  lastEnrollmentFailureCode?: string | null;
  lastEnrollmentFailureMessage?: string | null;
  lastEnrollmentSyncAt?: Date | null;
  remoteStatus?: string | null;
  sidhEnrollmentId?: string | null;
  updatedAt?: Date;
};

type SyncAttempt = {
  attemptId: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  finishedAt?: Date | null;
  operation: "batch_sync" | "enrollment_sync";
  remoteId?: string | null;
  requestFingerprint?: string | null;
  responseCode?: number | null;
  retryable?: boolean;
  startedAt?: Date;
  status: "processing" | "succeeded" | "failed" | "manual_review";
};

type QueuedSyncState = {
  attempts?: SyncAttempt[];
  lastAttemptAt?: Date | null;
  lastFailureCode?: string | null;
  lastFailureMessage?: string | null;
  lastJobId?: string | null;
  lastSuccessAt?: Date | null;
  lockId?: string | null;
  lockedAt?: Date | null;
  maxAttempts?: number;
  nextRunAt?: Date | null;
  remoteStatus?: string | null;
  requestFingerprint?: string | null;
  retryCount?: number;
  status?: string | null;
};

type ServiceBatchSyncState = {
  batchId: string;
  batchSync?: QueuedSyncState;
  batchSyncStateId: string;
  enrollmentSync?: QueuedSyncState;
  sidhBatchId?: string | null;
  save?: () => Promise<void>;
  updatedByUserId?: string | null;
};

type AttendanceUploadRow = {
  attendanceDate?: Date | null;
  attendanceStatus?: "present" | "absent" | null;
  candidateId?: string | null;
  errors: Array<{ field?: string | null; message: string }>;
  normalized?: Record<string, unknown>;
  rowId: string;
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate";
  trainingStatus?: "ongoing" | "completed" | "dropout" | null;
};

type ServiceAttendanceUpload = {
  attendanceUploadId: string;
  batchId: string;
  committedAt?: Date | null;
  committedRows: number;
  createdAt?: Date;
  fileName: string;
  invalidRows: number;
  rows: AttendanceUploadRow[];
  status: string;
  totalRows: number;
  updatedAt?: Date;
  validRows: number;
};

type ProcessBatchSyncJobsResult = {
  jobs: Array<{
    batchId: string;
    message: string;
    remoteBatchId: string | null;
    status: string;
    syncStateId: string;
  }>;
  manualReviewCount: number;
  processedCount: number;
  retryScheduledCount: number;
  succeededCount: number;
};

type ProcessEnrollmentSyncJobsResult = {
  jobs: Array<{
    batchId: string;
    cancelledCount: number;
    failedCount: number;
    message: string;
    queuedCount: number;
    status: string;
    succeededCount: number;
    syncStateId: string;
  }>;
  cancelledCount: number;
  manualReviewCount: number;
  processedCount: number;
  retryScheduledCount: number;
  succeededCount: number;
};

type ProcessDependencies = {
  circuitBreaker?: CircuitBreaker;
  concurrency?: number;
  connector?: ReturnType<typeof createSidhConnector>;
  now?: () => Date;
  rateLimiter?: RateLimiter;
};

export const BATCH_SYNC_QUEUE = "batch-sync";
export const ENROLLMENT_SYNC_QUEUE = "enrollment-sync";

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BATCH_LIMIT = 5;
const DEFAULT_CONCURRENCY = 5;
/** Safe env-independent fallbacks used only when a caller does not inject a shared runtime. */
const FALLBACK_RATE_LIMITER_PER_SEC = 10;
const FALLBACK_CIRCUIT_BREAKER_OPTIONS = { cooldownMs: 30_000, failureThreshold: 0.5, minSamples: 10 };

const ACTIVE_BATCH_STATUSES = ["draft", "ready", "active"];
const UNASSIGNED_CENTER_ID = "unassigned";

/** Registration-only center IDs used before a learner is attached to a real TC. */
export function isSyntheticCandidateCenterId(centerId: string) {
  return centerId === "candidate_registration" || centerId.startsWith("candidate_center_");
}

function isInternalProgramId(programId: string) {
  return /^prg_[a-z0-9]+$/i.test(programId.trim());
}

function ensureCanReadBatches(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("batches:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to batches");
  }
}

function ensureCanWriteBatches(actor: AuthSession) {
  if (!canManageBatches(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage batches");
  }
}

function ensureCanWriteAttendance(actor: AuthSession) {
  if (!canManageAttendance(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage attendance");
  }
}

function ensureCanProcessBatchSync(actor: AuthSession) {
  if (!canManageBatchSync(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to process batch sync jobs");
  }
}

function normalizeString(value?: string | null) {
  return value?.trim() ?? "";
}

function createSearchRegex(search?: string) {
  if (!search?.trim()) {
    return undefined;
  }

  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
}

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "INVALID_DATE", "Invalid date provided");
  }

  return parsed;
}

function resolveScopedCenterFilter(actor: AuthSession, centerId?: string) {
  const isPlatformAdmin = actor.user.roles.includes("platform_admin");

  if (centerId) {
    if (!isPlatformAdmin && !canAccessCenters(actor.user.roles, actor.user.centerIds, [centerId])) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to the requested center scope");
    }

    return centerId;
  }

  if (isPlatformAdmin) {
    return undefined;
  }

  return actor.user.centerIds;
}

function calculateAge(dateOfBirth: Date | string, onDate: Date) {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);

  if (Number.isNaN(dob.getTime())) {
    return 0;
  }

  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = onDate.getUTCMonth() - dob.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }

  return age;
}

function computeFingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getSyncStateValue(state?: QueuedSyncState | null) {
  return state ?? { retryCount: 0, status: "not_synced" };
}

function serializeSyncState(state?: QueuedSyncState | null) {
  const value = getSyncStateValue(state);

  return {
    attempts: (value.attempts ?? []).map((attempt) => ({
      attemptId: attempt.attemptId,
      failureCode: attempt.failureCode ?? null,
      failureMessage: attempt.failureMessage ?? null,
      finishedAt: toIsoDate(attempt.finishedAt),
      operation: attempt.operation,
      remoteId: attempt.remoteId ?? null,
      requestFingerprint: attempt.requestFingerprint ?? null,
      responseCode: attempt.responseCode ?? null,
      retryable: attempt.retryable ?? false,
      startedAt: toIsoDate(attempt.startedAt),
      status: attempt.status,
    })),
    lastAttemptAt: toIsoDate(value.lastAttemptAt),
    lastFailureCode: value.lastFailureCode ?? null,
    lastFailureMessage: value.lastFailureMessage ?? null,
    lastJobId: value.lastJobId ?? null,
    lastSuccessAt: toIsoDate(value.lastSuccessAt),
    remoteStatus: value.remoteStatus ?? null,
    requestFingerprint: value.requestFingerprint ?? null,
    retryCount: value.retryCount ?? 0,
    status: value.status ?? "not_synced",
  };
}

function serializeBatchCandidate(batchCandidate: ServiceBatchCandidate, candidate?: ServiceCandidate | null) {
  return {
    batchCandidateId: batchCandidate.batchCandidateId,
    candidateId: batchCandidate.candidateId,
    candidateName: candidate?.fullName ?? null,
    candidateMobileNumber: candidate?.mobileNumber ?? null,
    trainingStatus: candidate?.trainingStatus ?? null,
    sidhCandidateId: candidate?.sidhCandidateId ?? null,
    registrationMode: candidate?.registrationMode ?? null,
    enrollmentStatus: batchCandidate.enrollmentStatus,
    sidhEnrollmentId: batchCandidate.sidhEnrollmentId ?? null,
    remoteStatus: batchCandidate.remoteStatus ?? null,
    lastEnrollmentSyncAt: toIsoDate(batchCandidate.lastEnrollmentSyncAt),
    lastEnrollmentFailureCode: batchCandidate.lastEnrollmentFailureCode ?? null,
    lastEnrollmentFailureMessage: batchCandidate.lastEnrollmentFailureMessage ?? null,
    enrolledAt: toIsoDate(batchCandidate.enrolledAt),
    createdAt: toIsoDate(batchCandidate.createdAt),
    updatedAt: toIsoDate(batchCandidate.updatedAt),
  };
}

function serializeBatch(batch: ServiceBatch, syncState?: ServiceBatchSyncState | null, candidates?: Array<ReturnType<typeof serializeBatchCandidate>>) {
  return {
    id: batch.batchId,
    batchId: batch.batchId,
    batchCode: batch.batchCode,
    batchName: batch.batchName ?? null,
    batchSize: batch.batchSize ?? 80,
    courseId: batch.courseId,
    schemeId: batch.schemeId,
    centerId: batch.centerId,
    startDate: toIsoDate(batch.startDate)?.slice(0, 10) ?? null,
    endDate: toIsoDate(batch.endDate)?.slice(0, 10) ?? null,
    assessmentDate: toIsoDate(batch.assessmentDate)?.slice(0, 10) ?? null,
    startTime: batch.startTime ?? "09:00",
    endTime: batch.endTime ?? "17:00",
    trainingHoursPerDay: batch.trainingHoursPerDay ?? 8,
    fee: batch.fee ?? 0,
    sidhAssessmentMode: batch.sidhAssessmentMode ?? null,
    sidhBatchType: batch.sidhBatchType ?? null,
    sidhCategoryType: batch.sidhCategoryType ?? null,
    sidhCreatedSource: batch.sidhCreatedSource ?? null,
    sidhFeePaidBy: batch.sidhFeePaidBy ?? null,
    sidhTpId: batch.sidhTpId ?? null,
    status: batch.status,
    syncEnabled: batch.syncEnabled,
    allowAssessmentBeforeBatchEnd: batch.allowAssessmentBeforeBatchEnd ?? false,
    allowCandidateOverlap: batch.allowCandidateOverlap ?? false,
    assessmentEligibilityThreshold: batch.assessmentEligibilityThreshold,
    candidateCount: batch.candidateCount ?? candidates?.length ?? 0,
    sidhBatchId: batch.sidhBatchId ?? syncState?.sidhBatchId ?? null,
    syncState: syncState
      ? {
          batchSync: serializeSyncState(syncState.batchSync),
          enrollmentSync: serializeSyncState(syncState.enrollmentSync),
        }
      : {
          batchSync: serializeSyncState(null),
          enrollmentSync: serializeSyncState(null),
        },
    candidates: candidates ?? undefined,
    createdAt: toIsoDate(batch.createdAt),
    updatedAt: toIsoDate(batch.updatedAt),
  };
}

function serializeAttendanceUpload(upload: ServiceAttendanceUpload) {
  return {
    id: upload.attendanceUploadId,
    attendanceUploadId: upload.attendanceUploadId,
    batchId: upload.batchId,
    fileName: upload.fileName,
    status: upload.status,
    totalRows: upload.totalRows,
    validRows: upload.validRows,
    invalidRows: upload.invalidRows,
    committedRows: upload.committedRows,
    committedAt: toIsoDate(upload.committedAt),
    createdAt: toIsoDate(upload.createdAt),
    updatedAt: toIsoDate(upload.updatedAt),
    rows: upload.rows.map((row) => ({
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      candidateId: row.candidateId ?? null,
      attendanceDate: toIsoDate(row.attendanceDate)?.slice(0, 10) ?? null,
      attendanceStatus: row.attendanceStatus ?? null,
      trainingStatus: row.trainingStatus ?? null,
      status: row.status,
      errors: row.errors,
      normalized: row.normalized ?? {},
    })),
  };
}

async function ensureBatchSyncState(batchId: string, actorUserId?: string) {
  let syncState = (await BatchSyncStateModel.findOne({ batchId })) as ServiceBatchSyncState | null;

  if (!syncState) {
    syncState = (await BatchSyncStateModel.create({
      batchId,
      batchSyncStateId: createPrefixedId("bsst"),
      createdByUserId: actorUserId ?? null,
      updatedByUserId: actorUserId ?? null,
    })) as unknown as ServiceBatchSyncState;
  }

  return syncState;
}

async function getBatchOrThrow(batchId: string) {
  const batch = (await BatchModel.findOne({ batchId: normalizeString(batchId) })) as ServiceBatch | null;

  if (!batch) {
    throw new ApiError(404, "BATCH_NOT_FOUND", "Batch not found");
  }

  return batch;
}

async function ensureTrainingCenter(centerId: string) {
  const center = (await TrainingCenterModel.findOne({ centerId }).select({
    centerCode: 1,
    centerId: 1,
    centerName: 1,
    programIds: 1,
    sidhTcId: 1,
    status: 1,
    verifiedForSidh: 1,
  })) as ServiceCenter | null;

  if (!center) {
    throw new ApiError(404, "CENTER_NOT_FOUND", "Training center not found");
  }

  if (center.status !== "active") {
    throw new ApiError(400, "CENTER_INACTIVE", "Selected training center is not active");
  }

  return center;
}

async function ensureCourse(courseId: string) {
  const course = (await CourseModel.findOne({ courseId }).select({
    approvalStatus: 1,
    associatedQpOrJobRole: 1,
    courseId: 1,
    courseName: 1,
    minimumAge: 1,
    nsqfLevel: 1,
    programIds: 1,
    qpCode: 1,
    schemeIds: 1,
    sidhCourseId: 1,
    status: 1,
    trainingHours: 1,
    trainingPerDayHours: 1,
    validityEndDate: 1,
    validityStartDate: 1,
  })) as ServiceCourse | null;

  if (!course) {
    throw new ApiError(404, "COURSE_NOT_FOUND", "Course not found");
  }

  return course;
}

async function ensureScheme(schemeId: string) {
  const scheme = (await SchemeModel.findOne({ schemeId }).select({
    assessmentMode: 1,
    batchCategoryType: 1,
    batchType: 1,
    beneficiaryType: 1,
    createdSource: 1,
    fundingType: 1,
    name: 1,
    schemeId: 1,
    sidhSchemeId: 1,
    sidhSchemeReferenceId: 1,
    sidhSchemeType: 1,
    status: 1,
    syncEnabled: 1,
    validFrom: 1,
    validTo: 1,
  })) as ServiceScheme | null;

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  if (scheme.status !== "active") {
    throw new ApiError(400, "SCHEME_INACTIVE", "Selected scheme is not active");
  }

  return scheme;
}

async function validateBatchMasterData(input: {
  centerId: string;
  courseId: string;
  endDate: Date;
  schemeId: string;
  startDate: Date;
  syncEnabled: boolean;
}) {
  const [center, course, scheme] = await Promise.all([
    ensureTrainingCenter(input.centerId),
    ensureCourse(input.courseId),
    ensureScheme(input.schemeId),
  ]);
  const program = course.programIds?.[0]
    ? ((await ProgramModel.findOne({ programId: course.programIds[0] })) as ServiceProgram | null)
    : null;

  if (course.status !== "active" || course.approvalStatus !== "approved") {
    throw new ApiError(400, "COURSE_NOT_SYNC_ELIGIBLE", "Selected course mapping is not approved and active");
  }

  if (course.validityStartDate.getTime() > input.startDate.getTime() || course.validityEndDate.getTime() < input.endDate.getTime()) {
    throw new ApiError(400, "COURSE_VALIDITY_INVALID", "Selected course mapping is not valid for the requested batch dates");
  }

  if ((course.schemeIds ?? []).length > 0 && !(course.schemeIds ?? []).includes(input.schemeId)) {
    throw new ApiError(400, "COURSE_SCHEME_MISMATCH", "Selected course is not mapped to the chosen scheme");
  }

  if ((course.programIds ?? []).length > 0 && (center.programIds ?? []).length > 0) {
    const hasAllowedProgram = (course.programIds ?? []).some((programId) => (center.programIds ?? []).includes(programId));

    if (!hasAllowedProgram) {
      throw new ApiError(400, "CENTER_PROGRAM_MISMATCH", "Selected training center is not aligned to the course program mapping");
    }
  }

  if (scheme.validFrom && scheme.validFrom.getTime() > input.startDate.getTime()) {
    throw new ApiError(400, "SCHEME_VALIDITY_INVALID", "Selected scheme is not yet valid for the requested batch dates");
  }

  if (scheme.validTo && scheme.validTo.getTime() < input.endDate.getTime()) {
    throw new ApiError(400, "SCHEME_VALIDITY_INVALID", "Selected scheme expires before the batch end date");
  }

  if (input.syncEnabled) {
    if (!center.sidhTcId?.trim()) {
      throw new ApiError(400, "CENTER_SIDH_TC_ID_MISSING", "Selected training center is missing SIDH TC metadata");
    }

    if (isTrainingPartnerId(center.sidhTcId)) {
      throw new ApiError(
        400,
        "CENTER_SIDH_TC_ID_INVALID",
        "Training center SIDH TC ID must be the SIDH training center ID, not the training partner ID",
      );
    }

    if (!center.verifiedForSidh) {
      throw new ApiError(400, "CENTER_NOT_VERIFIED", "Verify the training center before using it for SIDH sync");
    }

    if (!course.sidhCourseId) {
      throw new ApiError(400, "COURSE_SIDH_MAPPING_MISSING", "Selected course is missing SIDH mapping metadata");
    }

    if (!scheme.syncEnabled || !scheme.sidhSchemeId || !scheme.sidhSchemeReferenceId) {
      throw new ApiError(400, "SCHEME_SYNC_METADATA_INCOMPLETE", "Selected scheme is missing required SIDH sync metadata");
    }
  }

  return { center, course, program, scheme };
}

function ensureCenterAssignedForSync(centerId: string, syncEnabled: boolean) {
  if (syncEnabled && centerId === UNASSIGNED_CENTER_ID) {
    throw new ApiError(400, "CENTER_REQUIRED_FOR_SYNC", "Select a training center before enabling SIDH sync");
  }
}

async function loadBatchRoster(batchId: string) {
  const batchCandidates = (await BatchCandidateModel.find({ batchId }).sort({ createdAt: 1 })) as ServiceBatchCandidate[];
  const candidateIds = batchCandidates.map((item) => item.candidateId);
  const candidates = candidateIds.length
    ? ((await CandidateModel.find({ candidateId: { $in: candidateIds } }).select({
        candidateId: 1,
        centerId: 1,
        dateOfBirth: 1,
        fullName: 1,
        mobileNumber: 1,
        programId: 1,
        registrationMode: 1,
        sidhCandidateId: 1,
        syncState: 1,
        trainingStatus: 1,
      })) as ServiceCandidate[])
    : [];

  const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  return {
    batchCandidates,
    candidates,
    serialized: batchCandidates.map((item) => serializeBatchCandidate(item, candidateMap.get(item.candidateId))),
  };
}

async function refreshBatchCandidateCount(batchId: string) {
  const candidateCount = await BatchCandidateModel.countDocuments({ batchId });
  await BatchModel.updateOne({ batchId }, { $set: { candidateCount } });
  return candidateCount;
}

type BatchAssignmentContext = Pick<ServiceBatch, "allowCandidateOverlap" | "batchId" | "batchSize" | "centerId" | "courseId" | "endDate" | "startDate">;

type BatchAssignmentCourse = Awaited<ReturnType<typeof ensureCourse>>;

type BatchAssignmentEvaluationContext = {
  conflictingCandidateIds: Set<string>;
  existingBatchCandidateIds: Set<string>;
};

export type BatchAssignmentEvaluation = {
  errors: Array<{ field?: string | null; message: string }>;
  status: "duplicate" | "invalid" | "valid";
};

export async function listConflictingCandidateIdsForBatch(batch: BatchAssignmentContext) {
  if (batch.allowCandidateOverlap) {
    return [];
  }

  const overlappingBatches = (await BatchModel.find({
    batchId: { $ne: batch.batchId },
    status: { $in: ACTIVE_BATCH_STATUSES },
    startDate: { $lte: batch.endDate },
    endDate: { $gte: batch.startDate },
  }).select({ batchId: 1 })) as Array<{ batchId: string }>;

  if (overlappingBatches.length === 0) {
    return [];
  }

  const overlappingBatchIds = overlappingBatches.map((item) => item.batchId);
  const memberships = (await BatchCandidateModel.find({
    batchId: { $in: overlappingBatchIds },
  }).select({ candidateId: 1 })) as Array<{ candidateId: string }>;

  return [...new Set(memberships.map((membership) => membership.candidateId))];
}

export function evaluateCandidateBatchAssignment(
  batch: BatchAssignmentContext,
  course: Pick<BatchAssignmentCourse, "minimumAge" | "programIds">,
  candidate: ServiceCandidate,
  context: BatchAssignmentEvaluationContext,
): BatchAssignmentEvaluation {
  if (context.existingBatchCandidateIds.has(candidate.candidateId)) {
    return {
      status: "duplicate",
      errors: [{ message: "Learner is already enrolled in this batch" }],
    };
  }

  const errors: Array<{ field?: string | null; message: string }> = [];

  if (!candidate.sidhCandidateId) {
    errors.push({
      field: "sidhCandidateId",
      message: "Learner must have a verified SIDH candidate ID before batch assignment",
    });
  }

  const candidateSyncStatus = candidate.syncState?.status ?? (candidate.registrationMode === "existing_sidh_link" ? "linked" : null);
  if (candidateSyncStatus && !["linked", "synced"].includes(candidateSyncStatus)) {
    errors.push({
      field: "syncState.status",
      message: "Learner must be verified on SIDH before batch assignment",
    });
  }

  if (
    batch.centerId !== UNASSIGNED_CENTER_ID &&
    candidate.centerId !== batch.centerId &&
    !isSyntheticCandidateCenterId(candidate.centerId)
  ) {
    errors.push({
      field: "centerId",
      message: "Learner is assigned to a different training center",
    });
  }

  const age = calculateAge(candidate.dateOfBirth, batch.startDate);
  if (age < course.minimumAge) {
    errors.push({
      field: "dateOfBirth",
      message: "Learner does not satisfy the course minimum age",
    });
  }

  // Candidate.programId often stores SIDH registration labels (e.g. "NSQF School"),
  // while course.programIds are internal program masters (prg_*). Only compare when both use internal IDs.
  if (
    (course.programIds ?? []).length > 0 &&
    isInternalProgramId(candidate.programId) &&
    !(course.programIds ?? []).includes(candidate.programId)
  ) {
    errors.push({
      field: "programId",
      message: "Learner is not aligned to the batch course program mapping",
    });
  }

  if (context.conflictingCandidateIds.has(candidate.candidateId)) {
    errors.push({
      field: "candidateId",
      message: "Learner already belongs to a conflicting active batch",
    });
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  return { status: "valid", errors: [] };
}

async function validateCandidateAssignments(batch: BatchAssignmentContext, candidateIds: string[]) {
  const uniqueCandidateIds = [...new Set(candidateIds.map((candidateId) => normalizeString(candidateId)).filter(Boolean))];

  if (uniqueCandidateIds.length === 0) {
    throw new ApiError(400, "CANDIDATE_REQUIRED", "At least one candidate is required");
  }

  const course = await ensureCourse(batch.courseId);
  const existingBatchCandidates = (await BatchCandidateModel.find({ batchId: batch.batchId }).select({ candidateId: 1 })) as Array<{ candidateId: string }>;
  const existingIds = new Set(existingBatchCandidates.map((item) => item.candidateId));
  const incomingIds = uniqueCandidateIds.filter((candidateId) => !existingIds.has(candidateId));

  const batchCapacity = Math.min(batch.batchSize ?? 80, 80);
  if ((existingIds.size + incomingIds.length) > batchCapacity) {
    throw new ApiError(400, "BATCH_SIZE_EXCEEDED", `Batch size must never exceed ${batchCapacity} candidates`);
  }

  const candidates = (await CandidateModel.find({ candidateId: { $in: incomingIds } }).select({
    candidateId: 1,
    centerId: 1,
    dateOfBirth: 1,
    fullName: 1,
    mobileNumber: 1,
    programId: 1,
    registrationMode: 1,
    sidhCandidateId: 1,
    syncState: 1,
    trainingStatus: 1,
  })) as ServiceCandidate[];

  if (candidates.length !== incomingIds.length) {
    throw new ApiError(400, "CANDIDATE_NOT_FOUND", "One or more candidates do not exist");
  }

  const conflictingCandidateIds = new Set(await listConflictingCandidateIdsForBatch(batch));
  const evaluationContext: BatchAssignmentEvaluationContext = {
    conflictingCandidateIds,
    existingBatchCandidateIds: existingIds,
  };

  for (const candidate of candidates) {
    const evaluation = evaluateCandidateBatchAssignment(batch, course, candidate, evaluationContext);

    if (evaluation.status === "duplicate") {
      continue;
    }

    if (evaluation.status === "invalid") {
      const firstError = evaluation.errors[0];
      const code =
        firstError?.field === "sidhCandidateId" || firstError?.field === "syncState.status"
          ? "CANDIDATE_NOT_VERIFIED_FOR_SIDH"
          : firstError?.field === "centerId"
            ? "CANDIDATE_CENTER_MISMATCH"
            : firstError?.field === "dateOfBirth"
              ? "CANDIDATE_MINIMUM_AGE"
              : firstError?.field === "programId"
                ? "CANDIDATE_PROGRAM_MISMATCH"
                : firstError?.field === "candidateId"
                  ? "CANDIDATE_BATCH_OVERLAP"
                  : "CANDIDATE_ASSIGNMENT_INVALID";

      throw new ApiError(400, code, `Candidate ${candidate.candidateId}: ${firstError?.message ?? "Unable to assign candidate to batch"}`);
    }
  }

  return candidates;
}

async function insertBatchCandidates(
  batchId: string,
  actorUserId: string,
  candidates: ServiceCandidate[],
  options: { ordered?: boolean } = {},
) {
  if (candidates.length === 0) {
    return;
  }

  await BatchCandidateModel.insertMany(
    candidates.map((candidate) => ({
      addedByUserId: actorUserId,
      batchCandidateId: createPrefixedId("batc"),
      batchId,
      candidateId: candidate.candidateId,
    })),
    { ordered: options.ordered ?? false },
  );
}

async function updateTrainingStatuses(rows: Array<{ attendanceDate: Date; candidateId: string; trainingStatus?: string | null }>, actorUserId: string, uploadId: string) {
  const latestByCandidate = new Map<string, { attendanceDate: Date; trainingStatus: string }>();

  for (const row of rows) {
    if (!row.trainingStatus) {
      continue;
    }

    const existing = latestByCandidate.get(row.candidateId);
    if (!existing || existing.attendanceDate.getTime() <= row.attendanceDate.getTime()) {
      latestByCandidate.set(row.candidateId, {
        attendanceDate: row.attendanceDate,
        trainingStatus: row.trainingStatus,
      });
    }
  }

  for (const [candidateId, latest] of latestByCandidate) {
    await CandidateModel.updateOne({ candidateId }, { $set: { trainingStatus: latest.trainingStatus } });
  }

  if (latestByCandidate.size === 0) {
    return;
  }

  await CandidateTrainingStatusHistoryModel.insertMany(
    Array.from(latestByCandidate.entries()).map(([candidateId, latest]) => ({
      batchId: rows.find((row) => row.candidateId === candidateId)?.candidateId ? rows.find((row) => row.candidateId === candidateId)?.candidateId : undefined,
    })).filter(Boolean),
  ).catch(() => undefined);

  const historyDocuments = rows
    .filter((row) => row.trainingStatus)
    .map((row) => ({
      batchId: "",
      candidateId: row.candidateId,
      candidateTrainingStatusHistoryId: createPrefixedId("ctsh"),
      createdByUserId: actorUserId,
      effectiveDate: row.attendanceDate,
      sourceUploadId: uploadId,
      trainingStatus: row.trainingStatus,
    }));

  if (historyDocuments.length > 0) {
    await CandidateTrainingStatusHistoryModel.insertMany(historyDocuments, { ordered: false }).catch(() => undefined);
  }
}

async function upsertDailySessions(batchId: string, affectedDates: Date[], sourceUploadId: string) {
  const uniqueDateKeys = [...new Set(affectedDates.map((date) => date.toISOString().slice(0, 10)))];

  for (const dateKey of uniqueDateKeys) {
    const sessionDate = parseDate(dateKey);
    const expectedCandidateCount = await BatchCandidateModel.countDocuments({ batchId });
    const records = (await AttendanceRecordModel.find({ batchId, attendanceDate: sessionDate }).select({ attendanceStatus: 1 })) as Array<{
      attendanceStatus: "present" | "absent";
    }>;
    const presentCount = records.filter((record) => record.attendanceStatus === "present").length;
    const absentCount = records.filter((record) => record.attendanceStatus === "absent").length;

    await BatchDailySessionModel.updateOne(
      { batchId, sessionDate },
      {
        $set: {
          absentCount,
          committedAt: new Date(),
          expectedCandidateCount,
          presentCount,
          sourceUploadId,
        },
        $setOnInsert: {
          batchDailySessionId: createPrefixedId("bds"),
        },
      },
      { upsert: true },
    );
  }
}

function normalizeAttendanceHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getAttendanceCellValue(row: Record<string, unknown>, aliases: string[]) {
  const entry = Object.entries(row).find(([key]) => aliases.includes(normalizeAttendanceHeader(key)));
  return entry?.[1];
}

function parseExcelDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = excelSerialToDate(value);

    if (!parsed) {
      return "";
    }

    return parseUserDateInput(parsed);
  }

  return parseUserDateInput(value);
}

function normalizeAttendanceStatus(value: unknown) {
  const normalized = normalizeString(String(value ?? "")).toLowerCase();

  if (["present", "p", "yes", "1"].includes(normalized)) {
    return "present" as const;
  }

  if (["absent", "a", "no", "0"].includes(normalized)) {
    return "absent" as const;
  }

  return null;
}

function normalizeTrainingStatus(value: unknown) {
  const normalized = normalizeString(String(value ?? "")).toLowerCase();

  if (["ongoing", "active"].includes(normalized)) {
    return "ongoing" as const;
  }

  if (["completed", "complete"].includes(normalized)) {
    return "completed" as const;
  }

  if (["dropout", "dropped", "drop_out"].includes(normalized)) {
    return "dropout" as const;
  }

  return null;
}

async function loadBatchWithScope(actor: AuthSession, batchId: string) {
  const batch = await getBatchOrThrow(batchId);
  resolveScopedCenterFilter(actor, batch.centerId);
  return batch;
}

function setAttempt(state: QueuedSyncState, attempt: SyncAttempt) {
  state.attempts = [...(state.attempts ?? []), attempt];
}

function updateLastAttempt(state: QueuedSyncState, patch: Partial<SyncAttempt>) {
  const attempts = [...(state.attempts ?? [])];
  const lastAttempt = attempts.at(-1);

  if (!lastAttempt) {
    return;
  }

  Object.assign(lastAttempt, patch);
  state.attempts = attempts;
}

async function validateBatchSyncEligibility(batch: ServiceBatch) {
  ensureCenterAssignedForSync(batch.centerId, batch.syncEnabled);

  if (!batch.fee || batch.fee <= 0) {
    throw new ApiError(400, "BATCH_FEE_INVALID", "Batch fee must be greater than 0");
  }

  return validateBatchMasterData({
    centerId: batch.centerId,
    courseId: batch.courseId,
    endDate: batch.endDate,
    schemeId: batch.schemeId,
    startDate: batch.startDate,
    syncEnabled: batch.syncEnabled,
  });
}

async function validateEnrollmentEligibility(batch: ServiceBatch, selectedBatchCandidates?: ServiceBatchCandidate[]) {
  const syncState = await ensureBatchSyncState(batch.batchId);
  const effectiveSidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;

  if (!effectiveSidhBatchId) {
    throw new ApiError(400, "BATCH_NOT_SYNCED", "Batch must have a SIDH batch ID before enrollment sync");
  }

  if (syncState.batchSync?.remoteStatus === "cancelled") {
    throw new ApiError(409, "REMOTE_BATCH_CANCELLED", "The remote batch is cancelled and cannot accept enrollment");
  }

  const batchCandidates = selectedBatchCandidates ?? ((await BatchCandidateModel.find({ batchId: batch.batchId })) as ServiceBatchCandidate[]);
  const candidateIds = batchCandidates.map((item) => item.candidateId);
  const candidates = candidateIds.length
    ? ((await CandidateModel.find({ candidateId: { $in: candidateIds } }).select({
        candidateId: 1,
        registrationMode: 1,
        sidhCandidateId: 1,
      })) as Array<{ candidateId: string; registrationMode: string; sidhCandidateId?: string | null }>)
    : [];
  const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

  for (const batchCandidate of batchCandidates) {
    const candidate = candidateMap.get(batchCandidate.candidateId);

    if (!candidate) {
      throw new ApiError(400, "CANDIDATE_NOT_FOUND", `Candidate ${batchCandidate.candidateId} could not be loaded for enrollment sync`);
    }

    if (!candidate.sidhCandidateId) {
      throw new ApiError(
        400,
        "CANDIDATE_NOT_SYNCED",
        `Candidate ${candidate.candidateId} must have a SIDH candidate ID before enrollment sync`,
      );
    }
  }

  return {
    batchCandidates,
    syncState,
  };
}

export async function createBatch(actor: AuthSession, input: CreateBatchInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  try {
    assertValidBatchFee(input.fee);
  } catch (error) {
    throw new ApiError(400, "BATCH_FEE_INVALID", error instanceof Error ? error.message : "Batch fee must be greater than 0");
  }

  const centerId = normalizeString(input.centerId) || UNASSIGNED_CENTER_ID;
  const hasAssignedCenter = centerId !== UNASSIGNED_CENTER_ID;
  ensureCenterAssignedForSync(centerId, input.syncEnabled);

  if (hasAssignedCenter) {
    resolveScopedCenterFilter(actor, centerId);
  }

  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  const assessmentDate = input.assessmentDate ? parseDate(input.assessmentDate) : null;
  if (hasAssignedCenter) {
    await validateBatchMasterData({
      centerId,
      courseId: input.courseId,
      endDate,
      schemeId: input.schemeId,
      startDate,
      syncEnabled: input.syncEnabled,
    });
  } else {
    await Promise.all([ensureCourse(input.courseId), ensureScheme(input.schemeId)]);
  }

  const existingBatch = await BatchModel.findOne({ batchCode: normalizeString(input.batchCode) }).select({ batchId: 1 });
  if (existingBatch) {
    throw new ApiError(409, "BATCH_EXISTS", "A batch with this code already exists");
  }

  const batchId = createPrefixedId("bat");
  const validatedCandidates = input.candidateIds.length
    ? await validateCandidateAssignments(
        {
          allowCandidateOverlap: input.allowCandidateOverlap,
          batchId,
          batchSize: input.batchSize,
          centerId,
          courseId: input.courseId,
          endDate,
          startDate,
        },
        input.candidateIds,
      )
    : [];

  const course = await ensureCourse(input.courseId);
  const scheme = await ensureScheme(input.schemeId);
  const program = course.programIds?.[0]
    ? ((await ProgramModel.findOne({ programId: course.programIds[0] }).select({
        assessmentMode: 1,
        batchCategoryType: 1,
        batchType: 1,
        createdSource: 1,
        feePaidBy: 1,
        name: 1,
        programId: 1,
        skillingCategoryId: 1,
        skillingCategoryName: 1,
        skillingCategoryScheme: 1,
      })) as ServiceProgram | null)
    : null;

  const sidhFields = resolveSidhBatchFieldSelection({
    batch: {
      assessmentMode: input.assessmentMode,
      batchType: input.batchType,
      categoryType: input.categoryType,
      createdSource: input.createdSource,
      feePaidBy: input.feePaidBy,
      tpId: input.tpId,
    },
    configuredTpId: getSidhBatchContext().tpId,
    program,
    scheme,
  });

  if (input.syncEnabled && !sidhFields.tpId) {
    throw new ApiError(400, "SIDH_TP_ID_REQUIRED", "SIDH TP ID is required when batch sync is enabled");
  }

  const batch = (await BatchModel.create({
    assessmentDate,
    assessmentEligibilityThreshold: input.assessmentEligibilityThreshold,
    allowAssessmentBeforeBatchEnd: input.allowAssessmentBeforeBatchEnd,
    allowCandidateOverlap: input.allowCandidateOverlap,
    batchCode: normalizeString(input.batchCode),
    batchId,
    batchName: normalizeString(input.batchName) || null,
    batchSize: input.batchSize,
    candidateCount: validatedCandidates.length,
    centerId,
    courseId: input.courseId,
    createdByUserId: actor.user.id,
    endDate,
    endTime: input.endTime,
    fee: input.fee,
    schemeId: input.schemeId,
    sidhAssessmentMode: sidhFields.assessmentMode,
    sidhBatchType: sidhFields.batchType,
    sidhCategoryType: sidhFields.categoryType,
    sidhCreatedSource: sidhFields.createdSource,
    sidhFeePaidBy: sidhFields.feePaidBy,
    sidhTpId: sidhFields.tpId || null,
    startDate,
    startTime: input.startTime,
    status: input.status,
    syncEnabled: input.syncEnabled,
    trainingHoursPerDay: input.trainingHoursPerDay,
    updatedByUserId: actor.user.id,
  })) as ServiceBatch;

  await insertBatchCandidates(batch.batchId, actor.user.id, validatedCandidates, { ordered: true });

  await ensureBatchSyncState(batch.batchId, actor.user.id);

  await writeAuditLog({
    action: "batch.created",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: {
      batchCode: batch.batchCode,
      centerId: batch.centerId,
      courseId: batch.courseId,
      schemeId: batch.schemeId,
    },
    requestId,
  });

  await bustDashboardCaches();

  return getBatch(actor, batch.batchId);
}

async function ensureBatchEditable(batch: ServiceBatch) {
  if (batch.sidhBatchId) {
    throw new ApiError(409, "BATCH_ALREADY_SYNCED", "This batch is already synced to SIDH and cannot be edited");
  }

  const syncState = await ensureBatchSyncState(batch.batchId);
  const syncStatus = syncState.batchSync?.status ?? "not_synced";
  const effectiveSidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;

  // Incomplete "synced" without a SIDH ID must remain editable so operators can fix and re-push.
  if (syncStatus === "synced" && !effectiveSidhBatchId) {
    return;
  }

  if (["synced", "queued", "processing"].includes(syncStatus)) {
    throw new ApiError(
      409,
      "BATCH_SYNC_IN_PROGRESS",
      syncStatus === "synced"
        ? "This batch is already synced to SIDH and cannot be edited"
        : "This batch is currently syncing to SIDH. Wait for the push to finish before editing",
    );
  }
}

export async function updateBatch(actor: AuthSession, batchId: string, input: UpdateBatchInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  if (input.fee !== undefined) {
    try {
      assertValidBatchFee(input.fee);
    } catch (error) {
      throw new ApiError(400, "BATCH_FEE_INVALID", error instanceof Error ? error.message : "Batch fee must be greater than 0");
    }
  }

  const batch = await loadBatchWithScope(actor, batchId);
  await ensureBatchEditable(batch);

  const nextStartDate = input.startDate ? parseDate(input.startDate) : batch.startDate;
  const nextEndDate = input.endDate ? parseDate(input.endDate) : batch.endDate;
  const nextAssessmentDate = input.assessmentDate ? parseDate(input.assessmentDate) : batch.assessmentDate ?? null;
  const nextCenterId = input.centerId ?? batch.centerId;
  const nextCourseId = input.courseId ?? batch.courseId;
  const nextSchemeId = input.schemeId ?? batch.schemeId;
  const nextSyncEnabled = input.syncEnabled ?? batch.syncEnabled;

  ensureCenterAssignedForSync(nextCenterId, nextSyncEnabled);
  resolveScopedCenterFilter(actor, nextCenterId);
  await validateBatchMasterData({
    centerId: nextCenterId,
    courseId: nextCourseId,
    endDate: nextEndDate,
    schemeId: nextSchemeId,
    startDate: nextStartDate,
    syncEnabled: nextSyncEnabled,
  });

  if (input.batchCode && normalizeString(input.batchCode) !== batch.batchCode) {
    const existingBatch = await BatchModel.findOne({ batchCode: normalizeString(input.batchCode) }).select({ batchId: 1 });
    if (existingBatch) {
      throw new ApiError(409, "BATCH_EXISTS", "A batch with this code already exists");
    }
  }

  if (input.batchCode !== undefined) {
    batch.batchCode = normalizeString(input.batchCode);
  }
  if (input.batchName !== undefined) {
    batch.batchName = normalizeString(input.batchName) || null;
  }
  if (input.batchSize !== undefined) {
    batch.batchSize = input.batchSize;
  }
  if (input.courseId !== undefined) {
    batch.courseId = input.courseId;
  }
  if (input.schemeId !== undefined) {
    batch.schemeId = input.schemeId;
  }
  if (input.centerId !== undefined) {
    batch.centerId = input.centerId;
  }
  if (input.startDate !== undefined) {
    batch.startDate = nextStartDate;
  }
  if (input.endDate !== undefined) {
    batch.endDate = nextEndDate;
  }
  if (input.assessmentDate !== undefined) {
    batch.assessmentDate = nextAssessmentDate;
  }
  if (input.startTime !== undefined) {
    batch.startTime = input.startTime;
  }
  if (input.endTime !== undefined) {
    batch.endTime = input.endTime;
  }
  if (input.trainingHoursPerDay !== undefined) {
    batch.trainingHoursPerDay = input.trainingHoursPerDay;
  }
  if (input.fee !== undefined) {
    batch.fee = input.fee;
  }
  if (input.status !== undefined) {
    batch.status = input.status;
  }
  if (input.syncEnabled !== undefined) {
    batch.syncEnabled = input.syncEnabled;
  }
  if (input.allowAssessmentBeforeBatchEnd !== undefined) {
    batch.allowAssessmentBeforeBatchEnd = input.allowAssessmentBeforeBatchEnd;
  }
  if (input.allowCandidateOverlap !== undefined) {
    batch.allowCandidateOverlap = input.allowCandidateOverlap;
  }
  if (input.assessmentEligibilityThreshold !== undefined) {
    batch.assessmentEligibilityThreshold = input.assessmentEligibilityThreshold;
  }

  if (
    input.assessmentMode !== undefined ||
    input.batchType !== undefined ||
    input.categoryType !== undefined ||
    input.createdSource !== undefined ||
    input.feePaidBy !== undefined ||
    input.tpId !== undefined
  ) {
    const course = await ensureCourse(batch.courseId);
    const scheme = await ensureScheme(batch.schemeId);
    const program = course.programIds?.[0]
      ? ((await ProgramModel.findOne({ programId: course.programIds[0] }).select({
          assessmentMode: 1,
          batchCategoryType: 1,
          batchType: 1,
          createdSource: 1,
          feePaidBy: 1,
          name: 1,
          programId: 1,
          skillingCategoryId: 1,
          skillingCategoryName: 1,
          skillingCategoryScheme: 1,
        })) as ServiceProgram | null)
      : null;
    const sidhFields = resolveSidhBatchFieldSelection({
      batch: {
        assessmentMode: input.assessmentMode ?? batch.sidhAssessmentMode ?? undefined,
        batchType: input.batchType ?? batch.sidhBatchType ?? undefined,
        categoryType: input.categoryType ?? batch.sidhCategoryType ?? undefined,
        createdSource: input.createdSource ?? batch.sidhCreatedSource ?? undefined,
        feePaidBy: input.feePaidBy ?? batch.sidhFeePaidBy ?? undefined,
        tpId: input.tpId ?? batch.sidhTpId ?? undefined,
      },
      configuredTpId: getSidhBatchContext().tpId,
      program,
      scheme,
    });

    if (nextSyncEnabled && !sidhFields.tpId) {
      throw new ApiError(400, "SIDH_TP_ID_REQUIRED", "SIDH TP ID is required when batch sync is enabled");
    }

    batch.sidhAssessmentMode = sidhFields.assessmentMode;
    batch.sidhBatchType = sidhFields.batchType;
    batch.sidhCategoryType = sidhFields.categoryType;
    batch.sidhCreatedSource = sidhFields.createdSource;
    batch.sidhFeePaidBy = sidhFields.feePaidBy;
    batch.sidhTpId = sidhFields.tpId || null;
  }

  batch.updatedByUserId = actor.user.id;
  await (batch as never as { save: () => Promise<void> }).save();

  await writeAuditLog({
    action: "batch.updated",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: input,
    requestId,
  });

  await bustDashboardCaches();
  return getBatch(actor, batch.batchId);
}

export async function listBatches(actor: AuthSession, query: BatchListQuery): Promise<PagedList<ReturnType<typeof serializeBatch>>> {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const scopedCenterFilter = resolveScopedCenterFilter(actor, query.centerId);
  const searchRegex = createSearchRegex(query.search);
  const filter: Record<string, unknown> = {};

  if (scopedCenterFilter) {
    filter.centerId = Array.isArray(scopedCenterFilter) ? { $in: scopedCenterFilter } : scopedCenterFilter;
  }
  if (query.courseId) {
    filter.courseId = query.courseId;
  }
  if (query.schemeId) {
    filter.schemeId = query.schemeId;
  }
  if (query.status) {
    filter.status = query.status;
  }
  if (query.syncEnabled !== undefined) {
    filter.syncEnabled = query.syncEnabled;
  }
  if (searchRegex) {
    filter.$or = [{ batchCode: searchRegex }, { batchName: searchRegex }];
  }

  if (query.syncStatus) {
    const states = (await BatchSyncStateModel.find({ "batchSync.status": query.syncStatus }).select({ batchId: 1 })) as Array<{ batchId: string }>;
    filter.batchId = { $in: states.map((item) => item.batchId) };
  }

  const [items, total] = await Promise.all([
    BatchModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    BatchModel.countDocuments(filter),
  ]);
  const batches = items as ServiceBatch[];
  const syncStates = batches.length
    ? ((await BatchSyncStateModel.find({ batchId: { $in: batches.map((item) => item.batchId) } })) as ServiceBatchSyncState[])
    : [];
  const syncStateMap = new Map(syncStates.map((item) => [item.batchId, item]));

  return {
    items: batches.map((batch) => serializeBatch(batch, syncStateMap.get(batch.batchId))),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getBatch(actor: AuthSession, batchId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const [syncState, roster] = await Promise.all([
    ensureBatchSyncState(batch.batchId),
    loadBatchRoster(batch.batchId),
  ]);

  return serializeBatch(batch, syncState, roster.serialized);
}

export async function addCandidatesToBatch(actor: AuthSession, batchId: string, input: AddCandidatesToBatchInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const candidates = await validateCandidateAssignments(batch, input.candidateIds);
  const existingMemberships = (await BatchCandidateModel.find({ batchId: batch.batchId }).select({ candidateId: 1 })) as Array<{ candidateId: string }>;
  const existingIds = new Set(existingMemberships.map((item) => item.candidateId));
  const incomingCandidates = candidates.filter((candidate) => !existingIds.has(candidate.candidateId));

  await insertBatchCandidates(batch.batchId, actor.user.id, incomingCandidates);

  if (batch.centerId !== UNASSIGNED_CENTER_ID) {
    const adoptableCandidateIds = incomingCandidates
      .filter((candidate) => isSyntheticCandidateCenterId(candidate.centerId))
      .map((candidate) => candidate.candidateId);

    if (adoptableCandidateIds.length > 0) {
      await CandidateModel.updateMany(
        { candidateId: { $in: adoptableCandidateIds } },
        { $set: { centerId: batch.centerId, updatedByUserId: actor.user.id } },
      );
    }
  }

  batch.candidateCount = await refreshBatchCandidateCount(batch.batchId);
  batch.updatedByUserId = actor.user.id;
  await (batch as never as { save: () => Promise<void> }).save();

  await writeAuditLog({
    action: "batch.candidates.added",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { candidateIds: incomingCandidates.map((candidate) => candidate.candidateId) },
    requestId,
  });

  if (incomingCandidates.length > 0) {
    const syncState = await ensureBatchSyncState(batch.batchId);
    const effectiveSidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;

    if (effectiveSidhBatchId) {
      await queueEnrollmentSync(
        actor,
        batch.batchId,
        {
          candidateIds: incomingCandidates.map((candidate) => candidate.candidateId),
          forceResync: true,
        },
        requestId,
      );
    }
  }

  return getBatch(actor, batch.batchId);
}

export async function resolveSidhBatchIdForActor(actor: AuthSession, batchId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const syncState = await ensureBatchSyncState(batch.batchId);
  const sidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;

  if (!sidhBatchId) {
    throw new ApiError(
      400,
      "BATCH_NOT_SYNCED",
      "Batch must be synced to SIDH before certificates or assessments can be submitted",
    );
  }

  return { batch, sidhBatchId, syncState };
}

async function ensureBatchDeletable(batch: ServiceBatch) {
  if (batch.sidhBatchId) {
    throw new ApiError(409, "BATCH_ALREADY_SYNCED", "Synced batches cannot be deleted");
  }

  const syncState = await ensureBatchSyncState(batch.batchId);
  const syncStatus = syncState.batchSync?.status ?? "not_synced";
  const effectiveSidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;

  if (syncStatus === "synced" && !effectiveSidhBatchId) {
    return;
  }

  if (["synced", "queued", "processing"].includes(syncStatus)) {
    throw new ApiError(
      409,
      "BATCH_SYNC_IN_PROGRESS",
      syncStatus === "synced"
        ? "Synced batches cannot be deleted"
        : "This batch is currently syncing to SIDH and cannot be deleted yet",
    );
  }
}

export async function deleteBatch(actor: AuthSession, batchId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  await ensureBatchDeletable(batch);

  await Promise.all([
    BatchCandidateModel.deleteMany({ batchId: batch.batchId }),
    AttendanceRecordModel.deleteMany({ batchId: batch.batchId }),
    CandidateTrainingStatusHistoryModel.deleteMany({ batchId: batch.batchId }),
    BatchDailySessionModel.deleteMany({ batchId: batch.batchId }),
    AttendanceUploadModel.deleteMany({ batchId: batch.batchId }),
    BatchSyncStateModel.deleteOne({ batchId: batch.batchId }),
    BatchModel.deleteOne({ batchId: batch.batchId }),
  ]);

  await writeAuditLog({
    action: "batch.deleted",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { batchCode: batch.batchCode },
    requestId,
  });

  await bustDashboardCaches();
  return { batchId: batch.batchId, deleted: true };
}

export async function removeCandidateFromBatch(actor: AuthSession, batchId: string, candidateId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const batchCandidate = (await BatchCandidateModel.findOne({
    batchId: batch.batchId,
    candidateId: normalizeString(candidateId),
  })) as ServiceBatchCandidate | null;

  if (!batchCandidate) {
    throw new ApiError(404, "BATCH_CANDIDATE_NOT_FOUND", "Candidate is not assigned to the batch");
  }

  if (batch.sidhBatchId && batchCandidate.enrollmentStatus === "synced") {
    throw new ApiError(
      409,
      "CANDIDATE_ALREADY_ENROLLED",
      "This learner is already enrolled in SIDH and cannot be removed from the batch",
    );
  }

  const deleteResult = await BatchCandidateModel.deleteOne({ batchId: batch.batchId, candidateId: normalizeString(candidateId) });

  if (!deleteResult.deletedCount) {
    throw new ApiError(404, "BATCH_CANDIDATE_NOT_FOUND", "Candidate is not assigned to the batch");
  }

  await Promise.all([
    AttendanceRecordModel.deleteMany({ batchId: batch.batchId, candidateId: normalizeString(candidateId) }),
    CandidateTrainingStatusHistoryModel.deleteMany({ batchId: batch.batchId, candidateId: normalizeString(candidateId) }),
  ]);

  batch.candidateCount = await refreshBatchCandidateCount(batch.batchId);
  batch.updatedByUserId = actor.user.id;
  await (batch as never as { save: () => Promise<void> }).save();

  await writeAuditLog({
    action: "batch.candidate.removed",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { candidateId: normalizeString(candidateId) },
    requestId,
  });

  return getBatch(actor, batch.batchId);
}

export async function removeAllCandidatesFromBatch(actor: AuthSession, batchId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const filter = batch.sidhBatchId
    ? { batchId: batch.batchId, enrollmentStatus: { $ne: "synced" } }
    : { batchId: batch.batchId };
  const removableCandidates = (await BatchCandidateModel.find(filter).select({ candidateId: 1 })) as Array<{ candidateId: string }>;

  if (removableCandidates.length === 0) {
    throw new ApiError(404, "NO_REMOVABLE_CANDIDATES", "No removable learners were found in this batch");
  }

  const candidateIds = removableCandidates.map((candidate) => candidate.candidateId);

  await Promise.all([
    BatchCandidateModel.deleteMany(filter),
    AttendanceRecordModel.deleteMany({ batchId: batch.batchId, candidateId: { $in: candidateIds } }),
    CandidateTrainingStatusHistoryModel.deleteMany({ batchId: batch.batchId, candidateId: { $in: candidateIds } }),
  ]);

  batch.candidateCount = await refreshBatchCandidateCount(batch.batchId);
  batch.updatedByUserId = actor.user.id;
  await (batch as never as { save: () => Promise<void> }).save();

  await writeAuditLog({
    action: "batch.candidates.removed_all",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { candidateIds, removableOnly: Boolean(batch.sidhBatchId) },
    requestId,
  });

  return getBatch(actor, batch.batchId);
}

export async function queueBatchSync(actor: AuthSession, batchId: string, input: BatchSyncRequestInput, requestId?: string, options: { immediate?: boolean } = {}) {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  await validateBatchSyncEligibility(batch);
  const syncState = await ensureBatchSyncState(batch.batchId, actor.user.id);
  const currentStatus = syncState.batchSync?.status ?? "not_synced";
  const effectiveSidhBatchId = batch.sidhBatchId ?? syncState.sidhBatchId ?? null;
  const isTrulySynced = currentStatus === "synced" && Boolean(effectiveSidhBatchId);

  // Only skip when we already have both synced status AND a remote SIDH batch ID.
  // Incomplete "synced" rows (status set but id missing) must be allowed to push again.
  if (isTrulySynced && !input.forceResync) {
    return getBatchStatus(actor, batch.batchId);
  }

  // Reclaim stuck processing/queued locks so a retry can run after a hung SIDH create.
  syncState.batchSync = {
    ...(syncState.batchSync ?? {}),
    lastFailureCode: null,
    lastFailureMessage: null,
    lastJobId: createPrefixedId("bsjob"),
    lockId: null,
    lockedAt: null,
    nextRunAt: new Date(),
    retryCount:
      input.forceResync || currentStatus === "processing" || !effectiveSidhBatchId
        ? 0
        : syncState.batchSync?.retryCount ?? 0,
    status: "queued",
  };
  syncState.updatedByUserId = actor.user.id;
  await syncState.save?.();

  await writeAuditLog({
    action: "batch.sync.queued",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: {
      forceResync: input.forceResync,
      jobId: syncState.batchSync.lastJobId,
      previousStatus: currentStatus,
      previousSidhBatchId: effectiveSidhBatchId,
    },
    requestId,
  });

  if (options.immediate) {
    try {
      await processQueuedBatchSyncJobs(actor, { limit: 1, requestId });
    } catch (error) {
      console.error(`[SIDH batch sync] failed to process jobs for ${batch.batchId}`, error);
    }
  } else {
    await notifyBatchSyncQueue().catch((error) => {
      console.error(`[SIDH batch sync] failed to notify worker for ${batch.batchId}`, error);
    });
  }

  return getBatchStatus(actor, batch.batchId);
}

export async function linkBatchToSidh(
  actor: AuthSession,
  batchId: string,
  input: { sidhBatchId: string | number },
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  await validateBatchSyncEligibility(batch);

  const remoteBatchId = String(input.sidhBatchId).trim();
  if (!remoteBatchId) {
    throw new ApiError(400, "SIDH_BATCH_ID_REQUIRED", "SIDH batch ID is required");
  }

  const syncState = await ensureBatchSyncState(batch.batchId, actor.user.id);
  const now = new Date();

  batch.sidhBatchId = remoteBatchId;
  await (batch as never as { save: () => Promise<void> }).save();

  syncState.sidhBatchId = remoteBatchId;
  syncState.batchSync = {
    ...(syncState.batchSync ?? {}),
    lastAttemptAt: now,
    lastFailureCode: null,
    lastFailureMessage: null,
    lastSuccessAt: now,
    lockId: null,
    lockedAt: null,
    nextRunAt: null,
    remoteStatus: "active",
    retryCount: 0,
    status: "synced",
  };
  syncState.updatedByUserId = actor.user.id;
  await syncState.save?.();

  await writeAuditLog({
    action: "batch.sync.linked",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { remoteBatchId, source: "manual_link" },
    requestId,
  });

  return getBatchStatus(actor, batch.batchId);
}

export async function queueEnrollmentSync(actor: AuthSession, batchId: string, input: EnrollmentSyncRequestInput, requestId?: string, options: { immediate?: boolean } = {}) {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const candidateFilter = input.candidateIds?.length ? { candidateId: { $in: input.candidateIds }, batchId: batch.batchId } : { batchId: batch.batchId };
  const batchCandidates = (await BatchCandidateModel.find(candidateFilter)) as ServiceBatchCandidate[];

  if (batchCandidates.length === 0) {
    throw new ApiError(400, "BATCH_CANDIDATES_REQUIRED", "Select at least one batch candidate for enrollment sync");
  }

  const { syncState } = await validateEnrollmentEligibility(batch, batchCandidates);
  const candidateIds = batchCandidates.map((item) => item.candidateId);

  // Re-queue incomplete enrollments (synced status without a remote enrollment id) as well.
  await BatchCandidateModel.updateMany(
    {
      batchId: batch.batchId,
      candidateId: { $in: candidateIds },
      ...(input.forceResync
        ? {}
        : {
            $or: [
              { enrollmentStatus: { $nin: ["synced"] } },
              { enrollmentStatus: "synced", sidhEnrollmentId: { $in: [null, ""] } },
            ],
          }),
    },
    {
      $set: {
        enrollmentStatus: "queued",
        lastEnrollmentFailureCode: null,
        lastEnrollmentFailureMessage: null,
      },
    },
  );

  syncState.enrollmentSync = {
    ...(syncState.enrollmentSync ?? {}),
    lastFailureCode: null,
    lastFailureMessage: null,
    lastJobId: createPrefixedId("enjob"),
    lockId: null,
    lockedAt: null,
    nextRunAt: new Date(),
    retryCount: input.forceResync || syncState.enrollmentSync?.status === "processing" ? 0 : syncState.enrollmentSync?.retryCount ?? 0,
    status: "queued",
  };
  syncState.updatedByUserId = actor.user.id;
  await syncState.save?.();

  await writeAuditLog({
    action: "batch.enrollment_sync.queued",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { candidateIds, forceResync: input.forceResync },
    requestId,
  });

  if (options.immediate) {
    try {
      await processQueuedEnrollmentSyncJobs(actor, { limit: batchCandidates.length, requestId });
    } catch (error) {
      console.error(`[SIDH enrollment sync] failed to process jobs for ${batch.batchId}`, error);
    }

    return getBatchStatus(actor, batch.batchId);
  }

  try {
    await notifyEnrollmentSyncQueue();
  } catch (error) {
    console.error(`[SIDH enrollment sync] failed to notify worker for ${batch.batchId}`, error);
  }

  return getBatchStatus(actor, batch.batchId);
}

export async function getBatchStatus(actor: AuthSession, batchId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const [syncState, enrollmentBreakdown] = await Promise.all([
    ensureBatchSyncState(batch.batchId),
    BatchCandidateModel.aggregate([
      { $match: { batchId: batch.batchId } },
      { $group: { _id: "$enrollmentStatus", count: { $sum: 1 } } },
    ]),
  ]);

  const enrollmentCounts = enrollmentBreakdown.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item._id as string] = item.count as number;
    return accumulator;
  }, {});

  return {
    batchId: batch.batchId,
    batchCode: batch.batchCode,
    candidateCount: batch.candidateCount ?? 0,
    sidhBatchId: batch.sidhBatchId ?? syncState.sidhBatchId ?? null,
    batchSync: serializeSyncState(syncState.batchSync),
    enrollmentSync: serializeSyncState(syncState.enrollmentSync),
    enrollmentCounts,
  };
}

export async function createAttendanceImport(actor: AuthSession, batchId: string, fileName: string, fileBuffer: ArrayBuffer) {
  await connectToDatabase();
  ensureCanWriteAttendance(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const roster = await loadBatchRoster(batch.batchId);
  const rosterIdSet = new Set(roster.batchCandidates.map((item) => item.candidateId));
  const [worksheet] = await readWorkbookSheetsFromArrayBuffer(fileBuffer, { defaultValue: "" });

  if (!worksheet) {
    throw new ApiError(400, "ATTENDANCE_SHEET_MISSING", "The uploaded workbook does not contain a readable worksheet");
  }

  const rawRows = worksheet.rows;
  const seenKeys = new Set<string>();
  const rows = rawRows.map((row, index) => {
    const normalized = {
      attendanceDate: parseExcelDate(getAttendanceCellValue(row, ["attendancedate", "date", "sessiondate"])),
      attendanceStatus: normalizeAttendanceStatus(getAttendanceCellValue(row, ["attendancestatus", "status", "presentabsent", "attendance"])),
      candidateId: normalizeString(String(getAttendanceCellValue(row, ["candidateid", "candidatecode", "candidate"]) ?? "")),
      trainingStatus: normalizeTrainingStatus(getAttendanceCellValue(row, ["trainingstatus", "candidatetrainingstatus", "statusupdate"])),
    };

    const errors: Array<{ field?: string; message: string }> = [];

    try {
      attendanceImportRowSchema.parse({
        attendanceDate: normalized.attendanceDate,
        attendanceStatus: normalized.attendanceStatus,
        candidateId: normalized.candidateId,
        ...(normalized.trainingStatus ? { trainingStatus: normalized.trainingStatus } : {}),
      });
    } catch (error) {
      const apiError = error as { issues?: Array<{ path: Array<string | number>; message: string }> };
      for (const issue of apiError.issues ?? []) {
        errors.push({ field: String(issue.path[0] ?? "row"), message: issue.message });
      }
    }

    if (normalized.attendanceDate) {
      const attendanceDate = parseDate(normalized.attendanceDate);
      if (attendanceDate.getTime() < batch.startDate.getTime() || attendanceDate.getTime() > batch.endDate.getTime()) {
        errors.push({ field: "attendanceDate", message: "Attendance date must fall within the batch date range" });
      }
    }

    if (normalized.candidateId && !rosterIdSet.has(normalized.candidateId)) {
      errors.push({ field: "candidateId", message: "Candidate is not assigned to the selected batch" });
    }

    const dedupeKey = `${normalized.candidateId}|${normalized.attendanceDate}`;
    const isDuplicate = Boolean(normalized.candidateId && normalized.attendanceDate && seenKeys.has(dedupeKey));

    if (normalized.candidateId && normalized.attendanceDate) {
      seenKeys.add(dedupeKey);
    }

    return {
      attendanceDate: normalized.attendanceDate ? parseDate(normalized.attendanceDate) : null,
      attendanceStatus: normalized.attendanceStatus,
      candidateId: normalized.candidateId || null,
      errors,
      normalized,
      rowId: createPrefixedId("attrow"),
      rowNumber: index + 2,
      status: isDuplicate ? "duplicate" : errors.length > 0 ? "invalid" : "valid",
      trainingStatus: normalized.trainingStatus,
    } satisfies AttendanceUploadRow;
  });

  const upload = (await AttendanceUploadModel.create({
    attendanceUploadId: createPrefixedId("attup"),
    batchId: batch.batchId,
    committedRows: 0,
    createdByUserId: actor.user.id,
    fileName,
    invalidRows: rows.filter((row) => row.status !== "valid").length,
    rows,
    status: rows.every((row) => row.status === "valid") ? "validated" : "staged",
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
  })) as ServiceAttendanceUpload;

  await writeAuditLog({
    action: "attendance.import.staged",
    actorUserId: actor.user.id,
    entityId: upload.attendanceUploadId,
    entityType: "attendance_upload",
    metadata: { batchId: batch.batchId, fileName, totalRows: upload.totalRows },
  });

  return serializeAttendanceUpload(upload);
}

export async function getAttendanceImport(actor: AuthSession, jobId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const upload = (await AttendanceUploadModel.findOne({ attendanceUploadId: normalizeString(jobId) })) as ServiceAttendanceUpload | null;
  if (!upload) {
    throw new ApiError(404, "ATTENDANCE_IMPORT_NOT_FOUND", "Attendance import job not found");
  }

  await loadBatchWithScope(actor, upload.batchId);
  return serializeAttendanceUpload(upload);
}

export async function commitAttendanceImport(actor: AuthSession, jobId: string, input: AttendanceCommitInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteAttendance(actor);

  const upload = (await AttendanceUploadModel.findOne({ attendanceUploadId: normalizeString(jobId) })) as ServiceAttendanceUpload | null;
  if (!upload) {
    throw new ApiError(404, "ATTENDANCE_IMPORT_NOT_FOUND", "Attendance import job not found");
  }

  const batch = await loadBatchWithScope(actor, upload.batchId);

  if (upload.invalidRows > 0) {
    throw new ApiError(400, "ATTENDANCE_IMPORT_INVALID", "Attendance imports with invalid rows must be corrected before commit");
  }

  const validRows = upload.rows.filter((row) => row.status === "valid" && row.candidateId && row.attendanceDate && row.attendanceStatus);
  if (validRows.length === 0) {
    throw new ApiError(400, "ATTENDANCE_IMPORT_EMPTY", "No valid attendance rows are available to commit");
  }

  if (input.overwriteExisting) {
    await AttendanceRecordModel.deleteMany({
      $or: validRows.map((row) => ({
        attendanceDate: row.attendanceDate,
        batchId: batch.batchId,
        candidateId: row.candidateId,
      })),
    });
  } else {
    const existingRecord = await AttendanceRecordModel.findOne({
      $or: validRows.map((row) => ({
        attendanceDate: row.attendanceDate,
        batchId: batch.batchId,
        candidateId: row.candidateId,
      })),
    }).select({ attendanceRecordId: 1 });

    if (existingRecord) {
      throw new ApiError(409, "ATTENDANCE_RECORD_EXISTS", "Attendance already exists for at least one staged candidate-day combination");
    }
  }

  await AttendanceRecordModel.insertMany(
    validRows.map((row) => ({
      attendanceDate: row.attendanceDate,
      attendanceRecordId: createPrefixedId("attrec"),
      attendanceStatus: row.attendanceStatus,
      batchId: batch.batchId,
      candidateId: row.candidateId,
      committedAt: new Date(),
      committedByUserId: actor.user.id,
      sourceUploadId: upload.attendanceUploadId,
      trainingStatus: row.trainingStatus ?? null,
    })),
    { ordered: false },
  );

  const statusRows = validRows
    .filter((row) => row.trainingStatus)
    .map((row) => ({
      attendanceDate: row.attendanceDate as Date,
      batchId: batch.batchId,
      candidateId: row.candidateId as string,
      trainingStatus: row.trainingStatus ?? null,
    }));

  if (statusRows.length > 0) {
    await CandidateTrainingStatusHistoryModel.insertMany(
      statusRows.map((row) => ({
        batchId: row.batchId,
        candidateId: row.candidateId,
        candidateTrainingStatusHistoryId: createPrefixedId("ctsh"),
        createdByUserId: actor.user.id,
        effectiveDate: row.attendanceDate,
        sourceUploadId: upload.attendanceUploadId,
        trainingStatus: row.trainingStatus,
      })),
      { ordered: false },
    );

    const latestByCandidate = new Map<string, { attendanceDate: Date; trainingStatus: string }>();
    for (const row of statusRows) {
      const existing = latestByCandidate.get(row.candidateId);
      if (!existing || existing.attendanceDate.getTime() <= row.attendanceDate.getTime()) {
        latestByCandidate.set(row.candidateId, {
          attendanceDate: row.attendanceDate,
          trainingStatus: row.trainingStatus as string,
        });
      }
    }

    for (const [candidateId, latest] of latestByCandidate) {
      await CandidateModel.updateOne({ candidateId }, { $set: { trainingStatus: latest.trainingStatus } });
    }
  }

  await upsertDailySessions(
    batch.batchId,
    validRows.map((row) => row.attendanceDate as Date),
    upload.attendanceUploadId,
  );

  upload.committedAt = new Date();
  upload.committedRows = validRows.length;
  upload.status = "committed";
  await (upload as never as { save: () => Promise<void> }).save();

  await writeAuditLog({
    action: "attendance.import.committed",
    actorUserId: actor.user.id,
    entityId: upload.attendanceUploadId,
    entityType: "attendance_upload",
    metadata: { batchId: batch.batchId, committedRows: validRows.length, overwriteExisting: input.overwriteExisting },
    requestId,
  });

  return getAttendanceImport(actor, upload.attendanceUploadId);
}

export async function getBatchAttendanceSummary(actor: AuthSession, batchId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const [roster, dailySessions, records, latestStatuses] = await Promise.all([
    loadBatchRoster(batch.batchId),
    BatchDailySessionModel.find({ batchId: batch.batchId }).sort({ sessionDate: 1 }),
    AttendanceRecordModel.find({ batchId: batch.batchId }).sort({ attendanceDate: 1 }),
    CandidateTrainingStatusHistoryModel.find({ batchId: batch.batchId }).sort({ effectiveDate: -1, createdAt: -1 }),
  ]);

  const totalSessions = dailySessions.length;
  const statusMap = new Map<string, string>();
  for (const entry of latestStatuses as Array<{ candidateId: string; trainingStatus: string }>) {
    if (!statusMap.has(entry.candidateId)) {
      statusMap.set(entry.candidateId, entry.trainingStatus);
    }
  }

  const presentCountByCandidate = new Map<string, number>();
  for (const record of records as Array<{ attendanceStatus: string; candidateId: string }>) {
    if (record.attendanceStatus === "present") {
      presentCountByCandidate.set(record.candidateId, (presentCountByCandidate.get(record.candidateId) ?? 0) + 1);
    }
  }

  const candidateMap = new Map(roster.candidates.map((candidate) => [candidate.candidateId, candidate]));

  return {
    batchId: batch.batchId,
    assessmentEligibilityThreshold: batch.assessmentEligibilityThreshold,
    totalSessions,
    dailySessions: (dailySessions as Array<{ absentCount: number; expectedCandidateCount: number; presentCount: number; sessionDate: Date }>).map((session) => ({
      absentCount: session.absentCount,
      attendanceDate: toIsoDate(session.sessionDate)?.slice(0, 10) ?? null,
      expectedCandidateCount: session.expectedCandidateCount,
      presentCount: session.presentCount,
    })),
    candidates: roster.batchCandidates.map((membership) => {
      const candidate = candidateMap.get(membership.candidateId);
      const presentDays = presentCountByCandidate.get(membership.candidateId) ?? 0;
      const attendancePercentage = totalSessions === 0 ? 0 : Number(((presentDays / totalSessions) * 100).toFixed(2));
      const trainingStatus = statusMap.get(membership.candidateId) ?? candidate?.trainingStatus ?? null;

      return {
        attendancePercentage,
        candidateId: membership.candidateId,
        candidateName: candidate?.fullName ?? null,
        eligibleForAssessment: attendancePercentage >= batch.assessmentEligibilityThreshold && trainingStatus !== "dropout",
        enrolledAt: toIsoDate(membership.enrolledAt),
        enrollmentStatus: membership.enrollmentStatus,
        presentDays,
        sidhCandidateId: candidate?.sidhCandidateId ?? null,
        totalSessions,
        trainingStatus,
      };
    }),
  };
}

function classifyMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown sync failure";
}

function buildBatchPayload(
  batch: ServiceBatch,
  center: ServiceCenter | null,
  course: ServiceCourse,
  scheme: ServiceScheme,
  program: ServiceProgram | null,
  candidateCount: number,
) {
  return buildSidhBatchPayload({
    assessmentDate: batch.assessmentDate ?? batch.endDate,
    batchName: batch.batchName ?? batch.batchCode,
    batchSize: batch.batchSize ?? candidateCount,
    candidateCount,
    configuredTpId: getSidhBatchContext().tpId,
    course: {
      sidhCourseId: course.sidhCourseId,
      trainingPerDayHours: batch.trainingHoursPerDay ?? course.trainingPerDayHours,
    },
    endDate: batch.endDate,
    endTime: batch.endTime,
    fee: batch.fee,
    options: {
      assessmentMode: batch.sidhAssessmentMode ?? undefined,
      batchType: batch.sidhBatchType ?? undefined,
      categoryType: batch.sidhCategoryType ?? undefined,
      createdSource: batch.sidhCreatedSource ?? undefined,
      feePaidBy: batch.sidhFeePaidBy ?? undefined,
      tpId: batch.sidhTpId ?? undefined,
    },
    program: program
      ? {
          name: program.name,
          skillingCategoryId: program.skillingCategoryId,
          skillingCategoryName: program.skillingCategoryName,
          skillingCategoryScheme: program.skillingCategoryScheme,
          assessmentMode: program.assessmentMode,
          batchCategoryType: program.batchCategoryType,
          batchType: program.batchType,
          createdSource: program.createdSource,
          feePaidBy: program.feePaidBy,
        }
      : null,
    scheme: {
      assessmentMode: scheme.assessmentMode,
      batchCategoryType: scheme.batchCategoryType,
      batchType: scheme.batchType,
      createdSource: scheme.createdSource,
      fundingType: scheme.fundingType,
      sidhSchemeId: scheme.sidhSchemeId,
      sidhSchemeReferenceId: scheme.sidhSchemeReferenceId,
      sidhSchemeType: scheme.sidhSchemeType,
    },
    startDate: batch.startDate,
    startTime: batch.startTime,
    tcId: center?.sidhTcId,
  });
}

function buildEnrollmentPayload(batch: ServiceBatch, syncState: ServiceBatchSyncState, candidateIds: string[]) {
  const sidhBatchId = resolveSidhBatchId(syncState.sidhBatchId ?? batch.sidhBatchId);

  if (sidhBatchId === null) {
    throw new ApiError(400, "BATCH_NOT_SYNCED", "Batch must have a SIDH batch ID before enrollment sync");
  }

  return {
    batchId: sidhBatchId,
    candidateIds,
  };
}

async function claimNextBatchSyncState(now: Date, key: "batchSync" | "enrollmentSync") {
  return BatchSyncStateModel.findOneAndUpdate(
    {
      [`${key}.nextRunAt`]: { $lte: now },
      [`${key}.status`]: "queued",
    },
    {
      $set: {
        [`${key}.lockId`]: createPrefixedId("lock"),
        [`${key}.lockedAt`]: now,
        [`${key}.status`]: "processing",
      },
    },
    {
      new: true,
      sort: {
        [`${key}.nextRunAt`]: 1,
        createdAt: 1,
      },
    },
  );
}

const DEFERRED_BATCH_CLAIM_DELAY_MS = 5_000;

async function deferClaimedBatchSyncState(claimedState: ServiceBatchSyncState, key: "batchSync" | "enrollmentSync", state: QueuedSyncState, now: Date) {
  state.lockId = null;
  state.lockedAt = null;
  state.status = "queued";
  state.nextRunAt = new Date(now.getTime() + DEFERRED_BATCH_CLAIM_DELAY_MS);

  if (key === "batchSync") {
    claimedState.batchSync = state;
  } else {
    claimedState.enrollmentSync = state;
  }

  await claimedState.save?.();
}


async function claimAndProcessNextBatchSync(
  actor: AuthSession,
  connector: ReturnType<typeof createSidhConnector>,
  rateLimiter: RateLimiter,
  circuitBreaker: CircuitBreaker,
  now: () => Date,
  requestId?: string,
): Promise<ProcessBatchSyncJobsResult["jobs"][number] | null> {
  const claimedState = (await claimNextBatchSyncState(now(), "batchSync")) as ServiceBatchSyncState | null;

  if (!claimedState) {
    return null;
  }

  const state = getSyncStateValue(claimedState.batchSync);

  if (await circuitBreaker.isOpen()) {
    await deferClaimedBatchSyncState(claimedState, "batchSync", state, now());
    return null;
  }

  const attemptId = createPrefixedId("batatt");
  state.status = "processing";
  setAttempt(state, {
    attemptId,
    operation: "batch_sync",
    startedAt: now(),
    status: "processing",
  });
  claimedState.batchSync = state;

  const batch = (await BatchModel.findOne({ batchId: claimedState.batchId })) as ServiceBatch | null;

  if (!batch) {
    state.lockId = null;
    state.lockedAt = null;
    state.lastFailureCode = "BATCH_NOT_FOUND";
    state.lastFailureMessage = "Batch not found for sync processing";
    state.status = "manual_review";
    updateLastAttempt(state, {
      failureCode: "BATCH_NOT_FOUND",
      failureMessage: "Batch not found for sync processing",
      finishedAt: now(),
      retryable: false,
      status: "manual_review",
    });
    claimedState.batchSync = state;
    await claimedState.save?.();
    return {
      batchId: claimedState.batchId,
      message: "Batch not found for sync processing",
      remoteBatchId: null,
      status: "manual_review",
      syncStateId: claimedState.batchSyncStateId,
    };
  }

  try {
    const [{ center, course, program, scheme }, roster] = await Promise.all([
      validateBatchSyncEligibility(batch),
      loadBatchRoster(batch.batchId),
    ]);
    const payload = buildBatchPayload(batch, center, course, scheme, program, roster.batchCandidates.length);
    console.log(`[SIDH batch push] batchId=${batch.batchId}`);
    console.log(JSON.stringify(payload, null, 2));
    const fingerprint = computeFingerprint(payload);
    state.requestFingerprint = fingerprint;
    claimedState.batchSync = state;

    await rateLimiter.acquire();
    const result = await connector.createBatch({
      attemptId,
      payload,
      syncJobId: claimedState.batchSync.lastJobId ?? claimedState.batchSyncStateId,
    });
    await circuitBreaker.recordSuccess();

    batch.sidhBatchId = result.remoteBatchId;
    await (batch as never as { save: () => Promise<void> }).save();
    claimedState.sidhBatchId = result.remoteBatchId;
    state.lastAttemptAt = now();
    state.lastFailureCode = null;
    state.lastFailureMessage = null;
    state.lastSuccessAt = now();
    state.lockId = null;
    state.lockedAt = null;
    state.nextRunAt = null;
    state.remoteStatus = "active";
    state.retryCount = state.retryCount ?? 0;
    state.status = "synced";
    updateLastAttempt(state, {
      failureCode: null,
      failureMessage: null,
      finishedAt: now(),
      remoteId: result.remoteBatchId,
      requestFingerprint: fingerprint,
      responseCode: result.responseStatus,
      retryable: false,
      status: "succeeded",
    });
    claimedState.batchSync = state;
    await claimedState.save?.();

    await writeAuditLog({
      action: "batch.sync.succeeded",
      actorUserId: actor.user.id,
      entityId: batch.batchId,
      entityType: "batch",
      metadata: { attemptId, remoteBatchId: result.remoteBatchId },
      requestId,
    });

    await bustDashboardCaches();

    if (roster.batchCandidates.length > 0) {
      try {
        await queueEnrollmentSync(
          actor,
          batch.batchId,
          {
            candidateIds: roster.batchCandidates.map((membership) => membership.candidateId),
            forceResync: false,
          },
          requestId,
        );
      } catch (error) {
        console.error(`[SIDH enrollment sync] auto-queue failed for ${batch.batchId}`, error);
      }
    }

    return {
      batchId: batch.batchId,
      message: "Batch synced successfully",
      remoteBatchId: result.remoteBatchId,
      status: "succeeded",
      syncStateId: claimedState.batchSyncStateId,
    };
  } catch (error) {
    const connectorError =
      error instanceof SidhConnectorError
        ? error
        : error instanceof ApiError
          ? new SidhConnectorError({
              code: error.errorCode,
              manualReview: true,
              message: error.message,
              retryable: false,
              status: error.status,
            })
        : new SidhConnectorError({
            code: "BATCH_SYNC_FAILED",
            message: classifyMessage(error),
            retryable: true,
          });

    if (connectorError.retryable) {
      await circuitBreaker.recordFailure();
    } else {
      await circuitBreaker.recordSuccess();
    }

    if (connectorError.code === "SIDH_CONFLICT" && connectorError.remoteBatchId) {
      batch.sidhBatchId = connectorError.remoteBatchId;
      await (batch as never as { save: () => Promise<void> }).save();
      claimedState.sidhBatchId = connectorError.remoteBatchId;
      state.lastAttemptAt = now();
      state.lastFailureCode = null;
      state.lastFailureMessage = null;
      state.lastSuccessAt = now();
      state.lockId = null;
      state.lockedAt = null;
      state.nextRunAt = null;
      state.remoteStatus = "active";
      state.status = "synced";
      updateLastAttempt(state, {
        failureCode: null,
        failureMessage: null,
        finishedAt: now(),
        remoteId: connectorError.remoteBatchId,
        requestFingerprint: state.requestFingerprint ?? null,
        responseCode: connectorError.status,
        retryable: false,
        status: "succeeded",
      });
      claimedState.batchSync = state;
      await claimedState.save?.();
      return {
        batchId: batch.batchId,
        message: "Batch reconciled from SIDH conflict response",
        remoteBatchId: connectorError.remoteBatchId,
        status: "succeeded",
        syncStateId: claimedState.batchSyncStateId,
      };
    }

    const currentRetryCount = state.retryCount ?? 0;
    const maxAttempts = Math.max(1, state.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const nextRetryCount = currentRetryCount + 1;

    state.lastAttemptAt = now();
    state.lastFailureCode = connectorError.code;
    state.lastFailureMessage = connectorError.message;
    state.lockId = null;
    state.lockedAt = null;

    if (connectorError.retryable && nextRetryCount < maxAttempts) {
      state.nextRunAt = calculateNextRunAt(nextRetryCount, now());
      state.retryCount = nextRetryCount;
      state.status = "queued";
      updateLastAttempt(state, {
        failureCode: connectorError.code,
        failureMessage: connectorError.message,
        finishedAt: now(),
        responseCode: connectorError.status,
        retryable: true,
        status: "failed",
      });
    } else {
      state.nextRunAt = null;
      state.retryCount = nextRetryCount;
      state.status = connectorError.retryable ? "failed" : "manual_review";
      state.remoteStatus = connectorError.code === "SIDH_REMOTE_BATCH_CANCELLED" ? "cancelled" : state.remoteStatus;
      updateLastAttempt(state, {
        failureCode: connectorError.code,
        failureMessage: connectorError.message,
        finishedAt: now(),
        responseCode: connectorError.status,
        retryable: connectorError.retryable,
        status: connectorError.retryable ? "failed" : "manual_review",
      });
    }

    claimedState.batchSync = state;
    await claimedState.save?.();

    return {
      batchId: claimedState.batchId,
      message: connectorError.message,
      remoteBatchId: connectorError.remoteBatchId,
      status: state.status ?? "failed",
      syncStateId: claimedState.batchSyncStateId,
    };
  }
}

export async function processQueuedBatchSyncJobs(actor: AuthSession, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessBatchSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const rateLimiter = dependencies.rateLimiter ?? createInMemoryRateLimiter(FALLBACK_RATE_LIMITER_PER_SEC);
  const circuitBreaker = dependencies.circuitBreaker ?? createInMemoryCircuitBreaker(FALLBACK_CIRCUIT_BREAKER_OPTIONS);
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_BATCH_LIMIT, 5_000));
  const concurrency = Math.max(1, Math.min(dependencies.concurrency ?? DEFAULT_CONCURRENCY, limit));

  const jobs = await runConcurrentPool(limit, concurrency, () =>
    claimAndProcessNextBatchSync(actor, connector, rateLimiter, circuitBreaker, now, input.requestId),
  );

  return {
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}

/** Starts the always-on batch-create worker for this process, driven by the active queue driver. */
export function startBatchSyncWorker(actor: AuthSession, options: { concurrency?: number; requestIdPrefix?: string } = {}) {
  const env = getEnv();
  const runtime = getSidhRuntime();
  const driver = getQueueDriver();
  const concurrency = Math.max(1, options.concurrency ?? env.SIDH_PUSH_CONCURRENCY);

  return driver.runWorker(
    BATCH_SYNC_QUEUE,
    async () => {
      const result = await claimAndProcessNextBatchSync(
        actor,
        runtime.connector,
        runtime.rateLimiter,
        runtime.circuitBreaker,
        () => new Date(),
        options.requestIdPrefix ? `${options.requestIdPrefix}-${createPrefixedId("bswrun")}` : undefined,
      );
      return result !== null;
    },
    {
      concurrency,
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    },
  );
}

/** Wakes up the batch-create worker immediately instead of waiting for the next poll tick. */
export async function notifyBatchSyncQueue() {
  await getQueueDriver().notify(BATCH_SYNC_QUEUE);
}

/**
 * Claims exactly one queued enrollment-sync job and fully processes it. Returns `null` when
 * there is nothing left to claim, or when the SIDH circuit breaker is open (the claimed
 * state is released back to `queued` without consuming a retry attempt).
 */
async function claimAndProcessNextEnrollmentSync(
  actor: AuthSession,
  connector: ReturnType<typeof createSidhConnector>,
  rateLimiter: RateLimiter,
  circuitBreaker: CircuitBreaker,
  now: () => Date,
  requestId?: string,
): Promise<ProcessEnrollmentSyncJobsResult["jobs"][number] | null> {
  const claimedState = (await claimNextBatchSyncState(now(), "enrollmentSync")) as ServiceBatchSyncState | null;

  if (!claimedState) {
    return null;
  }

  const state = getSyncStateValue(claimedState.enrollmentSync);

  if (await circuitBreaker.isOpen()) {
    await deferClaimedBatchSyncState(claimedState, "enrollmentSync", state, now());
    return null;
  }

  const attemptId = createPrefixedId("enatt");
  state.status = "processing";
  setAttempt(state, {
    attemptId,
    operation: "enrollment_sync",
    startedAt: now(),
    status: "processing",
  });
  claimedState.enrollmentSync = state;

  const batch = (await BatchModel.findOne({ batchId: claimedState.batchId })) as ServiceBatch | null;
  if (!batch) {
    state.lockId = null;
    state.lockedAt = null;
    state.status = "manual_review";
    state.lastFailureCode = "BATCH_NOT_FOUND";
    state.lastFailureMessage = "Batch not found for enrollment sync processing";
    updateLastAttempt(state, {
      failureCode: "BATCH_NOT_FOUND",
      failureMessage: "Batch not found for enrollment sync processing",
      finishedAt: now(),
      retryable: false,
      status: "manual_review",
    });
    claimedState.enrollmentSync = state;
    await claimedState.save?.();
    return {
      batchId: claimedState.batchId,
      cancelledCount: 0,
      failedCount: 1,
      message: "Batch not found for enrollment sync processing",
      queuedCount: 0,
      status: "manual_review",
      succeededCount: 0,
      syncStateId: claimedState.batchSyncStateId,
    };
  }

  const queuedMemberships = (await BatchCandidateModel.find({ batchId: batch.batchId, enrollmentStatus: "queued" })) as ServiceBatchCandidate[];

  if (queuedMemberships.length === 0) {
    state.lockId = null;
    state.lockedAt = null;
    state.nextRunAt = null;
    state.status = "synced";
    updateLastAttempt(state, {
      failureCode: null,
      failureMessage: null,
      finishedAt: now(),
      retryable: false,
      status: "succeeded",
    });
    claimedState.enrollmentSync = state;
    await claimedState.save?.();
    return {
      batchId: batch.batchId,
      cancelledCount: 0,
      failedCount: 0,
      message: "No queued enrollments were found",
      queuedCount: 0,
      status: "succeeded",
      succeededCount: 0,
      syncStateId: claimedState.batchSyncStateId,
    };
  }

  try {
    await validateEnrollmentEligibility(batch, queuedMemberships);
      const candidates = (await CandidateModel.find({ candidateId: { $in: queuedMemberships.map((item) => item.candidateId) } }).select({
        candidateId: 1,
        fullName: 1,
        mobileNumber: 1,
        registrationMode: 1,
        sidhCandidateId: 1,
      })) as ServiceCandidate[];
      const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
      let succeededCount = 0;
      let failedCount = 0;
      let cancelledCount = 0;
      let terminalJob: ProcessEnrollmentSyncJobsResult["jobs"][number] | null = null;
      const eligibleMemberships: ServiceBatchCandidate[] = [];
      const sidhCandidateIds: string[] = [];

      for (const membership of queuedMemberships) {
        const candidate = candidateMap.get(membership.candidateId);

        if (!candidate?.sidhCandidateId) {
          membership.enrollmentStatus = "manual_review";
          membership.lastEnrollmentFailureCode = "CANDIDATE_NOT_SYNCED";
          membership.lastEnrollmentFailureMessage = "Candidate must have a SIDH candidate ID before enrollment sync";
          membership.lastEnrollmentSyncAt = now();
          await (membership as never as { save: () => Promise<void> }).save();
          failedCount += 1;
          continue;
        }

        eligibleMemberships.push(membership);
        sidhCandidateIds.push(candidate.sidhCandidateId);
      }

      if (eligibleMemberships.length > 0) {
        const payload = buildEnrollmentPayload(batch, claimedState, sidhCandidateIds);
        state.requestFingerprint = computeFingerprint(payload);

        try {
          await rateLimiter.acquire();
          const result = await connector.enrollCandidate({
            attemptId,
            payload,
            syncJobId: state.lastJobId ?? claimedState.batchSyncStateId,
          });
          await circuitBreaker.recordSuccess();

          for (const membership of eligibleMemberships) {
            membership.enrollmentStatus = "synced";
            membership.enrolledAt = now();
            membership.lastEnrollmentFailureCode = null;
            membership.lastEnrollmentFailureMessage = null;
            membership.lastEnrollmentSyncAt = now();
            membership.remoteStatus = "active";
            membership.sidhEnrollmentId = result.remoteEnrollmentId;
            await (membership as never as { save: () => Promise<void> }).save();
          }

          succeededCount = eligibleMemberships.length;
        } catch (error) {
          const connectorError =
            error instanceof SidhConnectorError
              ? error
              : error instanceof ApiError
                ? new SidhConnectorError({
                    code: error.errorCode,
                    manualReview: true,
                    message: error.message,
                    retryable: false,
                    status: error.status,
                  })
              : new SidhConnectorError({
                  code: "ENROLLMENT_SYNC_FAILED",
                  message: classifyMessage(error),
                  retryable: true,
                });

          if (connectorError.retryable) {
            await circuitBreaker.recordFailure();
          } else {
            await circuitBreaker.recordSuccess();
          }

          if (connectorError.code === "SIDH_REMOTE_BATCH_CANCELLED") {
            claimedState.batchSync = {
              ...(claimedState.batchSync ?? {}),
              remoteStatus: "cancelled",
            };
            state.remoteStatus = "cancelled";
            state.status = "cancelled";
            state.lockId = null;
            state.lockedAt = null;
            state.nextRunAt = null;
            updateLastAttempt(state, {
              failureCode: connectorError.code,
              failureMessage: connectorError.message,
              finishedAt: now(),
              responseCode: connectorError.status,
              retryable: false,
              status: "manual_review",
            });
            claimedState.enrollmentSync = state;
            await BatchCandidateModel.updateMany(
              { batchId: batch.batchId, enrollmentStatus: "queued" },
              {
                $set: {
                  enrollmentStatus: "cancelled",
                  lastEnrollmentFailureCode: connectorError.code,
                  lastEnrollmentFailureMessage: connectorError.message,
                  lastEnrollmentSyncAt: now(),
                  remoteStatus: "cancelled",
                },
              },
            );
            cancelledCount = await BatchCandidateModel.countDocuments({ batchId: batch.batchId, enrollmentStatus: "cancelled" });
            await claimedState.save?.();
            terminalJob = {
              batchId: batch.batchId,
              cancelledCount,
              failedCount,
              message: connectorError.message,
              queuedCount: 0,
              status: "cancelled",
              succeededCount,
              syncStateId: claimedState.batchSyncStateId,
            };
          } else if (connectorError.code === "SIDH_CONFLICT") {
            for (const membership of eligibleMemberships) {
              membership.enrollmentStatus = "synced";
              membership.enrolledAt = now();
              membership.lastEnrollmentFailureCode = null;
              membership.lastEnrollmentFailureMessage = null;
              membership.lastEnrollmentSyncAt = now();
              await (membership as never as { save: () => Promise<void> }).save();
            }
            succeededCount = eligibleMemberships.length;
          } else if (connectorError.retryable) {
            const nextRetryCount = (state.retryCount ?? 0) + 1;
            const maxAttempts = Math.max(1, state.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

            for (const membership of eligibleMemberships) {
              membership.enrollmentStatus = "queued";
              membership.lastEnrollmentFailureCode = connectorError.code;
              membership.lastEnrollmentFailureMessage = connectorError.message;
              membership.lastEnrollmentSyncAt = now();
              await (membership as never as { save: () => Promise<void> }).save();
            }

            state.lastAttemptAt = now();
            state.lastFailureCode = connectorError.code;
            state.lastFailureMessage = connectorError.message;
            state.lockId = null;
            state.lockedAt = null;
            state.retryCount = nextRetryCount;
            state.nextRunAt = nextRetryCount < maxAttempts ? calculateNextRunAt(nextRetryCount, now()) : null;
            state.status = nextRetryCount < maxAttempts ? "queued" : "failed";
            updateLastAttempt(state, {
              failureCode: connectorError.code,
              failureMessage: connectorError.message,
              finishedAt: now(),
              responseCode: connectorError.status,
              retryable: true,
              status: "failed",
            });
            claimedState.enrollmentSync = state;
            await claimedState.save?.();
            terminalJob = {
              batchId: batch.batchId,
              cancelledCount,
              failedCount: failedCount + eligibleMemberships.length,
              message: connectorError.message,
              queuedCount: await BatchCandidateModel.countDocuments({ batchId: batch.batchId, enrollmentStatus: "queued" }),
              status: state.status ?? "failed",
              succeededCount,
              syncStateId: claimedState.batchSyncStateId,
            };
          } else {
            for (const membership of eligibleMemberships) {
              membership.enrollmentStatus = "manual_review";
              membership.lastEnrollmentFailureCode = connectorError.code;
              membership.lastEnrollmentFailureMessage = connectorError.message;
              membership.lastEnrollmentSyncAt = now();
              await (membership as never as { save: () => Promise<void> }).save();
            }
            failedCount += eligibleMemberships.length;
          }
        }
      }

      if (terminalJob) {
        return terminalJob;
      }

      state.lastAttemptAt = now();
      state.lastFailureCode = failedCount > 0 ? "ENROLLMENT_MANUAL_REVIEW" : null;
      state.lastFailureMessage = failedCount > 0 ? "One or more candidates require manual review" : null;
      state.lastSuccessAt = succeededCount > 0 ? now() : state.lastSuccessAt ?? null;
      state.lockId = null;
      state.lockedAt = null;
      state.nextRunAt = null;
      state.status = failedCount > 0 ? "manual_review" : "synced";
      updateLastAttempt(state, {
        failureCode: state.lastFailureCode ?? null,
        failureMessage: state.lastFailureMessage ?? null,
        finishedAt: now(),
        retryable: false,
        status: failedCount > 0 ? "manual_review" : "succeeded",
      });
      claimedState.enrollmentSync = state;
      await claimedState.save?.();

      return {
        batchId: batch.batchId,
        cancelledCount,
        failedCount,
        message: failedCount > 0 ? "Enrollment sync completed with manual review items" : "Enrollment sync completed",
        queuedCount: await BatchCandidateModel.countDocuments({ batchId: batch.batchId, enrollmentStatus: "queued" }),
        status: failedCount > 0 ? "manual_review" : "succeeded",
        succeededCount,
        syncStateId: claimedState.batchSyncStateId,
      };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(500, "ENROLLMENT_SYNC_FAILED", classifyMessage(error));
    state.lastAttemptAt = now();
    state.lastFailureCode = apiError.errorCode;
    state.lastFailureMessage = apiError.message;
    state.lockId = null;
    state.lockedAt = null;
    state.nextRunAt = null;
    state.status = "manual_review";
    updateLastAttempt(state, {
      failureCode: apiError.errorCode,
      failureMessage: apiError.message,
      finishedAt: now(),
      retryable: false,
      status: "manual_review",
    });
    claimedState.enrollmentSync = state;
    await claimedState.save?.();
    return {
      batchId: claimedState.batchId,
      cancelledCount: 0,
      failedCount: 1,
      message: apiError.message,
      queuedCount: await BatchCandidateModel.countDocuments({ batchId: claimedState.batchId, enrollmentStatus: "queued" }),
      status: "manual_review",
      succeededCount: 0,
      syncStateId: claimedState.batchSyncStateId,
    };
  }
}

export async function processQueuedEnrollmentSyncJobs(actor: AuthSession, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessEnrollmentSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const rateLimiter = dependencies.rateLimiter ?? createInMemoryRateLimiter(FALLBACK_RATE_LIMITER_PER_SEC);
  const circuitBreaker = dependencies.circuitBreaker ?? createInMemoryCircuitBreaker(FALLBACK_CIRCUIT_BREAKER_OPTIONS);
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_BATCH_LIMIT, 5_000));
  const concurrency = Math.max(1, Math.min(dependencies.concurrency ?? DEFAULT_CONCURRENCY, limit));

  const jobs = await runConcurrentPool(limit, concurrency, () =>
    claimAndProcessNextEnrollmentSync(actor, connector, rateLimiter, circuitBreaker, now, input.requestId),
  );

  return {
    cancelledCount: jobs.reduce((total, job) => total + job.cancelledCount, 0),
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}

/** Starts the always-on enrollment worker for this process, driven by the active queue driver. */
export function startEnrollmentSyncWorker(actor: AuthSession, options: { concurrency?: number; requestIdPrefix?: string } = {}) {
  const env = getEnv();
  const runtime = getSidhRuntime();
  const driver = getQueueDriver();
  const concurrency = Math.max(1, options.concurrency ?? env.SIDH_PUSH_CONCURRENCY);

  return driver.runWorker(
    ENROLLMENT_SYNC_QUEUE,
    async () => {
      const result = await claimAndProcessNextEnrollmentSync(
        actor,
        runtime.connector,
        runtime.rateLimiter,
        runtime.circuitBreaker,
        () => new Date(),
        options.requestIdPrefix ? `${options.requestIdPrefix}-${createPrefixedId("eswrun")}` : undefined,
      );
      return result !== null;
    },
    {
      concurrency,
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    },
  );
}

/** Wakes up the enrollment worker immediately instead of waiting for the next poll tick. */
export async function notifyEnrollmentSyncQueue() {
  await getQueueDriver().notify(ENROLLMENT_SYNC_QUEUE);
}