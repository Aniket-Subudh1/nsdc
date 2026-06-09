import {
  deriveSidhBatchReferenceCode,
  SIDH_BATCH_ENUM_CATEGORIES,
  type SidhBatchFieldKey,
  type SidhBatchFieldOptionsResponse,
} from "@/lib/sidh-batch-field-options";
import { ApiError } from "@/lib/server/http";
import { getSidhBatchContext } from "@/lib/server/env";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchModel } from "@/lib/server/models/batch";
import { CourseModel, type CourseDocument } from "@/lib/server/models/course";
import { CourseVersionModel } from "@/lib/server/models/course-version";
import { ProgramModel } from "@/lib/server/models/program";
import { ReferenceValueModel } from "@/lib/server/models/reference-value";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { canManageCoreMasters, canManageMasters, getPermissionsForRoles } from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import { type AuthSession } from "@/lib/server/services/session";

type PagedList<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type ListMastersInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: "active" | "inactive";
};

type ProgramInput = {
  assessmentMode?: string;
  batchCategoryType?: string;
  batchType?: string;
  code: string;
  createdSource?: string;
  description?: string;
  feePaidBy?: string;
  name: string;
  requestId?: string;
  skillingCategoryId?: number;
  skillingCategoryName?: string;
  skillingCategoryScheme?: string;
  status: "active" | "inactive";
  syncToSidh: boolean;
};

type SchemeInput = {
  assessmentMode?: string;
  batchCategoryType?: string;
  batchType?: string;
  beneficiaryType?: string;
  code: string;
  createdSource?: string;
  description?: string;
  fundingType?: string;
  name: string;
  requestId?: string;
  sidhSchemeId?: string;
  sidhSchemeReferenceId?: string;
  sidhSchemeType?: string;
  status: "active" | "inactive";
  syncEnabled: boolean;
  validFrom?: string;
  validTo?: string;
};

type SectorInput = {
  code: string;
  description?: string;
  name: string;
  requestId?: string;
  status: "active" | "inactive";
};

type CourseInput = {
  approvalDate?: string;
  approvalStatus: "approved" | "pending" | "rejected" | "expired";
  associatedQpOrJobRole?: string;
  courseCode?: string;
  courseName: string;
  currentVersion?: number;
  gtUploadedDurationHours?: number;
  internalCourseCode?: string;
  jobRole?: string;
  jobRoleMappingType: "QP_NOS" | "JOB_ROLE" | "HYBRID";
  minimumAge: number;
  nsqfLevel: string | number;
  price: number;
  programIds: string[];
  qpCode?: string;
  requestId?: string;
  schemeIds: string[];
  sectorId: string;
  sidhCourseId?: string;
  shortForm?: string;
  status: "active" | "inactive";
  totalHours?: number;
  trainingHours?: number;
  trainingPerDayHours?: number;
  validity?: number;
  validityEndDate?: string;
  validityStartDate?: string;
};

type CourseListInput = ListMastersInput & {
  approvalStatus?: "approved" | "pending" | "rejected" | "expired";
  programId?: string;
  sectorId?: string;
  validOn?: string;
};

function ensureCanReadMasters(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("masters:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to master data");
  }
}

function ensureCanWriteMasters(actor: AuthSession) {
  if (!canManageMasters(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage master data");
  }
}

function ensureCanWriteCoreMasters(actor: AuthSession) {
  if (!canManageCoreMasters(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage programs, sectors, or schemes");
  }
}

function ensureCanReadReferenceData(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("reference-data:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to candidate reference data");
  }
}

function normalizeString(value: string) {
  return value.trim();
}

function normalizeStringArray(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

function ensureDateRange(startDate: string, endDate: string) {
  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    throw new ApiError(400, "INVALID_VALIDITY_RANGE", "Validity end date must be on or after the start date");
  }
}

function serializeProgram(program: {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  code: string;
  createdAt?: Date;
  createdSource?: string | null;
  description?: string | null;
  feePaidBy?: string | null;
  name: string;
  programId: string;
  skillingCategoryId?: number | null;
  skillingCategoryName?: string | null;
  skillingCategoryScheme?: string | null;
  status: "active" | "inactive";
  syncToSidh: boolean;
  verifiedAt?: Date | null;
  verifiedForSidh: boolean;
  updatedAt?: Date;
}) {
  return {
    id: program.programId,
    programId: program.programId,
    name: program.name,
    code: program.code,
    description: program.description ?? null,
    syncToSidh: program.syncToSidh,
    skillingCategoryId: program.skillingCategoryId ?? 1,
    skillingCategoryName: program.skillingCategoryName ?? null,
    skillingCategoryScheme: program.skillingCategoryScheme ?? "Fee Based",
    assessmentMode: program.assessmentMode ?? "Self",
    batchType: program.batchType ?? "Regular",
    batchCategoryType: program.batchCategoryType ?? "Fee Based",
    feePaidBy: program.feePaidBy ?? "Self-Paid",
    createdSource: program.createdSource ?? "Created for NSDC Academy Partners",
    verifiedForSidh: program.verifiedForSidh,
    verifiedAt: toIsoDate(program.verifiedAt),
    status: program.status,
    createdAt: toIsoDate(program.createdAt),
    updatedAt: toIsoDate(program.updatedAt),
  };
}

function serializeSector(sector: {
  code: string;
  createdAt?: Date;
  description?: string | null;
  name: string;
  sectorId: string;
  status: "active" | "inactive";
  updatedAt?: Date;
}) {
  return {
    id: sector.sectorId,
    sectorId: sector.sectorId,
    name: sector.name,
    code: sector.code,
    description: sector.description ?? null,
    status: sector.status,
    createdAt: toIsoDate(sector.createdAt),
    updatedAt: toIsoDate(sector.updatedAt),
  };
}

function serializeScheme(scheme: {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  beneficiaryType?: string | null;
  code: string;
  createdAt?: Date;
  createdSource?: string | null;
  description?: string | null;
  fundingType?: string | null;
  name: string;
  schemeId: string;
  sidhSchemeId?: string | null;
  sidhSchemeReferenceId?: string | null;
  sidhSchemeType?: string | null;
  status: "active" | "inactive";
  syncEnabled: boolean;
  updatedAt?: Date;
  validFrom?: Date | null;
  validTo?: Date | null;
  verifiedAt?: Date | null;
  verifiedForSidh: boolean;
}) {
  return {
    id: scheme.schemeId,
    schemeId: scheme.schemeId,
    name: scheme.name,
    code: scheme.code,
    description: scheme.description ?? null,
    status: scheme.status,
    syncEnabled: scheme.syncEnabled,
    verifiedForSidh: scheme.verifiedForSidh,
    verifiedAt: toIsoDate(scheme.verifiedAt),
    sidhSchemeId: scheme.sidhSchemeId ?? null,
    sidhSchemeReferenceId: scheme.sidhSchemeReferenceId ?? null,
    sidhSchemeType: scheme.sidhSchemeType ?? "feeBased",
    assessmentMode: scheme.assessmentMode ?? "Self",
    batchType: scheme.batchType ?? "Regular",
    batchCategoryType: scheme.batchCategoryType ?? "Fee Based",
    createdSource: scheme.createdSource ?? "Created for NSDC Academy Partners",
    fundingType: scheme.fundingType ?? null,
    beneficiaryType: scheme.beneficiaryType ?? null,
    validFrom: toIsoDate(scheme.validFrom),
    validTo: toIsoDate(scheme.validTo),
    createdAt: toIsoDate(scheme.createdAt),
    updatedAt: toIsoDate(scheme.updatedAt),
  };
}

function serializeCourse(course: CourseDocument) {
  return {
    id: course.courseId,
    courseId: course.courseId,
    sectorId: course.sectorId,
    programIds: course.programIds ?? [],
    schemeIds: course.schemeIds ?? [],
    courseName: course.courseName,
    courseCode: course.sidhCourseId,
    internalCourseCode: course.internalCourseCode,
    sidhCourseId: course.sidhCourseId,
    jobRole: course.associatedQpOrJobRole,
    associatedQpOrJobRole: course.associatedQpOrJobRole,
    nsqfLevel: course.nsqfLevel,
    trainingPerDayHours: course.trainingPerDayHours ?? null,
    totalHours: course.trainingHours,
    trainingHours: course.trainingHours,
    gtUploadedDurationHours: course.gtUploadedDurationHours ?? null,
    approvalStatus: course.approvalStatus,
    approvalDate: toIsoDate(course.approvalDate),
    validity: course.validity ?? null,
    validityStartDate: toIsoDate(course.validityStartDate),
    validityEndDate: toIsoDate(course.validityEndDate),
    shortForm: course.shortForm ?? null,
    minimumAge: course.minimumAge,
    price: course.price,
    qpCode: course.qpCode,
    jobRoleMappingType: course.jobRoleMappingType,
    status: course.status,
    version: course.version,
    createdAt: toIsoDate(course.createdAt),
    updatedAt: toIsoDate(course.updatedAt),
  };
}

function serializeCourseVersion(version: {
  changeSummary?: string | null;
  changedByUserId?: string | null;
  courseId: string;
  createdAt?: Date;
  snapshot: Record<string, unknown>;
  version: number;
}) {
  return {
    courseId: version.courseId,
    version: version.version,
    changedByUserId: version.changedByUserId ?? null,
    changeSummary: version.changeSummary ?? null,
    createdAt: toIsoDate(version.createdAt),
    snapshot: version.snapshot,
  };
}

async function ensureProgramsExist(programIds: string[], { activeOnly = false } = {}) {
  const normalizedProgramIds = normalizeStringArray(programIds);

  if (normalizedProgramIds.length === 0) {
    return normalizedProgramIds;
  }

  const filter: { programId: { $in: string[] }; status?: "active" } = {
    programId: { $in: normalizedProgramIds },
  };

  if (activeOnly) {
    filter.status = "active";
  }

  const programs = await ProgramModel.find(filter).select("programId");

  if (programs.length !== normalizedProgramIds.length) {
    throw new ApiError(400, "PROGRAM_NOT_FOUND", "One or more programs do not exist in the required state");
  }

  return normalizedProgramIds;
}

async function ensureSectorExists(sectorId: string) {
  const sector = await SectorModel.findOne({ sectorId: normalizeString(sectorId) });

  if (!sector) {
    throw new ApiError(400, "SECTOR_NOT_FOUND", "Selected sector does not exist");
  }

  return sector;
}

async function ensureSchemesExist(schemeIds: string[]) {
  const normalizedSchemeIds = normalizeStringArray(schemeIds);

  if (normalizedSchemeIds.length === 0) {
    return normalizedSchemeIds;
  }

  const schemes = await SchemeModel.find({ schemeId: { $in: normalizedSchemeIds } }).select("schemeId");

  if (schemes.length !== normalizedSchemeIds.length) {
    throw new ApiError(400, "SCHEME_NOT_FOUND", "One or more schemes do not exist");
  }

  return normalizedSchemeIds;
}

async function ensureNoCourseValidityOverlap(input: {
  excludeCourseId?: string;
  sidhCourseId: string;
  status: "active" | "inactive";
  validityEndDate: string;
  validityStartDate: string;
}) {
  if (input.status !== "active") {
    return;
  }

  const overlappingCourse = await CourseModel.findOne({
    sidhCourseId: normalizeString(input.sidhCourseId),
    status: "active",
    ...(input.excludeCourseId ? { courseId: { $ne: input.excludeCourseId } } : {}),
    validityStartDate: { $lte: new Date(input.validityEndDate) },
    validityEndDate: { $gte: new Date(input.validityStartDate) },
  }).select("courseId");

  if (overlappingCourse) {
    throw new ApiError(
      409,
      "COURSE_MAPPING_OVERLAP",
      "Another active course mapping already overlaps this SIDH course validity range",
    );
  }
}

async function ensureSchemeSyncMetadata(
  input: Pick<SchemeInput, "sidhSchemeId" | "sidhSchemeReferenceId" | "syncEnabled" | "validFrom" | "validTo">,
) {
  if (input.syncEnabled && !input.sidhSchemeId) {
    throw new ApiError(400, "SCHEME_METADATA_INCOMPLETE", "Sync-enabled schemes require a SIDH Scheme ID");
  }

  if (input.syncEnabled && !input.sidhSchemeReferenceId) {
    throw new ApiError(400, "SCHEME_METADATA_INCOMPLETE", "Sync-enabled schemes require a SIDH Scheme Reference ID");
  }

  if (input.validFrom && input.validTo) {
    ensureDateRange(input.validFrom, input.validTo);
  }
}

async function createCourseVersion(
  course: CourseDocument,
  actorUserId: string,
  changeSummary: string,
) {
  await CourseVersionModel.create({
    courseVersionId: createPrefixedId("cver"),
    courseId: course.courseId,
    version: course.version,
    snapshot: serializeCourse(course),
    changedByUserId: actorUserId,
    changeSummary,
  });
}

export function isCourseUsableOnDate(course: Pick<CourseDocument, "approvalStatus" | "status" | "validityEndDate" | "validityStartDate">, usageDate = new Date()) {
  const targetTime = usageDate.getTime();
  return (
    course.status === "active" &&
    course.approvalStatus === "approved" &&
    course.validityStartDate.getTime() <= targetTime &&
    course.validityEndDate.getTime() >= targetTime
  );
}

export async function listPrograms(
  actor: AuthSession,
  input: ListMastersInput & { syncToSidh?: boolean },
): Promise<PagedList<ReturnType<typeof serializeProgram>>> {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const searchRegex = createSearchRegex(input.search);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  if (input.syncToSidh !== undefined) {
    filter.syncToSidh = input.syncToSidh;
  }

  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { code: searchRegex }];
  }

  const [items, total] = await Promise.all([
    ProgramModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    ProgramModel.countDocuments(filter),
  ]);

  return { items: items.map((item) => serializeProgram(item)), total, page: input.page, pageSize: input.pageSize };
}

export async function createProgram(actor: AuthSession, input: ProgramInput) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const existingProgram = await ProgramModel.findOne({
    $or: [{ code: normalizeString(input.code) }, { name: normalizeString(input.name) }],
  });

  if (existingProgram) {
    throw new ApiError(409, "PROGRAM_EXISTS", "A program with this code or name already exists");
  }

  const program = await ProgramModel.create({
    programId: createPrefixedId("prg"),
    name: normalizeString(input.name),
    code: normalizeString(input.code),
    description: input.description?.trim() || null,
    syncToSidh: input.syncToSidh,
    skillingCategoryId: input.skillingCategoryId ?? 1,
    skillingCategoryName: input.skillingCategoryName?.trim() || null,
    skillingCategoryScheme: input.skillingCategoryScheme?.trim() || "Fee Based",
    assessmentMode: input.assessmentMode?.trim() || "Self",
    batchType: input.batchType?.trim() || "Regular",
    batchCategoryType: input.batchCategoryType?.trim() || "Fee Based",
    feePaidBy: input.feePaidBy?.trim() || "Self-Paid",
    createdSource: input.createdSource?.trim() || "Created for NSDC Academy Partners",
    verifiedForSidh: false,
    verifiedAt: null,
    verifiedByUserId: null,
    status: input.status,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "masters.program.created",
    actorUserId: actor.user.id,
    entityId: program.programId,
    entityType: "program",
    metadata: { code: program.code },
    requestId: input.requestId,
  });

  return serializeProgram(program);
}

export async function updateProgram(
  actor: AuthSession,
  programId: string,
  input: Partial<ProgramInput>,
) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const program = await ProgramModel.findOne({ programId: normalizeString(programId) });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  if (input.code && input.code.trim() !== program.code) {
    const existingProgram = await ProgramModel.findOne({ code: normalizeString(input.code) });
    if (existingProgram) {
      throw new ApiError(409, "PROGRAM_EXISTS", "A program with this code already exists");
    }
  }

  if (input.name !== undefined) {
    program.name = normalizeString(input.name);
  }
  if (input.code !== undefined) {
    program.code = normalizeString(input.code);
  }
  if (input.description !== undefined) {
    program.description = input.description.trim() || null;
  }
  if (input.syncToSidh !== undefined) {
    program.syncToSidh = input.syncToSidh;
  }
  if (input.skillingCategoryId !== undefined) {
    program.skillingCategoryId = input.skillingCategoryId;
  }
  if (input.skillingCategoryName !== undefined) {
    program.skillingCategoryName = input.skillingCategoryName.trim() || null;
  }
  if (input.skillingCategoryScheme !== undefined) {
    program.skillingCategoryScheme = input.skillingCategoryScheme.trim() || "Fee Based";
  }
  if (input.assessmentMode !== undefined) {
    program.assessmentMode = input.assessmentMode.trim() || "Self";
  }
  if (input.batchType !== undefined) {
    program.batchType = input.batchType.trim() || "Regular";
  }
  if (input.batchCategoryType !== undefined) {
    program.batchCategoryType = input.batchCategoryType.trim() || "Fee Based";
  }
  if (input.feePaidBy !== undefined) {
    program.feePaidBy = input.feePaidBy.trim() || "Self-Paid";
  }
  if (input.createdSource !== undefined) {
    program.createdSource = input.createdSource.trim() || "Created for NSDC Academy Partners";
  }
  if (input.status !== undefined) {
    program.status = input.status;
  }

  const touchedFields = [
    input.name,
    input.code,
    input.description,
    input.status,
    input.skillingCategoryId,
    input.skillingCategoryName,
    input.skillingCategoryScheme,
    input.assessmentMode,
    input.batchType,
    input.batchCategoryType,
    input.feePaidBy,
    input.createdSource,
  ].some((value) => value !== undefined);

  if (touchedFields) {
    program.verifiedForSidh = false;
    program.verifiedAt = null;
    program.verifiedByUserId = null;
    program.syncToSidh = false;
  }

  program.updatedByUserId = actor.user.id;
  await program.save();

  await writeAuditLog({
    action: "masters.program.updated",
    actorUserId: actor.user.id,
    entityId: program.programId,
    entityType: "program",
    metadata: input,
    requestId: input.requestId,
  });

  return serializeProgram(program);
}

export async function verifyProgramForSidh(actor: AuthSession, programId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const program = await ProgramModel.findOne({ programId: normalizeString(programId) });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  if (program.status !== "active") {
    throw new ApiError(400, "PROGRAM_NOT_ACTIVE", "Only active programs can be verified for SIDH readiness");
  }

  program.verifiedForSidh = true;
  program.verifiedAt = new Date();
  program.verifiedByUserId = actor.user.id;
  program.updatedByUserId = actor.user.id;
  await program.save();

  await writeAuditLog({
    action: "masters.program.verified",
    actorUserId: actor.user.id,
    entityId: program.programId,
    entityType: "program",
    metadata: { code: program.code },
    requestId,
  });

  return serializeProgram(program);
}

export async function deleteProgram(actor: AuthSession, programId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const normalizedProgramId = normalizeString(programId);
  const program = await ProgramModel.findOne({ programId: normalizedProgramId });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  const [linkedCenter, linkedCourse] = await Promise.all([
    TrainingCenterModel.findOne({ programIds: normalizedProgramId }).select("centerId centerName"),
    CourseModel.findOne({ programIds: normalizedProgramId }).select("courseId courseName"),
  ]);

  if (linkedCenter) {
    throw new ApiError(
      409,
      "PROGRAM_IN_USE",
      `Program is linked to training center ${linkedCenter.centerName ?? linkedCenter.centerId}`,
    );
  }

  if (linkedCourse) {
    throw new ApiError(
      409,
      "PROGRAM_IN_USE",
      `Program is linked to course ${linkedCourse.courseName ?? linkedCourse.courseId}`,
    );
  }

  await program.deleteOne();

  await writeAuditLog({
    action: "masters.program.deleted",
    actorUserId: actor.user.id,
    entityId: program.programId,
    entityType: "program",
    metadata: { code: program.code, name: program.name },
    requestId,
  });

  return serializeProgram(program);
}

export async function syncProgramToSidh(actor: AuthSession, programId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const program = await ProgramModel.findOne({ programId: normalizeString(programId) });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  if (program.status !== "active") {
    throw new ApiError(400, "PROGRAM_NOT_ACTIVE", "Only active programs can be marked ready for SIDH sync");
  }

  if (!program.verifiedForSidh) {
    throw new ApiError(400, "PROGRAM_NOT_VERIFIED", "Verify the program before marking it ready for SIDH");
  }

  if (!program.syncToSidh) {
    program.syncToSidh = true;
    program.updatedByUserId = actor.user.id;
    await program.save();
  }

  await writeAuditLog({
    action: "masters.program.sync_requested",
    actorUserId: actor.user.id,
    entityId: program.programId,
    entityType: "program",
    metadata: { code: program.code, syncToSidh: program.syncToSidh },
    requestId,
  });

  return serializeProgram(program);
}

export async function listSectors(actor: AuthSession, input: ListMastersInput): Promise<PagedList<ReturnType<typeof serializeSector>>> {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const searchRegex = createSearchRegex(input.search);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { code: searchRegex }];
  }

  const [items, total] = await Promise.all([
    SectorModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    SectorModel.countDocuments(filter),
  ]);

  return { items: items.map((item) => serializeSector(item)), total, page: input.page, pageSize: input.pageSize };
}

export async function createSector(actor: AuthSession, input: SectorInput) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const existingSector = await SectorModel.findOne({
    $or: [{ code: normalizeString(input.code) }, { name: normalizeString(input.name) }],
  });

  if (existingSector) {
    throw new ApiError(409, "SECTOR_EXISTS", "A sector with this code or name already exists");
  }

  const sector = await SectorModel.create({
    sectorId: createPrefixedId("sec"),
    name: normalizeString(input.name),
    code: normalizeString(input.code),
    description: input.description?.trim() || null,
    status: input.status,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "masters.sector.created",
    actorUserId: actor.user.id,
    entityId: sector.sectorId,
    entityType: "sector",
    metadata: { code: sector.code },
    requestId: input.requestId,
  });

  return serializeSector(sector);
}

export async function updateSector(actor: AuthSession, sectorId: string, input: Partial<SectorInput>) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const sector = await SectorModel.findOne({ sectorId: normalizeString(sectorId) });

  if (!sector) {
    throw new ApiError(404, "SECTOR_NOT_FOUND", "Sector not found");
  }

  const nextCode = input.code !== undefined ? normalizeString(input.code) : sector.code;
  const nextName = input.name !== undefined ? normalizeString(input.name) : sector.name;

  if (nextCode !== sector.code || nextName !== sector.name) {
    const existingSector = await SectorModel.findOne({
      sectorId: { $ne: sector.sectorId },
      $or: [{ code: nextCode }, { name: nextName }],
    });

    if (existingSector) {
      throw new ApiError(409, "SECTOR_EXISTS", "A sector with this code or name already exists");
    }
  }

  if (input.name !== undefined) {
    sector.name = nextName;
  }
  if (input.code !== undefined) {
    sector.code = nextCode;
  }
  if (input.description !== undefined) {
    sector.description = input.description.trim() || null;
  }
  if (input.status !== undefined) {
    sector.status = input.status;
  }

  sector.updatedByUserId = actor.user.id;
  await sector.save();

  await writeAuditLog({
    action: "masters.sector.updated",
    actorUserId: actor.user.id,
    entityId: sector.sectorId,
    entityType: "sector",
    metadata: { code: sector.code, name: sector.name },
    requestId: input.requestId,
  });

  return serializeSector(sector);
}

export async function deleteSector(actor: AuthSession, sectorId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const normalizedSectorId = normalizeString(sectorId);
  const sector = await SectorModel.findOne({ sectorId: normalizedSectorId });

  if (!sector) {
    throw new ApiError(404, "SECTOR_NOT_FOUND", "Sector not found");
  }

  const linkedCourse = await CourseModel.findOne({ sectorId: normalizedSectorId }).select("courseId courseName");

  if (linkedCourse) {
    throw new ApiError(
      409,
      "SECTOR_IN_USE",
      `Sector is linked to course ${linkedCourse.courseName ?? linkedCourse.courseId}`,
    );
  }

  await sector.deleteOne();

  await writeAuditLog({
    action: "masters.sector.deleted",
    actorUserId: actor.user.id,
    entityId: sector.sectorId,
    entityType: "sector",
    metadata: { code: sector.code, name: sector.name },
    requestId,
  });

  return serializeSector(sector);
}

export async function listSchemes(
  actor: AuthSession,
  input: ListMastersInput & { syncEnabled?: boolean },
): Promise<PagedList<ReturnType<typeof serializeScheme>>> {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const searchRegex = createSearchRegex(input.search);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  if (input.syncEnabled !== undefined) {
    filter.syncEnabled = input.syncEnabled;
  }

  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { code: searchRegex }, { sidhSchemeId: searchRegex }];
  }

  const [items, total] = await Promise.all([
    SchemeModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    SchemeModel.countDocuments(filter),
  ]);

  return { items: items.map((item) => serializeScheme(item)), total, page: input.page, pageSize: input.pageSize };
}

export async function createScheme(actor: AuthSession, input: SchemeInput) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);
  await ensureSchemeSyncMetadata(input);

  const existingScheme = await SchemeModel.findOne({
    $or: [{ code: normalizeString(input.code) }, { name: normalizeString(input.name) }],
  });

  if (existingScheme) {
    throw new ApiError(409, "SCHEME_EXISTS", "A scheme with this code or name already exists");
  }

  const scheme = await SchemeModel.create({
    schemeId: createPrefixedId("sch"),
    name: normalizeString(input.name),
    code: normalizeString(input.code),
    description: input.description?.trim() || null,
    status: input.status,
    syncEnabled: input.syncEnabled,
    verifiedForSidh: false,
    verifiedAt: null,
    verifiedByUserId: null,
    sidhSchemeId: input.sidhSchemeId?.trim() || null,
    sidhSchemeReferenceId: input.sidhSchemeReferenceId?.trim() || null,
    sidhSchemeType: input.sidhSchemeType?.trim() || "feeBased",
    assessmentMode: input.assessmentMode?.trim() || "Self",
    batchType: input.batchType?.trim() || "Regular",
    batchCategoryType: input.batchCategoryType?.trim() || "Fee Based",
    createdSource: input.createdSource?.trim() || "Created for NSDC Academy Partners",
    fundingType: input.fundingType?.trim() || null,
    beneficiaryType: input.beneficiaryType?.trim() || null,
    validFrom: input.validFrom ? new Date(input.validFrom) : null,
    validTo: input.validTo ? new Date(input.validTo) : null,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "masters.scheme.created",
    actorUserId: actor.user.id,
    entityId: scheme.schemeId,
    entityType: "scheme",
    metadata: { code: scheme.code },
    requestId: input.requestId,
  });

  return serializeScheme(scheme);
}

export async function updateScheme(actor: AuthSession, schemeId: string, input: Partial<SchemeInput>) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const scheme = await SchemeModel.findOne({ schemeId: normalizeString(schemeId) });

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  await ensureSchemeSyncMetadata({
    syncEnabled: input.syncEnabled ?? scheme.syncEnabled,
    sidhSchemeId: input.sidhSchemeId ?? scheme.sidhSchemeId ?? undefined,
    sidhSchemeReferenceId: input.sidhSchemeReferenceId ?? scheme.sidhSchemeReferenceId ?? undefined,
    validFrom: input.validFrom ?? (scheme.validFrom ? scheme.validFrom.toISOString().slice(0, 10) : undefined),
    validTo: input.validTo ?? (scheme.validTo ? scheme.validTo.toISOString().slice(0, 10) : undefined),
  });

  if (input.name !== undefined) {
    scheme.name = normalizeString(input.name);
  }
  if (input.code !== undefined) {
    scheme.code = normalizeString(input.code);
  }
  if (input.description !== undefined) {
    scheme.description = input.description.trim() || null;
  }
  if (input.status !== undefined) {
    scheme.status = input.status;
  }
  if (input.syncEnabled !== undefined) {
    scheme.syncEnabled = input.syncEnabled;
  }
  if (input.sidhSchemeId !== undefined) {
    scheme.sidhSchemeId = input.sidhSchemeId.trim() || null;
  }
  if (input.sidhSchemeReferenceId !== undefined) {
    scheme.sidhSchemeReferenceId = input.sidhSchemeReferenceId.trim() || null;
  }
  if (input.sidhSchemeType !== undefined) {
    scheme.sidhSchemeType = input.sidhSchemeType.trim() || "feeBased";
  }
  if (input.assessmentMode !== undefined) {
    scheme.assessmentMode = input.assessmentMode.trim() || "Self";
  }
  if (input.batchType !== undefined) {
    scheme.batchType = input.batchType.trim() || "Regular";
  }
  if (input.batchCategoryType !== undefined) {
    scheme.batchCategoryType = input.batchCategoryType.trim() || "Fee Based";
  }
  if (input.createdSource !== undefined) {
    scheme.createdSource = input.createdSource.trim() || "Created for NSDC Academy Partners";
  }
  if (input.fundingType !== undefined) {
    scheme.fundingType = input.fundingType.trim() || null;
  }
  if (input.beneficiaryType !== undefined) {
    scheme.beneficiaryType = input.beneficiaryType.trim() || null;
  }
  if (input.validFrom !== undefined) {
    scheme.validFrom = input.validFrom ? new Date(input.validFrom) : null;
  }
  if (input.validTo !== undefined) {
    scheme.validTo = input.validTo ? new Date(input.validTo) : null;
  }

  const touchedFields = [
    input.name,
    input.code,
    input.description,
    input.status,
    input.sidhSchemeId,
    input.sidhSchemeReferenceId,
    input.sidhSchemeType,
    input.assessmentMode,
    input.batchType,
    input.batchCategoryType,
    input.createdSource,
    input.fundingType,
    input.beneficiaryType,
    input.validFrom,
    input.validTo,
  ].some((value) => value !== undefined);

  if (touchedFields) {
    scheme.verifiedForSidh = false;
    scheme.verifiedAt = null;
    scheme.verifiedByUserId = null;
    scheme.syncEnabled = false;
  }

  scheme.updatedByUserId = actor.user.id;
  await scheme.save();

  await writeAuditLog({
    action: "masters.scheme.updated",
    actorUserId: actor.user.id,
    entityId: scheme.schemeId,
    entityType: "scheme",
    metadata: input,
    requestId: input.requestId,
  });

  return serializeScheme(scheme);
}

export async function verifySchemeForSidh(actor: AuthSession, schemeId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const scheme = await SchemeModel.findOne({ schemeId: normalizeString(schemeId) });

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  if (scheme.status !== "active") {
    throw new ApiError(400, "SCHEME_NOT_ACTIVE", "Only active schemes can be verified for SIDH readiness");
  }

  scheme.verifiedForSidh = true;
  scheme.verifiedAt = new Date();
  scheme.verifiedByUserId = actor.user.id;
  scheme.updatedByUserId = actor.user.id;
  await scheme.save();

  await writeAuditLog({
    action: "masters.scheme.verified",
    actorUserId: actor.user.id,
    entityId: scheme.schemeId,
    entityType: "scheme",
    metadata: { code: scheme.code },
    requestId,
  });

  return serializeScheme(scheme);
}

export async function deleteScheme(actor: AuthSession, schemeId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const normalizedSchemeId = normalizeString(schemeId);
  const scheme = await SchemeModel.findOne({ schemeId: normalizedSchemeId });

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  const [linkedCourse, linkedBatch] = await Promise.all([
    CourseModel.findOne({ schemeIds: normalizedSchemeId }).select("courseId courseName"),
    BatchModel.findOne({ schemeId: normalizedSchemeId }).select("batchId batchName batchCode"),
  ]);

  if (linkedCourse) {
    throw new ApiError(
      409,
      "SCHEME_IN_USE",
      `Scheme is linked to course ${linkedCourse.courseName ?? linkedCourse.courseId}`,
    );
  }

  if (linkedBatch) {
    throw new ApiError(
      409,
      "SCHEME_IN_USE",
      `Scheme is linked to batch ${linkedBatch.batchName ?? linkedBatch.batchCode ?? linkedBatch.batchId}`,
    );
  }

  await scheme.deleteOne();

  await writeAuditLog({
    action: "masters.scheme.deleted",
    actorUserId: actor.user.id,
    entityId: scheme.schemeId,
    entityType: "scheme",
    metadata: { code: scheme.code, name: scheme.name },
    requestId,
  });

  return serializeScheme(scheme);
}

export async function syncSchemeToSidh(actor: AuthSession, schemeId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const scheme = await SchemeModel.findOne({ schemeId: normalizeString(schemeId) });

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  if (scheme.status !== "active") {
    throw new ApiError(400, "SCHEME_NOT_ACTIVE", "Only active schemes can be marked ready for SIDH sync");
  }

  if (!scheme.verifiedForSidh) {
    throw new ApiError(400, "SCHEME_NOT_VERIFIED", "Verify the scheme before marking it ready for SIDH");
  }

  await ensureSchemeSyncMetadata({
    syncEnabled: true,
    sidhSchemeId: scheme.sidhSchemeId ?? undefined,
    sidhSchemeReferenceId: scheme.sidhSchemeReferenceId ?? undefined,
    validFrom: scheme.validFrom ? scheme.validFrom.toISOString().slice(0, 10) : undefined,
    validTo: scheme.validTo ? scheme.validTo.toISOString().slice(0, 10) : undefined,
  });

  if (!scheme.syncEnabled) {
    scheme.syncEnabled = true;
    scheme.updatedByUserId = actor.user.id;
    await scheme.save();
  }

  await writeAuditLog({
    action: "masters.scheme.sync_requested",
    actorUserId: actor.user.id,
    entityId: scheme.schemeId,
    entityType: "scheme",
    metadata: { code: scheme.code, syncEnabled: scheme.syncEnabled },
    requestId,
  });

  return serializeScheme(scheme);
}

export async function listCourses(actor: AuthSession, input: CourseListInput): Promise<PagedList<ReturnType<typeof serializeCourse>>> {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const searchRegex = createSearchRegex(input.search);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }
  if (input.sectorId) {
    filter.sectorId = normalizeString(input.sectorId);
  }
  if (input.programId) {
    filter.programIds = normalizeString(input.programId);
  }
  if (input.approvalStatus) {
    filter.approvalStatus = input.approvalStatus;
  }
  if (input.validOn) {
    const validOnDate = new Date(input.validOn);
    filter.validityStartDate = { $lte: validOnDate };
    filter.validityEndDate = { $gte: validOnDate };
  }
  if (searchRegex) {
    filter.$or = [
      { courseName: searchRegex },
      { internalCourseCode: searchRegex },
      { sidhCourseId: searchRegex },
      { qpCode: searchRegex },
      { associatedQpOrJobRole: searchRegex },
      { shortForm: searchRegex },
    ];
  }

  const [items, total] = await Promise.all([
    CourseModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    CourseModel.countDocuments(filter),
  ]);

  return { items: items.map((item) => serializeCourse(item)), total, page: input.page, pageSize: input.pageSize };
}

export async function createCourse(actor: AuthSession, input: CourseInput) {
  await connectToDatabase();
  ensureCanWriteMasters(actor);
  const codes = resolveCourseCodes(input);
  const jobRole = resolveCourseJobRole(input);
  const dates = resolveCourseDates(input);
  const totalHours = input.totalHours ?? input.trainingHours;

  if (!totalHours) {
    throw new ApiError(400, "TOTAL_HOURS_REQUIRED", "Total hours is required");
  }

  await ensureSectorExists(input.sectorId);
  const normalizedProgramIds = await ensureProgramsExist(input.programIds);
  const normalizedSchemeIds = await ensureSchemesExist(input.schemeIds);
  await ensureNoCourseValidityOverlap({
    sidhCourseId: codes.sidhCourseId,
    status: input.status,
    validityEndDate: dates.endDate,
    validityStartDate: dates.startDate,
  });

  const existingCourse = await CourseModel.findOne({
    $or: [
      { internalCourseCode: codes.internalCourseCode },
      {
        sidhCourseId: codes.sidhCourseId,
        validityStartDate: new Date(dates.startDate),
        validityEndDate: new Date(dates.endDate),
      },
    ],
  });

  if (existingCourse) {
    throw new ApiError(409, "COURSE_EXISTS", "A course with this internal code or mapping already exists");
  }

  const course = await CourseModel.create({
    courseId: createPrefixedId("cor"),
    sectorId: normalizeString(input.sectorId),
    programIds: normalizedProgramIds,
    schemeIds: normalizedSchemeIds,
    courseName: normalizeString(input.courseName),
    internalCourseCode: codes.internalCourseCode,
    sidhCourseId: codes.sidhCourseId,
    associatedQpOrJobRole: jobRole,
    nsqfLevel: String(input.nsqfLevel).trim(),
    trainingPerDayHours: input.trainingPerDayHours ?? null,
    trainingHours: totalHours,
    gtUploadedDurationHours: input.gtUploadedDurationHours ?? null,
    approvalStatus: input.approvalStatus,
    approvalDate: input.approvalDate ? new Date(input.approvalDate) : null,
    validity: input.validity ?? dates.validityDays,
    validityStartDate: new Date(dates.startDate),
    validityEndDate: new Date(dates.endDate),
    shortForm: input.shortForm?.trim() || null,
    minimumAge: input.minimumAge,
    price: input.price,
    qpCode: input.qpCode?.trim() || jobRole,
    jobRoleMappingType: input.jobRoleMappingType,
    status: input.status,
    version: 1,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await createCourseVersion(course, actor.user.id, "Initial version");

  await writeAuditLog({
    action: "masters.course.created",
    actorUserId: actor.user.id,
    entityId: course.courseId,
    entityType: "course",
    metadata: {
      internalCourseCode: course.internalCourseCode,
      sidhCourseId: course.sidhCourseId,
      version: course.version,
    },
    requestId: input.requestId,
  });

  return serializeCourse(course);
}

export async function updateCourse(actor: AuthSession, courseId: string, input: Partial<CourseInput>) {
  await connectToDatabase();
  ensureCanWriteMasters(actor);

  const course = await CourseModel.findOne({ courseId: normalizeString(courseId) });

  if (!course) {
    throw new ApiError(404, "COURSE_NOT_FOUND", "Course not found");
  }

  if (input.currentVersion !== undefined && input.currentVersion !== course.version) {
    throw new ApiError(409, "COURSE_VERSION_CONFLICT", "Course was updated by another user. Refresh and retry.");
  }

  const nextDates = resolveCourseDates({
    validityEndDate: input.validityEndDate ?? course.validityEndDate.toISOString().slice(0, 10),
    validityStartDate: input.validityStartDate ?? course.validityStartDate.toISOString().slice(0, 10),
  });

  const nextCodes = input.courseCode || input.internalCourseCode || input.sidhCourseId
    ? resolveCourseCodes({
        courseCode: input.courseCode,
        internalCourseCode: input.internalCourseCode ?? (input.courseCode ? undefined : course.internalCourseCode),
        sidhCourseId: input.sidhCourseId ?? (input.courseCode ? undefined : course.sidhCourseId),
      })
    : { internalCourseCode: course.internalCourseCode, sidhCourseId: course.sidhCourseId };

  if (input.sectorId !== undefined) {
    await ensureSectorExists(input.sectorId);
  }

  const normalizedProgramIds = input.programIds ? await ensureProgramsExist(input.programIds) : course.programIds;
  const normalizedSchemeIds = input.schemeIds ? await ensureSchemesExist(input.schemeIds) : course.schemeIds;

  await ensureNoCourseValidityOverlap({
    excludeCourseId: course.courseId,
    sidhCourseId: nextCodes.sidhCourseId,
    status: input.status ?? course.status,
    validityStartDate: nextDates.startDate,
    validityEndDate: nextDates.endDate,
  });

  if (nextCodes.internalCourseCode !== course.internalCourseCode) {
    const duplicateCourse = await CourseModel.findOne({ internalCourseCode: nextCodes.internalCourseCode });
    if (duplicateCourse) {
      throw new ApiError(409, "COURSE_EXISTS", "A course with this internal code already exists");
    }
  }

  if (input.sectorId !== undefined) {
    course.sectorId = normalizeString(input.sectorId);
  }
  if (input.programIds !== undefined) {
    course.programIds = normalizedProgramIds;
  }
  if (input.schemeIds !== undefined) {
    course.schemeIds = normalizedSchemeIds;
  }
  if (input.courseName !== undefined) {
    course.courseName = normalizeString(input.courseName);
  }
  if (input.internalCourseCode !== undefined) {
    course.internalCourseCode = nextCodes.internalCourseCode;
  }
  if (input.courseCode !== undefined && input.internalCourseCode === undefined) {
    course.internalCourseCode = nextCodes.internalCourseCode;
  }
  if (input.sidhCourseId !== undefined) {
    course.sidhCourseId = nextCodes.sidhCourseId;
  }
  if (input.courseCode !== undefined && input.sidhCourseId === undefined) {
    course.sidhCourseId = nextCodes.sidhCourseId;
  }
  if (input.associatedQpOrJobRole !== undefined) {
    course.associatedQpOrJobRole = normalizeString(input.associatedQpOrJobRole);
  }
  if (input.jobRole !== undefined) {
    course.associatedQpOrJobRole = normalizeString(input.jobRole);
  }
  if (input.nsqfLevel !== undefined) {
    course.nsqfLevel = String(input.nsqfLevel).trim();
  }
  if (input.trainingPerDayHours !== undefined) {
    course.trainingPerDayHours = input.trainingPerDayHours;
  }
  if (input.totalHours !== undefined) {
    course.trainingHours = input.totalHours;
  }
  if (input.trainingHours !== undefined) {
    course.trainingHours = input.trainingHours;
  }
  if (input.gtUploadedDurationHours !== undefined) {
    course.gtUploadedDurationHours = input.gtUploadedDurationHours;
  }
  if (input.approvalStatus !== undefined) {
    course.approvalStatus = input.approvalStatus;
  }
  if (input.approvalDate !== undefined) {
    course.approvalDate = input.approvalDate ? new Date(input.approvalDate) : null;
  }
  if (input.validityStartDate !== undefined || input.validityEndDate !== undefined) {
    course.validityStartDate = new Date(nextDates.startDate);
    course.validityEndDate = new Date(nextDates.endDate);
    course.validity = input.validity ?? nextDates.validityDays;
  } else if (input.validity !== undefined) {
    course.validity = input.validity;
  }
  if (input.shortForm !== undefined) {
    course.shortForm = input.shortForm.trim() || null;
  }
  if (input.minimumAge !== undefined) {
    course.minimumAge = input.minimumAge;
  }
  if (input.price !== undefined) {
    course.price = input.price;
  }
  if (input.qpCode !== undefined) {
    course.qpCode = normalizeString(input.qpCode);
  }
  if (input.jobRoleMappingType !== undefined) {
    course.jobRoleMappingType = input.jobRoleMappingType;
  }
  if (input.status !== undefined) {
    course.status = input.status;
  }

  course.version += 1;
  course.updatedByUserId = actor.user.id;
  await course.save();
  await createCourseVersion(course, actor.user.id, "Updated course mapping");

  await writeAuditLog({
    action: "masters.course.updated",
    actorUserId: actor.user.id,
    entityId: course.courseId,
    entityType: "course",
    metadata: { version: course.version, input },
    requestId: input.requestId,
  });

  return serializeCourse(course);
}

export async function deleteCourse(actor: AuthSession, courseId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteMasters(actor);

  const normalizedCourseId = normalizeString(courseId);
  const course = await CourseModel.findOne({ courseId: normalizedCourseId });

  if (!course) {
    throw new ApiError(404, "COURSE_NOT_FOUND", "Course not found");
  }

  const linkedBatch = await BatchModel.findOne({ courseId: normalizedCourseId }).select("batchId batchName batchCode");

  if (linkedBatch) {
    throw new ApiError(
      409,
      "COURSE_IN_USE",
      `Course is linked to batch ${linkedBatch.batchName ?? linkedBatch.batchCode ?? linkedBatch.batchId}`,
    );
  }

  await Promise.all([course.deleteOne(), CourseVersionModel.deleteMany({ courseId: normalizedCourseId })]);

  await writeAuditLog({
    action: "masters.course.deleted",
    actorUserId: actor.user.id,
    entityId: course.courseId,
    entityType: "course",
    metadata: {
      internalCourseCode: course.internalCourseCode,
      sidhCourseId: course.sidhCourseId,
      version: course.version,
    },
    requestId,
  });

  return serializeCourse(course);
}

export async function listCourseVersions(actor: AuthSession, courseId: string) {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const versions = await CourseVersionModel.find({ courseId: normalizeString(courseId) }).sort({ version: -1 });
  return versions.map((item) => serializeCourseVersion(item));
}

export async function getCandidateReferenceData(actor: AuthSession) {
  await connectToDatabase();
  ensureCanReadReferenceData(actor);

  const scopedCenterFilter = actor.user.roles.includes("platform_admin")
    ? { status: "active" }
    : { centerId: { $in: actor.user.centerIds }, status: "active" };

  const [programs, sectors, schemes, centers, courses, referenceValues] = await Promise.all([
    ProgramModel.find({ status: "active" }).sort({ name: 1 }),
    SectorModel.find({ status: "active" }).sort({ name: 1 }),
    SchemeModel.find({ status: "active" }).sort({ name: 1 }),
    TrainingCenterModel.find(scopedCenterFilter).sort({ centerName: 1 }),
    CourseModel.find({ status: "active", approvalStatus: "approved" }).sort({ courseName: 1 }),
    ReferenceValueModel.find({ status: "active" }).sort({ category: 1, sortOrder: 1, label: 1 }),
  ]);

  const usableCourses = courses.filter((course) => isCourseUsableOnDate(course, new Date()));
  const groupedReferenceValues = referenceValues.reduce<Record<string, Array<{ code: string; label: string }>>>(
    (accumulator, item) => {
      const key = item.category;
      accumulator[key] ??= [];
      accumulator[key].push({ code: item.code, label: item.label });
      return accumulator;
    },
    {},
  );

  return {
    programs: programs.map((item) => serializeProgram(item)),
    sectors: sectors.map((item) => serializeSector(item)),
    schemes: schemes.map((item) => serializeScheme(item)),
    sidhBatchContext: getSidhBatchContext(),
    trainingCenters: centers.map((item) => ({
      id: item.centerId,
      centerId: item.centerId,
      centerName: item.centerName,
      centerCode: item.centerCode,
      sidhTcId: item.sidhTcId ?? null,
      verifiedForSidh: item.verifiedForSidh ?? false,
    })),
    courses: usableCourses.map((item) => serializeCourse(item)),
    enums: groupedReferenceValues,
  };
}

const SIDH_BATCH_FIELD_KEYS = Object.keys(SIDH_BATCH_ENUM_CATEGORIES) as SidhBatchFieldKey[];

function serializeSidhBatchReferenceOption(item: {
  code: string;
  label: string;
  referenceValueId: string;
  sortOrder?: number | null;
}) {
  return {
    referenceValueId: item.referenceValueId,
    code: item.code,
    label: item.label,
    sortOrder: item.sortOrder ?? 0,
  };
}

export async function listSidhBatchFieldOptions(actor: AuthSession): Promise<SidhBatchFieldOptionsResponse> {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const categories = Object.values(SIDH_BATCH_ENUM_CATEGORIES);
  const referenceValues = await ReferenceValueModel.find({
    category: { $in: categories },
    status: "active",
  }).sort({ category: 1, sortOrder: 1, label: 1 });

  const groupedByCategory = referenceValues.reduce<
    Record<string, ReturnType<typeof serializeSidhBatchReferenceOption>[]>
  >((accumulator, item) => {
    accumulator[item.category] ??= [];
    accumulator[item.category].push(serializeSidhBatchReferenceOption(item));
    return accumulator;
  }, {});

  return SIDH_BATCH_FIELD_KEYS.reduce<SidhBatchFieldOptionsResponse>((accumulator, field) => {
    const category = SIDH_BATCH_ENUM_CATEGORIES[field];
    accumulator[field] = {
      category,
      options: groupedByCategory[category] ?? [],
    };
    return accumulator;
  }, {} as SidhBatchFieldOptionsResponse);
}

async function resolveUniqueSidhBatchReferenceCode(category: string, label: string) {
  const baseCode = deriveSidhBatchReferenceCode(label);
  let code = baseCode;
  let suffix = 2;

  while (await ReferenceValueModel.exists({ category, code })) {
    code = `${baseCode}_${suffix}`;
    suffix += 1;
  }

  return code;
}

export async function createSidhBatchFieldOption(
  actor: AuthSession,
  input: { field: SidhBatchFieldKey; label: string },
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const category = SIDH_BATCH_ENUM_CATEGORIES[input.field];
  const label = normalizeString(input.label);
  const existingOption = await ReferenceValueModel.findOne({ category, label, status: "active" });

  if (existingOption) {
    throw new ApiError(409, "SIDH_BATCH_OPTION_EXISTS", "This option already exists for the selected field");
  }

  const latestOption = await ReferenceValueModel.findOne({ category }).sort({ sortOrder: -1 }).limit(1);
  const code = await resolveUniqueSidhBatchReferenceCode(category, label);
  const referenceValue = await ReferenceValueModel.create({
    referenceValueId: createPrefixedId("ref"),
    category,
    code,
    label,
    sortOrder: (latestOption?.sortOrder ?? 0) + 1,
    status: "active",
  });

  await writeAuditLog({
    action: "masters.sidh_batch_field_option.created",
    actorUserId: actor.user.id,
    entityId: referenceValue.referenceValueId,
    entityType: "reference_value",
    metadata: { category, code, field: input.field, label },
    requestId,
  });

  return serializeSidhBatchReferenceOption(referenceValue);
}

export async function updateSidhBatchFieldOption(
  actor: AuthSession,
  referenceValueId: string,
  input: { label?: string; sortOrder?: number; status?: "active" | "inactive" },
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteCoreMasters(actor);

  const referenceValue = await ReferenceValueModel.findOne({ referenceValueId });

  const sidhBatchCategories = Object.values(SIDH_BATCH_ENUM_CATEGORIES);

  if (!referenceValue || !sidhBatchCategories.includes(referenceValue.category as (typeof sidhBatchCategories)[number])) {
    throw new ApiError(404, "SIDH_BATCH_OPTION_NOT_FOUND", "SIDH batch field option not found");
  }

  if (input.label !== undefined) {
    const label = normalizeString(input.label);
    const duplicate = await ReferenceValueModel.findOne({
      category: referenceValue.category,
      label,
      referenceValueId: { $ne: referenceValue.referenceValueId },
      status: "active",
    });

    if (duplicate) {
      throw new ApiError(409, "SIDH_BATCH_OPTION_EXISTS", "This option already exists for the selected field");
    }

    referenceValue.label = label;
  }

  if (input.sortOrder !== undefined) {
    referenceValue.sortOrder = input.sortOrder;
  }

  if (input.status !== undefined) {
    referenceValue.status = input.status;
  }

  await referenceValue.save();

  await writeAuditLog({
    action: "masters.sidh_batch_field_option.updated",
    actorUserId: actor.user.id,
    entityId: referenceValue.referenceValueId,
    entityType: "reference_value",
    metadata: {
      category: referenceValue.category,
      code: referenceValue.code,
      label: referenceValue.label,
      sortOrder: referenceValue.sortOrder,
      status: referenceValue.status,
    },
    requestId,
  });

  return serializeSidhBatchReferenceOption(referenceValue);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveCourseCodes(input: Pick<CourseInput, "courseCode" | "internalCourseCode" | "sidhCourseId">) {
  const sidhCourseId = input.sidhCourseId?.trim() || input.courseCode?.trim();

  if (!sidhCourseId) {
    throw new ApiError(400, "SIDH_COURSE_ID_REQUIRED", "SIDH course ID from the approved course list is required");
  }

  return {
    internalCourseCode: input.internalCourseCode?.trim() || sidhCourseId,
    sidhCourseId,
  };
}

function resolveCourseDates(input: Pick<CourseInput, "approvalDate" | "validityEndDate" | "validityStartDate">) {
  if (!input.validityEndDate?.trim()) {
    throw new ApiError(400, "COURSE_VALIDITY_REQUIRED", "Course valid-until date is required");
  }

  const endDate = input.validityEndDate.trim();
  const startDate = input.validityStartDate?.trim() || input.approvalDate?.trim() || toDateInput(new Date());
  ensureDateRange(startDate, endDate);

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const validityDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  return { endDate, startDate, validityDays };
}

function resolveCourseJobRole(input: Pick<CourseInput, "associatedQpOrJobRole" | "jobRole">) {
  const jobRole = input.jobRole?.trim() || input.associatedQpOrJobRole?.trim();

  if (!jobRole) {
    throw new ApiError(400, "JOB_ROLE_REQUIRED", "Job role is required");
  }

  return jobRole;
}