function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
}

export function parseUserDateInput(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  const isoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function formatUserDate(value: unknown) {
  return parseUserDateInput(value);
}

export function formatSidhDate(value?: Date | string | null) {
  const userDate = parseUserDateInput(value);
  if (userDate) {
    return userDate;
  }

  return toIsoDate(value)?.slice(0, 10) ?? "";
}

export function formatSidhTime(value?: string | null, fallback = "09:00") {
  const normalized = (value ?? fallback).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return fallback;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function resolveDateParts(value?: Date | string | null) {
  const isoDate = formatSidhDate(value);
  if (!isoDate) {
    return null;
  }

  return {
    day: Number(isoDate.slice(8, 10)),
    month: Number(isoDate.slice(5, 7)) - 1,
    year: Number(isoDate.slice(0, 4)),
  };
}

export function formatSidhMidnight(value?: Date | string | null) {
  const datePart = formatSidhDate(value);
  return datePart ? `${datePart}T00:00:00Z` : "";
}

export function toSidhDate(value: unknown) {
  const userDate = parseUserDateInput(value);
  return userDate ? formatSidhMidnight(userDate) : "";
}

export function toSidhDateTime(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(normalized)) {
    return normalized.endsWith("Z") ? normalized.replace(/\.\d{3}Z$/, "Z") : `${normalized}Z`;
  }

  const userDate = parseUserDateInput(normalized);
  return userDate ? `${userDate}T00:00:00Z` : "";
}

export function formatSidhInstant(
  dateValue?: Date | string | null,
  timeValue?: string | null,
  fallbackTime = "09:00",
) {
  const parts = resolveDateParts(dateValue);
  if (!parts) {
    return "";
  }

  const [hours, minutes] = formatSidhTime(timeValue, fallbackTime).split(":").map(Number);
  const instant = new Date(Date.UTC(parts.year, parts.month, parts.day, hours, minutes, 0));
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function resolveSidhBatchId(batchId: string | null | undefined) {
  const normalized = batchId?.trim();

  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

export function isTrainingPartnerId(value?: string | null) {
  return Boolean(value?.trim().match(/^TP\d+$/i));
}
