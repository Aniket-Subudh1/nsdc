import { buildCandidateImportTemplateBuffer } from "@/lib/candidate-import-template-excel";
import type { CandidateImportTemplateOptions } from "@/lib/candidate-import-template-workbook";
import { CourseModel } from "@/lib/server/models/course";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { type AuthSession } from "@/lib/server/services/session";

export type { CandidateImportTemplateOptions };

function getTemplateCenterFilter(actor: AuthSession) {
  if (actor.user.roles.includes("platform_admin")) {
    return {};
  }

  return { centerId: { $in: actor.user.centerIds } };
}

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

export async function listCandidateImportTemplateOptions(actor: AuthSession): Promise<CandidateImportTemplateOptions> {
  const [centers, courses] = await Promise.all([
    TrainingCenterModel.find({
      ...getTemplateCenterFilter(actor),
      status: "active",
    })
      .select({ centerName: 1 })
      .sort({ centerName: 1 })
      .lean(),
    CourseModel.find({
      status: "active",
      approvalStatus: "approved",
    })
      .select({ courseName: 1 })
      .sort({ courseName: 1 })
      .lean(),
  ]);

  return {
    centerNames: uniqueSortedNames(centers.map((center) => String(center.centerName ?? ""))),
    courseNames: uniqueSortedNames(courses.map((course) => String(course.courseName ?? ""))),
  };
}

export async function buildCandidateImportTemplate(actor: AuthSession) {
  const options = await listCandidateImportTemplateOptions(actor);
  const buffer = await buildCandidateImportTemplateBuffer(options);

  return {
    buffer,
    options,
  };
}
