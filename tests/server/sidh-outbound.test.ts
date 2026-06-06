import { describe, expect, it } from "vitest";

import {
  normalizeBatchCreationPayload,
  normalizeCandidateRegistrationPayload,
  normalizeTrainingAssessmentPayload,
} from "@/lib/server/sidh-outbound";
import {
  formatSidhDate,
  formatSidhMidnight,
  parseUserDateInput,
  toSidhDate,
  toSidhDateTime,
} from "@/lib/server/sidh-payload";

describe("user date parsing", () => {
  it("normalizes common user-facing date formats to YYYY-MM-DD", () => {
    expect(parseUserDateInput("10/06/2005")).toBe("2005-06-10");
    expect(parseUserDateInput("2005-06-10")).toBe("2005-06-10");
    expect(parseUserDateInput("2005-06-10T00:00:00Z")).toBe("2005-06-10");
    expect(parseUserDateInput(new Date("2005-06-10T00:00:00.000Z"))).toBe("2005-06-10");
  });
});

describe("SIDH date conversion", () => {
  it("converts user dates to SIDH midnight timestamps", () => {
    expect(toSidhDate("10/06/2005")).toBe("2005-06-10T00:00:00Z");
    expect(formatSidhMidnight("2005-06-10")).toBe("2005-06-10T00:00:00Z");
    expect(formatSidhDate("10/06/2005")).toBe("2005-06-10");
  });

  it("preserves SIDH datetime values", () => {
    expect(toSidhDateTime("2026-01-01T09:00:00Z")).toBe("2026-01-01T09:00:00Z");
    expect(toSidhDateTime("2026-02-05")).toBe("2026-02-05T00:00:00Z");
  });
});

describe("SIDH outbound payload normalization", () => {
  it("normalizes candidate registration DOB", () => {
    expect(
      normalizeCandidateRegistrationPayload({
        ContactDetails: {
          CountryCode: "+91",
          Phone: "9876543210",
        },
        PersonalDetails: {
          DOB: "10/06/2005",
          FirstName: "Rohit Kumar",
        },
      }),
    ).toMatchObject({
      PersonalDetails: {
        DOB: "2005-06-10T00:00:00Z",
      },
    });
  });

  it("normalizes batch and assessment date fields", () => {
    expect(
      normalizeBatchCreationPayload({
        assessmentEndDate: "2026-02-05",
        assessmentMode: "Self",
        assessmentStartDate: "2026-02-05",
        batchEndDate: "2026-02-01",
        batchEndTime: "2026-02-01T17:00:00Z",
        batchFee: { totalFees: 500 },
        batchName: "Retail Batch",
        batchStartDate: "2026-01-01",
        batchStartTime: "2026-01-01T09:00:00Z",
        batchType: "Regular",
        courseId: "SIDH_COURSE_001",
        createdSource: "Created for NSDC Academy Partners",
        feePaidBy: "Self-Paid",
        schemeId: "Scheme_2",
        schemeReferenceId: "02R/2009-10/002IM",
        schemeType: "feeBased",
        size: 80,
        skillingcategory: { id: 1, name: "NSDC Market led programme", scheme: "Fee Based" },
        tcId: "SIDH_TC_001",
        trainingHoursPerDay: 8,
        type: "Fee Based",
      }),
    ).toMatchObject({
      batchStartDate: "2026-01-01T00:00:00Z",
      batchEndDate: "2026-02-01T00:00:00Z",
      assessmentStartDate: "2026-02-05T00:00:00Z",
      assessmentEndDate: "2026-02-05T00:00:00Z",
    });

    expect(
      normalizeTrainingAssessmentPayload({
        batchId: "BATCH_REMOTE_001",
        candidates: [
          {
            assessmentDetails: {
              assessmentAgency: "Self",
              assessmentDataUploadedOn: "2026-02-05",
              assessmentPercentage: 82,
              assessmentStatus: "Pass",
              assessorID: "ASSR_001",
              assessorName: "Assessor One",
              grade: "A",
            },
            candidateID: "CAN_001",
            certificationDetails: {
              certificationDate: "2026-02-05",
              certificationName: "Retail Course",
              certifyingAgency: "Self",
              isCertified: true,
            },
            trainingDetails: {
              attendance: 92,
              trainingStatus: "completed",
            },
          },
        ],
      }),
    ).toMatchObject({
      candidates: [
        {
          assessmentDetails: {
            assessmentDataUploadedOn: "2026-02-05T00:00:00Z",
          },
          certificationDetails: {
            certificationDate: "2026-02-05T00:00:00Z",
          },
        },
      ],
    });
  });
});
