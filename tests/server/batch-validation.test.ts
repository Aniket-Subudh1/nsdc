import { describe, expect, it } from "vitest";

import {
  attendanceImportRowSchema,
  createBatchSchema,
  updateBatchSchema,
} from "@/lib/server/validation";

describe("batch validation", () => {
  it("rejects batch size over 80", () => {
    expect(() =>
      createBatchSchema.parse({
        batchCode: "B-001",
        batchName: "January Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-02-03",
        candidateIds: Array.from({ length: 81 }, (_, index) => `cand_${index + 1}`),
      }),
    ).toThrow("Batch size must never exceed 80 candidates");
  });

  it("rejects assessment dates before the batch end date by default", () => {
    expect(() =>
      createBatchSchema.parse({
        batchCode: "B-002",
        batchName: "Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-01-20",
      }),
    ).toThrow("Assessment date cannot be before batch end date unless explicitly configured");
  });

  it("allows earlier assessment dates only when explicitly configured", () => {
    expect(
      createBatchSchema.parse({
        batchCode: "B-003",
        batchName: "Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-01-20",
        allowAssessmentBeforeBatchEnd: true,
      }),
    ).toMatchObject({
      batchCode: "B-003",
    });
  });

  it("rejects inverted start and end dates on update", () => {
    expect(() =>
      updateBatchSchema.parse({
        startDate: "2026-03-02",
        endDate: "2026-03-01",
      }),
    ).toThrow("Batch start date must be before end date");
  });
});

describe("attendance validation", () => {
  it("accepts normalized staged attendance rows", () => {
    expect(
      attendanceImportRowSchema.parse({
        candidateId: "cand_001",
        attendanceDate: "2026-01-10",
        attendanceStatus: "present",
        trainingStatus: "ongoing",
      }),
    ).toMatchObject({
      attendanceStatus: "present",
      candidateId: "cand_001",
    });
  });
});