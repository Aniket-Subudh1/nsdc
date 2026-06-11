import { describe, expect, it } from "vitest";

import {
  formatUserDate,
  formatUserDateForExport,
  formatUserDateTime,
  formatUserDateTimeForExport,
  parseUserDateTime,
} from "@/lib/format-datetime";

describe("format-datetime", () => {
  it("parses ISO strings", () => {
    expect(parseUserDateTime("2024-06-12T10:30:00.000Z")?.toISOString()).toBe("2024-06-12T10:30:00.000Z");
  });

  it("formats readable IST date and time", () => {
    const formatted = formatUserDateTime("2024-06-12T10:30:00.000Z");
    expect(formatted).toContain("2024");
    expect(formatted).toMatch(/Jun/i);
    expect(formatted).toMatch(/4:00\s*pm/i);
  });

  it("formats readable IST date only", () => {
    const formatted = formatUserDate("2024-06-12T10:30:00.000Z");
    expect(formatted).toContain("2024");
    expect(formatted).toMatch(/Jun/i);
    expect(formatted).not.toMatch(/pm|am/i);
  });

  it("formats export datetime without slashes", () => {
    const formatted = formatUserDateTimeForExport("2024-06-12T10:30:00.000Z");
    expect(formatted).toMatch(/Jun/i);
    expect(formatted).toMatch(/2024/);
    expect(formatted).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("formats export date for DOB-style fields", () => {
    const formatted = formatUserDateForExport("2005-06-10T00:00:00.000Z");
    expect(formatted).toMatch(/Jun/i);
    expect(formatted).toContain("2005");
  });

  it("returns fallback for invalid values", () => {
    expect(formatUserDateTime("not-a-date")).toBe("—");
    expect(formatUserDateTimeForExport(null)).toBe("");
  });
});
