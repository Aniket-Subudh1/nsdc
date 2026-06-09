"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconBuildingCommunity,
  IconCalendarEvent,
  IconCircleCheck,
  IconClipboardList,
  IconClock,
  IconFileUpload,
  IconRefresh,
  IconSchool,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import TrainingPartnerDashboardPanel from "@/components/management/training-partner-dashboard-panel";

type DashboardOverviewProps = {
  portal: "admin" | "training_partner";
};

type DashboardCenterOverview = {
  centers: Array<{
    centerId: string;
    centerName: string;
    centerCode: string;
    district: string;
    state: string;
    programCount: number;
    verifiedForSidh: boolean;
  }>;
  totals: {
    sectors: number;
    courses: number;
    batches: number;
  };
  preview: {
    sectors: Array<{
      sectorId: string;
      sectorName: string;
      sectorCode: string;
      courseCount: number;
      batchCount: number;
      enrolledLearners: number;
    }>;
    courses: Array<{
      courseId: string;
      courseName: string;
      sectorId: string;
      sectorName: string;
      batchCount: number;
      activeBatchCount: number;
      enrolledLearners: number;
    }>;
    batches: Array<{
      batchId: string;
      batchCode: string;
      batchName: string | null;
      courseName: string;
      sectorName: string;
      status: string;
      startDate: string;
      endDate: string;
      batchSize: number;
      enrolledCount: number;
      syncedEnrollmentCount: number;
    }>;
  };
};

type DashboardSummary = {
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
  batchStatus: Record<string, number>;
  learnerProgress: Record<string, number>;
  enrollmentStatus: Record<string, number>;
  topCenters: Array<{ centerId: string; centerName: string; learnerCount: number }>;
  centerOverview: DashboardCenterOverview | null;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
};

const portalContent = {
  admin: {
    subtitle: "Your overview of learners, batches, and training centers across the platform.",
    prefix: "/admin",
  },
  training_partner: {
    subtitle: "Summary counts and quick access to your center's sectors, courses, and batches.",
    prefix: "/training-partner",
  },
} as const;

const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Being prepared",
  ready: "Ready to start",
  active: "Currently running",
  completed: "Finished",
  cancelled: "Cancelled",
};

const BATCH_STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-400",
  ready: "bg-blue-400",
  active: "bg-emerald-500",
  completed: "bg-sky-600",
  cancelled: "bg-red-400",
};

const LEARNER_PROGRESS_LABELS: Record<string, string> = {
  ongoing: "Currently training",
  completed: "Training completed",
  dropout: "Dropped out",
  notStarted: "Not started yet",
};

const LEARNER_PROGRESS_COLORS: Record<string, string> = {
  ongoing: "bg-emerald-500",
  completed: "bg-sky-600",
  dropout: "bg-amber-400",
  notStarted: "bg-neutral-300",
};

const ENROLLMENT_LABELS: Record<string, string> = {
  synced: "Enrolled on portal",
  queued: "Waiting to enroll",
  processing: "Enrollment in progress",
  failed: "Enrollment failed",
  manual_review: "Needs review",
  not_enrolled: "Not enrolled yet",
};

const ENROLLMENT_COLORS: Record<string, string> = {
  synced: "bg-emerald-500",
  queued: "bg-blue-400",
  processing: "bg-sky-400",
  failed: "bg-red-400",
  manual_review: "bg-amber-400",
  not_enrolled: "bg-neutral-300",
};

const ACTIVITY_LABELS: Record<string, string> = {
  "auth.login.success": "Someone signed in",
  "auth.logout": "Someone signed out",
  "batch.created": "A new training batch was created",
  "batch.updated": "Training batch details were updated",
  "batch.candidates.added": "Learners were added to a batch",
  "batch.candidate.removed": "A learner was removed from a batch",
  "batch.sync.queued": "Batch sync to government portal was started",
  "batch.sync.succeeded": "Batch synced successfully to government portal",
  "batch.enrollment_sync.queued": "Learner enrollment sync was started",
  "attendance.import.staged": "An attendance file was uploaded",
  "attendance.import.committed": "Attendance records were saved",
  "candidate.created": "A new learner was registered",
  "candidate.updated": "Learner details were updated",
  "candidate.sync.queued": "Learner sync to government portal was started",
  "candidate.sync.succeeded": "Learner synced successfully",
  "candidate.import.committed": "Bulk learner import was completed",
  "masters.program.created": "A new program was added",
  "masters.scheme.created": "A new scheme was added",
  "masters.scheme.verified": "A scheme was verified",
};

function formatActivityLabel(action: string) {
  if (ACTIVITY_LABELS[action]) {
    return ACTIVITY_LABELS[action];
  }

  return action
    .replace(/\./g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatEntityType(entityType: string) {
  const labels: Record<string, string> = {
    batch: "Training batch",
    candidate: "Learner",
    program: "Program",
    scheme: "Scheme",
    course: "Course",
    user: "User account",
    training_center: "Training center",
  };

  return labels[entityType] ?? entityType.replace(/_/g, " ");
}

export default function DashboardOverview({ portal }: DashboardOverviewProps) {
  const router = useRouter();
  const content = portalContent[portal];
  const base = content.prefix;

  const [stats, setStats] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);

    try {
      const data = await apiFetch<DashboardSummary>("/api/v1/dashboard/summary");
      setStats(data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof ClientApiError ? fetchError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const batchChartItems = Object.entries(BATCH_STATUS_LABELS).map(([key, label]) => ({
    label,
    value: stats?.batchStatus[key] ?? 0,
    colorClass: BATCH_STATUS_COLORS[key] ?? "bg-neutral-400",
  }));

  const progressChartItems = Object.entries(LEARNER_PROGRESS_LABELS).map(([key, label]) => ({
    label,
    value: stats?.learnerProgress[key] ?? 0,
    colorClass: LEARNER_PROGRESS_COLORS[key] ?? "bg-neutral-400",
  }));

  const enrollmentChartItems = Object.entries(ENROLLMENT_LABELS)
    .map(([key, label]) => ({
      label,
      value: stats?.enrollmentStatus[key] ?? 0,
      colorClass: ENROLLMENT_COLORS[key] ?? "bg-neutral-400",
    }))
    .filter((item) => item.value > 0 || loading);

  const topCenterItems = (stats?.topCenters ?? []).map((center) => ({
    label: center.centerName,
    value: center.learnerCount,
    colorClass: "bg-sky-500",
  }));

  const centerOverview = stats?.centerOverview ?? null;
  const primaryCenter = centerOverview?.centers[0] ?? null;
  const isTrainingPartner = portal === "training_partner";

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Welcome back{stats?.userName ? `, ${stats.userName.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{content.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <IconRefresh className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <IconAlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total learners"
          value={loading ? null : stats?.totals.learners ?? 0}
          icon={<IconUsers className="h-5 w-5" />}
          onClick={() => router.push(`${base}/candidates`)}
        />
        <StatCard
          label="Active batches"
          value={loading ? null : stats?.totals.activeBatches ?? 0}
          icon={<IconSchool className="h-5 w-5" />}
          onClick={() => router.push(`${base}/batches`)}
        />
        <StatCard
          label={isTrainingPartner ? "Assigned programs" : "Training centers"}
          value={
            loading
              ? null
              : isTrainingPartner
                ? primaryCenter?.programCount ?? 0
                : stats?.totals.trainingCenters ?? 0
          }
          icon={<IconBuildingCommunity className="h-5 w-5" />}
          onClick={() => router.push(`${base}/${isTrainingPartner ? "master-data" : "training-centers"}`)}
        />
        <StatCard
          label="Enrolled in batches"
          value={loading ? null : stats?.totals.enrolledInBatches ?? 0}
          icon={<IconClipboardList className="h-5 w-5" />}
          onClick={() => router.push(`${base}/batches`)}
        />
      </div>

      {isTrainingPartner ? (
        <TrainingPartnerDashboardPanel basePath={base} centerOverview={centerOverview} loading={loading} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatusCard
          label="Currently training"
          value={loading ? null : stats?.highlights.currentlyTraining ?? 0}
          icon={<IconClock className="h-4 w-4 text-emerald-600" />}
          color="green"
        />
        <StatusCard
          label="Training completed"
          value={loading ? null : stats?.highlights.trainingCompleted ?? 0}
          icon={<IconCircleCheck className="h-4 w-4 text-sky-600" />}
          color="green"
        />
        <StatusCard
          label="Pending government sync"
          value={loading ? null : stats?.highlights.pendingGovernmentSync ?? 0}
          icon={<IconAlertCircle className="h-4 w-4 text-amber-600" />}
          color="amber"
          highlight={!!stats?.highlights.pendingGovernmentSync}
        />
        <StatusCard
          label="Assessments in next 30 days"
          value={loading ? null : stats?.highlights.upcomingAssessments ?? 0}
          icon={<IconCalendarEvent className="h-4 w-4 text-blue-600" />}
          color="blue"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Where are your batches?">
          <BarChart items={batchChartItems} loading={loading} emptyMessage="No batches in your scope yet." />
        </ChartPanel>
        <ChartPanel title="How are learners progressing?">
          <BarChart items={progressChartItems} loading={loading} emptyMessage="No learner progress data yet." />
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Batch enrollment on government portal">
          <BarChart
            items={enrollmentChartItems.length > 0 ? enrollmentChartItems : [{ label: "No enrollments yet", value: 0, colorClass: "bg-neutral-300" }]}
            loading={loading}
            emptyMessage="No enrollment activity yet."
          />
        </ChartPanel>
        {!isTrainingPartner ? (
          <ChartPanel title="Top centers by learners">
            {loading ? (
              <BarSkeleton rows={4} />
            ) : topCenterItems.length > 0 ? (
              <BarChart items={topCenterItems} loading={false} emptyMessage="" />
            ) : (
              <EmptyState message="Learner counts will appear once centers have registrations." />
            )}
          </ChartPanel>
        ) : (
          <ChartPanel title="Top sectors by enrollments">
            {loading ? (
              <BarSkeleton rows={4} />
            ) : (centerOverview?.preview.sectors.length ?? 0) > 0 ? (
              <BarChart
                items={(centerOverview?.preview.sectors ?? []).slice(0, 6).map((sector) => ({
                  label: sector.sectorName,
                  value: sector.enrolledLearners,
                  colorClass: "bg-sky-500",
                }))}
                loading={false}
                emptyMessage=""
                maxItems={6}
              />
            ) : (
              <EmptyState message="Sector breakdown appears once courses and batches are linked to your center." />
            )}
          </ChartPanel>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <QuickAction
            label="Register learner"
            icon={<IconUserPlus className="h-5 w-5" />}
            onClick={() => router.push(`${base}/candidates`)}
          />
          <QuickAction
            label="Manage batches"
            icon={<IconSchool className="h-5 w-5" />}
            onClick={() => router.push(`${base}/batches`)}
          />
          <QuickAction
            label="Upload attendance"
            icon={<IconFileUpload className="h-5 w-5" />}
            onClick={() => router.push(`${base}/batches`)}
          />
          {!isTrainingPartner ? (
            <QuickAction
              label="Training centers"
              icon={<IconBuildingCommunity className="h-5 w-5" />}
              onClick={() => router.push(`${base}/training-centers`)}
            />
          ) : (
            <QuickAction
              label="Course catalog"
              icon={<IconClipboardList className="h-5 w-5" />}
              onClick={() => router.push(`${base}/master-data`)}
            />
          )}
          <QuickAction
            label={isTrainingPartner ? "View learners" : "Course catalog"}
            icon={isTrainingPartner ? <IconUsers className="h-5 w-5" /> : <IconClipboardList className="h-5 w-5" />}
            onClick={() => router.push(`${base}/${isTrainingPartner ? "candidates" : "master-data"}`)}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent activity</h2>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-4 text-sm text-neutral-500">Loading recent updates...</div>
          ) : (stats?.recentActivity.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-neutral-500">
              Activity from registrations, batches, and attendance will show up here.
            </div>
          ) : (
            (isTrainingPartner ? stats?.recentActivity.slice(0, 4) : stats?.recentActivity)?.map((activity) => (
              <div
                key={activity.id}
                className="flex flex-col gap-1 border-b border-neutral-100 px-4 py-3 text-sm last:border-0 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-neutral-900">{formatActivityLabel(activity.action)}</p>
                  <p className="text-xs text-neutral-500">{formatEntityType(activity.entityType)}</p>
                </div>
                <span className="text-xs text-neutral-500">
                  {new Date(activity.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  onClick,
  highlight = false,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-3xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md sm:p-5",
        highlight ? "border-amber-300" : "border-slate-200"
      )}
    >
      <span className="text-neutral-400">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-neutral-900">
          {value === null ? (
            <span className="inline-block h-7 w-10 animate-pulse rounded bg-neutral-200" />
          ) : (
            value.toLocaleString()
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
      </div>
    </button>
  );
}

function StatusCard({
  label,
  value,
  icon,
  color,
  highlight = false,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  color: "amber" | "green" | "red" | "blue" | "neutral";
  highlight?: boolean;
}) {
  const styles: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    blue: "bg-blue-50 border-blue-200",
    neutral: "bg-neutral-50 border-neutral-200",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3",
        styles[color],
        highlight && "ring-1 ring-amber-300"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-800">
          {value === null ? (
            <span className="inline-block h-4 w-6 animate-pulse rounded bg-neutral-200" />
          ) : (
            value.toLocaleString()
          )}
        </p>
        <p className="text-xs leading-tight text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function QuickAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-4 text-sm font-semibold text-neutral-800">{title}</h3>
      {children}
    </div>
  );
}

function BarChart({
  items,
  loading,
  emptyMessage,
  maxItems,
}: {
  items: Array<{ label: string; value: number; colorClass: string; suffix?: string }>;
  loading: boolean;
  emptyMessage: string;
  maxItems?: number;
}) {
  if (loading) {
    return <BarSkeleton rows={4} />;
  }

  const visibleItems = maxItems ? items.filter((item) => item.value > 0).slice(0, maxItems) : items;
  const nonZeroItems = visibleItems.filter((item) => item.value > 0);
  if (nonZeroItems.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const max = Math.max(...visibleItems.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {visibleItems.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-neutral-600 sm:w-36">{item.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn("h-full rounded-full transition-all duration-500", item.colorClass)}
              style={{ width: `${Math.max(Math.round((item.value / max) * 100), item.value > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-neutral-700">
            {item.value.toLocaleString()}
            {item.suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
          <div className="h-4 flex-1 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-6 animate-pulse rounded bg-neutral-200" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-neutral-500">{message}</p>;
}
