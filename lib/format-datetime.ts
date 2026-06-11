const IST_TIMEZONE = "Asia/Kolkata";

export function parseUserDateTime(value?: Date | string | null): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** e.g. "12 Jun 2025, 3:45 pm" (IST) */
export function formatUserDateTime(value?: Date | string | null, fallback = "—"): string {
  const parsed = parseUserDateTime(value);
  if (!parsed) {
    return fallback;
  }

  return parsed.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** e.g. "12 Jun 2025" (IST) */
export function formatUserDate(value?: Date | string | null, fallback = "—"): string {
  const parsed = parseUserDateTime(value);
  if (!parsed) {
    return fallback;
  }

  return parsed.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Excel / CSV export — e.g. "12 Jun 2025, 03:45 pm" */
export function formatUserDateTimeForExport(value?: Date | string | null): string {
  const parsed = parseUserDateTime(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Date-only export — e.g. "12 Jun 2005" */
export function formatUserDateForExport(value?: Date | string | null): string {
  const parsed = parseUserDateTime(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
