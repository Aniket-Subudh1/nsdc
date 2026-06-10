import { getCandidateProgramLabel } from "@/lib/candidate-field-options";
import { buildCandidateExcelWorkbook, type CandidateExcelRow } from "@/lib/candidate-excel-workbook";
import type { CandidateImportTemplateOptions } from "@/lib/candidate-import-template-workbook";
import { workbookToArrayBuffer } from "@/lib/spreadsheet/excel-template";

export const CANDIDATE_IMPORT_EXPORT_HEADERS = [
  "Name Prefix",
  "Full Name",
  "Gender",
  "DOB",
  "Father's Name",
  "Guardian Name",
  "Email",
  "Phone",
  "Country Code",
  "State",
  "District",
  "Program",
  "Center Name",
  "Course (reference only)",
] as const;

type CandidateExportSource = {
  programId?: string | null;
  centerName?: string | null;
  countryCode?: string | null;
  dateOfBirth: Date | string;
  domicileDistrict?: string | null;
  domicileState?: string | null;
  email?: string | null;
  fathersName?: string | null;
  fullName: string;
  gender?: string | null;
  guardiansName?: string | null;
  mobileNumber: string;
  permanentAddress?: {
    city?: string | null;
    district?: string | null;
    state?: string | null;
  } | null;
  referenceCourseName?: string | null;
  salutation?: string | null;
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

export function mapCandidateToExportRow(candidate: CandidateExportSource): CandidateExcelRow {
  const state = candidate.permanentAddress?.state ?? candidate.domicileState ?? "";
  const district =
    candidate.permanentAddress?.district ??
    candidate.permanentAddress?.city ??
    candidate.domicileDistrict ??
    "";

  return {
    "Name Prefix": candidate.salutation ?? "",
    "Full Name": candidate.fullName,
    Gender: candidate.gender ?? "",
    DOB: formatExportDate(candidate.dateOfBirth),
    "Father's Name": candidate.fathersName ?? "",
    "Guardian Name": candidate.guardiansName ?? "",
    Email: candidate.email ?? "",
    Phone: candidate.mobileNumber,
    "Country Code": candidate.countryCode ?? "91",
    State: state,
    District: district,
    Program: getCandidateProgramLabel(candidate.programId) || "",
    "Center Name": candidate.centerName ?? "",
    "Course (reference only)": candidate.referenceCourseName ?? "",
  };
}

export async function buildCandidateExportWorkbook(
  candidates: CandidateExportSource[],
  options: CandidateImportTemplateOptions,
) {
  const rows =
    candidates.length > 0
      ? candidates.map((candidate) => mapCandidateToExportRow(candidate))
      : [Object.fromEntries(CANDIDATE_IMPORT_EXPORT_HEADERS.map((header) => [header, ""])) as CandidateExcelRow];

  const ExcelJS = (await import("exceljs")).default;
  const workbook = buildCandidateExcelWorkbook(new ExcelJS.Workbook(), options, rows);
  return workbookToArrayBuffer(workbook);
}
