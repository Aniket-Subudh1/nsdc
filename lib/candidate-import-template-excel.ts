import type { Workbook } from "exceljs";

import {
  CANDIDATE_GENDER_OPTIONS,
  CANDIDATE_NAME_PREFIX_OPTIONS,
} from "@/lib/candidate-field-options";
import {
  CANDIDATE_IMPORT_TEMPLATE_HEADERS,
  type CandidateImportTemplateOptions,
} from "@/lib/candidate-import-template-workbook";
import {
  CANDIDATE_STATE_DISTRICT_MAP,
  CANDIDATE_STATE_OPTIONS,
  type CandidateState,
} from "@/lib/candidate-location-options";
import {
  addListValidation,
  downloadExcelWorkbook,
  MAX_TEMPLATE_DATA_ROW,
  sanitizeExcelDefinedName,
  workbookToArrayBuffer,
  writeListColumn,
} from "@/lib/spreadsheet/excel-template";

const FIRST_STATE_DISTRICT_COLUMN = 6;

function buildSampleImportRow(options: CandidateImportTemplateOptions) {
  const sampleState: CandidateState = CANDIDATE_STATE_OPTIONS.includes("ODISHA")
    ? "ODISHA"
    : (CANDIDATE_STATE_OPTIONS[0] ?? "ODISHA");
  const sampleDistrict = CANDIDATE_STATE_DISTRICT_MAP[sampleState]?.[0] ?? "CUTTACK";

  return [
    "Mr",
    "Rohit Kumar",
    "Male",
    "10/06/2005",
    "Suresh Kumar",
    null,
    "rohit@example.com",
    "9876543210",
    "91",
    sampleState,
    sampleDistrict,
    options.centerNames[0] ?? "Center One",
    options.courseNames[0] ?? null,
  ];
}

export function buildCandidateImportTemplateWorkbook(workbook: Workbook, options: CandidateImportTemplateOptions) {
  const sheet = workbook.addWorksheet("Candidates");
  const listsSheet = workbook.addWorksheet("Lists");
  listsSheet.state = "veryHidden";

  const prefixSource = writeListColumn(listsSheet, 1, [...CANDIDATE_NAME_PREFIX_OPTIONS]);
  const genderSource = writeListColumn(listsSheet, 2, [...CANDIDATE_GENDER_OPTIONS]);
  const centerSource = writeListColumn(listsSheet, 3, options.centerNames);
  const courseSource = writeListColumn(listsSheet, 4, options.courseNames);
  const stateSource = writeListColumn(listsSheet, 5, [...CANDIDATE_STATE_OPTIONS]);

  const usedDefinedNames = new Set<string>();

  for (const [index, state] of CANDIDATE_STATE_OPTIONS.entries()) {
    const districts = [...CANDIDATE_STATE_DISTRICT_MAP[state]];
    if (districts.length === 0) {
      continue;
    }

    const column = FIRST_STATE_DISTRICT_COLUMN + index;
    const districtSource = writeListColumn(listsSheet, column, districts);
    if (!districtSource) {
      continue;
    }

    let definedName = sanitizeExcelDefinedName(state);
    let suffix = 1;

    while (usedDefinedNames.has(definedName)) {
      suffix += 1;
      definedName = `${sanitizeExcelDefinedName(state)}_${suffix}`;
    }

    usedDefinedNames.add(definedName);
    workbook.definedNames.add(districtSource, definedName);
  }

  sheet.addRow([...CANDIDATE_IMPORT_TEMPLATE_HEADERS]);
  sheet.addRow(buildSampleImportRow(options));

  const lastRow = MAX_TEMPLATE_DATA_ROW;

  addListValidation(sheet, `A2:A${lastRow}`, prefixSource, { allowBlank: false });
  addListValidation(sheet, `C2:C${lastRow}`, genderSource, { allowBlank: false });

  if (stateSource) {
    addListValidation(sheet, `J2:J${lastRow}`, stateSource, { allowBlank: true });
  }

  if (CANDIDATE_STATE_OPTIONS.length > 0) {
    addListValidation(sheet, `K2:K${lastRow}`, 'INDIRECT(SUBSTITUTE($J2," ","_"))', { allowBlank: true });
  }

  if (centerSource) {
    addListValidation(sheet, `L2:L${lastRow}`, centerSource, { allowBlank: false });
  }

  if (courseSource) {
    addListValidation(sheet, `M2:M${lastRow}`, courseSource, { allowBlank: true });
  }

  return workbook;
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
