import {
  CANDIDATE_GENDER_OPTIONS,
  CANDIDATE_NAME_PREFIX_OPTIONS,
  CANDIDATE_PROGRAM_OPTIONS,
} from "@/lib/candidate-field-options";
import {
  CANDIDATE_STATE_DISTRICT_MAP,
  CANDIDATE_STATE_OPTIONS,
} from "@/lib/candidate-location-options";

export const CANDIDATE_IMPORT_TEMPLATE_HEADERS = [
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
  "Program",
  "Center Name",
  "Sector (reference only)",
  "Course (reference only)",
] as const;

export type CandidateImportTemplateOptions = {
  centerNames: string[];
  /** Flat course list kept for compatibility and fallbacks. */
  courseNames: string[];
  /** Sector display names that have at least one approved course. */
  sectorNames: string[];
  /** Approved course names keyed by sector display name. */
  coursesBySector: Record<string, string[]>;
};

export type CandidateImportTemplateSheet = {
  name: string;
  rows: Record<string, unknown>[];
};

function buildListReferenceRows(options: CandidateImportTemplateOptions) {
  const rowCount = Math.max(
    CANDIDATE_NAME_PREFIX_OPTIONS.length,
    CANDIDATE_GENDER_OPTIONS.length,
    CANDIDATE_PROGRAM_OPTIONS.length,
    options.centerNames.length,
    options.sectorNames.length,
    options.courseNames.length,
    CANDIDATE_STATE_OPTIONS.length,
  );

  if (rowCount === 0) {
    return [];
  }

  return Array.from({ length: rowCount }, (_, index) => ({
    "Name Prefix": CANDIDATE_NAME_PREFIX_OPTIONS[index] ?? "",
    Gender: CANDIDATE_GENDER_OPTIONS[index] ?? "",
    Program: CANDIDATE_PROGRAM_OPTIONS[index] ?? "",
    "Center Name": options.centerNames[index] ?? "",
    "Sector (reference only)": options.sectorNames[index] ?? "",
    "Course (reference only)": options.courseNames[index] ?? "",
    State: CANDIDATE_STATE_OPTIONS[index] ?? "",
  }));
}

function buildDistrictReferenceRows() {
  const rows: Record<string, unknown>[] = [];

  for (const state of CANDIDATE_STATE_OPTIONS) {
    for (const district of CANDIDATE_STATE_DISTRICT_MAP[state]) {
      rows.push({
        State: state,
        District: district,
      });
    }
  }

  return rows;
}

function pickSampleSectorCourse(options: CandidateImportTemplateOptions) {
  const sectorName = options.sectorNames[0] ?? "";
  const courseName =
    (sectorName ? options.coursesBySector[sectorName]?.[0] : undefined) ?? options.courseNames[0] ?? "";
  return { sectorName, courseName };
}

function buildSampleImportRow(options: CandidateImportTemplateOptions) {
  const sampleState = CANDIDATE_STATE_OPTIONS.includes("ODISHA") ? "ODISHA" : (CANDIDATE_STATE_OPTIONS[0] ?? "ODISHA");
  const sampleDistrict = CANDIDATE_STATE_DISTRICT_MAP[sampleState]?.[0] ?? "CUTTACK";
  const { sectorName, courseName } = pickSampleSectorCourse(options);

  return {
    "Name Prefix": "Mr",
    "Full Name": "Rohit Kumar",
    Gender: "Male",
    DOB: "10/06/2005",
    "Father's Name": "Suresh Kumar",
    "Guardian Name": "",
    Email: "rohit@example.com",
    Phone: "9876543210",
    "Country Code": "91",
    State: sampleState,
    District: sampleDistrict,
    Program: CANDIDATE_PROGRAM_OPTIONS[0] ?? "NSQF School",
    "Center Name": options.centerNames[0] ?? "Center One",
    "Sector (reference only)": sectorName,
    "Course (reference only)": courseName,
  };
}

export function buildCandidateImportTemplateSheets(
  options: CandidateImportTemplateOptions,
): CandidateImportTemplateSheet[] {
  const listRows = buildListReferenceRows(options);
  const districtRows = buildDistrictReferenceRows();

  return [
    {
      name: "Candidates",
      rows: [buildSampleImportRow(options)],
    },
    ...(listRows.length > 0
      ? [
          {
            name: "Lists",
            rows: listRows,
          },
        ]
      : []),
    ...(districtRows.length > 0
      ? [
          {
            name: "Districts",
            rows: districtRows,
          },
        ]
      : []),
  ];
}
