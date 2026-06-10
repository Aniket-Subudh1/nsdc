import type { Workbook } from "exceljs";

import {
  COURSE_IMPORT_TEMPLATE_HEADERS,
  type CourseImportTemplateOptions,
} from "@/lib/course-import-template-workbook";
import {
  addListValidation,
  downloadExcelWorkbook,
  MAX_TEMPLATE_DATA_ROW,
  workbookToArrayBuffer,
  writeListColumn,
} from "@/lib/spreadsheet/excel-template";

function buildSampleImportRow(options: CourseImportTemplateOptions) {
  return [
    options.sectorNames[0] ?? "Agriculture",
    options.programNames[0] ?? "Skill Development Program",
    options.schemeNames[0] ?? "PMKVY",
    "Maize Cultivator",
    "FeeSchCor_48128",
    "Kisan Drone Operator",
    "4",
    6,
    "Approved",
    "01/01/2026",
    320,
    "31/12/2028",
    "MC",
  ];
}

export function buildCourseImportTemplateWorkbook(workbook: Workbook, options: CourseImportTemplateOptions) {
  const sheet = workbook.addWorksheet("Course Import Template");
  const listsSheet = workbook.addWorksheet("Lists");
  listsSheet.state = "veryHidden";

  const sectorSource = writeListColumn(listsSheet, 1, options.sectorNames);
  const programSource = writeListColumn(listsSheet, 2, options.programNames);
  const schemeSource = writeListColumn(listsSheet, 3, options.schemeNames);
  const approvalSource = writeListColumn(listsSheet, 4, options.approvalStatusOptions);

  sheet.addRow([...COURSE_IMPORT_TEMPLATE_HEADERS]);
  sheet.addRow(buildSampleImportRow(options));

  const lastRow = MAX_TEMPLATE_DATA_ROW;

  if (sectorSource) {
    addListValidation(sheet, `A2:A${lastRow}`, sectorSource, { allowBlank: false });
  }

  if (programSource) {
    addListValidation(sheet, `B2:B${lastRow}`, programSource, { allowBlank: false });
  }

  if (schemeSource) {
    addListValidation(sheet, `C2:C${lastRow}`, schemeSource, { allowBlank: false });
  }

  if (approvalSource) {
    addListValidation(sheet, `I2:I${lastRow}`, approvalSource, { allowBlank: false });
  }

  return workbook;
}

export async function createCourseImportTemplateWorkbook(options: CourseImportTemplateOptions) {
  const ExcelJS = (await import("exceljs")).default;
  return buildCourseImportTemplateWorkbook(new ExcelJS.Workbook(), options);
}

export async function buildCourseImportTemplateBuffer(options: CourseImportTemplateOptions) {
  const workbook = await createCourseImportTemplateWorkbook(options);
  return workbookToArrayBuffer(workbook);
}

export async function downloadCourseImportTemplateWorkbook(
  fileName: string,
  options: CourseImportTemplateOptions,
) {
  const workbook = await createCourseImportTemplateWorkbook(options);
  await downloadExcelWorkbook(fileName, workbook);
}
