export type SpreadsheetCellValue = boolean | Date | number | string | null;
export type SpreadsheetObjectRow = Record<string, unknown>;
export type SpreadsheetSheetData = SpreadsheetCellValue[][];

type SheetRowOptions = {
  defaultValue?: unknown;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const excelEpoch = Date.UTC(1899, 11, 31);

export function excelSerialToDate(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const wholeDays = Math.trunc(value);
  const fractionalDay = value - wholeDays;
  const adjustedDays = wholeDays > 59 ? wholeDays - 1 : wholeDays;

  return new Date(excelEpoch + adjustedDays * millisecondsPerDay + Math.round(fractionalDay * millisecondsPerDay));
}

function normalizeHeaderCell(value: SpreadsheetCellValue) {
  return String(value ?? "").trim();
}

function isEmptyCell(value: SpreadsheetCellValue | undefined) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function normalizeCellValue(value: unknown): SpreadsheetCellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  return String(value);
}

export function sheetDataToObjects(data: SpreadsheetSheetData, options: SheetRowOptions = {}) {
  const [headerRow, ...bodyRows] = data;

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map(normalizeHeaderCell);
  const defaultValue = options.defaultValue ?? "";

  return bodyRows.flatMap((row) => {
    const record: SpreadsheetObjectRow = {};
    let hasValue = false;

    for (const [index, header] of headers.entries()) {
      if (!header) {
        continue;
      }

      const cellValue = row[index];

      if (!isEmptyCell(cellValue)) {
        hasValue = true;
      }

      record[header] = cellValue === undefined || cellValue === null ? defaultValue : cellValue;
    }

    return hasValue ? [record] : [];
  });
}

export function objectsToSheetData(rows: SpreadsheetObjectRow[]) {
  const headers: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      headers.push(key);
    }
  }

  if (headers.length === 0) {
    return [[]] satisfies SpreadsheetSheetData;
  }

  return [
    headers,
    ...rows.map((row) => headers.map((header) => normalizeCellValue(row[header]))),
  ] satisfies SpreadsheetSheetData;
}