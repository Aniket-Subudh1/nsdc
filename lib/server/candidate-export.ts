import { writeWorkbookToArrayBuffer } from "@/lib/spreadsheet/node";

export const CANDIDATE_IMPORT_EXPORT_HEADERS = [
  "Name Prefix",
  "Full Name",
  "Gender",
  "DOB",
  "Father's Name",
  "Guardian Name",
  "Email",
  "Phone",
  "Country Code",
  "State",
  "District",
  "Center Name",
  "Course (reference only)",
] as const;

type CandidateExportSource = {
  centerName?: string | null;
  countryCode?: string | null;
  dateOfBirth: Date | string;
  domicileDistrict?: string | null;
  domicileState?: string | null;
  email?: string | null;
  fathersName?: string | null;
  fullName: string;
  gender?: string | null;
  guardiansName?: string | null;
  mobileNumber: string;
  permanentAddress?: {
    city?: string | null;
    district?: string | null;
    state?: string | null;
  } | null;
  referenceCourseName?: string | null;
  salutation?: string | null;
};

function formatExportDate(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export function mapCandidateToExportRow(candidate: CandidateExportSource) {
  const state = candidate.permanentAddress?.state ?? candidate.domicileState ?? "";
  const district =
    candidate.permanentAddress?.district ??
    candidate.permanentAddress?.city ??
    candidate.domicileDistrict ??
    "";

  return {
    "Name Prefix": candidate.salutation ?? "",
    "Full Name": candidate.fullName,
    Gender: candidate.gender ?? "",
    DOB: formatExportDate(candidate.dateOfBirth),
    "Father's Name": candidate.fathersName ?? "",
    "Guardian Name": candidate.guardiansName ?? "",
    Email: candidate.email ?? "",
    Phone: candidate.mobileNumber,
    "Country Code": candidate.countryCode ?? "91",
    State: state,
    District: district,
    "Center Name": candidate.centerName ?? "",
    "Course (reference only)": candidate.referenceCourseName ?? "",
  };
}

export async function buildCandidateExportWorkbook(candidates: CandidateExportSource[]) {
  const rows = candidates.map((candidate) => mapCandidateToExportRow(candidate));

  return writeWorkbookToArrayBuffer([
    {
      name: "Candidates",
      rows: rows.length > 0 ? rows : [Object.fromEntries(CANDIDATE_IMPORT_EXPORT_HEADERS.map((header) => [header, ""]))],
    },
  ]);
}
