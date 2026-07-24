import { createHash } from "node:crypto";

import {
  getCandidateProgramLabel,
  normalizeCandidateGender,
  normalizeCandidateNamePrefix,
  normalizeCandidateProgram,
  resolveCandidateProgramId,
} from "@/lib/candidate-field-options";
import { normalizeCandidateDistrict, normalizeCandidateState } from "@/lib/candidate-location-options";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { readWorkbookSheetsFromArrayBuffer } from "@/lib/spreadsheet/node";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CourseModel } from "@/lib/server/models/course";
import { CandidateImportRowModel } from "@/lib/server/models/candidate-import-row";
import { ImportJobModel } from "@/lib/server/models/import-job";
import { OutboxEventModel } from "@/lib/server/models/outbox-event";
import { ProgramModel } from "@/lib/server/models/program";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import {
  canAccessCenters,
  canManageCandidates,
  canManageSync,
  getPermissionsForRoles,
} from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import { applyBatchEnrollmentEligibilityFilters } from "@/lib/server/services/batch-enrollment-jobs";
import { type AuthSession } from "@/lib/server/services/session";
import { parseUserDateInput } from "@/lib/server/sidh-payload";
import { buildCandidateExportWorkbook } from "@/lib/server/candidate-export";
import { listCandidateImportTemplateOptions } from "@/lib/server/candidate-import-template";
import {
  bulkQueueCandidateSyncSchema,
  createCandidateSchema,
  createCandidateRegistrationSchema,
  type CandidateImportInput,
  type CandidateExportQuery,
  type CandidateListQuery,
  type BulkQueueCandidateSyncInput,
  type CreateCandidateInput,
  type CreateCandidateRegistrationInput,
  type LinkExistingSidhCandidateInput,
  type SyncJobsQuery,
  type UpdateCandidateInput,
} from "@/lib/server/validation";

type PagedList<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type CandidateCreateOptions = {
  queueSync?: boolean;
  referenceCourseId?: string | null;
  referenceCourseName?: string | null;
  registrationField?: "phone" | "mobileNumber";
  requestId?: string;
  skipAudit?: boolean;
  sourceImportJobId?: string;
};

type AddressLike = {
  address?: string | null;
  city?: string | null;
  constituency?: string | null;
  district?: string | null;
  pinCode?: string | null;
  state?: string | null;
  tehsil?: string | null;
};

type CommunicationAddressLike = AddressLike & {
  sameAsPermanent?: boolean | null;
};

type CandidateLike = {
  candidateId: string;
  centerId: string;
  centerName?: string | null;
  communicationAddress: CommunicationAddressLike;
  countryCode?: string | null;
  createdAt?: Date;
  dateOfBirth: Date | string;
  disability: boolean;
  domicileDistrict?: string | null;
  domicileState?: string | null;
  duplicateHash: string;
  educationLevel?: string | null;
  email?: string | null;
  employmentDetails?: string | null;
  employmentStatus?: string | null;
  employed?: string | null;
  fathersName?: string | null;
  fullName: string;
  gender?: string | null;
  guardiansName?: string | null;
  heardAboutUs?: string | null;
  idNumber?: string | null;
  idType: string;
  maritalStatus?: string | null;
  mobileNumber: string;
  mothersName?: string | null;
  monthsOfPreviousExperience?: number | null;
  permanentAddress: AddressLike;
  previousExperienceSector?: string | null;
  programId: string;
  referenceCourseId?: string | null;
  referenceCourseName?: string | null;
  registrationMode: "internal_registration" | "existing_sidh_link";
  religion?: string | null;
  salutation?: string | null;
  sidhCandidateId?: string | null;
  syncState?: Record<string, unknown> | null;
  trainingStatus?: string | null;
  typeOfAlternateId?: string | null;
  typeOfDisability?: string | null;
  updatedAt?: Date;
  aadhaarReferenceNo?: string | null;
  category?: string | null;
};

type ImportJobLike = {
  centerId: string;
  committedAt?: Date | null;
  committedRows: number;
  createdAt?: Date;
  duplicateRows: number;
  fileName: string;
  importJobId: string;
  invalidRows: number;
  programId: string;
  registrationMode: string;
  status: string;
  totalRows: number;
  updatedAt?: Date;
  validRows: number;
};

type SyncJobLike = {
  attempts?: Iterable<unknown> | null;
  candidateId: string;
  createdAt?: Date;
  entityId: string;
  entityType: string;
  latestRemoteCandidateId?: string | null;
  nextRunAt?: Date;
  payloadSnapshot?: Record<string, unknown>;
  retryCount: number;
  status: string;
  syncJobId: string;
  updatedAt?: Date;
};

type SerializedCandidate = ReturnType<typeof serializeCandidate>;

function ensureCanReadCandidates(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("candidates:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to candidates");
  }
}

function ensureCanWriteCandidates(actor: AuthSession) {
  if (!canManageCandidates(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage candidates");
  }
}

function ensureCanReadSyncJobs(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("sync:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to sync jobs");
  }
}

function ensureCanWriteSyncJobs(actor: AuthSession) {
  if (!canManageSync(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage sync jobs");
  }
}

function normalizeWhitespace(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeFullName(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeIdValue(value?: string | null) {
  return value ? value.replace(/\s+/g, "").toUpperCase() : "";
}

function normalizeYesNo(value: unknown): "Yes" | "No" | "" {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();

  if (normalized === "yes") {
    return "Yes";
  }

  if (normalized === "no") {
    return "No";
  }

  return "";
}

function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDate(value: string) {
  const normalized = parseUserDateInput(value);

  if (!normalized) {
    throw new ApiError(400, "INVALID_DATE", "Invalid date provided");
  }

  return new Date(`${normalized}T00:00:00.000Z`);
}

function parseTemplateDate(value: unknown) {
  return parseUserDateInput(value);
}

function normalizeMobileNumber(value: string) {
  return value.replace(/\D/g, "");
}

function createDuplicateHash(input: {
  dateOfBirth: string;
  fullName: string;
  idNumber: string;
  idType: string;
  mobileNumber: string;
}) {
  return createHash("sha256")
    .update(
      [
        normalizeFullName(input.fullName),
        input.dateOfBirth,
        normalizeMobileNumber(input.mobileNumber),
        normalizeWhitespace(input.idType).toUpperCase(),
        normalizeIdValue(input.idNumber),
      ].join("|"),
    )
    .digest("hex");
}

async function findCandidateByMobileNumber(mobileNumber: string, excludeCandidateId?: string) {
  const normalizedMobileNumber = normalizeMobileNumber(mobileNumber);
  if (!normalizedMobileNumber) {
    return null;
  }

  return CandidateModel.findOne({
    mobileNumber: normalizedMobileNumber,
    ...(excludeCandidateId ? { candidateId: { $ne: excludeCandidateId } } : {}),
  }).select({ candidateId: 1, fullName: 1 });
}

function createSearchRegex(search?: string) {
  if (!search?.trim()) {
    return undefined;
  }

  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
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

async function ensureProgramExists(programId: string) {
  const program = await ProgramModel.findOne({ programId }).select({ programId: 1, name: 1, status: 1 });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  return program;
}

async function ensureTrainingCenterExists(centerId: string) {
  const center = await TrainingCenterModel.findOne({ centerId }).select({ centerId: 1, centerName: 1, status: 1 });

  if (!center) {
    throw new ApiError(404, "CENTER_NOT_FOUND", "Training center not found");
  }

  return center;
}

function createTechnicalCenterId(centerName?: string | null) {
  const normalizedCenterName = normalizeWhitespace(centerName).toLowerCase();

  if (!normalizedCenterName) {
    return "candidate_registration";
  }

  return `candidate_center_${createHash("sha256").update(normalizedCenterName).digest("hex").slice(0, 12)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveCandidateRegistrationContext(
  actor: AuthSession,
  overrides?: Partial<CandidateImportInput> & { centerName?: string },
) {
  const centerIdOverride = overrides?.centerId?.trim();

  if (centerIdOverride) {
    const center = await ensureTrainingCenterExists(centerIdOverride);
    resolveScopedCenterFilter(actor, center.centerId);

    return {
      centerId: center.centerId,
      programId: overrides?.programId ?? "candidate_registration",
      registrationMode: overrides?.registrationMode ?? "internal_registration",
    } as const;
  }

  const centerName = normalizeWhitespace(overrides?.centerName);

  if (centerName) {
    const center = await TrainingCenterModel.findOne({
      centerName: { $regex: new RegExp(`^${escapeRegExp(centerName)}$`, "i") },
      status: "active",
    }).select({ centerId: 1, centerName: 1, status: 1 });

    if (center) {
      resolveScopedCenterFilter(actor, center.centerId);

      return {
        centerId: center.centerId,
        programId: overrides?.programId ?? "candidate_registration",
        registrationMode: overrides?.registrationMode ?? "internal_registration",
      } as const;
    }
  }

  if (actor.user.centerIds[0]) {
    return {
      centerId: actor.user.centerIds[0],
      programId: overrides?.programId ?? "candidate_registration",
      registrationMode: overrides?.registrationMode ?? "internal_registration",
    } as const;
  }

  return {
    centerId: createTechnicalCenterId(centerName),
    programId: overrides?.programId ?? "candidate_registration",
    registrationMode: overrides?.registrationMode ?? "internal_registration",
  } as const;
}

function assertLearnerMutableBeforeSidh(candidate: CandidateLike) {
  if (candidate.registrationMode === "existing_sidh_link") {
    throw new ApiError(409, "CANDIDATE_NOT_MUTABLE", "Linked NSDC_SIDH portal learners cannot be changed here");
  }

  if (candidate.sidhCandidateId) {
    throw new ApiError(409, "CANDIDATE_ALREADY_SYNCED", "Learner is already registered on the NSDC_SIDH portal");
  }

  const status = String(candidate.syncState?.status ?? "not_queued");

  if (status === "queued" || status === "processing") {
    throw new ApiError(409, "CANDIDATE_SYNC_IN_PROGRESS", "Learner is already in the NSDC_SIDH sync queue");
  }

  // Only treat as fully synced when we actually stored a SIDH candidate ID.
  if ((status === "synced" || status === "succeeded") && candidate.sidhCandidateId) {
    throw new ApiError(409, "CANDIDATE_ALREADY_SYNCED", "Learner is already registered on the NSDC_SIDH portal");
  }
}

async function resolveReferenceCourseDetails(
  referenceDetails?: { courseId?: string; courseName?: string } | null,
) {
  if (referenceDetails === null) {
    return { courseId: null, courseName: null };
  }

  if (!referenceDetails) {
    return { courseId: null, courseName: null };
  }

  const courseId = normalizeWhitespace(referenceDetails.courseId);
  const courseNameInput = normalizeWhitespace(referenceDetails.courseName);

  if (!courseId && !courseNameInput) {
    return { courseId: null, courseName: null };
  }

  const referenceCourseSelect = {
    courseId: 1,
    courseName: 1,
    status: 1,
    approvalStatus: 1,
  } as const;

  function assertReferenceCourseEligible(course: { courseId: string; courseName: string; status?: string; approvalStatus?: string }) {
    if (course.status !== "active" || course.approvalStatus !== "approved") {
      throw new ApiError(
        400,
        "INVALID_REFERENCE_COURSE",
        `Course "${course.courseName}" (${course.courseId}) is not an active approved course`,
      );
    }

    return {
      courseId: course.courseId,
      courseName: course.courseName,
    };
  }

  if (courseId) {
    const course = await CourseModel.findOne({ courseId }).select(referenceCourseSelect);

    if (!course) {
      throw new ApiError(400, "INVALID_REFERENCE_COURSE", `Course "${courseId}" could not be resolved`);
    }

    return assertReferenceCourseEligible(course);
  }

  const matchingCourses = await CourseModel.find({
    courseName: { $regex: new RegExp(`^${escapeRegExp(courseNameInput)}$`, "i") },
    status: "active",
    approvalStatus: "approved",
  })
    .select(referenceCourseSelect)
    .sort({ courseName: 1, courseId: 1 });

  if (matchingCourses.length === 0) {
    throw new ApiError(400, "INVALID_REFERENCE_COURSE", `Course "${courseNameInput}" could not be resolved`);
  }

  if (matchingCourses.length > 1) {
    throw new ApiError(
      400,
      "AMBIGUOUS_REFERENCE_COURSE",
      `Multiple active approved courses match "${courseNameInput}". Use the course id instead.`,
      [
        {
          field: "referenceDetails.courseName",
          message: `Matched ${matchingCourses.map((course) => course.courseId).join(", ")}`,
        },
      ],
    );
  }

  return assertReferenceCourseEligible(matchingCourses[0]);
}

function expandCandidateRegistrationInput(
  registrationInput: CreateCandidateRegistrationInput,
  context: { centerId: string; programId: string; registrationMode: "internal_registration" | "existing_sidh_link" },
): CreateCandidateInput {
  return {
    programId: resolveCandidateProgramId(registrationInput.program) || context.programId,
    centerId: context.centerId,
    registrationMode: context.registrationMode,
    personalDetails: {
      salutation: registrationInput.personalDetails.namePrefix,
      fullName: registrationInput.personalDetails.firstName,
      gender: registrationInput.personalDetails.gender,
      dateOfBirth: registrationInput.personalDetails.dob,
      maritalStatus: "",
      fathersName: registrationInput.personalDetails.fatherName,
      mothersName: "",
      guardiansName: registrationInput.personalDetails.guardianName,
      religion: "",
      category: "",
      disability: false,
      typeOfDisability: "",
      educationLevel: "",
    },
    contactDetails: {
      email: registrationInput.contactDetails.email,
      countryCode: registrationInput.contactDetails.countryCode,
      mobileNumber: registrationInput.contactDetails.phone,
    },
    locationDetails: {
      state: registrationInput.locationDetails?.state ?? "",
      district: registrationInput.locationDetails?.district ?? "",
      centerName: registrationInput.locationDetails?.centerName ?? "",
    },
    identity: {
      idType: "UNSPECIFIED",
      typeOfAlternateId: "",
      aadhaarReferenceNo: "",
      idNumber: "",
    },
    domicile: {
      state: registrationInput.locationDetails?.state ?? "",
      district: registrationInput.locationDetails?.district ?? "",
    },
    permanentAddress: {
      address: "",
      state: registrationInput.locationDetails?.state ?? "",
      district: registrationInput.locationDetails?.district ?? "",
      pinCode: "",
      city: registrationInput.locationDetails?.district ?? "",
      tehsil: "",
      constituency: "",
    },
    communicationAddress: {
      sameAsPermanent: true,
      address: "",
      state: "",
      district: "",
      pinCode: "",
      city: "",
      tehsil: "",
      constituency: "",
    },
    experience: {
      trainingStatus: "Fresher",
      previousExperienceSector: "",
      monthsOfPreviousExperience: null,
      employed: "",
      employmentStatus: "",
      employmentDetails: "",
      heardAboutUs: "",
    },
  };
}

function normalizeImportedRowToCandidateInput(
  row: Record<string, unknown>,
  context: { centerId: string; programId: string; registrationMode: "internal_registration" | "existing_sidh_link" },
) {
  const contactDetails =
    row.contactDetails && typeof row.contactDetails === "object"
      ? (row.contactDetails as Record<string, unknown>)
      : null;

  if (contactDetails && (typeof contactDetails.phone === "string" || typeof contactDetails.phone === "number")) {
    return expandCandidateRegistrationInput(createCandidateRegistrationSchema.parse(row), context);
  }

  return createCandidateSchema.parse(row);
}

function serializeCandidate(candidate: CandidateLike) {
  return {
    id: candidate.candidateId,
    candidateId: candidate.candidateId,
    programId: candidate.programId,
    program: getCandidateProgramLabel(candidate.programId) || null,
    centerId: candidate.centerId,
    registrationMode: candidate.registrationMode,
    personalDetails: {
      salutation: candidate.salutation ?? null,
      fullName: candidate.fullName,
      gender: candidate.gender ?? null,
      dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? null,
      maritalStatus: candidate.maritalStatus ?? null,
      fathersName: candidate.fathersName ?? null,
      mothersName: candidate.mothersName ?? null,
      guardiansName: candidate.guardiansName ?? null,
      religion: candidate.religion ?? null,
      disability: candidate.disability,
      typeOfDisability: candidate.typeOfDisability ?? null,
      category: candidate.category ?? null,
      educationLevel: candidate.educationLevel ?? null,
    },
    contactDetails: {
      email: candidate.email ?? null,
      mobileNumber: candidate.mobileNumber,
    },
    locationDetails: {
      state: candidate.permanentAddress?.state ?? null,
      district: candidate.permanentAddress?.district ?? candidate.domicileDistrict ?? null,
      centerName: candidate.centerName ?? null,
    },
    referenceDetails: {
      courseId: candidate.referenceCourseId ?? null,
      courseName: candidate.referenceCourseName ?? null,
    },
    domicile: {
      state: candidate.domicileState ?? null,
      district: candidate.domicileDistrict ?? null,
    },
    identity: {
      idType: candidate.idType,
      typeOfAlternateId: candidate.typeOfAlternateId ?? null,
      idNumber: candidate.idNumber ?? null,
    },
    permanentAddress: candidate.permanentAddress,
    communicationAddress: candidate.communicationAddress,
    experience: {
      trainingStatus: candidate.trainingStatus ?? null,
      previousExperienceSector: candidate.previousExperienceSector ?? null,
      monthsOfPreviousExperience: candidate.monthsOfPreviousExperience ?? null,
      employed: candidate.employed ?? null,
      employmentStatus: candidate.employmentStatus ?? null,
      employmentDetails: candidate.employmentDetails ?? null,
      heardAboutUs: candidate.heardAboutUs ?? null,
    },
    sidhCandidateId: candidate.sidhCandidateId ?? null,
    syncState: candidate.syncState ?? null,
    duplicateHash: candidate.duplicateHash,
    createdAt: toIsoDate(candidate.createdAt),
    updatedAt: toIsoDate(candidate.updatedAt),
  };
}

function serializeImportJob(job: ImportJobLike) {
  return {
    id: job.importJobId,
    importJobId: job.importJobId,
    fileName: job.fileName,
    status: job.status,
    programId: job.programId,
    centerId: job.centerId,
    registrationMode: job.registrationMode,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    duplicateRows: job.duplicateRows,
    committedRows: job.committedRows,
    committedAt: toIsoDate(job.committedAt),
    createdAt: toIsoDate(job.createdAt),
    updatedAt: toIsoDate(job.updatedAt),
  };
}

function readImportRowValidationErrors(row: Record<string, unknown>) {
  const validationErrors = row.validationErrors;
  if (Array.isArray(validationErrors)) {
    return validationErrors;
  }

  const legacyErrors = row.errors;
  return Array.isArray(legacyErrors) ? legacyErrors : [];
}

function serializeImportRow(row: Record<string, unknown>) {
  return {
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: readImportRowValidationErrors(row),
    duplicateOfCandidateId: row.duplicateOfCandidateId ?? null,
    candidateId: row.candidateId ?? null,
    normalized: row.normalized ?? {},
  };
}

const IMPORT_ROW_BATCH_SIZE = 1000;

async function persistImportRows(importJobId: string, rows: Array<Record<string, unknown>>) {
  for (let index = 0; index < rows.length; index += IMPORT_ROW_BATCH_SIZE) {
    const chunk = rows.slice(index, index + IMPORT_ROW_BATCH_SIZE).map((row) => ({
      importJobId,
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      raw: row.raw ?? {},
      normalized: row.normalized ?? {},
      status: row.status,
      validationErrors: readImportRowValidationErrors(row),
      duplicateOfCandidateId: row.duplicateOfCandidateId ?? null,
      candidateId: row.candidateId ?? null,
    }));

    await CandidateImportRowModel.insertMany(chunk, { ordered: false });
  }
}

async function importJobUsesExternalRows(importJobId: string) {
  return Boolean(await CandidateImportRowModel.exists({ importJobId }));
}

function listEmbeddedImportRows(
  job: { rows?: unknown },
  page: number,
  pageSize: number,
  status?: string,
) {
  let rows = Array.from(job.rows as unknown as Array<Record<string, unknown>>);

  if (status) {
    rows = rows.filter((row) => row.status === status);
  }

  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize).map((row) => serializeImportRow(row));

  return {
    items,
    page,
    pageSize,
    total: rows.length,
  };
}

function serializeSyncJob(job: SyncJobLike) {
  return {
    id: job.syncJobId,
    syncJobId: job.syncJobId,
    entityType: job.entityType,
    entityId: job.entityId,
    candidateId: job.candidateId,
    status: job.status,
    retryCount: job.retryCount,
    latestRemoteCandidateId: job.latestRemoteCandidateId ?? null,
    payloadSnapshot: job.payloadSnapshot ?? {},
    attempts: Array.from(job.attempts ?? []).map((attempt) => ({
      ...(attempt as Record<string, unknown>),
      startedAt: toIsoDate((attempt as { startedAt?: Date | string | null }).startedAt),
      finishedAt: toIsoDate((attempt as { finishedAt?: Date | string | null }).finishedAt),
    })),
    nextRunAt: toIsoDate(job.nextRunAt),
    createdAt: toIsoDate(job.createdAt),
    updatedAt: toIsoDate(job.updatedAt),
  };
}

function buildCandidateInputFromDocument(candidate: CandidateLike): CreateCandidateInput {
  return {
    programId: candidate.programId,
    centerId: candidate.centerId,
    registrationMode: candidate.registrationMode,
    personalDetails: {
      salutation: candidate.salutation ?? "",
      fullName: candidate.fullName,
      gender: candidate.gender ?? "Unknown",
      dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? "",
      maritalStatus: candidate.maritalStatus ?? "",
      fathersName: candidate.fathersName ?? "",
      mothersName: candidate.mothersName ?? "",
      guardiansName: candidate.guardiansName ?? "",
      religion: candidate.religion ?? "",
      category: candidate.category ?? "",
      disability: candidate.disability ?? false,
      typeOfDisability: candidate.typeOfDisability ?? "",
      educationLevel: candidate.educationLevel ?? "",
    },
    contactDetails: {
      email: candidate.email ?? "",
      countryCode: candidate.countryCode ?? "91",
      mobileNumber: candidate.mobileNumber,
    },
    locationDetails: {
      state: candidate.permanentAddress?.state ?? "",
      district: candidate.permanentAddress?.district ?? candidate.domicileDistrict ?? "",
      centerName: candidate.centerName ?? "",
    },
    identity: {
      idType: candidate.idType,
      typeOfAlternateId: candidate.typeOfAlternateId ?? "",
      aadhaarReferenceNo: candidate.aadhaarReferenceNo ?? "",
      idNumber: candidate.idNumber ?? "",
    },
    domicile: {
      state: candidate.domicileState ?? "",
      district: candidate.domicileDistrict ?? "",
    },
    permanentAddress: {
      address: candidate.permanentAddress?.address ?? "",
      state: candidate.permanentAddress?.state ?? "",
      district: candidate.permanentAddress?.district ?? "",
      pinCode: candidate.permanentAddress?.pinCode ?? "",
      city: candidate.permanentAddress?.city ?? "",
      tehsil: candidate.permanentAddress?.tehsil ?? "",
      constituency: candidate.permanentAddress?.constituency ?? "",
    },
    communicationAddress: {
      sameAsPermanent: candidate.communicationAddress?.sameAsPermanent ?? true,
      address: candidate.communicationAddress?.address ?? "",
      state: candidate.communicationAddress?.state ?? "",
      district: candidate.communicationAddress?.district ?? "",
      pinCode: candidate.communicationAddress?.pinCode ?? "",
      city: candidate.communicationAddress?.city ?? "",
      tehsil: candidate.communicationAddress?.tehsil ?? "",
      constituency: candidate.communicationAddress?.constituency ?? "",
    },
    experience: {
      trainingStatus: candidate.trainingStatus ?? "Fresher",
      previousExperienceSector: candidate.previousExperienceSector ?? "",
      monthsOfPreviousExperience: candidate.monthsOfPreviousExperience ?? null,
      employed: normalizeYesNo(candidate.employed),
      employmentStatus: candidate.employmentStatus ?? "",
      employmentDetails: candidate.employmentDetails ?? "",
      heardAboutUs: candidate.heardAboutUs ?? "",
    },
  };
}

function mergeCandidateInput(base: CreateCandidateInput, patch: UpdateCandidateInput): CreateCandidateInput {
  return {
    ...base,
    programId: patch.programId ?? base.programId,
    centerId: patch.centerId ?? base.centerId,
    registrationMode: patch.registrationMode ?? base.registrationMode,
    personalDetails: {
      ...base.personalDetails,
      ...(patch.personalDetails ?? {}),
    },
    contactDetails: {
      ...base.contactDetails,
      ...(patch.contactDetails ?? {}),
    },
    locationDetails: {
      ...base.locationDetails,
      ...(patch.locationDetails ?? {}),
    },
    identity: {
      ...base.identity,
      ...(patch.identity ?? {}),
    },
    domicile: {
      ...base.domicile,
      ...(patch.domicile ?? {}),
    },
    permanentAddress: {
      ...base.permanentAddress,
      ...(patch.permanentAddress ?? {}),
    },
    communicationAddress: {
      ...base.communicationAddress,
      ...(patch.communicationAddress ?? {}),
    },
    experience: {
      ...base.experience,
      ...(patch.experience ?? {}),
    },
  };
}

function buildCandidateRecord(input: CreateCandidateInput) {
  const duplicateIdentityValue = input.identity.idNumber || input.identity.aadhaarReferenceNo || input.contactDetails.mobileNumber;
  const duplicateHash = createDuplicateHash({
    dateOfBirth: input.personalDetails.dateOfBirth,
    fullName: input.personalDetails.fullName,
    idNumber: duplicateIdentityValue,
    idType: input.identity.idType,
    mobileNumber: input.contactDetails.mobileNumber,
  });
  const permanentAddress = {
    address: normalizeWhitespace(input.permanentAddress.address) || null,
    state: normalizeWhitespace(input.permanentAddress.state || input.locationDetails?.state) || null,
    district: normalizeWhitespace(input.permanentAddress.district || input.locationDetails?.district) || null,
    pinCode: normalizeWhitespace(input.permanentAddress.pinCode) || null,
    city: normalizeWhitespace(input.permanentAddress.city || input.locationDetails?.district) || null,
    tehsil: normalizeWhitespace(input.permanentAddress.tehsil) || null,
    constituency: normalizeWhitespace(input.permanentAddress.constituency) || null,
  };
  const communicationAddress = input.communicationAddress.sameAsPermanent
    ? {
        sameAsPermanent: true,
        ...permanentAddress,
      }
    : {
        sameAsPermanent: false,
        address: normalizeWhitespace(input.communicationAddress.address) || null,
        state: normalizeWhitespace(input.communicationAddress.state) || null,
        district: normalizeWhitespace(input.communicationAddress.district) || null,
        pinCode: normalizeWhitespace(input.communicationAddress.pinCode) || null,
        city: normalizeWhitespace(input.communicationAddress.city) || null,
        tehsil: normalizeWhitespace(input.communicationAddress.tehsil) || null,
        constituency: normalizeWhitespace(input.communicationAddress.constituency) || null,
      };

  return {
    registrationMode: input.registrationMode,
    fullName: normalizeWhitespace(input.personalDetails.fullName),
    normalizedFullName: normalizeFullName(input.personalDetails.fullName),
    salutation: normalizeWhitespace(input.personalDetails.salutation) || null,
    gender: normalizeWhitespace(input.personalDetails.gender) || null,
    dateOfBirth: parseDate(input.personalDetails.dateOfBirth),
    email: normalizeWhitespace(input.contactDetails.email).toLowerCase() || null,
    maritalStatus: normalizeWhitespace(input.personalDetails.maritalStatus) || null,
    fathersName: normalizeWhitespace(input.personalDetails.fathersName) || null,
    mothersName: normalizeWhitespace(input.personalDetails.mothersName) || null,
    guardiansName: normalizeWhitespace(input.personalDetails.guardiansName) || null,
    religion: normalizeWhitespace(input.personalDetails.religion) || null,
    category: normalizeWhitespace(input.personalDetails.category) || null,
    disability: input.personalDetails.disability,
    typeOfDisability: normalizeWhitespace(input.personalDetails.typeOfDisability) || null,
    domicileState: normalizeWhitespace(input.domicile.state || input.locationDetails?.state) || null,
    domicileDistrict: normalizeWhitespace(input.domicile.district || input.locationDetails?.district) || null,
    idType: normalizeWhitespace(input.identity.idType),
    typeOfAlternateId: normalizeWhitespace(input.identity.typeOfAlternateId) || null,
    aadhaarReferenceNo: normalizeWhitespace(input.identity.aadhaarReferenceNo) || null,
    idNumber: normalizeWhitespace(input.identity.idNumber) || null,
    normalizedIdNumber: normalizeIdValue(input.identity.idNumber || input.identity.aadhaarReferenceNo || duplicateIdentityValue),
    countryCode: normalizeWhitespace(input.contactDetails.countryCode) || "91",
    mobileNumber: normalizeMobileNumber(input.contactDetails.mobileNumber),
    educationLevel: normalizeWhitespace(input.personalDetails.educationLevel) || null,
    permanentAddress,
    communicationAddress,
    trainingStatus: normalizeWhitespace(input.experience.trainingStatus) || null,
    previousExperienceSector: normalizeWhitespace(input.experience.previousExperienceSector) || null,
    monthsOfPreviousExperience: input.experience.monthsOfPreviousExperience ?? null,
    employed: normalizeWhitespace(input.experience.employed) || null,
    employmentStatus: normalizeWhitespace(input.experience.employmentStatus) || null,
    employmentDetails: normalizeWhitespace(input.experience.employmentDetails) || null,
    heardAboutUs: normalizeWhitespace(input.experience.heardAboutUs) || null,
    programId: input.programId,
    centerId: input.centerId,
    centerName: normalizeWhitespace(input.locationDetails?.centerName) || null,
    duplicateHash,
  };
}

async function ensureUniqueMobileNumber(
  mobileNumber: string,
  options: { excludeCandidateId?: string; registrationField?: "phone" | "mobileNumber" } = {},
) {
  const existing = await findCandidateByMobileNumber(mobileNumber, options.excludeCandidateId);

  if (existing) {
    const field =
      options.registrationField === "phone" ? "contactDetails.phone" : "contactDetails.mobileNumber";

    throw new ApiError(409, "DUPLICATE_MOBILE_NUMBER", "A candidate with this mobile number already exists", [
      {
        field,
        message: `Mobile number already used by ${existing.candidateId}`,
      },
    ]);
  }
}

async function createQueuedSyncJob(actor: AuthSession, candidate: SerializedCandidate, requestId?: string) {
  const existingQueuedJob = await SyncJobModel.findOne({
    candidateId: candidate.candidateId,
    status: { $in: ["queued", "processing"] },
  }).select({ syncJobId: 1 });

  if (existingQueuedJob) {
    throw new ApiError(409, "SYNC_ALREADY_QUEUED", "A sync job is already queued for this candidate");
  }

  const syncJobId = createPrefixedId("sync");
  const syncJob = await SyncJobModel.create({
    syncJobId,
    entityType: "candidate",
    entityId: candidate.candidateId,
    candidateId: candidate.candidateId,
    maxAttempts: 3,
    status: "queued",
    payloadSnapshot: candidate,
    createdByUserId: actor.user.id,
  });

  await OutboxEventModel.create({
    outboxEventId: createPrefixedId("evt"),
    eventType: "candidate.sync.queued",
    entityType: "candidate",
    entityId: candidate.candidateId,
    payload: {
      candidateId: candidate.candidateId,
      syncJobId,
    },
  });

  await CandidateModel.updateOne(
    { candidateId: candidate.candidateId },
    {
      $set: {
        syncState: {
          status: "queued",
          lastJobId: syncJobId,
          lastAttemptAt: null,
          lastSuccessAt: candidate.syncState?.lastSuccessAt ?? null,
          lastFailureCode: null,
          lastFailureMessage: null,
          retryCount: candidate.syncState?.retryCount ?? 0,
        },
        updatedByUserId: actor.user.id,
      },
    },
  );

  await writeAuditLog({
    action: "candidate.sync.queued",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidate.candidateId,
    metadata: { syncJobId },
    requestId,
  });

  return serializeSyncJob(syncJob);
}

async function createCandidateRecord(actor: AuthSession, input: CreateCandidateInput, options: CandidateCreateOptions = {}) {
  ensureCanWriteCandidates(actor);

  const normalized = buildCandidateRecord(createCandidateSchema.parse(input));
  await ensureUniqueMobileNumber(normalized.mobileNumber, {
    registrationField: options.registrationField,
  });

  const created = await CandidateModel.create({
    candidateId: createPrefixedId("cand"),
    ...normalized,
    referenceCourseId: options.referenceCourseId?.trim() || null,
    referenceCourseName: options.referenceCourseName?.trim() || null,
    sidhCandidateId: null,
    syncState: {
      status: "not_queued",
      lastJobId: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureCode: null,
      lastFailureMessage: null,
      retryCount: 0,
    },
    sourceImportJobId: options.sourceImportJobId ?? null,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  const serialized = serializeCandidate(created);

  if (!options.skipAudit) {
    await writeAuditLog({
      action: "candidate.created",
      actorUserId: actor.user.id,
      entityType: "candidate",
      entityId: created.candidateId,
      metadata: {
        centerId: input.centerId,
        programId: input.programId,
        referenceCourseId: options.referenceCourseId ?? null,
        referenceCourseName: options.referenceCourseName ?? null,
        sourceImportJobId: options.sourceImportJobId ?? null,
        createdByUserId: actor.user.id,
      },
      requestId: options.requestId,
    });
  }

  if (options.queueSync && input.registrationMode === "internal_registration") {
    const syncJob = await createQueuedSyncJob(actor, serialized, options.requestId);
    return {
      ...serialized,
      syncState: {
        ...(serialized.syncState ?? {}),
        status: "queued",
        lastJobId: syncJob.syncJobId,
      },
    };
  }

  return serialized;
}

function normalizeImportHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCellValue(row: Record<string, unknown>, keys: string[]) {
  const keyMap = new Map(Object.keys(row).map((key) => [normalizeImportHeader(key), row[key]]));

  for (const key of keys) {
    const value = keyMap.get(normalizeImportHeader(key));
    if (value !== undefined) {
      return value;
    }
  }

  return "";
}

function mapImportRowToCandidateInput(row: Record<string, unknown>): CreateCandidateRegistrationInput {
  const courseName = String(
    getCellValue(row, [
      "Course (reference only)",
      "Course",
      "Course Name",
      "CourseName",
      "Reference Course",
    ]),
  ).trim();

  return {
    program: normalizeCandidateProgram(getCellValue(row, ["Program"])) as CreateCandidateRegistrationInput["program"],
    personalDetails: {
      namePrefix: normalizeCandidateNamePrefix(
        getCellValue(row, ["Name Prefix", "NamePrefix", "Salutation"]),
      ) as CreateCandidateRegistrationInput["personalDetails"]["namePrefix"],
      firstName: String(getCellValue(row, ["Full Name", "FullName", "First Name", "FirstName"])),
      gender: normalizeCandidateGender(getCellValue(row, ["Gender"])) as CreateCandidateRegistrationInput["personalDetails"]["gender"],
      dob: parseTemplateDate(getCellValue(row, ["DOB", "DateofBirth", "Date of Birth"])),
      fatherName: String(getCellValue(row, ["Father's Name", "FathersName", "Father Name", "FatherName"])),
      guardianName: String(getCellValue(row, ["Guardian Name", "GuardianName", "Guardian's Name"])),
    },
    contactDetails: {
      email: String(getCellValue(row, ["Email", "EmailID", "Email Id"])),
      countryCode: String(getCellValue(row, ["Country Code", "CountryCode"])) || "91",
      phone: String(getCellValue(row, ["Phone", "MobileNo", "Mobile Number"])),
    },
    locationDetails: {
      state: normalizeCandidateState(getCellValue(row, ["State"])),
      district: normalizeCandidateDistrict(
        getCellValue(row, ["State"]),
        getCellValue(row, ["District", "City", "DomicileDistrict", "PermanentAddressDistrict"]),
      ),
      centerName: String(getCellValue(row, ["Center Name", "Centre Name", "CenterName", "CentreName"])),
    },
    ...(courseName
      ? {
          referenceDetails: {
            courseName,
          },
        }
      : {}),
  };
}

export async function createCandidate(actor: AuthSession, input: CreateCandidateRegistrationInput, options?: CandidateCreateOptions) {
  await connectToDatabase();
  const registrationInput = createCandidateRegistrationSchema.parse(input);
  const context = await resolveCandidateRegistrationContext(actor, {
    centerId: registrationInput.locationDetails?.centerId,
    centerName: registrationInput.locationDetails?.centerName,
  });
  const referenceCourse = await resolveReferenceCourseDetails(registrationInput.referenceDetails ?? null);

  return createCandidateRecord(actor, expandCandidateRegistrationInput(registrationInput, context), {
    ...options,
    referenceCourseId: referenceCourse.courseId,
    referenceCourseName: referenceCourse.courseName,
    registrationField: "phone",
  });
}

export async function updateCandidate(actor: AuthSession, candidateId: string, patch: UpdateCandidateInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);
  assertLearnerMutableBeforeSidh(candidate as never);

  const mergedInput = createCandidateSchema.parse(mergeCandidateInput(buildCandidateInputFromDocument(candidate as never), patch));
  const normalized = buildCandidateRecord(mergedInput);
  const referenceCourse =
    patch.referenceDetails !== undefined
      ? await resolveReferenceCourseDetails(patch.referenceDetails)
      : {
          courseId: candidate.referenceCourseId ?? null,
          courseName: candidate.referenceCourseName ?? null,
        };

  await Promise.all([ensureProgramExists(mergedInput.programId), ensureTrainingCenterExists(mergedInput.centerId)]);
  await ensureUniqueMobileNumber(normalized.mobileNumber, { excludeCandidateId: candidateId });

  Object.assign(candidate, normalized, {
    referenceCourseId: referenceCourse.courseId,
    referenceCourseName: referenceCourse.courseName,
    updatedByUserId: actor.user.id,
  });
  await candidate.save();

  await writeAuditLog({
    action: "candidate.updated",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidateId,
    metadata: {
      programId: candidate.programId,
      centerId: candidate.centerId,
      referenceCourseId: candidate.referenceCourseId,
      referenceCourseName: candidate.referenceCourseName,
      updatedByUserId: actor.user.id,
    },
    requestId,
  });

  return serializeCandidate(candidate);
}

export async function deleteCandidate(actor: AuthSession, candidateId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);
  assertLearnerMutableBeforeSidh(candidate as never);

  await Promise.all([
    SyncJobModel.deleteMany({ candidateId }),
    candidate.deleteOne(),
  ]);

  await writeAuditLog({
    action: "candidate.deleted",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidateId,
    metadata: {
      centerId: candidate.centerId,
      programId: candidate.programId,
      fullName: candidate.fullName,
    },
    requestId,
  });

  return { candidateId, deleted: true };
}

export async function getCandidate(actor: AuthSession, candidateId: string) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  return serializeCandidate(candidate);
}

function createExactMatchRegex(value?: string) {
  const trimmed = normalizeWhitespace(value);

  if (!trimmed) {
    return null;
  }

  return new RegExp(`^${escapeRegExp(trimmed)}$`, "i");
}

function appendFilterCondition(conditions: Array<Record<string, unknown>>, condition: Record<string, unknown>) {
  conditions.push(condition);
}

function appendRegisteredDateFilter(
  filter: Record<string, unknown>,
  registeredFrom?: string,
  registeredTo?: string,
) {
  if (!registeredFrom && !registeredTo) {
    return;
  }

  const createdAt: Record<string, Date> = {};

  if (registeredFrom) {
    createdAt.$gte = new Date(`${registeredFrom}T00:00:00.000+05:30`);
  }

  if (registeredTo) {
    createdAt.$lte = new Date(`${registeredTo}T23:59:59.999+05:30`);
  }

  filter.createdAt = createdAt;
}

const CANDIDATE_EXPORT_MAX_ROWS = 50_000;

async function buildCandidateListFilter(actor: AuthSession, query: CandidateExportQuery) {
  const filter: Record<string, unknown> = {};
  const andConditions: Array<Record<string, unknown>> = [];
  const scopedCenterFilter = query.eligibleForBatchId ? undefined : resolveScopedCenterFilter(actor, query.centerId);
  const searchRegex = createSearchRegex(query.search);
  const stateRegex = createExactMatchRegex(query.state);
  const districtRegex = createExactMatchRegex(query.district);

  if (Array.isArray(scopedCenterFilter)) {
    filter.centerId = { $in: scopedCenterFilter };
  } else if (scopedCenterFilter) {
    filter.centerId = scopedCenterFilter;
  }

  if (query.programId) {
    filter.programId = query.programId;
  }

  if (query.registrationMode) {
    filter.registrationMode = query.registrationMode;
  }

  if (query.syncStatus) {
    filter["syncState.status"] = query.syncStatus;
  }

  if (query.referenceCourseId) {
    filter.referenceCourseId = query.referenceCourseId;
  }

  if (query.gender) {
    filter.gender = query.gender;
  }

  if (searchRegex) {
    appendFilterCondition(andConditions, {
      $or: [
        { fullName: searchRegex },
        { mobileNumber: searchRegex },
        { sidhCandidateId: searchRegex },
        { candidateId: searchRegex },
        { email: searchRegex },
      ],
    });
  }

  if (stateRegex) {
    appendFilterCondition(andConditions, {
      $or: [{ "permanentAddress.state": stateRegex }, { domicileState: stateRegex }],
    });
  }

  if (districtRegex) {
    appendFilterCondition(andConditions, {
      $or: [
        { "permanentAddress.district": districtRegex },
        { "permanentAddress.city": districtRegex },
        { domicileDistrict: districtRegex },
      ],
    });
  }

  if (query.eligibleForBatchId) {
    await applyBatchEnrollmentEligibilityFilters(actor, query.eligibleForBatchId, filter, andConditions, {
      userCenterId: query.centerId,
    });
  }

  appendRegisteredDateFilter(filter, query.registeredFrom, query.registeredTo);

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  return filter;
}

export async function listCandidates(actor: AuthSession, query: CandidateListQuery): Promise<PagedList<SerializedCandidate>> {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const filter = await buildCandidateListFilter(actor, query);
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    CandidateModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    CandidateModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeCandidate(item)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function exportCandidates(actor: AuthSession, query: CandidateExportQuery) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const filter = await buildCandidateListFilter(actor, query);
  const total = await CandidateModel.countDocuments(filter);

  if (total > CANDIDATE_EXPORT_MAX_ROWS) {
    throw new ApiError(
      400,
      "CANDIDATE_EXPORT_TOO_LARGE",
      `Export is limited to ${CANDIDATE_EXPORT_MAX_ROWS.toLocaleString()} learners. Narrow your filters and try again.`,
    );
  }

  const [candidates, templateOptions] = await Promise.all([
    CandidateModel.find(filter).sort({ createdAt: -1 }).limit(CANDIDATE_EXPORT_MAX_ROWS).lean(),
    listCandidateImportTemplateOptions(actor),
  ]);
  const buffer = await buildCandidateExportWorkbook(candidates as CandidateLike[], templateOptions);

  return {
    buffer,
    total,
  };
}

export async function linkExistingSidhCandidate(actor: AuthSession, input: LinkExistingSidhCandidateInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);
  resolveScopedCenterFilter(actor, input.centerId);

  await Promise.all([ensureProgramExists(input.programId), ensureTrainingCenterExists(input.centerId)]);

  const existingSidhCandidate = await CandidateModel.findOne({ sidhCandidateId: input.sidhCandidateId }).select({ candidateId: 1 });

  if (existingSidhCandidate) {
    throw new ApiError(409, "SIDH_CANDIDATE_ALREADY_LINKED", "This SIDH candidate is already linked internally");
  }

  const duplicateHash = createDuplicateHash({
    dateOfBirth: input.dateOfBirth,
    fullName: input.fullName,
    idNumber: input.sidhCandidateId,
    idType: "SIDH_CANDIDATE_ID",
    mobileNumber: input.mobileNumber,
  });

  await ensureUniqueMobileNumber(input.mobileNumber, { registrationField: "mobileNumber" });

  const candidate = await CandidateModel.create({
    candidateId: createPrefixedId("cand"),
    registrationMode: "existing_sidh_link",
    fullName: normalizeWhitespace(input.fullName),
    normalizedFullName: normalizeFullName(input.fullName),
    salutation: null,
    gender: null,
    dateOfBirth: parseDate(input.dateOfBirth),
    email: null,
    maritalStatus: null,
    fathersName: null,
    mothersName: null,
    guardiansName: "Linked from SIDH",
    religion: null,
    category: null,
    disability: false,
    typeOfDisability: null,
    domicileState: null,
    domicileDistrict: null,
    idType: "SIDH_CANDIDATE_ID",
    typeOfAlternateId: null,
    aadhaarReferenceNo: null,
    idNumber: input.sidhCandidateId,
    normalizedIdNumber: normalizeIdValue(input.sidhCandidateId),
    countryCode: "91",
    mobileNumber: input.mobileNumber,
    educationLevel: null,
    permanentAddress: {
      address: null,
      state: null,
      district: null,
      pinCode: null,
      city: null,
      tehsil: null,
      constituency: null,
    },
    communicationAddress: {
      sameAsPermanent: true,
      address: null,
      state: null,
      district: null,
      pinCode: null,
      city: null,
      tehsil: null,
      constituency: null,
    },
    trainingStatus: null,
    previousExperienceSector: null,
    monthsOfPreviousExperience: null,
    employed: null,
    employmentStatus: null,
    employmentDetails: null,
    heardAboutUs: null,
    programId: input.programId,
    centerId: input.centerId,
    duplicateHash,
    sidhCandidateId: input.sidhCandidateId,
    syncState: {
      status: "linked",
      lastJobId: null,
      lastAttemptAt: null,
      lastSuccessAt: new Date(),
      lastFailureCode: null,
      lastFailureMessage: null,
      retryCount: 0,
    },
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "candidate.sidh_linked",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidate.candidateId,
    metadata: { sidhCandidateId: input.sidhCandidateId },
    requestId,
  });

  return serializeCandidate(candidate);
}

export async function createCandidateImportJob(
  actor: AuthSession,
  input: CandidateImportInput | undefined,
  fileName: string,
  workbookBuffer: ArrayBuffer,
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);
  const context = await resolveCandidateRegistrationContext(actor, input);

  let workbookSheets: Awaited<ReturnType<typeof readWorkbookSheetsFromArrayBuffer>>;

  try {
    workbookSheets = await readWorkbookSheetsFromArrayBuffer(workbookBuffer, { defaultValue: "" });
  } catch (error) {
    throw new ApiError(
      400,
      "IMPORT_WORKBOOK_UNREADABLE",
      error instanceof Error
        ? `Unable to read the Excel file. Re-download the latest template and try again. (${error.message})`
        : "Unable to read the Excel file. Re-download the latest template and try again.",
    );
  }

  const firstSheet = workbookSheets.find((sheet) => normalizeWhitespace(sheet.name).toLowerCase() === "candidate import template") ?? workbookSheets[0];

  if (!firstSheet) {
    throw new ApiError(400, "IMPORT_EMPTY_WORKBOOK", "Workbook does not contain any sheets");
  }

  const rawRows = firstSheet.rows;
  const seenMobileNumbers = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  for (const [index, rawRow] of rawRows.entries()) {
    const rowNumber = index + 2;
    const rowId = createPrefixedId("impr");
    const registrationInput = mapImportRowToCandidateInput(rawRow);

    try {
      const parsedRegistrationInput = createCandidateRegistrationSchema.parse(registrationInput);
      const resolvedReferenceCourse = parsedRegistrationInput.referenceDetails
        ? await resolveReferenceCourseDetails(parsedRegistrationInput.referenceDetails)
        : null;
      const stagedRegistrationInput = resolvedReferenceCourse?.courseId
        ? {
            ...parsedRegistrationInput,
            referenceDetails: {
              courseId: resolvedReferenceCourse.courseId,
              courseName: resolvedReferenceCourse.courseName,
            },
          }
        : parsedRegistrationInput;
      const candidateInput = expandCandidateRegistrationInput(stagedRegistrationInput, context);
      const parsed = createCandidateSchema.parse(candidateInput);
      const normalized = buildCandidateRecord(parsed);
      const mobileNumber = normalizeMobileNumber(parsed.contactDetails.mobileNumber);
      const existing = await findCandidateByMobileNumber(mobileNumber);

      if (existing || seenMobileNumbers.has(mobileNumber)) {
        duplicateRows += 1;
        rows.push({
          rowId,
          rowNumber,
          raw: rawRow,
          normalized: stagedRegistrationInput,
          status: "duplicate",
          errors: [{
            field: "contactDetails.phone",
            message: existing ? `Matches existing candidate ${existing.candidateId}` : "Matches another row in this import",
          }],
          duplicateOfCandidateId: existing?.candidateId ?? null,
          candidateId: null,
        });
        continue;
      }

      seenMobileNumbers.add(mobileNumber);
      validRows += 1;
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
        normalized: {
          ...stagedRegistrationInput,
          _duplicateHash: normalized.duplicateHash,
        },
        status: "valid",
        errors: [],
        duplicateOfCandidateId: null,
        candidateId: null,
      });
    } catch (error) {
      invalidRows += 1;
      const issues = error instanceof ApiError ? error.errors : "issues" in (error as object) ? (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues : [];
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
          normalized: registrationInput,
        status: "invalid",
        errors: Array.isArray(issues)
          ? issues.map((issue) => ({ field: "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : "field" in issue ? issue.field : undefined, message: issue.message }))
          : [{ message: "Invalid row" }],
        duplicateOfCandidateId: null,
        candidateId: null,
      });
    }
  }

  const job = await ImportJobModel.create({
    importJobId: createPrefixedId("imp"),
    fileName,
    status: "staged",
    programId: context.programId,
    centerId: context.centerId,
    registrationMode: context.registrationMode,
    totalRows: rawRows.length,
    validRows,
    invalidRows,
    duplicateRows,
    committedRows: 0,
    rows: [],
    createdByUserId: actor.user.id,
  });

  await persistImportRows(job.importJobId, rows);

  await writeAuditLog({
    action: "candidate.import.staged",
    actorUserId: actor.user.id,
    entityType: "candidate_import",
    entityId: job.importJobId,
    metadata: { fileName, totalRows: rawRows.length, validRows, invalidRows, duplicateRows },
    requestId,
  });

  return serializeImportJob(job);
}

export async function getCandidateImportJob(actor: AuthSession, importJobId: string) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);
  return serializeImportJob(job);
}

export async function listCandidateImportRows(
  actor: AuthSession,
  importJobId: string,
  page: number,
  pageSize: number,
  status?: string,
) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);

  if (await importJobUsesExternalRows(importJobId)) {
    const filter: Record<string, unknown> = { importJobId };
    if (status) {
      filter.status = status;
    }

    const start = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      CandidateImportRowModel.find(filter).sort({ rowNumber: 1 }).skip(start).limit(pageSize).lean(),
      CandidateImportRowModel.countDocuments(filter),
    ]);

    return {
      items: items.map((row) => serializeImportRow(row as Record<string, unknown>)),
      page,
      pageSize,
      total,
    };
  }

  return listEmbeddedImportRows(job, page, pageSize, status);
}

export async function commitCandidateImportJob(actor: AuthSession, importJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);

  if (job.status === "committed") {
    throw new ApiError(409, "IMPORT_ALREADY_COMMITTED", "This import job has already been committed");
  }

  let committedRows = 0;

  if (await importJobUsesExternalRows(importJobId)) {
    const COMMIT_BATCH_SIZE = 100;

    while (true) {
      const batch = await CandidateImportRowModel.find({ importJobId, status: "valid" })
        .sort({ rowNumber: 1 })
        .limit(COMMIT_BATCH_SIZE)
        .lean();

      if (batch.length === 0) {
        break;
      }

      for (const row of batch) {
        try {
          const normalizedRow = row.normalized as Record<string, unknown>;
          const candidateInput = normalizeImportedRowToCandidateInput(normalizedRow, {
            centerId: job.centerId,
            programId: job.programId,
            registrationMode: job.registrationMode as "internal_registration" | "existing_sidh_link",
          });
          const referenceDetails =
            normalizedRow.referenceDetails && typeof normalizedRow.referenceDetails === "object"
              ? (normalizedRow.referenceDetails as { courseId?: string; courseName?: string })
              : null;
          const referenceCourse = await resolveReferenceCourseDetails(referenceDetails);
          const createdCandidate = await createCandidateRecord(actor, candidateInput, {
            queueSync: false,
            requestId,
            skipAudit: true,
            sourceImportJobId: importJobId,
            referenceCourseId: referenceCourse.courseId,
            referenceCourseName: referenceCourse.courseName,
          });

          committedRows += 1;
          await CandidateImportRowModel.updateOne(
            { rowId: row.rowId },
            {
              $set: {
                status: "committed",
                candidateId: createdCandidate.candidateId,
              },
            },
          );
        } catch (error) {
          await CandidateImportRowModel.updateOne(
            { rowId: row.rowId },
            {
              $set: {
                status: "skipped",
                validationErrors: [
                  ...readImportRowValidationErrors(row as Record<string, unknown>),
                  {
                    message: error instanceof Error ? error.message : "Unable to commit row",
                  },
                ],
              },
            },
          );
        }
      }
    }
  } else {
    const updatedRows: Array<Record<string, unknown>> = [];

    for (const row of Array.from(job.rows as unknown as Array<Record<string, unknown>>)) {
      if (row.status !== "valid") {
        updatedRows.push(row);
        continue;
      }

      try {
        const normalizedRow = row.normalized as Record<string, unknown>;
        const candidateInput = normalizeImportedRowToCandidateInput(normalizedRow, {
          centerId: job.centerId,
          programId: job.programId,
          registrationMode: job.registrationMode as "internal_registration" | "existing_sidh_link",
        });
        const referenceDetails =
          normalizedRow.referenceDetails && typeof normalizedRow.referenceDetails === "object"
            ? (normalizedRow.referenceDetails as { courseId?: string; courseName?: string })
            : null;
        const referenceCourse = await resolveReferenceCourseDetails(referenceDetails);
        const createdCandidate = await createCandidateRecord(actor, candidateInput, {
          queueSync: false,
          requestId,
          skipAudit: true,
          sourceImportJobId: importJobId,
          referenceCourseId: referenceCourse.courseId,
          referenceCourseName: referenceCourse.courseName,
        });

        committedRows += 1;
        updatedRows.push({
          ...row,
          status: "committed",
          candidateId: createdCandidate.candidateId,
        });
      } catch (error) {
        updatedRows.push({
          ...row,
          status: "skipped",
          validationErrors: [
            ...readImportRowValidationErrors(row as Record<string, unknown>),
            {
              message: error instanceof Error ? error.message : "Unable to commit row",
            },
          ],
        });
      }
    }

    job.rows = updatedRows as never;
  }

  job.status = "committed";
  job.committedRows = committedRows;
  job.committedAt = new Date();
  await job.save();

  await writeAuditLog({
    action: "candidate.import.committed",
    actorUserId: actor.user.id,
    entityType: "candidate_import",
    entityId: importJobId,
    metadata: { committedRows },
    requestId,
  });

  return serializeImportJob(job);
}

export async function queueCandidateSync(actor: AuthSession, candidateId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  if (candidate.registrationMode === "existing_sidh_link") {
    throw new ApiError(409, "SYNC_NOT_REQUIRED", "Existing SIDH linked candidates do not require registration sync");
  }

  return createQueuedSyncJob(actor, serializeCandidate(candidate), requestId);
}

export async function queueCandidateSyncBulk(actor: AuthSession, input: BulkQueueCandidateSyncInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidateIds = Array.from(new Set(bulkQueueCandidateSyncSchema.parse(input).candidateIds));
  const items: Array<{ candidateId: string; message: string; status: "queued" | "skipped" }> = [];

  for (const candidateId of candidateIds) {
    const candidate = await CandidateModel.findOne({ candidateId });

    if (!candidate) {
      items.push({ candidateId, message: "Candidate not found", status: "skipped" });
      continue;
    }

    resolveScopedCenterFilter(actor, candidate.centerId);

    if (candidate.registrationMode === "existing_sidh_link" || candidate.sidhCandidateId) {
      items.push({ candidateId, message: "Already linked with Skill India", status: "skipped" });
      continue;
    }

    try {
      await createQueuedSyncJob(actor, serializeCandidate(candidate), requestId);
      items.push({ candidateId, message: "Queued for Skill India registration", status: "queued" });
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === "SYNC_ALREADY_QUEUED") {
        items.push({ candidateId, message: "Already queued for delivery", status: "skipped" });
        continue;
      }

      throw error;
    }
  }

  return {
    items,
    queuedCount: items.filter((item) => item.status === "queued").length,
    requestedCount: candidateIds.length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

export async function listSyncJobs(actor: AuthSession, query: SyncJobsQuery) {
  await connectToDatabase();
  ensureCanReadSyncJobs(actor);

  const scopedCenterFilter = resolveScopedCenterFilter(actor);
  const candidateIds = Array.isArray(scopedCenterFilter)
    ? (await CandidateModel.find({ centerId: { $in: scopedCenterFilter } }).select({ candidateId: 1 })).map((item) => item.candidateId)
    : undefined;
  const filter: Record<string, unknown> = {};

  if (query.entityType) {
    filter.entityType = query.entityType;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (candidateIds) {
    filter.candidateId = { $in: candidateIds };
  }

  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    SyncJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    SyncJobModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeSyncJob(item)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getSyncJob(actor: AuthSession, syncJobId: string) {
  await connectToDatabase();
  ensureCanReadSyncJobs(actor);

  const job = await SyncJobModel.findOne({ syncJobId });

  if (!job) {
    throw new ApiError(404, "SYNC_JOB_NOT_FOUND", "Sync job not found");
  }

  const candidate = await CandidateModel.findOne({ candidateId: job.candidateId }).select({ centerId: 1 });
  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found for sync job");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  const transactions = await SidhApiTransactionModel.find({ syncJobId }).sort({ createdAt: -1 }).limit(20);

  return {
    ...serializeSyncJob(job),
    transactions: transactions.map((transaction) => ({
      transactionId: transaction.transactionId,
      operation: transaction.operation,
      endpoint: transaction.endpoint,
      responseStatus: transaction.responseStatus,
      success: transaction.success,
      createdAt: toIsoDate(transaction.createdAt),
    })),
  };
}

export async function retrySyncJob(actor: AuthSession, syncJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteSyncJobs(actor);

  const job = await SyncJobModel.findOne({ syncJobId });

  if (!job) {
    throw new ApiError(404, "SYNC_JOB_NOT_FOUND", "Sync job not found");
  }

  const candidate = await CandidateModel.findOne({ candidateId: job.candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  if (job.status === "processing") {
    throw new ApiError(409, "SYNC_JOB_BUSY", "Sync job is currently processing");
  }

  job.status = "queued";
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = new Date();
  await job.save();

  candidate.syncState = {
    ...(candidate.syncState ?? {}),
    status: "queued",
    lastJobId: syncJobId,
  } as never;
  await candidate.save();

  await writeAuditLog({
    action: "candidate.sync.retried",
    actorUserId: actor.user.id,
    entityType: "sync_job",
    entityId: syncJobId,
    metadata: { candidateId: job.candidateId },
    requestId,
  });

  return serializeSyncJob(job);
}