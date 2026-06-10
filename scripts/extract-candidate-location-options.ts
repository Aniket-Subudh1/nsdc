import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import readExcelFile from "read-excel-file/node";

type SpreadsheetCellValue = boolean | Date | number | string | null;
type SpreadsheetSheetData = SpreadsheetCellValue[][];

type WorkbookSheet = {
  data: SpreadsheetSheetData;
  sheet: string;
};

const NON_STATE_HEADERS = new Set([
  "Type Of ID",
  "yesno",
  "EmploymentStatus",
  "HeardAboutUs",
  "Education List",
  "TrainingStatus",
  "State",
  "AadharID",
]);

const DEFAULT_SOURCE = path.join(
  process.env.HOME ?? "",
  "Downloads/SIDH_API Integration @GTET 2/SIDH Bulk Candidate_upload Template.xlsx",
);
const DEFAULT_OUTPUT = path.join(process.cwd(), "lib/candidate-location-options.ts");
const DEFAULT_JSON_OUTPUT = path.join(process.cwd(), "lib/candidate-location-options.json");

function clean(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).replace(/\ufeff/g, "").trim();
  if (!text || text.toLowerCase() === "none") {
    return null;
  }

  return text.split(/\s+/).join(" ");
}

function normalizeStateKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readStateLabels(headerRow: SpreadsheetCellValue[], bodyRows: SpreadsheetSheetData) {
  const stateColumnIndex = headerRow.findIndex((header) => clean(header) === "State");
  if (stateColumnIndex < 0) {
    throw new Error("State column was not found in Master Reference Data");
  }

  const labels: string[] = [];
  const seen = new Set<string>();

  for (const row of bodyRows) {
    const label = clean(row[stateColumnIndex]);
    if (!label) {
      continue;
    }

    const key = normalizeStateKey(label);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    labels.push(label);
  }

  return labels;
}

async function extractStateCityMap(sourcePath: string) {
  const workbookBuffer = await readFile(sourcePath);
  const sheets = (await readExcelFile(workbookBuffer)) as WorkbookSheet[];
  const masterSheet = sheets.find((sheet) => sheet.sheet === "Master Reference Data");

  if (!masterSheet) {
    throw new Error("Master Reference Data sheet was not found");
  }

  const [headerRow, ...bodyRows] = masterSheet.data;
  if (!headerRow) {
    throw new Error("Master Reference Data sheet is empty");
  }

  const headers = headerRow.map((header) => clean(header) ?? "");
  const stateLabels = readStateLabels(headerRow, bodyRows);
  const labelByKey = Object.fromEntries(stateLabels.map((label) => [normalizeStateKey(label), label]));
  const stateCities = Object.fromEntries(stateLabels.map((label) => [label, [] as string[]]));

  for (const [columnIndex, header] of headers.entries()) {
    if (columnIndex < 10 || !header) {
      continue;
    }

    if (NON_STATE_HEADERS.has(header) || header.includes("Constituency")) {
      continue;
    }

    const stateLabel = labelByKey[normalizeStateKey(header)];
    if (!stateLabel) {
      continue;
    }

    const cities: string[] = [];
    const seen = new Set<string>();

    for (const row of bodyRows) {
      const city = clean(row[columnIndex]);
      if (!city) {
        continue;
      }

      const key = city.toUpperCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      cities.push(city);
    }

    stateCities[stateLabel] = cities;
  }

  return Object.fromEntries(
    stateLabels
      .filter((label) => stateCities[label]?.length)
      .map((label) => [label, stateCities[label]]),
  );
}

function renderTypescript(stateCities: Record<string, string[]>) {
  const states = Object.keys(stateCities);

  return `// Auto-generated from SIDH Bulk Candidate_upload Template.xlsx (Master Reference Data).
// Regenerate with: npm run extract:candidate-locations -- <workbook-path>

export const CANDIDATE_STATE_OPTIONS = ${JSON.stringify(states, null, 2)} as const;

export type CandidateState = (typeof CANDIDATE_STATE_OPTIONS)[number];

export const CANDIDATE_STATE_DISTRICT_MAP: Record<CandidateState, readonly string[]> = ${JSON.stringify(stateCities, null, 2)} as const;

function normalizeLocationToken(value: string) {
  return value.trim().replace(/\\s+/g, " ");
}

function normalizeStateLookupKey(value: string) {
  return normalizeLocationToken(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDistrictLookupKey(value: string) {
  return normalizeLocationToken(value).toUpperCase().replace(/\\./g, "").replace(/[^A-Z0-9]/g, "");
}

const CANDIDATE_STATE_LOOKUP = Object.fromEntries(
  CANDIDATE_STATE_OPTIONS.map((state) => [normalizeStateLookupKey(state), state]),
) as Record<string, CandidateState>;

const CANDIDATE_DISTRICT_LOOKUP = Object.fromEntries(
  CANDIDATE_STATE_OPTIONS.map((state) => [
    state,
    Object.fromEntries(
      CANDIDATE_STATE_DISTRICT_MAP[state].map((district) => [normalizeDistrictLookupKey(district), district]),
    ),
  ]),
) as Record<CandidateState, Record<string, string>>;

export function resolveCandidateState(value: string) {
  const trimmed = normalizeLocationToken(value);
  if (!trimmed) {
    return "";
  }

  const exactMatch = CANDIDATE_STATE_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  return CANDIDATE_STATE_LOOKUP[normalizeStateLookupKey(trimmed)] ?? "";
}

export function resolveCandidateDistrict(state: string, value: string) {
  const trimmed = normalizeLocationToken(value);
  if (!trimmed) {
    return "";
  }

  const resolvedState = resolveCandidateState(state);
  if (!resolvedState) {
    return "";
  }

  const districts = CANDIDATE_STATE_DISTRICT_MAP[resolvedState];
  const exactMatch = districts.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  return CANDIDATE_DISTRICT_LOOKUP[resolvedState][normalizeDistrictLookupKey(trimmed)] ?? "";
}

export function listCandidateDistrictsForState(state: string) {
  const resolvedState = resolveCandidateState(String(state ?? ""));
  if (!resolvedState) {
    return [] as string[];
  }

  return [...CANDIDATE_STATE_DISTRICT_MAP[resolvedState]];
}

export function normalizeCandidateState(value: unknown) {
  return resolveCandidateState(String(value ?? ""));
}

export function normalizeCandidateDistrict(state: unknown, value: unknown) {
  return resolveCandidateDistrict(String(state ?? ""), String(value ?? ""));
}

export function isKnownCandidateState(value: unknown) {
  const trimmed = normalizeLocationToken(String(value ?? ""));
  if (!trimmed) {
    return true;
  }

  return resolveCandidateState(trimmed) !== "";
}

export function isKnownCandidateDistrictForState(state: unknown, value: unknown) {
  const trimmed = normalizeLocationToken(String(value ?? ""));
  if (!trimmed) {
    return true;
  }

  return resolveCandidateDistrict(String(state ?? ""), trimmed) !== "";
}

export const CANDIDATE_STATE_ERROR = \`State must be one of the SIDH LGD values: \${CANDIDATE_STATE_OPTIONS.slice(0, 5).join(", ")}, ... (\${CANDIDATE_STATE_OPTIONS.length} total)\`;

export function candidateDistrictError(state: string) {
  const districts = listCandidateDistrictsForState(state);
  const resolvedState = normalizeCandidateState(state);
  if (districts.length === 0) {
    return "District must match a SIDH LGD value for the selected state";
  }

  return \`District must be one of the SIDH LGD values for \${resolvedState || state}: \${districts.slice(0, 5).join(", ")}\${districts.length > 5 ? ", ..." : ""}\`;
}

/** @deprecated Use listCandidateDistrictsForState */
export const listCandidateCitiesForState = listCandidateDistrictsForState;

/** @deprecated Use normalizeCandidateDistrict */
export const normalizeCandidateCity = normalizeCandidateDistrict;

/** @deprecated Use isKnownCandidateDistrictForState */
export const isKnownCandidateCityForState = isKnownCandidateDistrictForState;

/** @deprecated Use candidateDistrictError */
export const candidateCityError = candidateDistrictError;

/** @deprecated Use CANDIDATE_STATE_DISTRICT_MAP */
export const CANDIDATE_STATE_CITY_MAP = CANDIDATE_STATE_DISTRICT_MAP;
`;
}

async function main() {
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;
  const jsonOutputPath = process.argv[4] ?? DEFAULT_JSON_OUTPUT;

  const stateCities = await extractStateCityMap(sourcePath);
  const typescript = renderTypescript(stateCities);

  await writeFile(outputPath, typescript, "utf8");
  await writeFile(jsonOutputPath, `${JSON.stringify(stateCities, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outputPath} and ${jsonOutputPath} with ${Object.keys(stateCities).length} states`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
