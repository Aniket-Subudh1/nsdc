import { COURSE_IMPORT_TEMPLATE_HEADERS } from "@/lib/course-import-template-workbook";
import { writeWorkbookToArrayBuffer } from "@/lib/spreadsheet/node";

export const COURSE_IMPORT_EXPORT_HEADERS = COURSE_IMPORT_TEMPLATE_HEADERS;

type CourseExportLookups = {
  programNameById: Map<string, string>;
  schemeLabelById: Map<string, string>;
  sectorNameById: Map<string, string>;
};

type CourseExportSource = {
  approvalDate?: Date | string | null;
  approvalStatus?: string | null;
  associatedQpOrJobRole?: string | null;
  courseName: string;
  nsqfLevel?: string | null;
  programIds?: string[] | null;
  schemeIds?: string[] | null;
  sectorId: string;
  shortForm?: string | null;
  sidhCourseId?: string | null;
  trainingHours?: number | null;
  trainingPerDayHours?: number | null;
  validityEndDate?: Date | string | null;
};

function formatExportDate(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function formatApprovalStatus(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "approved") {
    return "Approved";
  }

  if (normalized === "pending") {
    return "Pending";
  }

  if (normalized === "rejected") {
    return "Rejected";
  }

  if (normalized === "expired") {
    return "Expired";
  }

  return "";
}

function buildSchemeLabel(name: string, sidhSchemeId?: string | null) {
  const trimmedName = name.trim();
  const trimmedSidhSchemeId = sidhSchemeId?.trim();

  if (!trimmedName) {
    return "";
  }

  return trimmedSidhSchemeId ? `${trimmedName} (${trimmedSidhSchemeId})` : trimmedName;
}

export function createCourseExportLookups(input: {
  programs: Array<{ programId: string; name?: string | null }>;
  schemes: Array<{ name?: string | null; schemeId: string; sidhSchemeId?: string | null }>;
  sectors: Array<{ name?: string | null; sectorId: string }>;
}): CourseExportLookups {
  const sectorNameById = new Map<string, string>();
  for (const sector of input.sectors) {
    const name = String(sector.name ?? "").trim();
    if (name) {
      sectorNameById.set(String(sector.sectorId), name);
    }
  }

  const programNameById = new Map<string, string>();
  for (const program of input.programs) {
    const name = String(program.name ?? "").trim();
    if (name) {
      programNameById.set(String(program.programId), name);
    }
  }

  const schemeLabelById = new Map<string, string>();
  for (const scheme of input.schemes) {
    const name = String(scheme.name ?? "").trim();
    if (!name) {
      continue;
    }

    schemeLabelById.set(String(scheme.schemeId), buildSchemeLabel(name, scheme.sidhSchemeId));
  }

  return {
    programNameById,
    schemeLabelById,
    sectorNameById,
  };
}

export function mapCourseToExportRow(course: CourseExportSource, lookups: CourseExportLookups) {
  const programId = course.programIds?.[0] ?? "";
  const schemeId = course.schemeIds?.[0] ?? "";

  return {
    "Sector Name": lookups.sectorNameById.get(course.sectorId) ?? "",
    "Linked Program": lookups.programNameById.get(programId) ?? "",
    "Linked Scheme": lookups.schemeLabelById.get(schemeId) ?? "",
    "Course Name": course.courseName,
    "SIDH Course ID": course.sidhCourseId ?? "",
    "Job Role": course.associatedQpOrJobRole ?? "",
    "NSQF Level": course.nsqfLevel ?? "",
    "Training Per Day (Hours)": course.trainingPerDayHours ?? "",
    "Approval Status": formatApprovalStatus(course.approvalStatus),
    "Approval Date": formatExportDate(course.approvalDate),
    "Total Hours": course.trainingHours ?? "",
    "Valid Until": formatExportDate(course.validityEndDate),
    "Short Form": course.shortForm ?? "",
  };
}

export async function buildCourseExportWorkbook(courses: CourseExportSource[], lookups: CourseExportLookups) {
  const rows = courses.map((course) => mapCourseToExportRow(course, lookups));

  return writeWorkbookToArrayBuffer([
    {
      name: "Course Import Template",
      rows:
        rows.length > 0
          ? rows
          : [Object.fromEntries(COURSE_IMPORT_EXPORT_HEADERS.map((header) => [header, ""]))],
    },
  ]);
}
