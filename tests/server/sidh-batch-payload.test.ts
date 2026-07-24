import { describe, expect, it } from "vitest";

import {
  buildSidhBatchPayload,
  calculateBatchEndDate,
  calculateMinimumAssessmentDate,
  resolveAssessmentDate,
  resolveBatchSchemeId,
  resolveSidhSchemeKey,
} from "@/lib/sidh-batch-payload";

describe("SIDH batch payload builder", () => {
  it("builds the ISO datetime batch payload from course and schedule data", () => {
    const payload = buildSidhBatchPayload({
      assessmentDate: "2026-11-25",
      batchName: "Retail Batch 2026-06-11",
      batchSize: 25,
      course: {
        sidhCourseId: "FeeSchCor_48128",
        trainingPerDayHours: 8,
      },
      endDate: "2026-11-25",
      endTime: "17:00",
      fee: 500,
      program: {
        name: "NSDC Market led programme",
        skillingCategoryId: 1,
        skillingCategoryName: "NSDC Market led programme",
        skillingCategoryScheme: "Fee Based",
      },
      scheme: {
        feePaidBy: "Self-Paid",
        sidhSchemeId: "Scheme_2",
        sidhSchemeReferenceId: "Scheme_2",
        sidhSchemeType: "feeBased",
      },
      startDate: "2026-06-11",
      startTime: "09:00",
      tcId: "TC164648",
      options: {
        assessmentMode: "Self",
        batchType: "Regular",
        categoryType: "Fee Based",
        createdSource: "Created for NSDC Academy Partners",
        feePaidBy: "Self-Paid",
        tpId: "TP054997",
      },
      configuredTpId: "TP054997",
    });

    expect(payload).toMatchObject({
      assessmentEndDate: "2026-11-25T00:00:00Z",
      assessmentStartDate: "2026-11-25T00:00:00Z",
      batchEndDate: "2026-11-25T00:00:00Z",
      batchEndTime: "2026-11-25T17:00:00Z",
      batchStartDate: "2026-06-11T00:00:00Z",
      batchStartTime: "2026-06-11T09:00:00Z",
      courseId: "FeeSchCor_48128",
      tcId: "TC164648",
      trainingHoursPerDay: 8,
      batchFee: { totalFees: 500 },
      schemeId: "Scheme_2",
      schemeReferenceId: "Scheme_2",
      schemeType: "feeBased",
      feePaidBy: "Self-Paid",
      skillingcategory: {
        id: 1,
        name: "NSDC Market led programme",
        scheme: "Fee Based",
      },
      tpId: "TP054997",
    });
  });

  it("emits equal schemeId and schemeReferenceId even when scheme fields differ", () => {
    const payload = buildSidhBatchPayload({
      assessmentDate: "2026-11-25",
      batchName: "Retail Batch 2026-06-11",
      batchSize: 25,
      course: {
        sidhCourseId: "FeeSchCor_48128",
        trainingPerDayHours: 8,
      },
      endDate: "2026-11-25",
      endTime: "17:00",
      fee: 500,
      scheme: {
        sidhSchemeId: "44644",
        sidhSchemeReferenceId: "Scheme_1159",
        sidhSchemeType: "feeBased",
      },
      startDate: "2026-06-11",
      startTime: "09:00",
      tcId: "TC164648",
      options: {
        tpId: "TP054997",
      },
    });

    expect(payload.schemeId).toBe("Scheme_1159");
    expect(payload.schemeReferenceId).toBe("Scheme_1159");
    expect(payload.schemeId).toBe(payload.schemeReferenceId);
  });

  it("resolves Scheme_* style keys preferentially", () => {
    expect(
      resolveSidhSchemeKey({
        sidhSchemeId: "44644",
        sidhSchemeReferenceId: "Scheme_2",
      }),
    ).toBe("Scheme_2");
    expect(
      resolveSidhSchemeKey({
        sidhSchemeId: "Scheme_2",
        sidhSchemeReferenceId: "",
      }),
    ).toBe("Scheme_2");
  });

  it("rejects zero batch fee when building the SIDH payload", () => {
    expect(() =>
      buildSidhBatchPayload({
        assessmentDate: "2026-11-25",
        batchName: "Retail Batch 2026-06-11",
        batchSize: 25,
        course: {
          sidhCourseId: "FeeSchCor_48128",
          trainingPerDayHours: 8,
        },
        endDate: "2026-11-25",
        endTime: "17:00",
        fee: 0,
        scheme: {
          sidhSchemeId: "Scheme_2",
          sidhSchemeReferenceId: "Scheme_2",
          sidhSchemeType: "feeBased",
        },
        startDate: "2026-06-11",
        startTime: "09:00",
        tcId: "TC164648",
      }),
    ).toThrow("Batch fee must be greater than 0");
  });

  it("calculates end date from course duration", () => {
    expect(calculateBatchEndDate("2026-06-11", 240, 8)).toBe("2026-07-10");
  });

  it("defaults assessment date to the next day after batch end date", () => {
    expect(calculateMinimumAssessmentDate("2026-02-01")).toBe("2026-02-02");
    expect(resolveAssessmentDate("2026-02-01")).toBe("2026-02-02");
    expect(resolveAssessmentDate("2026-02-01", "2026-02-01")).toBe("2026-02-02");
    expect(resolveAssessmentDate("2026-02-01", "2026-02-15")).toBe("2026-02-15");
  });

  it("prefers a course-linked SIDH-ready scheme", () => {
    expect(
      resolveBatchSchemeId(["sch_a"], [
        { schemeId: "sch_a", sidhSchemeId: "Scheme_2", sidhSchemeReferenceId: "Scheme_2", syncEnabled: true },
        { schemeId: "sch_b", sidhSchemeId: "Scheme_3", sidhSchemeReferenceId: "Scheme_3", syncEnabled: true },
      ]),
    ).toBe("sch_a");
  });
});
