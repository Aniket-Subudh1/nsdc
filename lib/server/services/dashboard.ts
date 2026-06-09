import { connectToDatabase } from "@/lib/server/mongodb";
import { AuditLogModel } from "@/lib/server/models/audit-log";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchModel } from "@/lib/server/models/batch";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CourseModel } from "@/lib/server/models/course";
import { SectorModel } from "@/lib/server/models/sector";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { ApiError } from "@/lib/server/http";
import { type AuthSession } from "@/lib/server/services/session";

type CountMap = Record<string, number>;

const PREVIEW_LIMIT = 5;
const MAX_PAGE_SIZE = 50;

export type DashboardCenterSummary = {
  centerId: string;
  centerName: string;
  centerCode: string;
  district: string;
  state: string;
  programCount: number;
  verifiedForSidh: boolean;
};

export type DashboardSectorSummary = {
  sectorId: string;
  sectorName: string;
  sectorCode: string;
  courseCount: number;
  batchCount: number;
  enrolledLearners: number;
};

export type DashboardCourseSummary = {
  courseId: string;
  courseName: string;
  sectorId: string;
  sectorName: string;
  batchCount: number;
  activeBatchCount: number;
  enrolledLearners: number;
};

export type DashboardBatchSummary = {
  batchId: string;
  batchCode: string;
  batchName: string | null;
  centerId: string;
  centerName: string;
  courseId: string;
  courseName: string;
  sectorName: string;
  status: string;
  startDate: string;
  endDate: string;
  batchSize: number;
  enrolledCount: number;
  syncedEnrollmentCount: number;
};

export type DashboardCenterOverview = {
  centers: DashboardCenterSummary[];
  totals: {
    sectors: number;
    courses: number;
    batches: number;
  };
  preview: {
    sectors: DashboardSectorSummary[];
    courses: DashboardCourseSummary[];
    batches: DashboardBatchSummary[];
  };
};

export type DashboardCenterSection = "sectors" | "courses" | "batches";

export type DashboardSummary = {
  userName: string;
  totals: {
    learners: number;
    activeBatches: number;
    trainingCenters: number;
    enrolledInBatches: number;
  };
  highlights: {
    currentlyTraining: number;
    trainingCompleted: number;
    pendingGovernmentSync: number;
    upcomingAssessments: number;
  };
  batchStatus: CountMap;
  learnerProgress: CountMap;
  enrollmentStatus: CountMap;
  topCenters: Array<{ centerId: string; centerName: string; learnerCount: number }>;
  centerOverview: DashboardCenterOverview | null;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
};

type CenterCatalogContext = {
  centerNameById: Map<string, string>;
  courseById: Map<string, { courseId: string; courseName: string; sectorId: string }>;
  sectorNameById: Map<string, string>;
  enrollmentByBatchId: Map<string, { enrolledCount: number; syncedEnrollmentCount: number }>;
  sectors: DashboardSectorSummary[];
  courses: DashboardCourseSummary[];
};

function resolveScopedCenterFilter(actor: AuthSession) {
  const isPlatformAdmin = actor.user.roles.includes("platform_admin");

  if (isPlatformAdmin) {
    return undefined;
  }

  if (actor.user.centerIds.length === 0) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to any training center scope");
  }

  return actor.user.centerIds;
}

function buildCenterFilter(scopedCenterFilter: string[] | string | undefined) {
  if (!scopedCenterFilter) {
    return {};
  }

  if (Array.isArray(scopedCenterFilter)) {
    return { centerId: { $in: scopedCenterFilter } };
  }

  return { centerId: scopedCenterFilter };
}

function createSearchRegex(search?: string) {
  if (!search?.trim()) {
    return undefined;
  }

  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function paginateList<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

function normalizePageSize(pageSize: number) {
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

async function countByField(
  model: { countDocuments: (filter: Record<string, unknown>) => Promise<number> },
  baseFilter: Record<string, unknown>,
  field: string,
  values: string[],
) {
  const entries = await Promise.all(
    values.map(async (value) => [value, await model.countDocuments({ ...baseFilter, [field]: value })] as const),
  );

  return Object.fromEntries(entries) as CountMap;
}

async function countBatchCandidatesForCenterFilter(centerFilter: Record<string, unknown>) {
  if (Object.keys(centerFilter).length === 0) {
    return BatchCandidateModel.countDocuments({ enrollmentStatus: { $ne: "cancelled" } });
  }

  const rows = await BatchCandidateModel.aggregate<{ total: number }>([
    {
      $match: {
        enrollmentStatus: { $ne: "cancelled" },
      },
    },
    {
      $lookup: {
        from: BatchModel.collection.name,
        localField: "batchId",
        foreignField: "batchId",
        as: "batch",
      },
    },
    { $unwind: "$batch" },
    { $match: centerFilter.centerId ? { "batch.centerId": centerFilter.centerId } : {} },
    { $count: "total" },
  ]);

  return rows[0]?.total ?? 0;
}

async function countEnrollmentStatusForCenterFilter(centerFilter: Record<string, unknown>) {
  if (Object.keys(centerFilter).length === 0) {
    return countByField(BatchCandidateModel, { enrollmentStatus: { $ne: "cancelled" } }, "enrollmentStatus", [
      "synced",
      "queued",
      "processing",
      "failed",
      "manual_review",
      "not_enrolled",
    ]);
  }

  const statuses = ["synced", "queued", "processing", "failed", "manual_review", "not_enrolled"] as const;
  const rows = await BatchCandidateModel.aggregate<{ _id: string; count: number }>([
    { $match: { enrollmentStatus: { $ne: "cancelled" } } },
    {
      $lookup: {
        from: BatchModel.collection.name,
        localField: "batchId",
        foreignField: "batchId",
        as: "batch",
      },
    },
    { $unwind: "$batch" },
    { $match: { "batch.centerId": centerFilter.centerId } },
    { $group: { _id: "$enrollmentStatus", count: { $sum: 1 } } },
  ]);

  const countByStatus = new Map(rows.map((row) => [row._id, row.count]));
  return Object.fromEntries(statuses.map((status) => [status, countByStatus.get(status) ?? 0])) as CountMap;
}

async function loadRecentActivity(
  scopedCenterFilter: string[] | undefined,
  centerFilter: Record<string, unknown>,
) {
  if (!scopedCenterFilter) {
    return AuditLogModel.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .select({ auditLogId: 1, action: 1, entityType: 1, createdAt: 1 });
  }

  const centerIds = scopedCenterFilter;
  const recentBatchIds = (
    await BatchModel.find(centerFilter).sort({ updatedAt: -1 }).limit(200).select({ batchId: 1 })
  ).map((batch) => batch.batchId);

  const orConditions: Array<Record<string, unknown>> = [
    { entityType: "training_center", entityId: { $in: centerIds } },
    { "metadata.centerId": { $in: centerIds } },
  ];

  if (recentBatchIds.length > 0) {
    orConditions.push(
      { entityType: "batch", entityId: { $in: recentBatchIds } },
      { "metadata.batchId": { $in: recentBatchIds } },
    );
  }

  const [directMatches, candidateMatches] = await Promise.all([
    AuditLogModel.find({ $or: orConditions })
      .sort({ createdAt: -1 })
      .limit(6)
      .select({ auditLogId: 1, action: 1, entityType: 1, createdAt: 1 }),
    AuditLogModel.aggregate<{ auditLogId: string; action: string; entityType: string; createdAt: Date }>([
      { $match: { entityType: "candidate" } },
      { $sort: { createdAt: -1 } },
      { $limit: 40 },
      {
        $lookup: {
          from: CandidateModel.collection.name,
          localField: "entityId",
          foreignField: "candidateId",
          as: "candidate",
        },
      },
      { $unwind: "$candidate" },
      { $match: { "candidate.centerId": { $in: centerIds } } },
      { $limit: 6 },
      { $project: { auditLogId: 1, action: 1, entityType: 1, createdAt: 1 } },
    ]),
  ]);

  const merged = [...directMatches, ...candidateMatches]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 6);

  const seen = new Set<string>();
  return merged.filter((entry) => {
    if (seen.has(entry.auditLogId)) {
      return false;
    }

    seen.add(entry.auditLogId);
    return true;
  });
}

async function loadCenterCatalogContext(centerFilter: Record<string, unknown>): Promise<CenterCatalogContext> {
  const [centers, batches] = await Promise.all([
    TrainingCenterModel.find(centerFilter).select({ centerId: 1, centerName: 1, programIds: 1 }),
    BatchModel.find(centerFilter).select({ batchId: 1, courseId: 1, status: 1 }),
  ]);

  const centerNameById = new Map(centers.map((center) => [center.centerId, center.centerName]));
  const centerProgramIds = [...new Set(centers.flatMap((center) => center.programIds ?? []))];
  const batchCourseIds = [...new Set(batches.map((batch) => batch.courseId))];

  const [programCourses, batchCourses, enrollmentRows] = await Promise.all([
    centerProgramIds.length > 0
      ? CourseModel.find({ programIds: { $in: centerProgramIds }, status: "active" }).select({
          courseId: 1,
          courseName: 1,
          sectorId: 1,
        })
      : Promise.resolve([]),
    batchCourseIds.length > 0
      ? CourseModel.find({ courseId: { $in: batchCourseIds } }).select({
          courseId: 1,
          courseName: 1,
          sectorId: 1,
        })
      : Promise.resolve([]),
    batches.length > 0
      ? BatchCandidateModel.aggregate<{
          _id: string;
          enrolledCount: number;
          syncedEnrollmentCount: number;
        }>([
          {
            $match: {
              batchId: { $in: batches.map((batch) => batch.batchId) },
              enrollmentStatus: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: "$batchId",
              enrolledCount: { $sum: 1 },
              syncedEnrollmentCount: {
                $sum: { $cond: [{ $eq: ["$enrollmentStatus", "synced"] }, 1, 0] },
              },
            },
          },
        ])
      : Promise.resolve([]),
  ]);

  const courseById = new Map<string, { courseId: string; courseName: string; sectorId: string }>();
  for (const course of [...programCourses, ...batchCourses]) {
    courseById.set(course.courseId, {
      courseId: course.courseId,
      courseName: course.courseName,
      sectorId: course.sectorId,
    });
  }

  const sectorIds = [...new Set([...courseById.values()].map((course) => course.sectorId))];
  const sectorDocs = sectorIds.length
    ? await SectorModel.find({ sectorId: { $in: sectorIds } }).select({ sectorId: 1, name: 1, code: 1 })
    : [];

  const sectorNameById = new Map(sectorDocs.map((sector) => [sector.sectorId, sector.name]));
  const enrollmentByBatchId = new Map(
    enrollmentRows.map((row) => [
      row._id,
      { enrolledCount: row.enrolledCount, syncedEnrollmentCount: row.syncedEnrollmentCount },
    ]),
  );

  const courseBatchStats = new Map<
    string,
    { batchCount: number; activeBatchCount: number; enrolledLearners: number }
  >();
  const sectorBatchStats = new Map<
    string,
    { courseIds: Set<string>; batchCount: number; enrolledLearners: number }
  >();

  for (const batch of batches) {
    const course = courseById.get(batch.courseId);
    const enrollment = enrollmentByBatchId.get(batch.batchId) ?? {
      enrolledCount: 0,
      syncedEnrollmentCount: 0,
    };

    const courseStats = courseBatchStats.get(batch.courseId) ?? {
      batchCount: 0,
      activeBatchCount: 0,
      enrolledLearners: 0,
    };
    courseStats.batchCount += 1;
    if (batch.status === "active") {
      courseStats.activeBatchCount += 1;
    }
    courseStats.enrolledLearners += enrollment.enrolledCount;
    courseBatchStats.set(batch.courseId, courseStats);

    if (course) {
      const sectorStats = sectorBatchStats.get(course.sectorId) ?? {
        courseIds: new Set<string>(),
        batchCount: 0,
        enrolledLearners: 0,
      };
      sectorStats.courseIds.add(course.courseId);
      sectorStats.batchCount += 1;
      sectorStats.enrolledLearners += enrollment.enrolledCount;
      sectorBatchStats.set(course.sectorId, sectorStats);
    }
  }

  const sectors = sectorDocs
    .map((sector) => {
      const stats = sectorBatchStats.get(sector.sectorId);
      const coursesInSector = [...courseById.values()].filter((course) => course.sectorId === sector.sectorId);

      return {
        sectorId: sector.sectorId,
        sectorName: sector.name,
        sectorCode: sector.code,
        courseCount: coursesInSector.length,
        batchCount: stats?.batchCount ?? 0,
        enrolledLearners: stats?.enrolledLearners ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.enrolledLearners - left.enrolledLearners || left.sectorName.localeCompare(right.sectorName),
    );

  const courses = [...courseById.values()]
    .map((course) => {
      const stats = courseBatchStats.get(course.courseId) ?? {
        batchCount: 0,
        activeBatchCount: 0,
        enrolledLearners: 0,
      };

      return {
        courseId: course.courseId,
        courseName: course.courseName,
        sectorId: course.sectorId,
        sectorName: sectorNameById.get(course.sectorId) ?? "Sector",
        batchCount: stats.batchCount,
        activeBatchCount: stats.activeBatchCount,
        enrolledLearners: stats.enrolledLearners,
      };
    })
    .sort(
      (left, right) =>
        right.enrolledLearners - left.enrolledLearners || left.courseName.localeCompare(right.courseName),
    );

  return {
    centerNameById,
    courseById,
    sectorNameById,
    enrollmentByBatchId,
    sectors,
    courses,
  };
}

async function buildCenterOverview(centerFilter: Record<string, unknown>): Promise<DashboardCenterOverview> {
  const [centers, context, batchTotal, previewBatches] = await Promise.all([
    TrainingCenterModel.find(centerFilter).select({
      centerId: 1,
      centerName: 1,
      centerCode: 1,
      district: 1,
      state: 1,
      programIds: 1,
      verifiedForSidh: 1,
    }),
    loadCenterCatalogContext(centerFilter),
    BatchModel.countDocuments(centerFilter),
    BatchModel.find(centerFilter)
      .sort({ startDate: -1 })
      .limit(PREVIEW_LIMIT)
      .select({
        batchId: 1,
        batchCode: 1,
        batchName: 1,
        centerId: 1,
        courseId: 1,
        status: 1,
        startDate: 1,
        endDate: 1,
        batchSize: 1,
      }),
  ]);

  const previewBatchSummaries = previewBatches.map((batch) => {
    const course = context.courseById.get(batch.courseId);
    const enrollment = context.enrollmentByBatchId.get(batch.batchId) ?? {
      enrolledCount: 0,
      syncedEnrollmentCount: 0,
    };

    return {
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      batchName: batch.batchName ?? null,
      centerId: batch.centerId,
      centerName: context.centerNameById.get(batch.centerId) ?? "Training center",
      courseId: batch.courseId,
      courseName: course?.courseName ?? "Course",
      sectorName: course ? (context.sectorNameById.get(course.sectorId) ?? "Sector") : "Sector",
      status: batch.status,
      startDate: batch.startDate.toISOString(),
      endDate: batch.endDate.toISOString(),
      batchSize: batch.batchSize,
      enrolledCount: enrollment.enrolledCount,
      syncedEnrollmentCount: enrollment.syncedEnrollmentCount,
    };
  });

  return {
    centers: centers.map((center) => ({
      centerId: center.centerId,
      centerName: center.centerName,
      centerCode: center.centerCode,
      district: center.district,
      state: center.state,
      programCount: center.programIds?.length ?? 0,
      verifiedForSidh: center.verifiedForSidh ?? false,
    })),
    totals: {
      sectors: context.sectors.length,
      courses: context.courses.length,
      batches: batchTotal,
    },
    preview: {
      sectors: context.sectors.slice(0, PREVIEW_LIMIT),
      courses: context.courses.slice(0, PREVIEW_LIMIT),
      batches: previewBatchSummaries,
    },
  };
}

async function listBatchSummaries(
  centerFilter: Record<string, unknown>,
  context: CenterCatalogContext,
  input: { page: number; pageSize: number; search?: string; status?: string },
) {
  const searchRegex = createSearchRegex(input.search);
  const batchFilter: Record<string, unknown> = { ...centerFilter };

  if (input.status && input.status !== "all") {
    batchFilter.status = input.status;
  }

  if (searchRegex) {
    batchFilter.$or = [{ batchCode: searchRegex }, { batchName: searchRegex }];
  }

  const pageSize = normalizePageSize(input.pageSize);
  const page = Math.max(input.page, 1);

  const [batches, total] = await Promise.all([
    BatchModel.find(batchFilter)
      .sort({ startDate: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({
        batchId: 1,
        batchCode: 1,
        batchName: 1,
        centerId: 1,
        courseId: 1,
        status: 1,
        startDate: 1,
        endDate: 1,
        batchSize: 1,
      }),
    BatchModel.countDocuments(batchFilter),
  ]);

  const batchIds = batches.map((batch) => batch.batchId);
  const enrollmentRows =
    batchIds.length > 0
      ? await BatchCandidateModel.aggregate<{
          _id: string;
          enrolledCount: number;
          syncedEnrollmentCount: number;
        }>([
          {
            $match: {
              batchId: { $in: batchIds },
              enrollmentStatus: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: "$batchId",
              enrolledCount: { $sum: 1 },
              syncedEnrollmentCount: {
                $sum: { $cond: [{ $eq: ["$enrollmentStatus", "synced"] }, 1, 0] },
              },
            },
          },
        ])
      : [];

  const enrollmentByBatchId = new Map(
    enrollmentRows.map((row) => [
      row._id,
      { enrolledCount: row.enrolledCount, syncedEnrollmentCount: row.syncedEnrollmentCount },
    ]),
  );

  const items = batches.map((batch) => {
    const course = context.courseById.get(batch.courseId);
    const enrollment = enrollmentByBatchId.get(batch.batchId) ?? {
      enrolledCount: 0,
      syncedEnrollmentCount: 0,
    };

    return {
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      batchName: batch.batchName ?? null,
      centerId: batch.centerId,
      centerName: context.centerNameById.get(batch.centerId) ?? "Training center",
      courseId: batch.courseId,
      courseName: course?.courseName ?? "Course",
      sectorName: course ? (context.sectorNameById.get(course.sectorId) ?? "Sector") : "Sector",
      status: batch.status,
      startDate: batch.startDate.toISOString(),
      endDate: batch.endDate.toISOString(),
      batchSize: batch.batchSize,
      enrolledCount: enrollment.enrolledCount,
      syncedEnrollmentCount: enrollment.syncedEnrollmentCount,
    };
  });

  return { items, total, page, pageSize };
}

export async function listDashboardCenterSection(
  actor: AuthSession,
  input: {
    section: DashboardCenterSection;
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  },
) {
  await connectToDatabase();

  const scopedCenterFilter = resolveScopedCenterFilter(actor);
  if (!scopedCenterFilter) {
    throw new ApiError(403, "FORBIDDEN", "Center overview is only available for training partner scope");
  }

  const centerFilter = buildCenterFilter(scopedCenterFilter);
  const pageSize = normalizePageSize(input.pageSize);
  const page = Math.max(input.page, 1);
  const search = input.search?.trim().toLowerCase();

  const context = await loadCenterCatalogContext(centerFilter);

  if (input.section === "sectors") {
    const filtered = search
      ? context.sectors.filter(
          (sector) =>
            sector.sectorName.toLowerCase().includes(search) || sector.sectorCode.toLowerCase().includes(search),
        )
      : context.sectors;

    return {
      section: input.section,
      ...paginateList(filtered, page, pageSize),
    };
  }

  if (input.section === "courses") {
    const filtered = search
      ? context.courses.filter(
          (course) =>
            course.courseName.toLowerCase().includes(search) || course.sectorName.toLowerCase().includes(search),
        )
      : context.courses;

    return {
      section: input.section,
      ...paginateList(filtered, page, pageSize),
    };
  }

  const batchPage = await listBatchSummaries(centerFilter, context, {
    page,
    pageSize,
    search: input.search,
    status: input.status,
  });

  return {
    section: input.section,
    ...batchPage,
  };
}

export async function getDashboardSummary(actor: AuthSession): Promise<DashboardSummary> {
  await connectToDatabase();

  const scopedCenterFilter = resolveScopedCenterFilter(actor);
  const centerFilter = buildCenterFilter(scopedCenterFilter);

  const now = new Date();
  const assessmentWindowEnd = new Date(now);
  assessmentWindowEnd.setDate(assessmentWindowEnd.getDate() + 30);

  const [
    learners,
    activeBatches,
    trainingCenters,
    enrolledInBatches,
    currentlyTraining,
    trainingCompleted,
    pendingGovernmentSync,
    upcomingAssessments,
    batchStatus,
    learnerProgress,
    enrollmentStatus,
    topCenterRows,
    recentActivity,
    centerOverview,
  ] = await Promise.all([
    CandidateModel.countDocuments(centerFilter),
    BatchModel.countDocuments({ ...centerFilter, status: "active" }),
    TrainingCenterModel.countDocuments({ ...centerFilter, status: "active" }),
    countBatchCandidatesForCenterFilter(centerFilter),
    CandidateModel.countDocuments({ ...centerFilter, trainingStatus: "ongoing" }),
    CandidateModel.countDocuments({ ...centerFilter, trainingStatus: "completed" }),
    CandidateModel.countDocuments({
      ...centerFilter,
      "syncState.status": { $in: ["queued", "processing", "failed", "manual_review"] },
    }),
    BatchModel.countDocuments({
      ...centerFilter,
      status: { $in: ["active", "ready"] },
      assessmentDate: { $gte: now, $lte: assessmentWindowEnd },
    }),
    countByField(BatchModel, centerFilter, "status", ["draft", "ready", "active", "completed", "cancelled"]),
    Promise.all([
      CandidateModel.countDocuments({ ...centerFilter, trainingStatus: "ongoing" }),
      CandidateModel.countDocuments({ ...centerFilter, trainingStatus: "completed" }),
      CandidateModel.countDocuments({ ...centerFilter, trainingStatus: "dropout" }),
      CandidateModel.countDocuments({
        ...centerFilter,
        $or: [{ trainingStatus: null }, { trainingStatus: { $exists: false } }, { trainingStatus: "" }],
      }),
    ]).then(([ongoing, completed, dropout, notStarted]) => ({
      ongoing,
      completed,
      dropout,
      notStarted,
    })),
    countEnrollmentStatusForCenterFilter(centerFilter),
    CandidateModel.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(centerFilter).length > 0 ? [{ $match: centerFilter }] : []),
      { $group: { _id: "$centerId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    loadRecentActivity(scopedCenterFilter, centerFilter),
    scopedCenterFilter ? buildCenterOverview(centerFilter) : Promise.resolve(null),
  ]);

  const centerNameById = new Map<string, string>();
  if (topCenterRows.length > 0) {
    const centers = await TrainingCenterModel.find({
      centerId: { $in: topCenterRows.map((row) => row._id) },
    }).select({ centerId: 1, centerName: 1 });

    for (const center of centers) {
      centerNameById.set(center.centerId, center.centerName);
    }
  }

  const topCenters = topCenterRows.map((row) => ({
    centerId: row._id,
    centerName: centerNameById.get(row._id) ?? "Training center",
    learnerCount: row.count,
  }));

  return {
    userName: actor.user.name,
    totals: {
      learners,
      activeBatches,
      trainingCenters,
      enrolledInBatches,
    },
    highlights: {
      currentlyTraining,
      trainingCompleted,
      pendingGovernmentSync,
      upcomingAssessments,
    },
    batchStatus,
    learnerProgress,
    enrollmentStatus,
    topCenters,
    centerOverview,
    recentActivity: recentActivity.map((entry) => ({
      id: entry.auditLogId,
      action: entry.action,
      entityType: entry.entityType,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
