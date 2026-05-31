import writeExcelFile from "write-excel-file/browser";

import { objectsToSheetData, type SpreadsheetObjectRow } from "@/lib/spreadsheet/shared";

type WorkbookSheetInput = {
  name: string;
  rows: SpreadsheetObjectRow[];
};

export async function downloadWorkbook(fileName: string, sheets: WorkbookSheetInput[]) {
  if (sheets.length === 0) {
    throw new Error("Workbook must contain at least one sheet");
  }

  if (sheets.length === 1) {
    await writeExcelFile(objectsToSheetData(sheets[0].rows)).toFile(fileName);
    return;
  }

  await writeExcelFile(
    sheets.map((sheet) => ({
      data: objectsToSheetData(sheet.rows),
      sheet: sheet.name,
    })),
  ).toFile(fileName);
}