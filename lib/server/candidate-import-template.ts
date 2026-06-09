import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { CourseModel } from "@/lib/server/models/course";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { type AuthSession } from "@/lib/server/services/session";

function getTemplateCenterFilter(actor: AuthSession) {
  if (actor.user.roles.includes("platform_admin")) {
    return {};
  }

  return { centerId: { $in: actor.user.centerIds } };
}

export type CandidateImportTemplateOptions = {
  centerNames: string[];
  courseNames: string[];
};

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

async function runPythonTemplateGenerator(config: CandidateImportTemplateOptions) {
  const stamp = `${process.pid}-${Date.now()}`;
  const configPath = path.join(process.cwd(), `.candidate-import-template-${stamp}.json`);
  const outputPath = path.join(process.cwd(), `.candidate-import-template-${stamp}.xlsx`);
  const scriptPath = path.join(process.cwd(), "scripts/generate-candidate-import-template.py");

  await writeFile(configPath, JSON.stringify(config));

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("python3", [scriptPath, "--config", configPath, "--output", outputPath], {
        cwd: process.cwd(),
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `Template generator exited with code ${code}`));
      });
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(configPath), unlink(outputPath)]);
  }
}

export async function buildCandidateImportTemplate(actor: AuthSession) {
  const options = await listCandidateImportTemplateOptions(actor);
  const buffer = await runPythonTemplateGenerator(options);

  return {
    buffer,
    options,
  };
}
