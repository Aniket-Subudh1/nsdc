import type { Workbook } from "exceljs";

import { CANDIDATE_PROGRAM_OPTIONS } from "@/lib/candidate-field-options";
import { buildCandidateExcelWorkbook } from "@/lib/candidate-excel-workbook";
import {
  CANDIDATE_IMPORT_TEMPLATE_HEADERS,
  type CandidateImportTemplateOptions,
} from "@/lib/candidate-import-template-workbook";
import {
  CANDIDATE_STATE_DISTRICT_MAP,
  CANDIDATE_STATE_OPTIONS,
  type CandidateState,
} from "@/lib/candidate-location-options";
import { downloadExcelWorkbook, workbookToArrayBuffer } from "@/lib/spreadsheet/excel-template";

function buildSampleImportRow(options: CandidateImportTemplateOptions) {
  const sampleState: CandidateState = CANDIDATE_STATE_OPTIONS.includes("ODISHA")
    ? "ODISHA"
    : (CANDIDATE_STATE_OPTIONS[0] ?? "ODISHA");
  const sampleDistrict = CANDIDATE_STATE_DISTRICT_MAP[sampleState]?.[0] ?? "CUTTACK";

  return {
    "Name Prefix": "Mr",
    "Full Name": "Rohit Kumar",
    Gender: "Male",
    DOB: "10/06/2005",
    "Father's Name": "Suresh Kumar",
    "Guardian Name": "",
    Email: "rohit@example.com",
    Phone: "9876543210",
    "Country Code": "91",
    State: sampleState,
    District: sampleDistrict,
    Program: CANDIDATE_PROGRAM_OPTIONS[0] ?? "NSQF School",
    "Center Name": options.centerNames[0] ?? "Center One",
    "Course (reference only)": options.courseNames[0] ?? "",
  } satisfies Partial<Record<(typeof CANDIDATE_IMPORT_TEMPLATE_HEADERS)[number], string>>;
}

export function buildCandidateImportTemplateWorkbook(workbook: Workbook, options: CandidateImportTemplateOptions) {
  return buildCandidateExcelWorkbook(workbook, options, [buildSampleImportRow(options)]);
}

export async function createCandidateImportTemplateWorkbook(options: CandidateImportTemplateOptions) {
  const ExcelJS = (await import("exceljs")).default;
  return buildCandidateImportTemplateWorkbook(new ExcelJS.Workbook(), options);
}

export async function buildCandidateImportTemplateBuffer(options: CandidateImportTemplateOptions) {
  const workbook = await createCandidateImportTemplateWorkbook(options);
  return workbookToArrayBuffer(workbook);
}

export async function downloadCandidateImportTemplateWorkbook(
  fileName: string,
  options: CandidateImportTemplateOptions,
) {
  const workbook = await createCandidateImportTemplateWorkbook(options);
  await downloadExcelWorkbook(fileName, workbook);
}
