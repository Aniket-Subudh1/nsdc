export const COURSE_IMPORT_TEMPLATE_HEADERS = [
  "Sector Name",
  "Linked Program",
  "Linked Scheme",
  "Course Name",
  "SIDH Course ID",
  "Job Role",
  "NSQF Level",
  "Training Per Day (Hours)",
  "Approval Status",
  "Approval Date",
  "Total Hours",
  "Valid Until",
  "Short Form",
] as const;

export type CourseImportTemplateOptions = {
  approvalStatusOptions: string[];
  programNames: string[];
  schemeNames: string[];
  sectorNames: string[];
};

export type CourseImportTemplateSheet = {
  name: string;
  rows: Record<string, unknown>[];
};

function buildListReferenceRows(options: CourseImportTemplateOptions) {
  const rowCount = Math.max(
    options.sectorNames.length,
    options.programNames.length,
    options.schemeNames.length,
    options.approvalStatusOptions.length,
  );

  if (rowCount === 0) {
    return [];
  }

  return Array.from({ length: rowCount }, (_, index) => ({
    "Sector Name": options.sectorNames[index] ?? "",
    "Program Name": options.programNames[index] ?? "",
    "Scheme Name": options.schemeNames[index] ?? "",
    "Approval Status": options.approvalStatusOptions[index] ?? "",
  }));
}

function buildSampleImportRow(options: CourseImportTemplateOptions) {
  return Object.fromEntries(
    COURSE_IMPORT_TEMPLATE_HEADERS.map((header) => {
      switch (header) {
        case "Sector Name":
          return [header, options.sectorNames[0] ?? "Agriculture"];
        case "Linked Program":
          return [header, options.programNames[0] ?? "Skill Development Program"];
        case "Linked Scheme":
          return [header, options.schemeNames[0] ?? "PMKVY"];
        case "Course Name":
          return [header, "Maize Cultivator"];
        case "SIDH Course ID":
          return [header, "FeeSchCor_48128"];
        case "Job Role":
          return [header, "Kisan Drone Operator"];
        case "NSQF Level":
          return [header, "4"];
        case "Training Per Day (Hours)":
          return [header, 6];
        case "Approval Status":
          return [header, "Approved"];
        case "Approval Date":
          return [header, "01/01/2026"];
        case "Total Hours":
          return [header, 320];
        case "Valid Until":
          return [header, "31/12/2028"];
        case "Short Form":
          return [header, "MC"];
        default:
          return [header, ""];
      }
    }),
  );
}

export function buildCourseImportTemplateSheets(options: CourseImportTemplateOptions): CourseImportTemplateSheet[] {
  const listRows = buildListReferenceRows(options);

  return [
    {
      name: "Course Import Template",
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
  ];
}
