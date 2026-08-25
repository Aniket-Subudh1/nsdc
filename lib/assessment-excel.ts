export const ASSESSMENT_EXCEL_HEADERS = [
  "Candidate ID",
  "SIDH Candidate ID",
  "Learner name",
  "Training status",
  "Attendance %",
  "Result",
  "Score %",
  "Grade",
  "Certified",
  "Certificate name",
] as const;

export type AssessmentExcelHeader = (typeof ASSESSMENT_EXCEL_HEADERS)[number];

export type AssessmentExcelRow = {
  attendance: number;
  candidateId: string;
  certificateName: string;
  certified: boolean;
  grade: string;
  learnerName: string;
  result: "Pass" | "Fail";
  score: number;
  sidhCandidateId: string;
  trainingStatus: "completed" | "ongoing" | "dropout";
};

export type AssessmentExcelApplyRow = {
  candidateId: string;
  eligibleForAssessment: boolean;
  sidhCandidateId: string | null;
  assessmentDetails: {
    assessmentPercentage: number;
    assessmentStatus: string;
    grade: string;
  };
  certificationDetails: {
    certificationName: string;
    isCertified: boolean;
  };
  trainingDetails: {
    attendance: number;
    trainingStatus: string;
  };
};

export type AssessmentExcelApplyResult<T extends AssessmentExcelApplyRow> = {
  applied: number;
  invalid: number;
  rows: T[];
  unmatched: number;
};

export function defaultAssessmentScores(isDropout: boolean) {
  if (isDropout) {
    return {
      attendance: 0,
      certified: false,
      grade: "D",
      result: "Fail" as const,
      score: 0,
    };
  }

  return {
    attendance: 100,
    certified: true,
    grade: "A",
    result: "Pass" as const,
    score: 100,
  };
}

export function extractSidhResponseMessage(responseBody: unknown) {
  if (typeof responseBody === "string" && responseBody.trim()) {
    return responseBody.trim();
  }

  if (responseBody && typeof responseBody === "object") {
    const record = responseBody as Record<string, unknown>;
    for (const key of ["message", "Message", "error", "errorMessage"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return "SIDH accepted the assessment data";
}

export function formatSidhLifecycleLabel(remoteStatus?: string | null) {
  const normalized = remoteStatus?.trim().toLowerCase() ?? "";
  if (normalized === "assessed") {
    return "Assessed / Placement-ready";
  }
  if (normalized === "certified") {
    return "Certified";
  }
  if (normalized === "cancelled") {
    return "Cancelled on SIDH";
  }
  if (normalized === "active") {
    return "Active on SIDH";
  }
  return remoteStatus?.trim() || null;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[%]/g, " percent ").replace(/[^a-z0-9]+/g, "");
}

function parsePercentage(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/%/g, "").trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function parseTrainingStatus(value: unknown): AssessmentExcelRow["trainingStatus"] | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "completed" || normalized === "complete") {
    return "completed";
  }
  if (normalized === "ongoing" || normalized === "inprogress" || normalized === "in progress") {
    return "ongoing";
  }
  if (normalized === "dropout" || normalized === "drop out") {
    return "dropout";
  }
  return null;
}

function parseResult(value: unknown): AssessmentExcelRow["result"] | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pass" || normalized === "passed") {
    return "Pass";
  }
  if (normalized === "fail" || normalized === "failed") {
    return "Fail";
  }
  return null;
}

function parseCertified(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "true", "1", "y", "certified"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0", "n"].includes(normalized)) {
    return false;
  }
  return null;
}

export function parseAssessmentExcelObjects(rows: Array<Record<string, unknown>>): AssessmentExcelRow[] {
  return rows.map((row) => {
    const lookup = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      lookup.set(normalizeHeader(key), value);
    }

    const get = (...keys: string[]) => {
      for (const key of keys) {
        if (lookup.has(key)) {
          return lookup.get(key);
        }
      }
      return "";
    };

    return {
      attendance: parsePercentage(get("attendancepercent", "attendance")) ?? 100,
      candidateId: String(get("candidateid") ?? "").trim(),
      certificateName: String(get("certificatename") ?? "").trim(),
      certified: parseCertified(get("certified")) ?? true,
      grade: String(get("grade") ?? "").trim() || "A",
      learnerName: String(get("learnername") ?? "").trim(),
      result: parseResult(get("result", "assessmentstatus")) ?? "Pass",
      score: parsePercentage(get("scorepercent", "assessmentpercent", "score")) ?? 100,
      sidhCandidateId: String(get("sidhcandidateid") ?? "").trim(),
      trainingStatus: parseTrainingStatus(get("trainingstatus")) ?? "completed",
    };
  });
}

export function applyAssessmentExcelRows<T extends AssessmentExcelApplyRow>(
  currentRows: T[],
  excelRows: AssessmentExcelRow[],
): AssessmentExcelApplyResult<T> {
  const byCandidateId = new Map(currentRows.map((row) => [row.candidateId.trim().toLowerCase(), row.candidateId]));
  const bySidhId = new Map(
    currentRows
      .filter((row) => row.sidhCandidateId)
      .map((row) => [row.sidhCandidateId!.trim().toLowerCase(), row.candidateId]),
  );

  let applied = 0;
  let unmatched = 0;
  let invalid = 0;
  const updates = new Map<string, AssessmentExcelRow>();

  for (const excelRow of excelRows) {
    const matchedId =
      (excelRow.candidateId ? byCandidateId.get(excelRow.candidateId.toLowerCase()) : undefined) ??
      (excelRow.sidhCandidateId ? bySidhId.get(excelRow.sidhCandidateId.toLowerCase()) : undefined);

    if (!matchedId) {
      unmatched += 1;
      continue;
    }

    if (excelRow.attendance < 0 || excelRow.score < 0) {
      invalid += 1;
      continue;
    }

    updates.set(matchedId, excelRow);
  }

  const rows = currentRows.map((row) => {
    const excelRow = updates.get(row.candidateId);
    if (!excelRow) {
      return row;
    }

    applied += 1;
    const isDropout = excelRow.trainingStatus === "dropout";
    return {
      ...row,
      eligibleForAssessment: !isDropout,
      assessmentDetails: {
        ...row.assessmentDetails,
        assessmentPercentage: excelRow.score,
        assessmentStatus: excelRow.result,
        grade: excelRow.grade || (excelRow.score >= 80 ? "A" : excelRow.score >= 60 ? "B" : excelRow.score >= 40 ? "C" : "D"),
      },
      certificationDetails: {
        ...row.certificationDetails,
        certificationName: excelRow.certificateName || row.certificationDetails.certificationName,
        isCertified: excelRow.result === "Pass" ? excelRow.certified : false,
      },
      trainingDetails: {
        attendance: excelRow.attendance,
        trainingStatus: excelRow.trainingStatus,
      },
    };
  });

  return { applied, invalid, rows, unmatched };
}
