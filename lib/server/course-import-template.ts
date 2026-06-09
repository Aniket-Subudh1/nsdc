import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { connectToDatabase } from "@/lib/server/mongodb";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";

export type CourseImportTemplateOptions = {
  approvalStatusOptions: string[];
  programNames: string[];
  schemeNames: string[];
  sectorNames: string[];
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

async function runPythonTemplateGenerator(config: CourseImportTemplateOptions) {
  const stamp = `${process.pid}-${Date.now()}`;
  const configPath = path.join(process.cwd(), `.course-import-template-${stamp}.json`);
  const outputPath = path.join(process.cwd(), `.course-import-template-${stamp}.xlsx`);
  const scriptPath = path.join(process.cwd(), "scripts/generate-course-import-template.py");

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

export async function buildCourseImportTemplate() {
  const options = await listCourseImportTemplateOptions();
  const buffer = await runPythonTemplateGenerator(options);

  return {
    buffer,
    options,
  };
}
