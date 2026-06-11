import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchModel } from "@/lib/server/models/batch";
import { CourseModel } from "@/lib/server/models/course";
import { ProgramModel } from "@/lib/server/models/program";
import { SectorModel } from "@/lib/server/models/sector";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { ApiError } from "@/lib/server/http";
import { type AuthSession } from "@/lib/server/services/session";

export type EnrollmentAnalyticsFilters = {
  financialYear?: string; // "2024-25" or "all"
  district?: string;
  sectorId?: string;
  programId?: string;
  centerId?: string;
};

export type DistrictSummaryRow = {
  district: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

export type DistrictTrendRow = {
  district: string;
  years: Record<string, { enrolled: number; synced: number }>;
  total: number;
};

export type SectorwiseRow = {
  sectorId: string;
  sectorName: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  courseCount: number;
};

export type CoursewiseRow = {
  courseId: string;
  courseName: string;
  sectorName: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

export type CenterwiseRow = {
  centerId: string;
  centerName: string;
  district: string;
  state: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

export type ProgramwiseRow = {
  programId: string;
  programName: string;
  programCode: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

export type EnrollmentAnalyticsData = {
  availableFinancialYears: string[];
  availableDistricts: string[];
  availableSectors: Array<{ sectorId: string; sectorName: string }>;
  availablePrograms: Array<{ programId: string; programName: string }>;
  districtSummary: DistrictSummaryRow[];
  districtTrend: DistrictTrendRow[];
  sectorwise: SectorwiseRow[];
  coursewise: CoursewiseRow[];
  centerwise: CenterwiseRow[];
  programwise: ProgramwiseRow[];
  totalEnrolled: number;
  totalSynced: number;
  totalBatchSize: number;
  asOf: string;
};

function getBatchFinancialYear(date: Date): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 4) {
    const nextYearShort = String(year + 1).slice(2);
    return `${year}-${nextYearShort}`;
  }
  const prevYear = year - 1;
  const currYearShort = String(year).slice(2);
  return `${prevYear}-${currYearShort}`;
}

function getFinancialYearDates(fy: string): { start: Date; end: Date } {
  const [startYearStr] = fy.split("-");
  const startYear = parseInt(startYearStr, 10);
  return {
    start: new Date(Date.UTC(startYear, 3, 1)), // April 1
    end: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999)), // March 31
  };
}

function isSyntheticCenter(centerId: string): boolean {
  return centerId === "candidate_registration" || centerId.startsWith("candidate_center_");
}

export async function getDashboardEnrollmentAnalytics(
  actor: AuthSession,
  filters: EnrollmentAnalyticsFilters,
): Promise<EnrollmentAnalyticsData> {
  await connectToDatabase();

  const isPlatformAdmin = actor.user.roles.includes("platform_admin");
  if (!isPlatformAdmin) {
    if (actor.user.centerIds.length === 0) {
      throw new ApiError(403, "FORBIDDEN", "No training center scope");
    }
  }

  const baseBatchFilter: Record<string, unknown> = {
    status: { $ne: "cancelled" },
  };

  if (!isPlatformAdmin) {
    baseBatchFilter.centerId = { $in: actor.user.centerIds };
  }

  // Load all batches in scope for filter discovery + trend data
  const allBatches = await BatchModel.find(baseBatchFilter)
    .select({ batchId: 1, courseId: 1, centerId: 1, schemeId: 1, startDate: 1, batchSize: 1, status: 1 })
    .lean();

  // Build available financial years from batch start dates
  const fySet = new Set<string>();
  for (const batch of allBatches) {
    fySet.add(getBatchFinancialYear(new Date(batch.startDate)));
  }
  const availableFinancialYears = [...fySet].sort().reverse();

  // Load all referenced masters upfront
  const allCourseIds = [...new Set(allBatches.map((b) => b.courseId))];
  const allCenterIds = [
    ...new Set(allBatches.map((b) => b.centerId).filter((id) => !isSyntheticCenter(id))),
  ];

  const [allCourses, allCenters] = await Promise.all([
    allCourseIds.length > 0
      ? CourseModel.find({ courseId: { $in: allCourseIds } })
          .select({ courseId: 1, courseName: 1, sectorId: 1, programIds: 1 })
          .lean()
      : Promise.resolve([]),
    allCenterIds.length > 0
      ? TrainingCenterModel.find({ centerId: { $in: allCenterIds } })
          .select({ centerId: 1, centerName: 1, district: 1, state: 1, programIds: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const courseById = new Map(allCourses.map((c) => [c.courseId, c]));
  const centerById = new Map(allCenters.map((c) => [c.centerId, c]));

  const allSectorIds = [...new Set(allCourses.map((c) => c.sectorId))];
  const allProgramIds = [...new Set([...allCourses.flatMap((c) => c.programIds ?? [])])];

  const [allSectors, allPrograms] = await Promise.all([
    allSectorIds.length > 0
      ? SectorModel.find({ sectorId: { $in: allSectorIds } })
          .select({ sectorId: 1, name: 1, code: 1 })
          .lean()
      : Promise.resolve([]),
    allProgramIds.length > 0
      ? ProgramModel.find({ programId: { $in: allProgramIds } })
          .select({ programId: 1, name: 1, code: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const sectorById = new Map(allSectors.map((s) => [s.sectorId, s]));
  const programById = new Map(allPrograms.map((p) => [p.programId, p]));

  // Build available filter options
  const availableDistricts = [
    ...new Set(allCenters.map((c) => c.district).filter(Boolean)),
  ].sort();
  const availableSectors = allSectors
    .map((s) => ({ sectorId: s.sectorId, sectorName: s.name }))
    .sort((a, b) => a.sectorName.localeCompare(b.sectorName));
  const availablePrograms = allPrograms
    .map((p) => ({ programId: p.programId, programName: p.name }))
    .sort((a, b) => a.programName.localeCompare(b.programName));

  // Apply filters to get filtered batch set
  let filteredBatches = allBatches;

  // Financial year filter
  if (filters.financialYear && filters.financialYear !== "all") {
    const { start, end } = getFinancialYearDates(filters.financialYear);
    filteredBatches = filteredBatches.filter((b) => {
      const d = new Date(b.startDate);
      return d >= start && d <= end;
    });
  }

  // Center filter
  if (filters.centerId) {
    filteredBatches = filteredBatches.filter((b) => b.centerId === filters.centerId);
  }

  // Sector filter
  if (filters.sectorId) {
    const allowedCourseIds = new Set(
      allCourses.filter((c) => c.sectorId === filters.sectorId).map((c) => c.courseId),
    );
    filteredBatches = filteredBatches.filter((b) => allowedCourseIds.has(b.courseId));
  }

  // District filter
  if (filters.district) {
    const centersInDistrict = new Set(
      allCenters.filter((c) => c.district === filters.district).map((c) => c.centerId),
    );
    filteredBatches = filteredBatches.filter((b) => centersInDistrict.has(b.centerId));
  }

  // Program filter
  if (filters.programId) {
    const coursesInProgram = new Set(
      allCourses
        .filter((c) => (c.programIds ?? []).includes(filters.programId!))
        .map((c) => c.courseId),
    );
    filteredBatches = filteredBatches.filter((b) => coursesInProgram.has(b.courseId));
  }

  if (filteredBatches.length === 0) {
    return {
      availableFinancialYears,
      availableDistricts,
      availableSectors,
      availablePrograms,
      districtSummary: [],
      districtTrend: [],
      sectorwise: [],
      coursewise: [],
      centerwise: [],
      programwise: [],
      totalEnrolled: 0,
      totalSynced: 0,
      totalBatchSize: 0,
      asOf: new Date().toISOString(),
    };
  }

  // Load enrollment counts for filtered batches
  const filteredBatchIds = filteredBatches.map((b) => b.batchId);
  const enrollmentRows = await BatchCandidateModel.aggregate<{
    _id: string;
    enrolled: number;
    synced: number;
  }>([
    {
      $match: {
        batchId: { $in: filteredBatchIds },
        enrollmentStatus: { $ne: "cancelled" },
      },
    },
    {
      $group: {
        _id: "$batchId",
        enrolled: { $sum: 1 },
        synced: {
          $sum: { $cond: [{ $eq: ["$enrollmentStatus", "synced"] }, 1, 0] },
        },
      },
    },
  ]);

  const enrollmentByBatch = new Map(
    enrollmentRows.map((r) => [r._id, { enrolled: r.enrolled, synced: r.synced }]),
  );

  // For district trend: load enrollment for ALL batches (not just filtered FY)
  // to show multi-year trend (reuse enrollmentByBatch for filtered, compute trend separately)
  const allBatchIds = allBatches.map((b) => b.batchId);
  const trendEnrollmentRows = await BatchCandidateModel.aggregate<{
    _id: string;
    enrolled: number;
    synced: number;
  }>([
    {
      $match: {
        batchId: { $in: allBatchIds },
        enrollmentStatus: { $ne: "cancelled" },
      },
    },
    {
      $group: {
        _id: "$batchId",
        enrolled: { $sum: 1 },
        synced: {
          $sum: { $cond: [{ $eq: ["$enrollmentStatus", "synced"] }, 1, 0] },
        },
      },
    },
  ]);
  const trendEnrollmentByBatch = new Map(
    trendEnrollmentRows.map((r) => [r._id, { enrolled: r.enrolled, synced: r.synced }]),
  );

  // --- District Summary ---
  const districtMap = new Map<
    string,
    { enrolled: number; synced: number; batchSize: number; batches: number }
  >();
  for (const batch of filteredBatches) {
    const center = centerById.get(batch.centerId);
    const district = center?.district ?? "Unknown";
    const enrollment = enrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };
    const existing = districtMap.get(district) ?? { enrolled: 0, synced: 0, batchSize: 0, batches: 0 };
    districtMap.set(district, {
      enrolled: existing.enrolled + enrollment.enrolled,
      synced: existing.synced + enrollment.synced,
      batchSize: existing.batchSize + (batch.batchSize ?? 0),
      batches: existing.batches + 1,
    });
  }
  const districtSummary: DistrictSummaryRow[] = [...districtMap.entries()]
    .map(([district, stats]) => ({ district, ...stats }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // --- District Trend (all FYs, applying non-FY filters) ---
  const districtYearMap = new Map<string, Map<string, { enrolled: number; synced: number }>>();

  const trendBatches = filters.district || filters.sectorId || filters.programId || filters.centerId
    ? allBatches.filter((b) => {
        // Apply non-FY filters for trend
        if (filters.centerId && b.centerId !== filters.centerId) return false;
        if (filters.sectorId) {
          const course = courseById.get(b.courseId);
          if (!course || course.sectorId !== filters.sectorId) return false;
        }
        if (filters.district) {
          const center = centerById.get(b.centerId);
          if (!center || center.district !== filters.district) return false;
        }
        if (filters.programId) {
          const course = courseById.get(b.courseId);
          if (!(course?.programIds ?? []).includes(filters.programId!)) return false;
        }
        return true;
      })
    : allBatches;

  for (const batch of trendBatches) {
    const center = centerById.get(batch.centerId);
    const district = center?.district ?? "Unknown";
    const fy = getBatchFinancialYear(new Date(batch.startDate));
    const enrollment = trendEnrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };

    if (!districtYearMap.has(district)) {
      districtYearMap.set(district, new Map());
    }
    const yearMap = districtYearMap.get(district)!;
    const existing = yearMap.get(fy) ?? { enrolled: 0, synced: 0 };
    yearMap.set(fy, {
      enrolled: existing.enrolled + enrollment.enrolled,
      synced: existing.synced + enrollment.synced,
    });
  }

  const districtTrend: DistrictTrendRow[] = [...districtYearMap.entries()]
    .map(([district, yearMap]) => ({
      district,
      years: Object.fromEntries([...yearMap.entries()]),
      total: [...yearMap.values()].reduce((sum, v) => sum + v.enrolled, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // --- Sector-wise ---
  const sectorMap = new Map<
    string,
    { sectorName: string; enrolled: number; synced: number; batchSize: number; courseIds: Set<string> }
  >();
  for (const batch of filteredBatches) {
    const course = courseById.get(batch.courseId);
    if (!course) continue;
    const sector = sectorById.get(course.sectorId);
    const sectorId = course.sectorId;
    const sectorName = sector?.name ?? "Unknown Sector";
    const enrollment = enrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };
    const existing = sectorMap.get(sectorId) ?? {
      sectorName,
      enrolled: 0,
      synced: 0,
      batchSize: 0,
      courseIds: new Set<string>(),
    };
    existing.enrolled += enrollment.enrolled;
    existing.synced += enrollment.synced;
    existing.batchSize += batch.batchSize ?? 0;
    existing.courseIds.add(course.courseId);
    sectorMap.set(sectorId, existing);
  }
  const sectorwise: SectorwiseRow[] = [...sectorMap.entries()]
    .map(([sectorId, stats]) => ({
      sectorId,
      sectorName: stats.sectorName,
      enrolled: stats.enrolled,
      synced: stats.synced,
      batchSize: stats.batchSize,
      courseCount: stats.courseIds.size,
    }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // --- Course-wise ---
  const courseMap = new Map<
    string,
    { courseName: string; sectorName: string; enrolled: number; synced: number; batchSize: number; batches: number }
  >();
  for (const batch of filteredBatches) {
    const course = courseById.get(batch.courseId);
    if (!course) continue;
    const sector = sectorById.get(course.sectorId);
    const sectorName = sector?.name ?? "Unknown";
    const enrollment = enrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };
    const existing = courseMap.get(batch.courseId) ?? {
      courseName: course.courseName,
      sectorName,
      enrolled: 0,
      synced: 0,
      batchSize: 0,
      batches: 0,
    };
    existing.enrolled += enrollment.enrolled;
    existing.synced += enrollment.synced;
    existing.batchSize += batch.batchSize ?? 0;
    existing.batches += 1;
    courseMap.set(batch.courseId, existing);
  }
  const coursewise: CoursewiseRow[] = [...courseMap.entries()]
    .map(([courseId, stats]) => ({ courseId, ...stats }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // --- Center-wise ---
  const centerMap = new Map<
    string,
    { centerName: string; district: string; state: string; enrolled: number; synced: number; batchSize: number; batches: number }
  >();
  for (const batch of filteredBatches) {
    const center = centerById.get(batch.centerId);
    const centerName = center?.centerName ?? "Direct Registration";
    const district = center?.district ?? "—";
    const state = center?.state ?? "—";
    const enrollment = enrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };
    const existing = centerMap.get(batch.centerId) ?? {
      centerName,
      district,
      state,
      enrolled: 0,
      synced: 0,
      batchSize: 0,
      batches: 0,
    };
    existing.enrolled += enrollment.enrolled;
    existing.synced += enrollment.synced;
    existing.batchSize += batch.batchSize ?? 0;
    existing.batches += 1;
    centerMap.set(batch.centerId, existing);
  }
  const centerwise: CenterwiseRow[] = [...centerMap.entries()]
    .map(([centerId, stats]) => ({ centerId, ...stats }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // --- Program-wise (via course.programIds) ---
  const programMap = new Map<
    string,
    { programName: string; programCode: string; enrolled: number; synced: number; batchSize: number; batches: number }
  >();
  for (const batch of filteredBatches) {
    const course = courseById.get(batch.courseId);
    const programIds: string[] = course?.programIds ?? [];
    const enrollment = enrollmentByBatch.get(batch.batchId) ?? { enrolled: 0, synced: 0 };

    if (programIds.length === 0) {
      const existing = programMap.get("__unassigned__") ?? {
        programName: "Unassigned",
        programCode: "—",
        enrolled: 0,
        synced: 0,
        batchSize: 0,
        batches: 0,
      };
      existing.enrolled += enrollment.enrolled;
      existing.synced += enrollment.synced;
      existing.batchSize += batch.batchSize ?? 0;
      existing.batches += 1;
      programMap.set("__unassigned__", existing);
    } else {
      for (const pid of programIds) {
        const program = programById.get(pid);
        if (!program) continue;
        const existing = programMap.get(pid) ?? {
          programName: program.name,
          programCode: program.code,
          enrolled: 0,
          synced: 0,
          batchSize: 0,
          batches: 0,
        };
        existing.enrolled += enrollment.enrolled;
        existing.synced += enrollment.synced;
        existing.batchSize += batch.batchSize ?? 0;
        existing.batches += 1;
        programMap.set(pid, existing);
      }
    }
  }
  const programwise: ProgramwiseRow[] = [...programMap.entries()]
    .map(([programId, stats]) => ({ programId, ...stats }))
    .sort((a, b) => b.enrolled - a.enrolled);

  const totalEnrolled = filteredBatches.reduce(
    (sum, b) => sum + (enrollmentByBatch.get(b.batchId)?.enrolled ?? 0),
    0,
  );
  const totalSynced = filteredBatches.reduce(
    (sum, b) => sum + (enrollmentByBatch.get(b.batchId)?.synced ?? 0),
    0,
  );
  const totalBatchSize = filteredBatches.reduce((sum, b) => sum + (b.batchSize ?? 0), 0);

  return {
    availableFinancialYears,
    availableDistricts,
    availableSectors,
    availablePrograms,
    districtSummary,
    districtTrend,
    sectorwise,
    coursewise,
    centerwise,
    programwise,
    totalEnrolled,
    totalSynced,
    totalBatchSize,
    asOf: new Date().toISOString(),
  };
}
