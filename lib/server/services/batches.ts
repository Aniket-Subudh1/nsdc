import { createHash } from "node:crypto";

import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { readWorkbookSheetsFromArrayBuffer } from "@/lib/spreadsheet/node";
import { excelSerialToDate } from "@/lib/spreadsheet/shared";
import { AttendanceRecordModel } from "@/lib/server/models/attendance-record";
import { AttendanceUploadModel } from "@/lib/server/models/attendance-upload";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchDailySessionModel } from "@/lib/server/models/batch-daily-session";
import { BatchModel } from "@/lib/server/models/batch";
import { BatchSyncStateModel } from "@/lib/server/models/batch-sync-state";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CandidateTrainingStatusHistoryModel } from "@/lib/server/models/candidate-training-status-history";
import { CourseModel } from "@/lib/server/models/course";
import { SchemeModel } from "@/lib/server/models/scheme";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import {
  canAccessCenters,
  canManageAttendance,
  canManageBatchSync,
  canManageBatches,
  getPermissionsForRoles,
} from "@/lib/server/rbac";
import { SIDH_BATCH_DEFAULTS } from "@/lib/server/sidh-defaults";
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
  sidhBatchId?: string | null;
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
  validityEndDate: Date;
  validityStartDate: Date;
};

type ServiceScheme = {
  beneficiaryType?: string | null;
  fundingType?: string | null;
  name: string;
  schemeId: string;
  sidhSchemeId?: string | null;
  status: string;
  syncEnabled: boolean;
  validFrom?: Date | null;
  validTo?: Date | null;
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
  connector?: ReturnType<typeof createSidhConnector>;
  now?: () => Date;
};

const ACTIVE_BATCH_STATUSES = ["draft", "ready", "active"];
const UNASSIGNED_CENTER_ID = "unassigned";

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
    beneficiaryType: 1,
    fundingType: 1,
    name: 1,
    schemeId: 1,
    sidhSchemeId: 1,
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
    if (!center.sidhTcId) {
      throw new ApiError(400, "CENTER_SIDH_TC_ID_MISSING", "Selected training center is missing SIDH TC metadata");
    }

    if (!center.verifiedForSidh) {
      throw new ApiError(400, "CENTER_NOT_VERIFIED", "Verify the training center before using it for SIDH sync");
    }

    if (!course.sidhCourseId) {
      throw new ApiError(400, "COURSE_SIDH_MAPPING_MISSING", "Selected course is missing SIDH mapping metadata");
    }

    if (!scheme.syncEnabled || !scheme.sidhSchemeId) {
      throw new ApiError(400, "SCHEME_SYNC_METADATA_INCOMPLETE", "Selected scheme is missing required SIDH sync metadata");
    }
  }

  return { center, course, scheme };
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

async function validateCandidateAssignments(batch: ServiceBatch, candidateIds: string[]) {
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

  for (const candidate of candidates) {
    if (!candidate.sidhCandidateId) {
      throw new ApiError(
        400,
        "CANDIDATE_NOT_VERIFIED_FOR_SIDH",
        `Candidate ${candidate.candidateId} must have a verified SIDH candidate ID before batch assignment`,
      );
    }

    const candidateSyncStatus = candidate.syncState?.status ?? (candidate.registrationMode === "existing_sidh_link" ? "linked" : null);
    if (candidateSyncStatus && !["linked", "synced"].includes(candidateSyncStatus)) {
      throw new ApiError(
        400,
        "CANDIDATE_NOT_VERIFIED_FOR_SIDH",
        `Candidate ${candidate.candidateId} must be verified on SIDH before batch assignment`,
      );
    }

    if (batch.centerId !== UNASSIGNED_CENTER_ID && candidate.centerId !== batch.centerId) {
      throw new ApiError(400, "CANDIDATE_CENTER_MISMATCH", `Candidate ${candidate.candidateId} is assigned to a different center`);
    }

    const age = calculateAge(candidate.dateOfBirth, batch.startDate);
    if (age < course.minimumAge) {
      throw new ApiError(400, "CANDIDATE_MINIMUM_AGE", `Candidate ${candidate.candidateId} does not satisfy the course minimum age`);
    }

    if ((course.programIds ?? []).length > 0 && !(course.programIds ?? []).includes(candidate.programId)) {
      throw new ApiError(400, "CANDIDATE_PROGRAM_MISMATCH", `Candidate ${candidate.candidateId} is not aligned to the batch course program mapping`);
    }
  }

  if (!batch.allowCandidateOverlap) {
    const otherMemberships = (await BatchCandidateModel.find({
      batchId: { $ne: batch.batchId },
      candidateId: { $in: incomingIds },
    }).select({ batchId: 1, candidateId: 1 })) as Array<{ batchId: string; candidateId: string }>;

    if (otherMemberships.length > 0) {
      const overlappingBatchIds = [...new Set(otherMemberships.map((membership) => membership.batchId))];
      const overlappingBatches = (await BatchModel.find({
        batchId: { $in: overlappingBatchIds },
        status: { $in: ACTIVE_BATCH_STATUSES },
        startDate: { $lte: batch.endDate },
        endDate: { $gte: batch.startDate },
      }).select({ batchId: 1 })) as Array<{ batchId: string }>;

      if (overlappingBatches.length > 0) {
        const conflictingBatchIdSet = new Set(overlappingBatches.map((item) => item.batchId));
        const conflict = otherMemberships.find((membership) => conflictingBatchIdSet.has(membership.batchId));

        if (conflict) {
          throw new ApiError(
            409,
            "CANDIDATE_BATCH_OVERLAP",
            `Candidate ${conflict.candidateId} already belongs to a conflicting active batch`,
          );
        }
      }
    }
  }

  return candidates;
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

    return parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = normalizeString(String(value ?? ""));
  if (!normalized) {
    return "";
  }

  const slashMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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

function calculateNextRunAt(retryCount: number, now: Date) {
  const delaySeconds = Math.min(5 * 2 ** Math.max(retryCount - 1, 0), 30);
  return new Date(now.getTime() + delaySeconds * 1000);
}

async function validateBatchSyncEligibility(batch: ServiceBatch) {
  if (batch.centerId !== UNASSIGNED_CENTER_ID) {
    return validateBatchMasterData({
      centerId: batch.centerId,
      courseId: batch.courseId,
      endDate: batch.endDate,
      schemeId: batch.schemeId,
      startDate: batch.startDate,
      syncEnabled: batch.syncEnabled,
    });
  }

  const [course, scheme] = await Promise.all([ensureCourse(batch.courseId), ensureScheme(batch.schemeId)]);

  if (course.status !== "active" || course.approvalStatus !== "approved") {
    throw new ApiError(400, "COURSE_NOT_SYNC_ELIGIBLE", "Selected course mapping is not approved and active");
  }

  if (course.validityStartDate.getTime() > batch.startDate.getTime() || course.validityEndDate.getTime() < batch.endDate.getTime()) {
    throw new ApiError(400, "COURSE_VALIDITY_INVALID", "Selected course mapping is not valid for the requested batch dates");
  }

  if ((course.schemeIds ?? []).length > 0 && !(course.schemeIds ?? []).includes(batch.schemeId)) {
    throw new ApiError(400, "COURSE_SCHEME_MISMATCH", "Selected course is not mapped to the chosen scheme");
  }

  return { center: null, course, scheme };
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
  const centerId = normalizeString(input.centerId) || UNASSIGNED_CENTER_ID;
  const hasAssignedCenter = centerId !== UNASSIGNED_CENTER_ID;

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

  const batch = (await BatchModel.create({
    assessmentDate,
    assessmentEligibilityThreshold: input.assessmentEligibilityThreshold,
    allowAssessmentBeforeBatchEnd: input.allowAssessmentBeforeBatchEnd,
    allowCandidateOverlap: input.allowCandidateOverlap,
    batchCode: normalizeString(input.batchCode),
    batchId: createPrefixedId("bat"),
    batchName: normalizeString(input.batchName) || null,
    batchSize: input.batchSize,
    centerId,
    courseId: input.courseId,
    createdByUserId: actor.user.id,
    endDate,
    endTime: input.endTime,
    fee: input.fee,
    schemeId: input.schemeId,
    startDate,
    startTime: input.startTime,
    status: input.status,
    syncEnabled: input.syncEnabled,
    trainingHoursPerDay: input.trainingHoursPerDay,
    updatedByUserId: actor.user.id,
  })) as ServiceBatch;

  const syncState = await ensureBatchSyncState(batch.batchId, actor.user.id);

  if (input.syncEnabled) {
    syncState.batchSync = {
      ...(syncState.batchSync ?? {}),
      lastFailureCode: null,
      lastFailureMessage: null,
      lastJobId: createPrefixedId("bsjob"),
      lockId: null,
      lockedAt: null,
      nextRunAt: new Date(),
      retryCount: 0,
      status: "queued",
    };
    syncState.updatedByUserId = actor.user.id;
    await syncState.save?.();
    await processQueuedBatchSyncJobs(actor, { limit: 5, requestId }).catch(() => undefined);
  }

  if (input.candidateIds.length > 0) {
    await addCandidatesToBatch(actor, batch.batchId, { candidateIds: input.candidateIds }, requestId);
  }

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

  return getBatch(actor, batch.batchId);
}

export async function updateBatch(actor: AuthSession, batchId: string, input: UpdateBatchInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const nextStartDate = input.startDate ? parseDate(input.startDate) : batch.startDate;
  const nextEndDate = input.endDate ? parseDate(input.endDate) : batch.endDate;
  const nextAssessmentDate = input.assessmentDate ? parseDate(input.assessmentDate) : batch.assessmentDate ?? null;
  const nextCenterId = input.centerId ?? batch.centerId;
  const nextCourseId = input.courseId ?? batch.courseId;
  const nextSchemeId = input.schemeId ?? batch.schemeId;
  const nextSyncEnabled = input.syncEnabled ?? batch.syncEnabled;

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

  if (incomingCandidates.length > 0) {
    await BatchCandidateModel.insertMany(
      incomingCandidates.map((candidate) => ({
        addedByUserId: actor.user.id,
        batchCandidateId: createPrefixedId("batc"),
        batchId: batch.batchId,
        candidateId: candidate.candidateId,
      })),
      { ordered: false },
    );
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

  return getBatch(actor, batch.batchId);
}

export async function removeCandidateFromBatch(actor: AuthSession, batchId: string, candidateId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
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

export async function queueBatchSync(actor: AuthSession, batchId: string, input: BatchSyncRequestInput, requestId?: string) {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  await validateBatchSyncEligibility(batch);
  const syncState = await ensureBatchSyncState(batch.batchId, actor.user.id);

  if (syncState.batchSync?.status === "synced" && !input.forceResync) {
    return getBatchStatus(actor, batch.batchId);
  }

  syncState.batchSync = {
    ...(syncState.batchSync ?? {}),
    lastFailureCode: null,
    lastFailureMessage: null,
    lastJobId: createPrefixedId("bsjob"),
    lockId: null,
    lockedAt: null,
    nextRunAt: new Date(),
    retryCount: input.forceResync ? 0 : syncState.batchSync?.retryCount ?? 0,
    status: "queued",
  };
  syncState.updatedByUserId = actor.user.id;
  await syncState.save?.();

  await writeAuditLog({
    action: "batch.sync.queued",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { forceResync: input.forceResync, jobId: syncState.batchSync.lastJobId },
    requestId,
  });

  await processQueuedBatchSyncJobs(actor, { limit: 5, requestId }).catch(() => undefined);

  return getBatchStatus(actor, batch.batchId);
}

export async function queueEnrollmentSync(actor: AuthSession, batchId: string, input: EnrollmentSyncRequestInput, requestId?: string) {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const candidateFilter = input.candidateIds?.length ? { candidateId: { $in: input.candidateIds }, batchId: batch.batchId } : { batchId: batch.batchId };
  const batchCandidates = (await BatchCandidateModel.find(candidateFilter)) as ServiceBatchCandidate[];

  if (batchCandidates.length === 0) {
    throw new ApiError(400, "BATCH_CANDIDATES_REQUIRED", "Select at least one batch candidate for enrollment sync");
  }

  const { syncState } = await validateEnrollmentEligibility(batch, batchCandidates);

  await BatchCandidateModel.updateMany(
    {
      batchId: batch.batchId,
      candidateId: { $in: batchCandidates.map((item) => item.candidateId) },
      ...(input.forceResync ? {} : { enrollmentStatus: { $nin: ["synced"] } }),
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
    retryCount: input.forceResync ? 0 : syncState.enrollmentSync?.retryCount ?? 0,
    status: "queued",
  };
  syncState.updatedByUserId = actor.user.id;
  await syncState.save?.();

  await writeAuditLog({
    action: "batch.enrollment_sync.queued",
    actorUserId: actor.user.id,
    entityId: batch.batchId,
    entityType: "batch",
    metadata: { candidateIds: batchCandidates.map((item) => item.candidateId), forceResync: input.forceResync },
    requestId,
  });

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

function buildBatchPayload(batch: ServiceBatch, center: ServiceCenter | null, course: ServiceCourse, scheme: ServiceScheme, candidateCount: number) {
  const assessmentDate = toIsoDate(batch.assessmentDate)?.slice(0, 10) ?? "";

  return {
    assessmentEndDate: assessmentDate,
    assessmentMode: SIDH_BATCH_DEFAULTS.assessmentMode,
    assessmentStartDate: assessmentDate,
    batchEndDate: toIsoDate(batch.endDate)?.slice(0, 10) ?? "",
    batchEndTime: batch.endTime ?? "17:00",
    batchFee: {
      totalFees: batch.fee ?? 0,
    },
    batchName: batch.batchName ?? batch.batchCode,
    batchStartDate: toIsoDate(batch.startDate)?.slice(0, 10) ?? "",
    batchStartTime: batch.startTime ?? "09:00",
    batchType: SIDH_BATCH_DEFAULTS.batchType,
    courseId: course.sidhCourseId,
    createdSource: SIDH_BATCH_DEFAULTS.createdSource,
    feePaidBy: SIDH_BATCH_DEFAULTS.feePaidBy,
    schemeId: scheme.sidhSchemeId ?? SIDH_BATCH_DEFAULTS.schemeId,
    schemeReferenceId: SIDH_BATCH_DEFAULTS.schemeReferenceId,
    schemeType: SIDH_BATCH_DEFAULTS.schemeType,
    size: Math.min(batch.batchSize ?? candidateCount, 80),
    skillingCategory: {
      id: SIDH_BATCH_DEFAULTS.skillingCategoryId,
      name: SIDH_BATCH_DEFAULTS.skillingCategoryName,
      scheme: SIDH_BATCH_DEFAULTS.scheme,
    },
    tcId: center?.sidhTcId ?? "",
    trainingHoursPerDay: batch.trainingHoursPerDay ?? 8,
    type: SIDH_BATCH_DEFAULTS.type,
  };
}

function buildEnrollmentPayload(batch: ServiceBatch, syncState: ServiceBatchSyncState, _batchCandidate: ServiceBatchCandidate, candidate: ServiceCandidate) {
  return {
    batchId: syncState.sidhBatchId ?? batch.sidhBatchId,
    candidateIds: [candidate.sidhCandidateId as string],
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

export async function processQueuedBatchSyncJobs(actor: AuthSession, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessBatchSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? 5, 25));
  const jobs: ProcessBatchSyncJobsResult["jobs"] = [];

  for (let index = 0; index < limit; index += 1) {
    const claimedState = (await claimNextBatchSyncState(now(), "batchSync")) as ServiceBatchSyncState | null;

    if (!claimedState) {
      break;
    }

    const state = getSyncStateValue(claimedState.batchSync);
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
      jobs.push({
        batchId: claimedState.batchId,
        message: "Batch not found for sync processing",
        remoteBatchId: null,
        status: "manual_review",
        syncStateId: claimedState.batchSyncStateId,
      });
      continue;
    }

    try {
      const [{ center, course, scheme }, roster] = await Promise.all([
        validateBatchSyncEligibility(batch),
        loadBatchRoster(batch.batchId),
      ]);
      const payload = buildBatchPayload(batch, center, course, scheme, roster.batchCandidates.length);
      const fingerprint = computeFingerprint(payload);
      state.requestFingerprint = fingerprint;
      claimedState.batchSync = state;

      const result = await connector.createBatch({
        attemptId,
        payload,
        syncJobId: claimedState.batchSync.lastJobId ?? claimedState.batchSyncStateId,
      });

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
        requestId: input.requestId,
      });

      jobs.push({
        batchId: batch.batchId,
        message: "Batch synced successfully",
        remoteBatchId: result.remoteBatchId,
        status: "succeeded",
        syncStateId: claimedState.batchSyncStateId,
      });
    } catch (error) {
      const connectorError =
        error instanceof SidhConnectorError
          ? error
          : new SidhConnectorError({
              code: "BATCH_SYNC_FAILED",
              message: classifyMessage(error),
              retryable: true,
            });

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
        jobs.push({
          batchId: batch.batchId,
          message: "Batch reconciled from SIDH conflict response",
          remoteBatchId: connectorError.remoteBatchId,
          status: "succeeded",
          syncStateId: claimedState.batchSyncStateId,
        });
        continue;
      }

      const currentRetryCount = state.retryCount ?? 0;
      const maxAttempts = Math.max(1, Math.min(state.maxAttempts ?? 3, 3));
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

      jobs.push({
        batchId: claimedState.batchId,
        message: connectorError.message,
        remoteBatchId: connectorError.remoteBatchId,
        status: state.status ?? "failed",
        syncStateId: claimedState.batchSyncStateId,
      });
    }
  }

  return {
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}

export async function processQueuedEnrollmentSyncJobs(actor: AuthSession, input: { limit?: number; requestId?: string } = {}, dependencies: ProcessDependencies = {}): Promise<ProcessEnrollmentSyncJobsResult> {
  await connectToDatabase();
  ensureCanProcessBatchSync(actor);

  const connector = dependencies.connector ?? createSidhConnector();
  const now = dependencies.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(input.limit ?? 5, 25));
  const jobs: ProcessEnrollmentSyncJobsResult["jobs"] = [];

  for (let index = 0; index < limit; index += 1) {
    const claimedState = (await claimNextBatchSyncState(now(), "enrollmentSync")) as ServiceBatchSyncState | null;

    if (!claimedState) {
      break;
    }

    const state = getSyncStateValue(claimedState.enrollmentSync);
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
      jobs.push({
        batchId: claimedState.batchId,
        cancelledCount: 0,
        failedCount: 1,
        message: "Batch not found for enrollment sync processing",
        queuedCount: 0,
        status: "manual_review",
        succeededCount: 0,
        syncStateId: claimedState.batchSyncStateId,
      });
      continue;
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
      jobs.push({
        batchId: batch.batchId,
        cancelledCount: 0,
        failedCount: 0,
        message: "No queued enrollments were found",
        queuedCount: 0,
        status: "succeeded",
        succeededCount: 0,
        syncStateId: claimedState.batchSyncStateId,
      });
      continue;
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

        const payload = buildEnrollmentPayload(batch, claimedState, membership, candidate);
        const fingerprint = computeFingerprint(payload);
        state.requestFingerprint = fingerprint;

        try {
          const result = await connector.enrollCandidate({
            attemptId,
            payload,
            syncJobId: state.lastJobId ?? claimedState.batchSyncStateId,
          });

          membership.enrollmentStatus = "synced";
          membership.enrolledAt = now();
          membership.lastEnrollmentFailureCode = null;
          membership.lastEnrollmentFailureMessage = null;
          membership.lastEnrollmentSyncAt = now();
          membership.remoteStatus = "active";
          membership.sidhEnrollmentId = result.remoteEnrollmentId;
          await (membership as never as { save: () => Promise<void> }).save();
          succeededCount += 1;
        } catch (error) {
          const connectorError =
            error instanceof SidhConnectorError
              ? error
              : new SidhConnectorError({
                  code: "ENROLLMENT_SYNC_FAILED",
                  message: classifyMessage(error),
                  retryable: true,
                });

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
            break;
          }

          if (connectorError.code === "SIDH_CONFLICT") {
            membership.enrollmentStatus = "synced";
            membership.enrolledAt = now();
            membership.lastEnrollmentFailureCode = null;
            membership.lastEnrollmentFailureMessage = null;
            membership.lastEnrollmentSyncAt = now();
            await (membership as never as { save: () => Promise<void> }).save();
            succeededCount += 1;
            continue;
          }

          if (connectorError.retryable) {
            const nextRetryCount = (state.retryCount ?? 0) + 1;
            const maxAttempts = Math.max(1, Math.min(state.maxAttempts ?? 3, 3));

            membership.enrollmentStatus = "queued";
            membership.lastEnrollmentFailureCode = connectorError.code;
            membership.lastEnrollmentFailureMessage = connectorError.message;
            membership.lastEnrollmentSyncAt = now();
            await (membership as never as { save: () => Promise<void> }).save();

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
              failedCount: failedCount + 1,
              message: connectorError.message,
              queuedCount: await BatchCandidateModel.countDocuments({ batchId: batch.batchId, enrollmentStatus: "queued" }),
              status: state.status ?? "failed",
              succeededCount,
              syncStateId: claimedState.batchSyncStateId,
            };
            break;
          }

          membership.enrollmentStatus = "manual_review";
          membership.lastEnrollmentFailureCode = connectorError.code;
          membership.lastEnrollmentFailureMessage = connectorError.message;
          membership.lastEnrollmentSyncAt = now();
          await (membership as never as { save: () => Promise<void> }).save();
          failedCount += 1;
        }
      }

      if (terminalJob) {
        jobs.push(terminalJob);
        continue;
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

      jobs.push({
        batchId: batch.batchId,
        cancelledCount,
        failedCount,
        message: failedCount > 0 ? "Enrollment sync completed with manual review items" : "Enrollment sync completed",
        queuedCount: await BatchCandidateModel.countDocuments({ batchId: batch.batchId, enrollmentStatus: "queued" }),
        status: failedCount > 0 ? "manual_review" : "succeeded",
        succeededCount,
        syncStateId: claimedState.batchSyncStateId,
      });
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
      jobs.push({
        batchId: claimedState.batchId,
        cancelledCount: 0,
        failedCount: 1,
        message: apiError.message,
        queuedCount: await BatchCandidateModel.countDocuments({ batchId: claimedState.batchId, enrollmentStatus: "queued" }),
        status: "manual_review",
        succeededCount: 0,
        syncStateId: claimedState.batchSyncStateId,
      });
    }
  }

  return {
    cancelledCount: jobs.reduce((total, job) => total + job.cancelledCount, 0),
    jobs,
    manualReviewCount: jobs.filter((job) => job.status === "manual_review").length,
    processedCount: jobs.length,
    retryScheduledCount: jobs.filter((job) => job.status === "queued").length,
    succeededCount: jobs.filter((job) => job.status === "succeeded").length,
  };
}