import { describe, expect, it } from "vitest";

import {
  attendanceImportRowSchema,
  createBatchSchema,
  createSchemeSchema,
  updateBatchSchema,
  updateSchemeSchema,
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
        assessmentDate: "2026-02-08",
        candidateIds: Array.from({ length: 81 }, (_, index) => `cand_${index + 1}`),
        fee: 500,
      }),
    ).toThrow("Batch size must never exceed 80 candidates");
  });

  it("rejects assessment dates on the batch end date", () => {
    expect(() =>
      createBatchSchema.parse({
        batchCode: "B-002",
        batchName: "Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-02-01",
        fee: 500,
      }),
    ).toThrow("Assessment date must be at least 1 day after the batch end date");
  });

  it("accepts assessment dates from the next day after the batch end date", () => {
    expect(
      createBatchSchema.parse({
        batchCode: "B-003",
        batchName: "Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-02-02",
        fee: 500,
      }),
    ).toMatchObject({
      batchCode: "B-003",
      assessmentDate: "2026-02-02",
    });
  });

  it("rejects update assessment dates on the batch end date", () => {
    expect(() =>
      updateBatchSchema.parse({
        endDate: "2026-02-01",
        assessmentDate: "2026-02-01",
      }),
    ).toThrow("Assessment date must be at least 1 day after the batch end date");
  });

  it("rejects inverted start and end dates on update", () => {
    expect(() =>
      updateBatchSchema.parse({
        startDate: "2026-03-02",
        endDate: "2026-03-01",
      }),
    ).toThrow("Batch start date must be before end date");
  });

  it("rejects zero batch fee on create", () => {
    expect(() =>
      createBatchSchema.parse({
        batchCode: "B-004",
        batchName: "Retail Batch",
        centerId: "tc_001",
        courseId: "course_001",
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        assessmentDate: "2026-02-15",
        fee: 0,
      }),
    ).toThrow("Batch fee must be greater than 0");
  });

  it("rejects zero batch fee on update", () => {
    expect(() =>
      updateBatchSchema.parse({
        fee: 0,
      }),
    ).toThrow("Batch fee must be greater than 0");
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

describe("scheme validation", () => {
  it("accepts blank optional dates on create", () => {
    expect(
      createSchemeSchema.parse({
        code: "Scheme_2",
        name: "Fee Based",
        status: "active",
        syncEnabled: false,
        validFrom: "",
        validTo: "",
      }),
    ).toMatchObject({
      code: "Scheme_2",
      name: "Fee Based",
      validFrom: undefined,
      validTo: undefined,
    });
  });

  it("accepts blank optional dates on update", () => {
    expect(
      updateSchemeSchema.parse({
        code: "Scheme_2_Updated",
        validFrom: "",
        validTo: "",
      }),
    ).toMatchObject({
      code: "Scheme_2_Updated",
      validFrom: undefined,
      validTo: undefined,
    });
  });
});