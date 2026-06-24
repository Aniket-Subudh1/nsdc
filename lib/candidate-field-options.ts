export const CANDIDATE_NAME_PREFIX_OPTIONS = ["Mr", "Mrs", "Ms", "Mx"] as const;
export const CANDIDATE_GENDER_OPTIONS = ["Male", "Female", "Transgender"] as const;
export const CANDIDATE_PROGRAM_OPTIONS = [
  "NSQF School",
  "Fee-Based",
  "CSR",
  "SFS - Skill for Success",
  "ITI",
  "Diploma",
  "Farmer",
] as const;

export type CandidateNamePrefix = (typeof CANDIDATE_NAME_PREFIX_OPTIONS)[number];
export type CandidateGender = (typeof CANDIDATE_GENDER_OPTIONS)[number];
export type CandidateProgram = (typeof CANDIDATE_PROGRAM_OPTIONS)[number];

export function normalizeCandidateNamePrefix(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const match = CANDIDATE_NAME_PREFIX_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function normalizeCandidateGender(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const match = CANDIDATE_GENDER_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function normalizeCandidateProgram(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const match = CANDIDATE_PROGRAM_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function resolveCandidateProgramId(program: CandidateProgram) {
  return program;
}

export function getCandidateProgramLabel(programId?: string | null) {
  const trimmed = String(programId ?? "").trim();
  if (!trimmed || trimmed === "candidate_registration") {
    return "";
  }

  return normalizeCandidateProgram(trimmed);
}

export const CANDIDATE_NAME_PREFIX_ERROR = `Name prefix must be one of: ${CANDIDATE_NAME_PREFIX_OPTIONS.join(", ")}`;
export const CANDIDATE_GENDER_ERROR = `Gender must be one of: ${CANDIDATE_GENDER_OPTIONS.join(", ")}`;
export const CANDIDATE_PROGRAM_ERROR = `Program must be one of: ${CANDIDATE_PROGRAM_OPTIONS.join(", ")}`;
