import { describe, expect, it } from "vitest";

import {
  formatSidhDate,
  formatSidhMidnight,
  formatSidhTime,
  isTrainingPartnerId,
  parseUserDateInput,
  resolveSidhBatchId,
} from "@/lib/server/sidh-payload";

describe("SIDH payload helpers", () => {
  it("formats SIDH dates and times like the Java integration", () => {
    expect(formatSidhDate(new Date("2026-06-11T00:00:00.000Z"))).toBe("2026-06-11");
    expect(formatSidhDate("11/06/2026")).toBe("2026-06-11");
    expect(formatSidhMidnight("2026-06-11")).toBe("2026-06-11T00:00:00Z");
    expect(parseUserDateInput("11/06/2026")).toBe("2026-06-11");
    expect(formatSidhTime("9:00", "09:00")).toBe("09:00");
    expect(formatSidhTime("17:00", "09:00")).toBe("17:00");
  });

  it("parses numeric SIDH batch IDs for enrollment payloads", () => {
    expect(resolveSidhBatchId("2237653")).toBe(2237653);
    expect(resolveSidhBatchId(2237653)).toBe(2237653);
    expect(resolveSidhBatchId("BATCH_REMOTE_001")).toBe("BATCH_REMOTE_001");
  });

  it("detects training partner IDs stored as TC IDs", () => {
    expect(isTrainingPartnerId("TP38273")).toBe(true);
    expect(isTrainingPartnerId("TC_12345")).toBe(false);
  });
});
