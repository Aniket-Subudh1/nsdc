import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CourseImportJobModel } from "@/lib/server/models/course-import-job";
import { CourseImportRowModel } from "@/lib/server/models/course-import-row";
import { CourseModel } from "@/lib/server/models/course";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";
import { canManageMasters, getPermissionsForRoles } from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import { createCourse } from "@/lib/server/services/masters";
import { type AuthSession } from "@/lib/server/services/session";
import { parseUserDateInput } from "@/lib/server/sidh-payload";
import { readWorkbookSheetsFromArrayBuffer } from "@/lib/spreadsheet/node";
import { excelSerialToDate } from "@/lib/spreadsheet/shared";
import { createCourseSchema } from "@/lib/server/validation";
import type { z } from "zod";

type CreateCourseInput = z.infer<typeof createCourseSchema>;

type CourseImportJobLike = {
  committedAt?: Date | null;
  committedRows: number;
  createdAt?: Date | null;
  duplicateRows: number;
  fileName: string;
  importJobId: string;
  invalidRows: number;
  rows?: unknown;
  status: string;
  totalRows: number;
  updatedAt?: Date | null;
  validRows: number;
};

type MasterLookupMaps = {
  programNameToId: Map<string, string>;
  schemeLabelToId: Map<string, string>;
  sectorNameToId: Map<string, string>;
};

const IMPORT_ROW_BATCH_SIZE = 1000;

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

function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
}

function normalizeWhitespace(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeImportHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCellValue(row: Record<string, unknown>, keys: string[]) {
  const keyMap = new Map(Object.keys(row).map((key) => [normalizeImportHeader(key), row[key]]));

  for (const key of keys) {
    const value = keyMap.get(normalizeImportHeader(key));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function parseImportDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = excelSerialToDate(value);
    if (parsed) {
      return parseUserDateInput(parsed);
    }
  }

  return parseUserDateInput(value);
}

function normalizeApprovalStatus(value: unknown): CreateCourseInput["approvalStatus"] {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (normalized.includes("approve")) {
    return "approved";
  }

  if (normalized.includes("reject")) {
    return "rejected";
  }

  if (normalized.includes("expire")) {
    return "expired";
  }

  return "pending";
}

function normalizeSchemeLabel(value: unknown) {
  const label = normalizeWhitespace(value);
  const match = label.match(/^(.*)\s+\(([^)]+)\)$/);
  return match ? match[1].trim() : label;
}

function buildSchemeLabel(name: string, sidhSchemeId?: string | null) {
  const trimmedName = name.trim();
  const trimmedSidhSchemeId = sidhSchemeId?.trim();

  if (!trimmedName) {
    return "";
  }

  return trimmedSidhSchemeId ? `${trimmedName} (${trimmedSidhSchemeId})` : trimmedName;
}

async function loadMasterLookupMaps(): Promise<MasterLookupMaps> {
  const [sectors, programs, schemes] = await Promise.all([
    SectorModel.find({ status: "active" }).select({ sectorId: 1, name: 1 }).lean(),
    ProgramModel.find({ status: "active" }).select({ programId: 1, name: 1 }).lean(),
    SchemeModel.find({ status: "active" }).select({ schemeId: 1, name: 1, sidhSchemeId: 1 }).lean(),
  ]);

  const sectorNameToId = new Map<string, string>();
  for (const sector of sectors) {
    const name = normalizeWhitespace(sector.name);
    if (name) {
      sectorNameToId.set(name.toLowerCase(), String(sector.sectorId));
    }
  }

  const programNameToId = new Map<string, string>();
  for (const program of programs) {
    const name = normalizeWhitespace(program.name);
    if (name) {
      programNameToId.set(name.toLowerCase(), String(program.programId));
    }
  }

  const schemeLabelToId = new Map<string, string>();
  for (const scheme of schemes) {
    const name = normalizeWhitespace(scheme.name);
    if (!name) {
      continue;
    }

    const schemeId = String(scheme.schemeId);
    schemeLabelToId.set(name.toLowerCase(), schemeId);
    schemeLabelToId.set(buildSchemeLabel(name, String(scheme.sidhSchemeId ?? "")).toLowerCase(), schemeId);
  }

  return { sectorNameToId, programNameToId, schemeLabelToId };
}

function resolveMasterId(
  maps: MasterLookupMaps,
  value: unknown,
  lookup: Map<string, string>,
  fieldLabel: string,
) {
  const label = normalizeWhitespace(value);
  if (!label) {
    throw new ApiError(400, "IMPORT_FIELD_REQUIRED", `${fieldLabel} is required`);
  }

  const resolved = lookup.get(label.toLowerCase()) ?? lookup.get(normalizeSchemeLabel(label).toLowerCase());
  if (!resolved) {
    throw new ApiError(400, "IMPORT_LOOKUP_FAILED", `${fieldLabel} "${label}" was not found in master data`);
  }

  return resolved;
}

function mapImportRowToCourseInput(row: Record<string, unknown>, maps: MasterLookupMaps): CreateCourseInput {
  const sectorId = resolveMasterId(maps, getCellValue(row, ["Sector Name", "Sector", "SectorName"]), maps.sectorNameToId, "Sector Name");
  const programId = resolveMasterId(
    maps,
    getCellValue(row, ["Linked Program", "Program", "Program Name", "ProgramName"]),
    maps.programNameToId,
    "Linked Program",
  );
  const schemeId = resolveMasterId(
    maps,
    getCellValue(row, ["Linked Scheme", "Scheme", "Scheme Name", "SchemeName"]),
    maps.schemeLabelToId,
    "Linked Scheme",
  );

  const sidhCourseId = normalizeWhitespace(getCellValue(row, ["SIDH Course ID", "SidhCourseId", "Course ID", "CourseId"]));
  const approvalDate = parseImportDate(getCellValue(row, ["Approval Date", "ApprovalDate"]));
  const validityEndDate = parseImportDate(getCellValue(row, ["Valid Until", "ValidUntil", "Validity End Date", "ValidityEndDate"]));

  return createCourseSchema.parse({
    sectorId,
    programIds: [programId],
    schemeIds: [schemeId],
    courseName: normalizeWhitespace(getCellValue(row, ["Course Name", "CourseName", "Course"])),
    sidhCourseId,
    jobRole: normalizeWhitespace(getCellValue(row, ["Job Role", "JobRole"])),
    nsqfLevel: normalizeWhitespace(getCellValue(row, ["NSQF Level", "NsqfLevel", "NSQFLevel"])) || "NA",
    trainingPerDayHours: getCellValue(row, ["Training Per Day (Hours)", "Training Per Day Hours", "TrainingPerDayHours"]),
    totalHours: getCellValue(row, ["Total Hours", "TotalHours", "Training Hours", "TrainingHours"]),
    approvalStatus: normalizeApprovalStatus(getCellValue(row, ["Approval Status", "ApprovalStatus"])),
    approvalDate: approvalDate || undefined,
    validityEndDate,
    shortForm: normalizeWhitespace(getCellValue(row, ["Short Form", "ShortForm"])),
  });
}

function buildDuplicateKey(input: Pick<CreateCourseInput, "sidhCourseId" | "courseCode" | "validityEndDate">) {
  const sidhCourseId = normalizeWhitespace(input.sidhCourseId ?? input.courseCode);
  const validityEndDate = normalizeWhitespace(input.validityEndDate);
  const internalCourseCode = sidhCourseId;

  return {
    internalCourseCode,
    mappingKey: `${sidhCourseId.toLowerCase()}|${validityEndDate}`,
  };
}

async function findExistingCourseDuplicate(input: CreateCourseInput) {
  const sidhCourseId = normalizeWhitespace(input.sidhCourseId ?? input.courseCode);
  const internalCourseCode = normalizeWhitespace(input.internalCourseCode) || sidhCourseId;
  const validityStartDate = parseImportDate(input.validityStartDate ?? input.approvalDate) || new Date().toISOString().slice(0, 10);
  const validityEndDate = parseImportDate(input.validityEndDate);

  return CourseModel.findOne({
    $or: [
      { internalCourseCode },
      {
        sidhCourseId,
        validityStartDate: new Date(`${validityStartDate}T00:00:00.000Z`),
        validityEndDate: new Date(`${validityEndDate}T00:00:00.000Z`),
      },
    ],
  }).select({ courseId: 1 });
}

function serializeImportJob(job: CourseImportJobLike) {
  return {
    id: job.importJobId,
    importJobId: job.importJobId,
    fileName: job.fileName,
    status: job.status,
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
    duplicateOfCourseId: row.duplicateOfCourseId ?? null,
    courseId: row.courseId ?? null,
    normalized: row.normalized ?? {},
  };
}

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
      duplicateOfCourseId: row.duplicateOfCourseId ?? null,
      courseId: row.courseId ?? null,
    }));

    await CourseImportRowModel.insertMany(chunk, { ordered: false });
  }
}

async function importJobUsesExternalRows(importJobId: string) {
  return Boolean(await CourseImportRowModel.exists({ importJobId }));
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

function extractValidationIssues(error: unknown) {
  if (error instanceof ApiError) {
    if (error.errors.length > 0) {
      return error.errors;
    }

    return [{ message: error.message }];
  }

  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: Array<{ path?: Array<string | number>; message: string }> }).issues;
    if (Array.isArray(issues)) {
      return issues.map((issue) => ({
        field: Array.isArray(issue.path) ? issue.path.join(".") : undefined,
        message: issue.message,
      }));
    }
  }

  return [{ message: error instanceof Error ? error.message : "Invalid row" }];
}

export async function createCourseImportJob(
  actor: AuthSession,
  fileName: string,
  workbookBuffer: ArrayBuffer,
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteMasters(actor);

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

  const firstSheet =
    workbookSheets.find((sheet) => normalizeWhitespace(sheet.name).toLowerCase() === "course import template") ??
    workbookSheets[0];

  if (!firstSheet) {
    throw new ApiError(400, "IMPORT_EMPTY_WORKBOOK", "Workbook does not contain any sheets");
  }

  const rawRows = firstSheet.rows;
  const lookupMaps = await loadMasterLookupMaps();
  const seenDuplicateKeys = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  for (const [index, rawRow] of rawRows.entries()) {
    const rowNumber = index + 2;
    const rowId = createPrefixedId("impr");
    let courseInput: CreateCourseInput | null = null;

    try {
      courseInput = mapImportRowToCourseInput(rawRow, lookupMaps);
      const duplicateKey = buildDuplicateKey(courseInput);
      const existing = await findExistingCourseDuplicate(courseInput);

      if (existing || seenDuplicateKeys.has(duplicateKey.mappingKey) || seenDuplicateKeys.has(duplicateKey.internalCourseCode.toLowerCase())) {
        duplicateRows += 1;
        rows.push({
          rowId,
          rowNumber,
          raw: rawRow,
          normalized: courseInput,
          status: "duplicate",
          errors: [{
            field: "sidhCourseId",
            message: existing
              ? `Matches existing course ${existing.courseId}`
              : "Matches another row in this import",
          }],
          duplicateOfCourseId: existing?.courseId ?? null,
          courseId: null,
        });
        continue;
      }

      seenDuplicateKeys.add(duplicateKey.mappingKey);
      seenDuplicateKeys.add(duplicateKey.internalCourseCode.toLowerCase());
      validRows += 1;
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
        normalized: courseInput,
        status: "valid",
        errors: [],
        duplicateOfCourseId: null,
        courseId: null,
      });
    } catch (error) {
      invalidRows += 1;
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
        normalized: courseInput ?? {},
        status: "invalid",
        errors: extractValidationIssues(error),
        duplicateOfCourseId: null,
        courseId: null,
      });
    }
  }

  const job = await CourseImportJobModel.create({
    importJobId: createPrefixedId("imp"),
    fileName,
    status: "staged",
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
    action: "masters.course.import.staged",
    actorUserId: actor.user.id,
    entityType: "course_import",
    entityId: job.importJobId,
    metadata: { fileName, totalRows: rawRows.length, validRows, invalidRows, duplicateRows },
    requestId,
  });

  return serializeImportJob(job);
}

export async function getCourseImportJob(actor: AuthSession, importJobId: string) {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const job = await CourseImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  return serializeImportJob(job);
}

export async function listCourseImportRows(
  actor: AuthSession,
  importJobId: string,
  page: number,
  pageSize: number,
  status?: string,
) {
  await connectToDatabase();
  ensureCanReadMasters(actor);

  const job = await CourseImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  if (await importJobUsesExternalRows(importJobId)) {
    const filter: Record<string, unknown> = { importJobId };
    if (status) {
      filter.status = status;
    }

    const start = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      CourseImportRowModel.find(filter).sort({ rowNumber: 1 }).skip(start).limit(pageSize).lean(),
      CourseImportRowModel.countDocuments(filter),
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

export async function commitCourseImportJob(actor: AuthSession, importJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteMasters(actor);

  const job = await CourseImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  if (job.status === "committed") {
    throw new ApiError(409, "IMPORT_ALREADY_COMMITTED", "This import job has already been committed");
  }

  let committedRows = 0;

  if (await importJobUsesExternalRows(importJobId)) {
    const COMMIT_BATCH_SIZE = 100;

    while (true) {
      const batch = await CourseImportRowModel.find({ importJobId, status: "valid" })
        .sort({ rowNumber: 1 })
        .limit(COMMIT_BATCH_SIZE)
        .lean();

      if (batch.length === 0) {
        break;
      }

      for (const row of batch) {
        try {
          const courseInput = createCourseSchema.parse(row.normalized);
          const createdCourse = await createCourse(actor, courseInput);

          committedRows += 1;
          await CourseImportRowModel.updateOne(
            { rowId: row.rowId },
            {
              $set: {
                status: "committed",
                courseId: createdCourse.courseId,
              },
            },
          );
        } catch (error) {
          await CourseImportRowModel.updateOne(
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
        const courseInput = createCourseSchema.parse(row.normalized);
        const createdCourse = await createCourse(actor, courseInput);
        committedRows += 1;
        updatedRows.push({
          ...row,
          status: "committed",
          courseId: createdCourse.courseId,
        });
      } catch (error) {
        updatedRows.push({
          ...row,
          status: "skipped",
          errors: [
            ...readImportRowValidationErrors(row),
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
    action: "masters.course.import.committed",
    actorUserId: actor.user.id,
    entityType: "course_import",
    entityId: job.importJobId,
    metadata: { committedRows, totalRows: job.totalRows },
    requestId,
  });

  return serializeImportJob(job);
}
