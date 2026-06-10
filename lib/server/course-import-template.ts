import { buildCourseImportTemplateBuffer } from "@/lib/course-import-template-excel";
import type { CourseImportTemplateOptions } from "@/lib/course-import-template-workbook";
import { connectToDatabase } from "@/lib/server/mongodb";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";

export type { CourseImportTemplateOptions };

function uniqueSortedNames(values: string[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(trimmed);
  }

  return names.sort((left, right) => left.localeCompare(right));
}

export async function listCourseImportTemplateOptions(): Promise<CourseImportTemplateOptions> {
  await connectToDatabase();

  const [sectors, programs, schemes] = await Promise.all([
    SectorModel.find({ status: "active" })
      .select({ name: 1 })
      .sort({ name: 1 })
      .lean(),
    ProgramModel.find({ status: "active" })
      .select({ name: 1 })
      .sort({ name: 1 })
      .lean(),
    SchemeModel.find({ status: "active" })
      .select({ name: 1, sidhSchemeId: 1 })
      .sort({ name: 1 })
      .lean(),
  ]);

  return {
    sectorNames: uniqueSortedNames(sectors.map((sector) => String(sector.name ?? ""))),
    programNames: uniqueSortedNames(programs.map((program) => String(program.name ?? ""))),
    schemeNames: uniqueSortedNames(
      schemes.map((scheme) => {
        const name = String(scheme.name ?? "").trim();
        const sidhSchemeId = String(scheme.sidhSchemeId ?? "").trim();
        return sidhSchemeId ? `${name} (${sidhSchemeId})` : name;
      }),
    ),
    approvalStatusOptions: ["Pending", "Approved"],
  };
}

export async function buildCourseImportTemplate() {
  const options = await listCourseImportTemplateOptions();
  const buffer = await buildCourseImportTemplateBuffer(options);

  return {
    buffer,
    options,
  };
}
