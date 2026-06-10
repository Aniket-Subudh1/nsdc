import type { Workbook, Worksheet } from "exceljs";

import {
  CANDIDATE_GENDER_OPTIONS,
  CANDIDATE_NAME_PREFIX_OPTIONS,
  CANDIDATE_PROGRAM_OPTIONS,
} from "@/lib/candidate-field-options";
import {
  CANDIDATE_IMPORT_TEMPLATE_HEADERS,
  type CandidateImportTemplateOptions,
} from "@/lib/candidate-import-template-workbook";
import {
  CANDIDATE_STATE_DISTRICT_MAP,
  CANDIDATE_STATE_OPTIONS,
} from "@/lib/candidate-location-options";
import {
  addListValidation,
  buildInlineListFormula,
  MAX_TEMPLATE_DATA_ROW,
  sanitizeExcelDefinedName,
  writeListColumn,
} from "@/lib/spreadsheet/excel-template";

const FIRST_STATE_DISTRICT_COLUMN = 7;
const PROGRAM_DEFINED_NAME = "CandidatePrograms";

export type CandidateExcelRow = Partial<Record<(typeof CANDIDATE_IMPORT_TEMPLATE_HEADERS)[number], string | null>>;

type CandidateListSources = {
  centerSource: string | null;
  courseSource: string | null;
  genderSource: string | null;
  prefixSource: string | null;
  programSource: string | null;
  stateSource: string | null;
};

function mapCandidateExcelRowToArray(row: CandidateExcelRow) {
  return CANDIDATE_IMPORT_TEMPLATE_HEADERS.map((header) => {
    const value = row[header];
    if (value === null || value === undefined || value === "") {
      return null;
    }

    return String(value);
  });
}

function setupCandidateListSources(
  workbook: Workbook,
  listsSheet: Worksheet,
  options: CandidateImportTemplateOptions,
): CandidateListSources {
  const prefixSource = writeListColumn(listsSheet, 1, [...CANDIDATE_NAME_PREFIX_OPTIONS]);
  const genderSource = writeListColumn(listsSheet, 2, [...CANDIDATE_GENDER_OPTIONS]);
  const programSource = writeListColumn(listsSheet, 3, [...CANDIDATE_PROGRAM_OPTIONS]);
  const centerSource = writeListColumn(listsSheet, 4, options.centerNames);
  const courseSource = writeListColumn(listsSheet, 5, options.courseNames);
  const stateSource = writeListColumn(listsSheet, 6, [...CANDIDATE_STATE_OPTIONS]);

  if (programSource) {
    workbook.definedNames.add(programSource, PROGRAM_DEFINED_NAME);
  }

  const usedDefinedNames = new Set<string>([PROGRAM_DEFINED_NAME]);

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

  return {
    prefixSource,
    genderSource,
    programSource,
    centerSource,
    courseSource,
    stateSource,
  };
}

function applyCandidateSheetValidations(sheet: Worksheet, sources: CandidateListSources, lastRow = MAX_TEMPLATE_DATA_ROW) {
  const programListFormula =
    buildInlineListFormula([...CANDIDATE_PROGRAM_OPTIONS]) ?? sources.programSource ?? PROGRAM_DEFINED_NAME;

  addListValidation(sheet, `A2:A${lastRow}`, sources.prefixSource, { allowBlank: false });
  addListValidation(sheet, `C2:C${lastRow}`, sources.genderSource, { allowBlank: false });

  if (sources.stateSource) {
    addListValidation(sheet, `J2:J${lastRow}`, sources.stateSource, { allowBlank: true });
  }

  if (CANDIDATE_STATE_OPTIONS.length > 0) {
    addListValidation(sheet, `K2:K${lastRow}`, 'INDIRECT(SUBSTITUTE($J2," ","_"))', { allowBlank: true });
  }

  addListValidation(sheet, `L2:L${lastRow}`, programListFormula, { allowBlank: false });

  if (sources.centerSource) {
    addListValidation(sheet, `M2:M${lastRow}`, sources.centerSource, { allowBlank: false });
  }

  if (sources.courseSource) {
    addListValidation(sheet, `N2:N${lastRow}`, sources.courseSource, { allowBlank: true });
  }
}

export function buildCandidateExcelWorkbook(
  workbook: Workbook,
  options: CandidateImportTemplateOptions,
  dataRows: CandidateExcelRow[],
) {
  const sheet = workbook.addWorksheet("Candidates");
  const listsSheet = workbook.addWorksheet("Lists");
  listsSheet.state = "veryHidden";

  const sources = setupCandidateListSources(workbook, listsSheet, options);

  sheet.addRow([...CANDIDATE_IMPORT_TEMPLATE_HEADERS]);
  for (const row of dataRows) {
    sheet.addRow(mapCandidateExcelRowToArray(row));
  }

  applyCandidateSheetValidations(sheet, sources);

  return workbook;
}
