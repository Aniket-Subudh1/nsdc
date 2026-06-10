import {
  CANDIDATE_GENDER_OPTIONS,
  CANDIDATE_NAME_PREFIX_OPTIONS,
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
  "Center Name",
  "Course (reference only)",
] as const;

export type CandidateImportTemplateOptions = {
  centerNames: string[];
  courseNames: string[];
};

export type CandidateImportTemplateSheet = {
  name: string;
  rows: Record<string, unknown>[];
};

function buildListReferenceRows(options: CandidateImportTemplateOptions) {
  const rowCount = Math.max(
    CANDIDATE_NAME_PREFIX_OPTIONS.length,
    CANDIDATE_GENDER_OPTIONS.length,
    options.centerNames.length,
    options.courseNames.length,
    CANDIDATE_STATE_OPTIONS.length,
  );

  if (rowCount === 0) {
    return [];
  }

  return Array.from({ length: rowCount }, (_, index) => ({
    "Name Prefix": CANDIDATE_NAME_PREFIX_OPTIONS[index] ?? "",
    Gender: CANDIDATE_GENDER_OPTIONS[index] ?? "",
    "Center Name": options.centerNames[index] ?? "",
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

function buildSampleImportRow(options: CandidateImportTemplateOptions) {
  const sampleState = CANDIDATE_STATE_OPTIONS.includes("ODISHA") ? "ODISHA" : (CANDIDATE_STATE_OPTIONS[0] ?? "ODISHA");
  const sampleDistrict = CANDIDATE_STATE_DISTRICT_MAP[sampleState]?.[0] ?? "CUTTACK";

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
    "Center Name": options.centerNames[0] ?? "Center One",
    "Course (reference only)": options.courseNames[0] ?? "",
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
