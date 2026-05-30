import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CourseModel, type CourseDocument } from "@/lib/server/models/course";
import { CourseVersionModel } from "@/lib/server/models/course-version";
import { ProgramModel } from "@/lib/server/models/program";
import { ReferenceValueModel } from "@/lib/server/models/reference-value";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { canManageMasters, getPermissionsForRoles } from "@/lib/server/rbac";
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
  code: string;
  description?: string;
  name: string;
  requestId?: string;
  status: "active" | "inactive";
  syncToSidh: boolean;
};

type SchemeInput = {
  beneficiaryType?: string;
  code: string;
  description?: string;
  fundingType?: string;
  name: string;
  requestId?: string;
  sidhSchemeId?: string;
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
  associatedQpOrJobRole: string;
  courseName: string;
  currentVersion?: number;
  gtUploadedDurationHours?: number;
  internalCourseCode: string;
  jobRoleMappingType: "QP_NOS" | "JOB_ROLE" | "HYBRID";
  minimumAge: number;
  price: number;
  programIds: string[];
  qpCode: string;
  requestId?: string;
  schemeIds: string[];
  sectorId: string;
  sidhCourseId: string;
  status: "active" | "inactive";
  trainingHours: number;
  validityEndDate: string;
  validityStartDate: string;
  nsqfLevel: number;
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
  code: string;
  createdAt?: Date;
  description?: string | null;
  name: string;
  programId: string;
  status: "active" | "inactive";
  syncToSidh: boolean;
  updatedAt?: Date;
}) {
  return {
    id: program.programId,
    programId: program.programId,
    name: program.name,
    code: program.code,
    description: program.description ?? null,
    syncToSidh: program.syncToSidh,
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
  beneficiaryType?: string | null;
  code: string;
  createdAt?: Date;
  description?: string | null;
  fundingType?: string | null;
  name: string;
  schemeId: string;
  sidhSchemeId?: string | null;
  status: "active" | "inactive";
  syncEnabled: boolean;
  updatedAt?: Date;
  validFrom?: Date | null;
  validTo?: Date | null;
}) {
  return {
    id: scheme.schemeId,
    schemeId: scheme.schemeId,
    name: scheme.name,
    code: scheme.code,
    description: scheme.description ?? null,
    status: scheme.status,
    syncEnabled: scheme.syncEnabled,
    sidhSchemeId: scheme.sidhSchemeId ?? null,
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
    internalCourseCode: course.internalCourseCode,
    sidhCourseId: course.sidhCourseId,
    associatedQpOrJobRole: course.associatedQpOrJobRole,
    nsqfLevel: course.nsqfLevel,
    trainingHours: course.trainingHours,
    gtUploadedDurationHours: course.gtUploadedDurationHours ?? null,
    approvalStatus: course.approvalStatus,
    approvalDate: toIsoDate(course.approvalDate),
    validityStartDate: toIsoDate(course.validityStartDate),
    validityEndDate: toIsoDate(course.validityEndDate),
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

async function ensureSchemeSyncMetadata(input: Pick<SchemeInput, "beneficiaryType" | "fundingType" | "sidhSchemeId" | "syncEnabled" | "validFrom" | "validTo">) {
  if (
    input.syncEnabled &&
    (!input.sidhSchemeId || !input.fundingType || !input.beneficiaryType || !input.validFrom || !input.validTo)
  ) {
    throw new ApiError(400, "SCHEME_METADATA_INCOMPLETE", "Sync-enabled schemes require complete SIDH metadata");
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
  ensureCanWriteMasters(actor);

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
  ensureCanWriteMasters(actor);

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
  if (input.status !== undefined) {
    program.status = input.status;
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
  ensureCanWriteMasters(actor);

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
  ensureCanWriteMasters(actor);
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
    sidhSchemeId: input.sidhSchemeId?.trim() || null,
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
  ensureCanWriteMasters(actor);

  const scheme = await SchemeModel.findOne({ schemeId: normalizeString(schemeId) });

  if (!scheme) {
    throw new ApiError(404, "SCHEME_NOT_FOUND", "Scheme not found");
  }

  await ensureSchemeSyncMetadata({
    syncEnabled: input.syncEnabled ?? scheme.syncEnabled,
    sidhSchemeId: input.sidhSchemeId ?? scheme.sidhSchemeId ?? undefined,
    fundingType: input.fundingType ?? scheme.fundingType ?? undefined,
    beneficiaryType: input.beneficiaryType ?? scheme.beneficiaryType ?? undefined,
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
  ensureDateRange(input.validityStartDate, input.validityEndDate);
  await ensureSectorExists(input.sectorId);
  const normalizedProgramIds = await ensureProgramsExist(input.programIds);
  const normalizedSchemeIds = await ensureSchemesExist(input.schemeIds);
  await ensureNoCourseValidityOverlap(input);

  const existingCourse = await CourseModel.findOne({
    $or: [
      { internalCourseCode: normalizeString(input.internalCourseCode) },
      {
        sidhCourseId: normalizeString(input.sidhCourseId),
        validityStartDate: new Date(input.validityStartDate),
        validityEndDate: new Date(input.validityEndDate),
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
    internalCourseCode: normalizeString(input.internalCourseCode),
    sidhCourseId: normalizeString(input.sidhCourseId),
    associatedQpOrJobRole: normalizeString(input.associatedQpOrJobRole),
    nsqfLevel: input.nsqfLevel,
    trainingHours: input.trainingHours,
    gtUploadedDurationHours: input.gtUploadedDurationHours ?? null,
    approvalStatus: input.approvalStatus,
    approvalDate: input.approvalDate ? new Date(input.approvalDate) : null,
    validityStartDate: new Date(input.validityStartDate),
    validityEndDate: new Date(input.validityEndDate),
    minimumAge: input.minimumAge,
    price: input.price,
    qpCode: normalizeString(input.qpCode),
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

  const nextValidityStartDate = input.validityStartDate ?? course.validityStartDate.toISOString().slice(0, 10);
  const nextValidityEndDate = input.validityEndDate ?? course.validityEndDate.toISOString().slice(0, 10);
  ensureDateRange(nextValidityStartDate, nextValidityEndDate);

  if (input.sectorId !== undefined) {
    await ensureSectorExists(input.sectorId);
  }

  const normalizedProgramIds = input.programIds ? await ensureProgramsExist(input.programIds) : course.programIds;
  const normalizedSchemeIds = input.schemeIds ? await ensureSchemesExist(input.schemeIds) : course.schemeIds;

  await ensureNoCourseValidityOverlap({
    excludeCourseId: course.courseId,
    sidhCourseId: input.sidhCourseId ?? course.sidhCourseId,
    status: input.status ?? course.status,
    validityStartDate: nextValidityStartDate,
    validityEndDate: nextValidityEndDate,
  });

  if (input.internalCourseCode && input.internalCourseCode.trim() !== course.internalCourseCode) {
    const duplicateCourse = await CourseModel.findOne({ internalCourseCode: normalizeString(input.internalCourseCode) });
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
    course.internalCourseCode = normalizeString(input.internalCourseCode);
  }
  if (input.sidhCourseId !== undefined) {
    course.sidhCourseId = normalizeString(input.sidhCourseId);
  }
  if (input.associatedQpOrJobRole !== undefined) {
    course.associatedQpOrJobRole = normalizeString(input.associatedQpOrJobRole);
  }
  if (input.nsqfLevel !== undefined) {
    course.nsqfLevel = input.nsqfLevel;
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
  if (input.validityStartDate !== undefined) {
    course.validityStartDate = new Date(input.validityStartDate);
  }
  if (input.validityEndDate !== undefined) {
    course.validityEndDate = new Date(input.validityEndDate);
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
    trainingCenters: centers.map((item) => ({
      id: item.centerId,
      centerId: item.centerId,
      centerName: item.centerName,
      centerCode: item.centerCode,
    })),
    courses: usableCourses.map((item) => serializeCourse(item)),
    enums: groupedReferenceValues,
  };
}