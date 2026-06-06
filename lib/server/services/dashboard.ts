import { connectToDatabase } from "@/lib/server/mongodb";
import { AuditLogModel } from "@/lib/server/models/audit-log";
import { BatchCandidateModel } from "@/lib/server/models/batch-candidate";
import { BatchModel } from "@/lib/server/models/batch";
import { CandidateModel } from "@/lib/server/models/candidate";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { ApiError } from "@/lib/server/http";
import { type AuthSession } from "@/lib/server/services/session";

type CountMap = Record<string, number>;

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
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
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

export async function getDashboardSummary(actor: AuthSession): Promise<DashboardSummary> {
  await connectToDatabase();

  const scopedCenterFilter = resolveScopedCenterFilter(actor);
  const centerFilter = buildCenterFilter(scopedCenterFilter);

  const now = new Date();
  const assessmentWindowEnd = new Date(now);
  assessmentWindowEnd.setDate(assessmentWindowEnd.getDate() + 30);

  const scopedBatchIds = scopedCenterFilter
    ? (
        await BatchModel.find(centerFilter).select({ batchId: 1 })
      ).map((batch) => batch.batchId)
    : null;

  const batchCandidateFilter =
    scopedBatchIds === null
      ? { enrollmentStatus: { $ne: "cancelled" } }
      : { batchId: { $in: scopedBatchIds }, enrollmentStatus: { $ne: "cancelled" } };

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
  ] = await Promise.all([
    CandidateModel.countDocuments(centerFilter),
    BatchModel.countDocuments({ ...centerFilter, status: "active" }),
    TrainingCenterModel.countDocuments({ ...centerFilter, status: "active" }),
    BatchCandidateModel.countDocuments(batchCandidateFilter),
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
    countByField(BatchCandidateModel, batchCandidateFilter, "enrollmentStatus", [
      "synced",
      "queued",
      "processing",
      "failed",
      "manual_review",
      "not_enrolled",
    ]),
    CandidateModel.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(centerFilter).length > 0 ? [{ $match: centerFilter }] : []),
      { $group: { _id: "$centerId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    AuditLogModel.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .select({ auditLogId: 1, action: 1, entityType: 1, createdAt: 1 }),
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
    recentActivity: recentActivity.map((entry) => ({
      id: entry.auditLogId,
      action: entry.action,
      entityType: entry.entityType,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
