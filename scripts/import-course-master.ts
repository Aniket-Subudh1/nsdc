import { loadEnvConfig } from "@next/env";
import * as XLSX from "xlsx";

import { ensureBootstrapData } from "../lib/server/bootstrap";
import { createPrefixedId } from "../lib/server/ids";
import { connectToDatabase } from "../lib/server/mongodb";
import { CourseModel } from "../lib/server/models/course";
import { CourseVersionModel } from "../lib/server/models/course-version";
import { SectorModel } from "../lib/server/models/sector";

type ImportedCourseRow = {
  approvalDate?: Date | null;
  approvalStatus: "approved" | "pending" | "rejected" | "expired";
  associatedQpOrJobRole: string;
  courseName: string;
  gtUploadedDurationHours: number | null;
  internalCourseCode: string;
  jobRoleMappingType: "QP_NOS" | "JOB_ROLE" | "HYBRID";
  minimumAge: number;
  nsqfLevel: number;
  price: number;
  qpCode: string;
  sectorCode: string;
  sectorName: string;
  sidhCourseId: string;
  trainingHours: number;
  validityEndDate: Date;
  validityStartDate: Date;
};

const headerAliases = {
  sectorName: ["sector name", "sector", "sectorname"],
  courseName: ["course name", "course", "coursename"],
  internalCourseCode: ["internal course code", "course code", "coursecode", "internalcoursecode"],
  sidhCourseId: ["sidh course id", "course id", "sidhcourseid", "sidhcourse"],
  associatedQpOrJobRole: ["associated qp or job role", "job role", "jobrole", "associatedqporjobrole"],
  nsqfLevel: ["nsqf level", "nsqflevel"],
  trainingHours: ["training hours", "hours", "traininghours"],
  gtUploadedDurationHours: ["gt uploaded duration hours", "uploaded duration hours", "gtuploadeddurationhours"],
  approvalStatus: ["approval status", "approvalstatus"],
  approvalDate: ["approval date", "approvaldate"],
  validityStartDate: ["validity start date", "valid from", "validitystartdate"],
  validityEndDate: ["validity end date", "valid to", "validityenddate"],
  minimumAge: ["minimum age", "minimumage"],
  price: ["price", "course price"],
  qpCode: ["qp code", "qpcode"],
  jobRoleMappingType: ["job role mapping type", "mapping type", "jobrolemappingtype"],
} as const;

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCellValue(row: Record<string, unknown>, aliases: readonly string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.map(normalizeHeader).includes(normalizeHeader(key))) {
      return value;
    }
  }

  return undefined;
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function toNumberValue(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function toDateValue(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const stringValue = toStringValue(value);
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferApprovalStatus(value: string): ImportedCourseRow["approvalStatus"] {
  const normalized = value.toLowerCase();

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

function inferMappingType(value: string): ImportedCourseRow["jobRoleMappingType"] {
  const normalized = value.toLowerCase();

  if (normalized.includes("job")) {
    return "JOB_ROLE";
  }

  if (normalized.includes("hybrid") || normalized.includes("both")) {
    return "HYBRID";
  }

  return "QP_NOS";
}

function inferSectorCode(sectorName: string) {
  return sectorName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

function mapWorkbookRow(row: Record<string, unknown>) {
  const sectorName = toStringValue(getCellValue(row, headerAliases.sectorName));
  const courseName = toStringValue(getCellValue(row, headerAliases.courseName));
  const internalCourseCode = toStringValue(getCellValue(row, headerAliases.internalCourseCode));
  const sidhCourseId = toStringValue(getCellValue(row, headerAliases.sidhCourseId));

  if (!sectorName && !courseName && !internalCourseCode && !sidhCourseId) {
    return null;
  }

  if (!sectorName || !courseName || !internalCourseCode || !sidhCourseId) {
    throw new Error(`Missing required course columns for row ${JSON.stringify(row)}`);
  }

  const validityStartDate = toDateValue(getCellValue(row, headerAliases.validityStartDate)) ?? new Date();
  const validityEndDate = toDateValue(getCellValue(row, headerAliases.validityEndDate)) ?? new Date("2099-12-31T00:00:00.000Z");

  return {
    sectorName,
    sectorCode: inferSectorCode(sectorName),
    courseName,
    internalCourseCode,
    sidhCourseId,
    associatedQpOrJobRole: toStringValue(getCellValue(row, headerAliases.associatedQpOrJobRole)) || courseName,
    nsqfLevel: toNumberValue(getCellValue(row, headerAliases.nsqfLevel), 4),
    trainingHours: toNumberValue(getCellValue(row, headerAliases.trainingHours), 320),
    gtUploadedDurationHours: toNumberValue(getCellValue(row, headerAliases.gtUploadedDurationHours), 0) || null,
    approvalStatus: inferApprovalStatus(toStringValue(getCellValue(row, headerAliases.approvalStatus))),
    approvalDate: toDateValue(getCellValue(row, headerAliases.approvalDate)),
    validityStartDate,
    validityEndDate,
    minimumAge: toNumberValue(getCellValue(row, headerAliases.minimumAge), 18),
    price: toNumberValue(getCellValue(row, headerAliases.price), 0),
    qpCode: toStringValue(getCellValue(row, headerAliases.qpCode)) || toStringValue(getCellValue(row, headerAliases.associatedQpOrJobRole)),
    jobRoleMappingType: inferMappingType(toStringValue(getCellValue(row, headerAliases.jobRoleMappingType))),
  } satisfies ImportedCourseRow;
}

function serializeSnapshot(course: {
  approvalDate?: Date | null;
  approvalStatus: string;
  associatedQpOrJobRole: string;
  courseId: string;
  courseName: string;
  gtUploadedDurationHours?: number | null;
  internalCourseCode: string;
  jobRoleMappingType: string;
  minimumAge: number;
  nsqfLevel: number;
  price: number;
  programIds?: string[];
  qpCode: string;
  schemeIds?: string[];
  sectorId: string;
  sidhCourseId: string;
  status: string;
  trainingHours: number;
  validityEndDate: Date;
  validityStartDate: Date;
  version: number;
}) {
  return {
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
    approvalDate: course.approvalDate?.toISOString() ?? null,
    validityStartDate: course.validityStartDate.toISOString(),
    validityEndDate: course.validityEndDate.toISOString(),
    minimumAge: course.minimumAge,
    price: course.price,
    qpCode: course.qpCode,
    jobRoleMappingType: course.jobRoleMappingType,
    status: course.status,
    version: course.version,
  };
}

function hasCourseChanged(existingCourse: any, row: ImportedCourseRow, sectorId: string) {
  if (!existingCourse) {
    return true;
  }

  const comparableCurrent = JSON.stringify({
    sectorId: existingCourse.sectorId,
    courseName: existingCourse.courseName,
    internalCourseCode: existingCourse.internalCourseCode,
    sidhCourseId: existingCourse.sidhCourseId,
    associatedQpOrJobRole: existingCourse.associatedQpOrJobRole,
    nsqfLevel: existingCourse.nsqfLevel,
    trainingHours: existingCourse.trainingHours,
    gtUploadedDurationHours: existingCourse.gtUploadedDurationHours ?? null,
    approvalStatus: existingCourse.approvalStatus,
    approvalDate: existingCourse.approvalDate?.toISOString().slice(0, 10) ?? null,
    validityStartDate: existingCourse.validityStartDate.toISOString().slice(0, 10),
    validityEndDate: existingCourse.validityEndDate.toISOString().slice(0, 10),
    minimumAge: existingCourse.minimumAge,
    price: existingCourse.price,
    qpCode: existingCourse.qpCode,
    jobRoleMappingType: existingCourse.jobRoleMappingType,
  });

  const comparableNext = JSON.stringify({
    sectorId,
    courseName: row.courseName,
    internalCourseCode: row.internalCourseCode,
    sidhCourseId: row.sidhCourseId,
    associatedQpOrJobRole: row.associatedQpOrJobRole,
    nsqfLevel: row.nsqfLevel,
    trainingHours: row.trainingHours,
    gtUploadedDurationHours: row.gtUploadedDurationHours ?? null,
    approvalStatus: row.approvalStatus,
    approvalDate: row.approvalDate?.toISOString().slice(0, 10) ?? null,
    validityStartDate: row.validityStartDate.toISOString().slice(0, 10),
    validityEndDate: row.validityEndDate.toISOString().slice(0, 10),
    minimumAge: row.minimumAge,
    price: row.price,
    qpCode: row.qpCode,
    jobRoleMappingType: row.jobRoleMappingType,
  });

  return comparableCurrent !== comparableNext;
}

async function resolveSectorId(row: ImportedCourseRow) {
  const existingSector = await SectorModel.findOne({ code: row.sectorCode });

  if (existingSector) {
    return existingSector.sectorId;
  }

  const createdSector = await SectorModel.create({
    sectorId: createPrefixedId("sec"),
    name: row.sectorName,
    code: row.sectorCode,
    description: `Imported from course workbook for ${row.sectorName}`,
    status: "active",
    createdByUserId: "system_import",
    updatedByUserId: "system_import",
  });

  return createdSector.sectorId;
}

async function createCourseVersionSnapshot(course: {
  approvalDate?: Date | null;
  approvalStatus: string;
  associatedQpOrJobRole: string;
  courseId: string;
  courseName: string;
  gtUploadedDurationHours?: number | null;
  internalCourseCode: string;
  jobRoleMappingType: string;
  minimumAge: number;
  nsqfLevel: number;
  price: number;
  programIds?: string[];
  qpCode: string;
  schemeIds?: string[];
  sectorId: string;
  sidhCourseId: string;
  status: string;
  trainingHours: number;
  validityEndDate: Date;
  validityStartDate: Date;
  version: number;
}) {
  await CourseVersionModel.create({
    courseVersionId: createPrefixedId("cver"),
    courseId: course.courseId,
    version: course.version,
    snapshot: serializeSnapshot(course),
    changedByUserId: "system_import",
    changeSummary: "Workbook import",
  });
}

async function importCourseRow(row: ImportedCourseRow) {
  const sectorId = await resolveSectorId(row);
  const overlappingCourse = await CourseModel.findOne({
    sidhCourseId: row.sidhCourseId,
    status: "active",
    validityStartDate: { $lte: row.validityEndDate },
    validityEndDate: { $gte: row.validityStartDate },
  });

  const existingCourse = await CourseModel.findOne({ internalCourseCode: row.internalCourseCode });

  if (overlappingCourse && (!existingCourse || overlappingCourse.courseId !== existingCourse.courseId)) {
    throw new Error(`Overlapping active mapping found for ${row.sidhCourseId}`);
  }

  if (!existingCourse) {
    const createdCourse = await CourseModel.create({
      courseId: createPrefixedId("cor"),
      sectorId,
      programIds: [],
      schemeIds: [],
      courseName: row.courseName,
      internalCourseCode: row.internalCourseCode,
      sidhCourseId: row.sidhCourseId,
      associatedQpOrJobRole: row.associatedQpOrJobRole,
      nsqfLevel: row.nsqfLevel,
      trainingHours: row.trainingHours,
      gtUploadedDurationHours: row.gtUploadedDurationHours ?? null,
      approvalStatus: row.approvalStatus,
      approvalDate: row.approvalDate ?? null,
      validityStartDate: row.validityStartDate,
      validityEndDate: row.validityEndDate,
      minimumAge: row.minimumAge,
      price: row.price,
      qpCode: row.qpCode,
      jobRoleMappingType: row.jobRoleMappingType,
      status: row.approvalStatus === "rejected" ? "inactive" : "active",
      version: 1,
      createdByUserId: "system_import",
      updatedByUserId: "system_import",
    });

    await createCourseVersionSnapshot(createdCourse);
    return "created" as const;
  }

  if (!hasCourseChanged(existingCourse, row, sectorId)) {
    return "skipped" as const;
  }

  existingCourse.sectorId = sectorId;
  existingCourse.courseName = row.courseName;
  existingCourse.sidhCourseId = row.sidhCourseId;
  existingCourse.associatedQpOrJobRole = row.associatedQpOrJobRole;
  existingCourse.nsqfLevel = row.nsqfLevel;
  existingCourse.trainingHours = row.trainingHours;
  existingCourse.gtUploadedDurationHours = row.gtUploadedDurationHours ?? null;
  existingCourse.approvalStatus = row.approvalStatus;
  existingCourse.approvalDate = row.approvalDate ?? null;
  existingCourse.validityStartDate = row.validityStartDate;
  existingCourse.validityEndDate = row.validityEndDate;
  existingCourse.minimumAge = row.minimumAge;
  existingCourse.price = row.price;
  existingCourse.qpCode = row.qpCode;
  existingCourse.jobRoleMappingType = row.jobRoleMappingType;
  existingCourse.status = row.approvalStatus === "rejected" ? "inactive" : "active";
  existingCourse.version += 1;
  existingCourse.updatedByUserId = "system_import";
  await existingCourse.save();
  await createCourseVersionSnapshot(existingCourse);

  return "updated" as const;
}

async function main() {
  loadEnvConfig(process.cwd());

  const workbookPath = process.argv[2];
  const sheetArgument = process.argv.find((argument) => argument.startsWith("--sheet="));
  const sheetName = sheetArgument?.split("=")[1];

  if (!workbookPath) {
    throw new Error("Usage: npm run import:course-master -- <workbook-path> [--sheet=Sheet1]");
  }

  await connectToDatabase();
  await ensureBootstrapData();

  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const targetSheetName = sheetName ?? workbook.SheetNames[0];

  if (!targetSheetName) {
    throw new Error("Workbook does not contain any sheets");
  }

  const worksheet = workbook.Sheets[targetSheetName];

  if (!worksheet) {
    throw new Error(`Sheet '${targetSheetName}' was not found`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
  const importRows: ImportedCourseRow[] = rows.flatMap((row) => {
    const mappedRow = mapWorkbookRow(row);
    return mappedRow ? [mappedRow] : [];
  });

  const summary = {
    created: 0,
    errors: 0,
    skipped: 0,
    updated: 0,
  };

  for (const row of importRows) {
    try {
      const result = await importCourseRow(row);
      summary[result] += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`Failed to import course ${row.internalCourseCode}:`, error);
    }
  }

  console.log(`Imported ${importRows.length} rows from ${targetSheetName}`);
  console.table(summary);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });