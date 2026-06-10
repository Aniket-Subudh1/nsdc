import type { Workbook, Worksheet } from "exceljs";

type WorksheetWithValidations = Worksheet & {
  dataValidations: {
    add: (
      address: string,
      validation: {
        type: "list";
        allowBlank: boolean;
        formulae: string[];
      },
    ) => void;
  };
};

export const MAX_TEMPLATE_DATA_ROW = 50_001;

export function buildInlineListFormula(values: string[]) {
  if (values.length === 0) {
    return null;
  }

  return `"${values.join(",")}"`;
}

export function writeListColumn(worksheet: Worksheet, column: number, values: string[], listsSheetName = "Lists") {
  if (values.length === 0) {
    return null;
  }

  for (const [index, value] of values.entries()) {
    worksheet.getCell(index + 1, column).value = value;
  }

  const columnLetter = worksheet.getColumn(column).letter;
  return `${listsSheetName}!$${columnLetter}$1:$${columnLetter}$${values.length}`;
}

export function addListValidation(
  worksheet: Worksheet,
  cellRange: string,
  formula: string | null,
  { allowBlank }: { allowBlank: boolean },
) {
  (worksheet as WorksheetWithValidations).dataValidations.add(cellRange, {
    type: "list",
    allowBlank,
    formulae: [formula && formula.length > 0 ? formula : '""'],
  });
}

export function sanitizeExcelDefinedName(state: string) {
  let sanitized = state.trim().replace(/[^A-Za-z0-9_.]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (sanitized && /^\d/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return sanitized || "STATE";
}

export async function workbookToArrayBuffer(workbook: Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();

  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const nodeBuffer = Buffer.from(buffer);
  return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength) as ArrayBuffer;
}

export async function downloadExcelWorkbook(fileName: string, workbook: Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
