import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchEnrollmentJobModel } from "@/lib/server/models/batch-enrollment-job";
import { BatchEnrollmentRowModel } from "@/lib/server/models/batch-enrollment-row";
import { BatchModel } from "@/lib/server/models/batch";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CourseModel } from "@/lib/server/models/course";
import { canAccessCenters, canManageBatches, getPermissionsForRoles } from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import {
  addCandidatesToBatch,
  evaluateCandidateBatchAssignment,
  listConflictingCandidateIdsForBatch,
} from "@/lib/server/services/batches";
import { type AuthSession } from "@/lib/server/services/session";
import { type CreateBatchEnrollmentJobInput } from "@/lib/server/validation";

const UNASSIGNED_CENTER_ID = "unassigned";

type BatchAssignmentContext = {
  allowCandidateOverlap?: boolean;
  batchId: string;
  batchSize?: number;
  centerId: string;
  courseId: string;
  endDate: Date;
  startDate: Date;
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
};

function toIsoDate(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureCanWriteBatches(actor: AuthSession) {
  if (!canManageBatches(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage batches");
  }
}

function ensureCanReadBatches(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("batches:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to batches");
  }
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

async function getBatchOrThrow(batchId: string) {
  const batch = await BatchModel.findOne({ batchId });

  if (!batch) {
    throw new ApiError(404, "BATCH_NOT_FOUND", "Batch not found");
  }

  return batch as BatchAssignmentContext & { batchName?: string | null; sidhBatchId?: string | null };
}

async function loadBatchWithScope(actor: AuthSession, batchId: string) {
  const batch = await getBatchOrThrow(batchId);
  resolveScopedCenterFilter(actor, batch.centerId);
  return batch;
}

async function ensureCourse(courseId: string) {
  const course = await CourseModel.findOne({ courseId }).select({
    courseId: 1,
    courseName: 1,
    minimumAge: 1,
    programIds: 1,
  });

  if (!course) {
    throw new ApiError(404, "COURSE_NOT_FOUND", "Course not found");
  }

  return course as { courseId: string; courseName: string; minimumAge: number; programIds?: string[] };
}

function serializeEnrollmentJob(job: {
  batchId: string;
  committedAt?: Date | null;
  committedRows: number;
  createdAt?: Date;
  createdByUserId?: string | null;
  duplicateRows: number;
  enrollmentJobId: string;
  invalidRows: number;
  status: string;
  totalRows: number;
  updatedAt?: Date;
  validRows: number;
}) {
  return {
    batchId: job.batchId,
    committedAt: toIsoDate(job.committedAt),
    committedRows: job.committedRows,
    createdAt: toIsoDate(job.createdAt),
    createdByUserId: job.createdByUserId ?? null,
    duplicateRows: job.duplicateRows,
    enrollmentJobId: job.enrollmentJobId,
    id: job.enrollmentJobId,
    invalidRows: job.invalidRows,
    status: job.status,
    totalRows: job.totalRows,
    updatedAt: toIsoDate(job.updatedAt),
    validRows: job.validRows,
  };
}

function serializeEnrollmentRow(row: {
  candidateId: string;
  candidateMobileNumber?: string | null;
  candidateName?: string | null;
  enrollmentJobId: string;
  rowId: string;
  rowNumber: number;
  status: string;
  validationErrors?: Array<{ field?: string | null; message: string }>;
}) {
  return {
    candidateId: row.candidateId,
    candidateMobileNumber: row.candidateMobileNumber ?? null,
    candidateName: row.candidateName ?? null,
    enrollmentJobId: row.enrollmentJobId,
    errors: row.validationErrors ?? [],
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    status: row.status,
  };
}

export async function applyBatchEnrollmentEligibilityFilters(
  actor: AuthSession,
  batchId: string,
  filter: Record<string, unknown>,
  andConditions: Array<Record<string, unknown>>,
  options: { userCenterId?: string } = {},
) {
  const batch = await loadBatchWithScope(actor, batchId);
  const course = await ensureCourse(batch.courseId);

  filter.sidhCandidateId = { $exists: true, $ne: null, $nin: [""] };
  andConditions.push({
    $or: [
      { "syncState.status": { $in: ["linked", "synced"] } },
      { "syncState.status": { $exists: false } },
      { "syncState.status": null },
    ],
  });

  const preferredCenterId = options.userCenterId?.trim() || (batch.centerId !== UNASSIGNED_CENTER_ID ? batch.centerId : undefined);
  if (preferredCenterId) {
    const scopedCenterFilter = resolveScopedCenterFilter(actor, preferredCenterId);
    if (typeof scopedCenterFilter === "string") {
      filter.centerId = scopedCenterFilter;
    } else if (Array.isArray(scopedCenterFilter)) {
      filter.centerId = { $in: scopedCenterFilter };
    } else {
      filter.centerId = preferredCenterId;
    }
  }

  if ((course.programIds ?? []).length > 0) {
    filter.programId = { $in: course.programIds };
  }

  if (course.minimumAge && batch.startDate) {
    const maxDateOfBirth = new Date(batch.startDate);
    maxDateOfBirth.setUTCFullYear(maxDateOfBirth.getUTCFullYear() - course.minimumAge);
    filter.dateOfBirth = { $lte: maxDateOfBirth };
  }

  const excludedCandidateIds = new Set<string>();
  const existingInBatch = (await BatchCandidateModel.find({ batchId: batch.batchId }).select({ candidateId: 1 })) as Array<{ candidateId: string }>;
  for (const membership of existingInBatch) {
    excludedCandidateIds.add(membership.candidateId);
  }

  for (const candidateId of await listConflictingCandidateIdsForBatch(batch)) {
    excludedCandidateIds.add(candidateId);
  }

  if (excludedCandidateIds.size > 0) {
    filter.candidateId = { $nin: [...excludedCandidateIds] };
  }

  return { batch, course };
}

export async function createBatchEnrollmentJob(
  actor: AuthSession,
  batchId: string,
  input: CreateBatchEnrollmentJobInput,
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);

  const batch = await loadBatchWithScope(actor, batchId);
  const course = await ensureCourse(batch.courseId);
  const uniqueCandidateIds = [...new Set(input.candidateIds.map((candidateId) => normalizeString(candidateId)).filter(Boolean))];

  if (uniqueCandidateIds.length === 0) {
    throw new ApiError(400, "CANDIDATE_REQUIRED", "Select at least one learner to stage enrollment");
  }

  const existingBatchCandidates = (await BatchCandidateModel.find({ batchId: batch.batchId }).select({ candidateId: 1 })) as Array<{ candidateId: string }>;
  const existingIds = new Set(existingBatchCandidates.map((item) => item.candidateId));
  const batchCapacity = Math.min(batch.batchSize ?? 80, 80);
  const remainingCapacity = Math.max(batchCapacity - existingIds.size, 0);
  const conflictingCandidateIds = new Set(await listConflictingCandidateIdsForBatch(batch));
  const evaluationContext = {
    conflictingCandidateIds,
    existingBatchCandidateIds: existingIds,
  };

  const candidates = (await CandidateModel.find({ candidateId: { $in: uniqueCandidateIds } }).select({
    candidateId: 1,
    centerId: 1,
    dateOfBirth: 1,
    fullName: 1,
    mobileNumber: 1,
    programId: 1,
    registrationMode: 1,
    sidhCandidateId: 1,
    syncState: 1,
  })) as ServiceCandidate[];

  const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const rows: Array<Record<string, unknown>> = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let stagedValidCount = 0;

  uniqueCandidateIds.forEach((candidateId, index) => {
    const rowId = createPrefixedId("benr");
    const rowNumber = index + 1;
    const candidate = candidateMap.get(candidateId);

    if (!candidate) {
      invalidRows += 1;
      rows.push({
        rowId,
        rowNumber,
        candidateId,
        candidateName: null,
        candidateMobileNumber: null,
        status: "invalid",
        validationErrors: [{ field: "candidateId", message: "Learner does not exist" }],
      });
      return;
    }

    const evaluation = evaluateCandidateBatchAssignment(batch, course, candidate, evaluationContext);

    if (evaluation.status === "duplicate") {
      duplicateRows += 1;
      rows.push({
        rowId,
        rowNumber,
        candidateId,
        candidateName: candidate.fullName,
        candidateMobileNumber: candidate.mobileNumber,
        status: "duplicate",
        validationErrors: evaluation.errors,
      });
      return;
    }

    if (evaluation.status === "invalid") {
      invalidRows += 1;
      rows.push({
        rowId,
        rowNumber,
        candidateId,
        candidateName: candidate.fullName,
        candidateMobileNumber: candidate.mobileNumber,
        status: "invalid",
        validationErrors: evaluation.errors,
      });
      return;
    }

    if (stagedValidCount >= remainingCapacity) {
      invalidRows += 1;
      rows.push({
        rowId,
        rowNumber,
        candidateId,
        candidateName: candidate.fullName,
        candidateMobileNumber: candidate.mobileNumber,
        status: "invalid",
        validationErrors: [{ message: `Batch size must never exceed ${batchCapacity} candidates` }],
      });
      return;
    }

    stagedValidCount += 1;
    validRows += 1;
    rows.push({
      rowId,
      rowNumber,
      candidateId,
      candidateName: candidate.fullName,
      candidateMobileNumber: candidate.mobileNumber,
      status: "valid",
      validationErrors: [],
    });
  });

  const enrollmentJobId = createPrefixedId("bejob");
  const job = await BatchEnrollmentJobModel.create({
    enrollmentJobId,
    batchId: batch.batchId,
    status: "staged",
    totalRows: uniqueCandidateIds.length,
    validRows,
    invalidRows,
    duplicateRows,
    committedRows: 0,
    createdByUserId: actor.user.id,
  });

  await BatchEnrollmentRowModel.insertMany(
    rows.map((row) => ({
      ...row,
      enrollmentJobId,
    })),
  );

  await writeAuditLog({
    action: "batch.enrollment.staged",
    actorUserId: actor.user.id,
    entityId: enrollmentJobId,
    entityType: "batch_enrollment_job",
    metadata: {
      batchId: batch.batchId,
      totalRows: uniqueCandidateIds.length,
      validRows,
      invalidRows,
      duplicateRows,
    },
    requestId,
  });

  return serializeEnrollmentJob(job);
}

export async function getBatchEnrollmentJob(actor: AuthSession, batchId: string, enrollmentJobId: string) {
  await connectToDatabase();
  ensureCanReadBatches(actor);
  await loadBatchWithScope(actor, batchId);

  const job = await BatchEnrollmentJobModel.findOne({ enrollmentJobId, batchId });

  if (!job) {
    throw new ApiError(404, "ENROLLMENT_JOB_NOT_FOUND", "Batch enrollment job not found");
  }

  return serializeEnrollmentJob(job);
}

export async function listBatchEnrollmentRows(
  actor: AuthSession,
  batchId: string,
  enrollmentJobId: string,
  page: number,
  pageSize: number,
  status?: string,
) {
  await connectToDatabase();
  ensureCanReadBatches(actor);
  await loadBatchWithScope(actor, batchId);

  const job = await BatchEnrollmentJobModel.findOne({ enrollmentJobId, batchId });

  if (!job) {
    throw new ApiError(404, "ENROLLMENT_JOB_NOT_FOUND", "Batch enrollment job not found");
  }

  const filter: Record<string, unknown> = { enrollmentJobId };
  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    BatchEnrollmentRowModel.find(filter).sort({ rowNumber: 1 }).skip(skip).limit(pageSize).lean(),
    BatchEnrollmentRowModel.countDocuments(filter),
  ]);

  return {
    items: items.map((row) => serializeEnrollmentRow(row as Record<string, unknown> & typeof items[number])),
    page,
    pageSize,
    total,
  };
}

export async function commitBatchEnrollmentJob(actor: AuthSession, batchId: string, enrollmentJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteBatches(actor);
  await loadBatchWithScope(actor, batchId);

  const job = await BatchEnrollmentJobModel.findOne({ enrollmentJobId, batchId });

  if (!job) {
    throw new ApiError(404, "ENROLLMENT_JOB_NOT_FOUND", "Batch enrollment job not found");
  }

  if (job.status === "committed") {
    throw new ApiError(409, "ENROLLMENT_ALREADY_COMMITTED", "This enrollment job has already been committed");
  }

  const validRows = await BatchEnrollmentRowModel.find({ enrollmentJobId, status: "valid" }).sort({ rowNumber: 1 }).lean();
  const candidateIds = validRows.map((row) => row.candidateId as string);

  if (candidateIds.length === 0) {
    throw new ApiError(400, "ENROLLMENT_ROWS_REQUIRED", "No valid learners are ready to enroll");
  }

  try {
    await addCandidatesToBatch(actor, batchId, { candidateIds }, requestId);
    await BatchEnrollmentRowModel.updateMany({ enrollmentJobId, status: "valid" }, { $set: { status: "committed" } });
    job.status = "committed";
    job.committedRows = candidateIds.length;
    job.committedAt = new Date();
    await job.save();

    await writeAuditLog({
      action: "batch.enrollment.committed",
      actorUserId: actor.user.id,
      entityId: enrollmentJobId,
      entityType: "batch_enrollment_job",
      metadata: { batchId, committedRows: candidateIds.length },
      requestId,
    });

    return serializeEnrollmentJob(job);
  } catch (error) {
    job.status = "failed";
    await job.save();
    throw error;
  }
}
