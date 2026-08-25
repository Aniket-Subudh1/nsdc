import { describe, expect, it } from "vitest";

import {
  applyAssessmentExcelRows,
  defaultAssessmentScores,
  extractSidhResponseMessage,
  formatSidhLifecycleLabel,
  parseAssessmentExcelObjects,
} from "@/lib/assessment-excel";

describe("assessment excel helpers", () => {
  it("defaults non-dropout learners to 100/100 Pass", () => {
    expect(defaultAssessmentScores(false)).toEqual({
      attendance: 100,
      certified: true,
      grade: "A",
      result: "Pass",
      score: 100,
    });
    expect(defaultAssessmentScores(true).result).toBe("Fail");
  });

  it("extracts the SIDH acceptance message", () => {
    expect(extractSidhResponseMessage({ message: "Updated batch with candidate in candidate collection" })).toBe(
      "Updated batch with candidate in candidate collection",
    );
  });

  it("formats SIDH lifecycle badges", () => {
    expect(formatSidhLifecycleLabel("assessed")).toBe("Assessed / Placement-ready");
    expect(formatSidhLifecycleLabel("certified")).toBe("Certified");
  });

  it("applies Excel rows onto matching learners", () => {
    const current = [
      {
        candidateId: "cand_001",
        eligibleForAssessment: true,
        sidhCandidateId: "CAN_40912030",
        assessmentDetails: { assessmentPercentage: 100, assessmentStatus: "Pass", grade: "A" },
        certificationDetails: { certificationName: "Mushroom Farming", isCertified: true },
        trainingDetails: { attendance: 100, trainingStatus: "completed" },
      },
    ];

    const excelRows = parseAssessmentExcelObjects([
      {
        "SIDH Candidate ID": "CAN_40912030",
        "Learner name": "Rama Charati",
        "Training status": "completed",
        "Attendance %": "90",
        Result: "Pass",
        "Score %": "88",
        Grade: "A",
        Certified: "Yes",
        "Certificate name": "Mushroom Farming",
      },
    ]);

    const result = applyAssessmentExcelRows(current, excelRows);
    expect(result.applied).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.rows[0]?.trainingDetails.attendance).toBe(90);
    expect(result.rows[0]?.assessmentDetails.assessmentPercentage).toBe(88);
  });
});
