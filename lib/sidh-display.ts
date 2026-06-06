import { parseUserDateInput } from "@/lib/server/sidh-payload";

function parseDateInput(value?: string | null) {
  const parsed = parseUserDateInput(value);
  if (!parsed) {
    return null;
  }

  return new Date(`${parsed}T00:00:00.000Z`);
}

export function formatDisplayDate(value?: string | null) {
  const dateValue = parseDateInput(value);
  if (!dateValue) {
    return value?.trim() || "-";
  }

  return dateValue.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDisplayTime(value?: string | null) {
  if (!value?.trim()) {
    return "-";
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return value;
  }

  const dateValue = new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2])));
  return dateValue.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export function formatDisplayDateTime(value?: string | null) {
  if (!value?.trim()) {
    return "-";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}
