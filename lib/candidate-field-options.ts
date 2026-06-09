export const CANDIDATE_NAME_PREFIX_OPTIONS = ["Mr", "Mrs", "Ms", "Mx"] as const;
export const CANDIDATE_GENDER_OPTIONS = ["Male", "Female", "Transgender"] as const;

export type CandidateNamePrefix = (typeof CANDIDATE_NAME_PREFIX_OPTIONS)[number];
export type CandidateGender = (typeof CANDIDATE_GENDER_OPTIONS)[number];

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

export const CANDIDATE_NAME_PREFIX_ERROR = `Name prefix must be one of: ${CANDIDATE_NAME_PREFIX_OPTIONS.join(", ")}`;
export const CANDIDATE_GENDER_ERROR = `Gender must be one of: ${CANDIDATE_GENDER_OPTIONS.join(", ")}`;
