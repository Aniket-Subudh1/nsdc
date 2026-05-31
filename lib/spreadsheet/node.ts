import { readFile } from "node:fs/promises";

import readExcelFile from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";

import { objectsToSheetData, sheetDataToObjects, type SpreadsheetObjectRow, type SpreadsheetSheetData } from "@/lib/spreadsheet/shared";

type WorkbookSheet = {
  data: SpreadsheetSheetData;
  sheet: string;
};

type WorkbookSheetInput = {
  name: string;
  rows: SpreadsheetObjectRow[];
};

type ReadWorkbookOptions = {
  defaultValue?: unknown;
};

function toBuffer(value: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function toArrayBuffer(value: Buffer) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function normalizeWorkbookSheets(sheets: WorkbookSheet[], options: ReadWorkbookOptions = {}) {
  return sheets.map((sheet) => ({
    name: sheet.sheet,
    rows: sheetDataToObjects(sheet.data, options),
  }));
}

function toWritableSheets(sheets: WorkbookSheetInput[]) {
  return sheets.map((sheet) => ({
    data: objectsToSheetData(sheet.rows),
    sheet: sheet.name,
  }));
}

export async function readWorkbookSheetsFromArrayBuffer(input: ArrayBuffer, options: ReadWorkbookOptions = {}) {
  const sheets = (await readExcelFile(toBuffer(input))) as WorkbookSheet[];
  return normalizeWorkbookSheets(sheets, options);
}

export async function readWorkbookSheetsFromFile(filePath: string, options: ReadWorkbookOptions = {}) {
  const workbookBuffer = await readFile(filePath);
  const sheets = (await readExcelFile(workbookBuffer)) as WorkbookSheet[];
  return normalizeWorkbookSheets(sheets, options);
}

export async function writeWorkbookToArrayBuffer(sheets: WorkbookSheetInput[]) {
  const writableSheets = toWritableSheets(sheets);

  if (writableSheets.length === 0) {
    throw new Error("Workbook must contain at least one sheet");
  }

  const buffer = writableSheets.length === 1
    ? await writeExcelFile(writableSheets[0].data).toBuffer()
    : await writeExcelFile(writableSheets).toBuffer();

  return toArrayBuffer(buffer);
}