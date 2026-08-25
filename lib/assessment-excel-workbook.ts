import type { Workbook } from "exceljs";

import {
  ASSESSMENT_EXCEL_HEADERS,
  parseAssessmentExcelObjects,
  type AssessmentExcelHeader,
  type AssessmentExcelRow,
} from "@/lib/assessment-excel";
import { addListValidation, buildInlineListFormula, downloadExcelWorkbook } from "@/lib/spreadsheet/excel-template";

export type AssessmentTemplateLearner = {
  attendance: number;
  candidateId: string;
  certificateName: string;
  certified: boolean;
  grade: string;
  learnerName: string;
  result: string;
  score: number;
  sidhCandidateId: string;
  trainingStatus: string;
};

function cellText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function buildAssessmentExcelWorkbook(workbook: Workbook, learners: AssessmentTemplateLearner[]) {
  const sheet = workbook.addWorksheet("Assessment");
  sheet.addRow([...ASSESSMENT_EXCEL_HEADERS]);
  sheet.getRow(1).font = { bold: true };

  for (const learner of learners) {
    sheet.addRow([
      learner.candidateId,
      learner.sidhCandidateId,
      learner.learnerName,
      learner.trainingStatus,
      learner.attendance,
      learner.result,
      learner.score,
      learner.grade,
      learner.certified ? "Yes" : "No",
      learner.certificateName,
    ]);
  }

  const lastRow = Math.max(learners.length + 1, 2);
  addListValidation(sheet, `D2:D${lastRow}`, buildInlineListFormula(["completed", "ongoing", "dropout"]), {
    allowBlank: false,
  });
  addListValidation(sheet, `F2:F${lastRow}`, buildInlineListFormula(["Pass", "Fail"]), { allowBlank: false });
  addListValidation(sheet, `I2:I${lastRow}`, buildInlineListFormula(["Yes", "No"]), { allowBlank: false });

  sheet.columns = ASSESSMENT_EXCEL_HEADERS.map((header) => ({
    header,
    width: Math.max(18, header.length + 4),
  }));

  return workbook;
}

export async function downloadAssessmentExcelWorkbook(fileName: string, learners: AssessmentTemplateLearner[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = buildAssessmentExcelWorkbook(new ExcelJS.Workbook(), learners);
  await downloadExcelWorkbook(fileName, workbook);
}

export async function parseAssessmentExcelFile(file: File): Promise<AssessmentExcelRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const headerRow = sheet.getRow(1);
  const headers: AssessmentExcelHeader[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = cellText(cell.value) as AssessmentExcelHeader;
  });

  const objects: Array<Record<string, unknown>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      record[header] = cellText(row.getCell(index + 1).value);
    });
    objects.push(record);
  });

  return parseAssessmentExcelObjects(objects);
}
