"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconActivity,
  IconBuildingCommunity,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type DashboardPlatformOverview = {
  totals: {
    trainingCenters: number;
    sectors: number;
    courses: number;
    batches: number;
  };
  preview: {
    centers: Array<{
      centerId: string;
      centerName: string;
      centerCode: string;
      district: string;
      state: string;
      status: string;
      programCount: number;
      verifiedForSidh: boolean;
      learnerCount: number;
      ongoingLearners: number;
      completedLearners: number;
      pendingSyncLearners: number;
      batchCount: number;
      activeBatchCount: number;
      enrolledInBatches: number;
    }>;
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
      centerName: string;
      courseName: string;
      sectorName: string;
      status: string;
      startDate: string;
      endDate: string;
      batchSize: number;
      enrolledCount: number;
      syncedEnrollmentCount: number;
    }>;
    activity: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      createdAt: string;
    }>;
  };
};

type DashboardTab = "overview" | "centers" | "catalog" | "batches" | "activity";
type CatalogKind = "sectors" | "courses";

type PagedSectionResponse<T> = {
  section: string;
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 8;

const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Being prepared",
  ready: "Ready to start",
  active: "Currently running",
  completed: "Finished",
  cancelled: "Cancelled",
};

const BATCH_STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  ready: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-sky-100 text-sky-700",
  cancelled: "bg-red-100 text-red-700",
};

const ACTIVITY_LABELS: Record<string, string> = {
  "auth.login.success": "Someone signed in",
  "auth.logout": "Someone signed out",
  "batch.created": "A new training batch was created",
  "batch.updated": "Training batch details were updated",
  "batch.candidates.added": "Learners were added to a batch",
  "batch.candidate.removed": "A learner was removed from a batch",
  "candidate.created": "A new learner was registered",
  "candidate.updated": "Learner details were updated",
  "candidate.import.committed": "Bulk learner import was completed",
  "masters.program.created": "A new program was added",
  "masters.sector.created": "A new sector was added",
  "masters.scheme.created": "A new scheme was added",
  "masters.course.created": "A new course was added",
  "masters.training_center.created": "A training center was created",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  batch: "Training batch",
  candidate: "Learner",
  program: "Program",
  scheme: "Scheme",
  course: "Course",
  sector: "Sector",
  training_center: "Training center",
  user: "User account",
};

const BATCH_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "ready", label: "Ready" },
  { value: "draft", label: "Draft" },
  { value: "completed", label: "Completed" },
] as const;

const CENTER_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const ACTIVITY_TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "candidate", label: "Learners" },
  { value: "batch", label: "Batches" },
  { value: "training_center", label: "Centers" },
  { value: "course", label: "Courses" },
  { value: "user", label: "Users" },
] as const;

function formatActivityLabel(action: string) {
  return ACTIVITY_LABELS[action] ?? action.replace(/\./g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatEntityType(entityType: string) {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType.replace(/_/g, " ");
}

function formatCenterDisplayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith("candidate_center_") || trimmed === "candidate_registration") {
    return "Direct registration";
  }

  return trimmed;
}

function formatCenterSubtitle(center: DashboardPlatformOverview["preview"]["centers"][number]) {
  if (center.status === "direct" || center.centerCode === "—") {
    return "Learners registered without a linked training center profile";
  }

  return `${center.district}, ${center.state} · ${center.centerCode}`;
}

function formatCenterStatus(status: string) {
  if (status === "direct") {
    return "Direct registration";
  }

  return status.replace(/_/g, " ");
}

export default function AdminDashboardPanel({
  basePath,
  platformOverview,
  loading,
}: {
  basePath: string;
  platformOverview: DashboardPlatformOverview | null;
  loading: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [catalogKind, setCatalogKind] = useState<CatalogKind>("sectors");
  const [centerSearch, setCenterSearch] = useState("");
  const [centerStatus, setCenterStatus] = useState("all");
  const [centerPage, setCenterPage] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatus, setBatchStatus] = useState("all");
  const [batchPage, setBatchPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [activityPage, setActivityPage] = useState(1);
  const [centerItems, setCenterItems] = useState<DashboardPlatformOverview["preview"]["centers"]>([]);
  const [catalogItems, setCatalogItems] = useState<
    Array<DashboardPlatformOverview["preview"]["sectors"][number] | DashboardPlatformOverview["preview"]["courses"][number]>
  >([]);
  const [batchItems, setBatchItems] = useState<DashboardPlatformOverview["preview"]["batches"]>([]);
  const [activityItems, setActivityItems] = useState<DashboardPlatformOverview["preview"]["activity"]>([]);
  const [centerTotal, setCenterTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [activityTotal, setActivityTotal] = useState(0);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const totals = platformOverview?.totals;

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview", count: null },
        { id: "centers" as const, label: "Training centers", count: totals?.trainingCenters ?? 0 },
        { id: "catalog" as const, label: "Sectors & courses", count: (totals?.sectors ?? 0) + (totals?.courses ?? 0) },
        { id: "batches" as const, label: "Batches", count: totals?.batches ?? 0 },
        { id: "activity" as const, label: "Activity", count: null },
      ] satisfies Array<{ id: DashboardTab; label: string; count: number | null }>,
    [totals?.batches, totals?.courses, totals?.sectors, totals?.trainingCenters],
  );

  const loadSection = useCallback(
    async (section: string, params: URLSearchParams) => {
      setSectionLoading(true);

      try {
        const data = await apiFetch<PagedSectionResponse<unknown>>(
          `/api/v1/dashboard/platform-overview?${params.toString()}`,
        );

        if (section === "centers") {
          setCenterItems(data.items as DashboardPlatformOverview["preview"]["centers"]);
          setCenterTotal(data.total);
        } else if (section === "sectors" || section === "courses") {
          setCatalogItems(
            data.items as Array<
              | DashboardPlatformOverview["preview"]["sectors"][number]
              | DashboardPlatformOverview["preview"]["courses"][number]
            >,
          );
          setCatalogTotal(data.total);
        } else if (section === "batches") {
          setBatchItems(data.items as DashboardPlatformOverview["preview"]["batches"]);
          setBatchTotal(data.total);
        } else if (section === "activity") {
          setActivityItems(data.items as DashboardPlatformOverview["preview"]["activity"]);
          setActivityTotal(data.total);
        }

        setSectionError(null);
      } catch (fetchError) {
        setSectionError(fetchError instanceof ClientApiError ? fetchError.message : "Unable to load dashboard data");
      } finally {
        setSectionLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTab !== "centers") {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        section: "centers",
        page: String(centerPage),
        pageSize: String(PAGE_SIZE),
      });
      if (centerSearch.trim()) params.set("search", centerSearch.trim());
      if (centerStatus !== "all") params.set("status", centerStatus);
      void loadSection("centers", params);
    }, centerSearch ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, centerPage, centerSearch, centerStatus, loadSection]);

  useEffect(() => {
    if (activeTab !== "catalog") {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        section: catalogKind,
        page: String(catalogPage),
        pageSize: String(PAGE_SIZE),
      });
      if (catalogSearch.trim()) params.set("search", catalogSearch.trim());
      void loadSection(catalogKind, params);
    }, catalogSearch ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, catalogKind, catalogPage, catalogSearch, loadSection]);

  useEffect(() => {
    if (activeTab !== "batches") {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        section: "batches",
        page: String(batchPage),
        pageSize: String(PAGE_SIZE),
      });
      if (batchSearch.trim()) params.set("search", batchSearch.trim());
      if (batchStatus !== "all") params.set("status", batchStatus);
      void loadSection("batches", params);
    }, batchSearch ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, batchPage, batchSearch, batchStatus, loadSection]);

  useEffect(() => {
    if (activeTab !== "activity") {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        section: "activity",
        page: String(activityPage),
        pageSize: String(PAGE_SIZE),
      });
      if (activitySearch.trim()) params.set("search", activitySearch.trim());
      if (activityType !== "all") params.set("entityType", activityType);
      void loadSection("activity", params);
    }, activitySearch ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, activityPage, activitySearch, activityType, loadSection]);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-violet-200 bg-linear-to-br from-violet-50 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Platform monitor</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-900">All training centers at a glance</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Drill into centers, catalog, batches, and live activity across the full network.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Centers" value={totals?.trainingCenters ?? 0} loading={loading} />
            <MetricPill label="Sectors" value={totals?.sectors ?? 0} loading={loading} />
            <MetricPill label="Courses" value={totals?.courses ?? 0} loading={loading} />
            <MetricPill label="Batches" value={totals?.batches ?? 0} loading={loading} />
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {tab.label}
              {tab.count !== null && !loading ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    activeTab === tab.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {tab.count.toLocaleString()}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {sectionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sectionError}</div>
      ) : null}

      {activeTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          <PreviewPanel
            title="Top centers"
            total={totals?.trainingCenters ?? 0}
            loading={loading}
            hasItems={(platformOverview?.preview.centers.length ?? 0) > 0}
            emptyMessage="Centers will appear once training centers are registered."
            onViewAll={() => {
              setCenterPage(1);
              setActiveTab("centers");
            }}
          >
            {(platformOverview?.preview.centers ?? []).map((center) => (
              <PreviewRow
                key={center.centerId}
                title={formatCenterDisplayName(center.centerName)}
                subtitle={`${center.district}, ${center.state} · ${center.activeBatchCount} active batches`}
                value={center.learnerCount}
                valueLabel="learners"
              />
            ))}
          </PreviewPanel>

          <PreviewPanel
            title="Top sectors"
            total={totals?.sectors ?? 0}
            loading={loading}
            hasItems={(platformOverview?.preview.sectors.length ?? 0) > 0}
            emptyMessage="Sector stats appear once catalog and batches exist."
            onViewAll={() => {
              setCatalogKind("sectors");
              setCatalogPage(1);
              setActiveTab("catalog");
            }}
          >
            {(platformOverview?.preview.sectors ?? []).map((sector) => (
              <PreviewRow
                key={sector.sectorId}
                title={sector.sectorName}
                subtitle={`${sector.courseCount} courses · ${sector.batchCount} batches`}
                value={sector.enrolledLearners}
                valueLabel="enrolled"
              />
            ))}
          </PreviewPanel>

          <PreviewPanel
            title="Top courses"
            total={totals?.courses ?? 0}
            loading={loading}
            hasItems={(platformOverview?.preview.courses.length ?? 0) > 0}
            emptyMessage="Course stats appear once courses and batches are linked."
            onViewAll={() => {
              setCatalogKind("courses");
              setCatalogPage(1);
              setActiveTab("catalog");
            }}
          >
            {(platformOverview?.preview.courses ?? []).map((course) => (
              <PreviewRow
                key={course.courseId}
                title={course.courseName}
                subtitle={`${course.sectorName} · ${course.activeBatchCount} active`}
                value={course.enrolledLearners}
                valueLabel="enrolled"
              />
            ))}
          </PreviewPanel>

          <PreviewPanel
            title="Recent batches"
            total={totals?.batches ?? 0}
            loading={loading}
            hasItems={(platformOverview?.preview.batches.length ?? 0) > 0}
            emptyMessage="Batch activity will show up once batches are created."
            onViewAll={() => {
              setBatchPage(1);
              setActiveTab("batches");
            }}
            footerAction={{ label: "Open batch manager", onClick: () => router.push(`${basePath}/batches`) }}
          >
            {(platformOverview?.preview.batches ?? []).map((batch) => (
              <PreviewRow
                key={batch.batchId}
                title={batch.batchCode}
                subtitle={`${formatCenterDisplayName(batch.centerName)} · ${batch.courseName}`}
                value={batch.enrolledCount}
                valueLabel={`of ${batch.batchSize}`}
              />
            ))}
          </PreviewPanel>

          <PreviewPanel
            title="Latest activity"
            total={activityTotal || platformOverview?.preview.activity.length || 0}
            loading={loading}
            hasItems={(platformOverview?.preview.activity.length ?? 0) > 0}
            emptyMessage="Platform activity will stream in here."
            onViewAll={() => {
              setActivityPage(1);
              setActiveTab("activity");
            }}
            className="xl:col-span-2 2xl:col-span-1"
          >
            {(platformOverview?.preview.activity ?? []).map((activity) => (
              <div key={activity.id} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-medium text-neutral-900">{formatActivityLabel(activity.action)}</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>{formatEntityType(activity.entityType)}</span>
                  <span>
                    {new Date(activity.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </PreviewPanel>
        </div>
      ) : null}

      {activeTab === "centers" ? (
        <SectionShell
          filters={
            <>
              <FilterPills
                options={CENTER_STATUS_FILTERS}
                value={centerStatus}
                onChange={(value) => {
                  setCenterStatus(value);
                  setCenterPage(1);
                }}
              />
              <SearchField
                value={centerSearch}
                onChange={(value) => {
                  setCenterSearch(value);
                  setCenterPage(1);
                }}
                placeholder="Search centers..."
              />
            </>
          }
          loading={sectionLoading}
          emptyMessage="No training centers match your filters."
          isEmpty={!sectionLoading && centerItems.length === 0}
        >
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {centerItems.map((center) => (
              <CenterCard key={center.centerId} center={center} onOpen={() => router.push(`${basePath}/training-centers`)} />
            ))}
          </div>
          <PaginationBar
            page={centerPage}
            totalPages={Math.max(1, Math.ceil(centerTotal / PAGE_SIZE))}
            total={centerTotal}
            onPageChange={setCenterPage}
          />
        </SectionShell>
      ) : null}

      {activeTab === "catalog" ? (
        <SectionShell
          filters={
            <>
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {(["sectors", "courses"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setCatalogKind(kind);
                      setCatalogPage(1);
                    }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                      catalogKind === kind ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
                    )}
                  >
                    {kind}
                  </button>
                ))}
              </div>
              <SearchField
                value={catalogSearch}
                onChange={(value) => {
                  setCatalogSearch(value);
                  setCatalogPage(1);
                }}
                placeholder={catalogKind === "sectors" ? "Search sectors..." : "Search courses..."}
              />
            </>
          }
          loading={sectionLoading}
          emptyMessage={`No ${catalogKind} match your search.`}
          isEmpty={!sectionLoading && catalogItems.length === 0}
        >
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {catalogKind === "sectors"
              ? (catalogItems as DashboardPlatformOverview["preview"]["sectors"]).map((sector) => (
                  <CatalogCard
                    key={sector.sectorId}
                    title={sector.sectorName}
                    code={sector.sectorCode}
                    stats={[
                      { label: "Courses", value: sector.courseCount },
                      { label: "Batches", value: sector.batchCount },
                      { label: "Enrolled", value: sector.enrolledLearners },
                    ]}
                  />
                ))
              : (catalogItems as DashboardPlatformOverview["preview"]["courses"]).map((course) => (
                  <CatalogCard
                    key={course.courseId}
                    title={course.courseName}
                    code={course.sectorName}
                    stats={[
                      { label: "Batches", value: course.batchCount },
                      { label: "Active", value: course.activeBatchCount },
                      { label: "Enrolled", value: course.enrolledLearners },
                    ]}
                  />
                ))}
          </div>
          <PaginationBar
            page={catalogPage}
            totalPages={Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE))}
            total={catalogTotal}
            onPageChange={setCatalogPage}
          />
        </SectionShell>
      ) : null}

      {activeTab === "batches" ? (
        <SectionShell
          filters={
            <>
              <FilterPills
                options={BATCH_STATUS_FILTERS}
                value={batchStatus}
                onChange={(value) => {
                  setBatchStatus(value);
                  setBatchPage(1);
                }}
              />
              <SearchField
                value={batchSearch}
                onChange={(value) => {
                  setBatchSearch(value);
                  setBatchPage(1);
                }}
                placeholder="Search batch code or name..."
              />
            </>
          }
          loading={sectionLoading}
          emptyMessage="No batches match your filters."
          isEmpty={!sectionLoading && batchItems.length === 0}
        >
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                <tr className="border-b border-slate-100">
                  {["Batch", "Center", "Course", "Status", "Schedule", "Enrolled", "Synced"].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batchItems.map((batch) => (
                  <tr key={batch.batchId} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{batch.batchCode}</p>
                      {batch.batchName ? <p className="text-xs text-neutral-500">{batch.batchName}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{formatCenterDisplayName(batch.centerName)}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <p>{batch.courseName}</p>
                      <p className="text-xs text-neutral-500">{batch.sectorName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          BATCH_STATUS_BADGE[batch.status] ?? "bg-neutral-100 text-neutral-700",
                        )}
                      >
                        {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {new Date(batch.startDate).toLocaleDateString()} – {new Date(batch.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {batch.enrolledCount.toLocaleString()}/{batch.batchSize}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{batch.syncedEnrollmentCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={batchPage}
            totalPages={Math.max(1, Math.ceil(batchTotal / PAGE_SIZE))}
            total={batchTotal}
            onPageChange={setBatchPage}
          />
        </SectionShell>
      ) : null}

      {activeTab === "activity" ? (
        <SectionShell
          filters={
            <>
              <FilterPills
                options={ACTIVITY_TYPE_FILTERS}
                value={activityType}
                onChange={(value) => {
                  setActivityType(value);
                  setActivityPage(1);
                }}
              />
              <SearchField
                value={activitySearch}
                onChange={(value) => {
                  setActivitySearch(value);
                  setActivityPage(1);
                }}
                placeholder="Search activity..."
              />
            </>
          }
          loading={sectionLoading}
          emptyMessage="No activity matches your filters."
          isEmpty={!sectionLoading && activityItems.length === 0}
        >
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto">
            {activityItems.map((activity) => (
              <div key={activity.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{formatActivityLabel(activity.action)}</p>
                  <p className="text-xs text-neutral-500">{formatEntityType(activity.entityType)}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(activity.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
          <PaginationBar
            page={activityPage}
            totalPages={Math.max(1, Math.ceil(activityTotal / PAGE_SIZE))}
            total={activityTotal}
            onPageChange={setActivityPage}
          />
        </SectionShell>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 ring-1 ring-slate-200">
      {loading ? "…" : value.toLocaleString()} {label}
    </span>
  );
}

function PreviewPanel({
  title,
  total,
  loading,
  hasItems,
  emptyMessage,
  onViewAll,
  footerAction,
  className,
  children,
}: {
  title: string;
  total: number;
  loading: boolean;
  hasItems: boolean;
  emptyMessage: string;
  onViewAll: () => void;
  footerAction?: { label: string; onClick: () => void };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          <p className="text-xs text-neutral-500">{loading ? "Loading..." : `${total.toLocaleString()} total`}</p>
        </div>
        {total > 0 ? (
          <button type="button" onClick={onViewAll} className="text-xs font-medium text-violet-700 hover:text-violet-800">
            View all
          </button>
        ) : null}
      </div>
      <div className="flex-1 space-y-2 p-4">
        {loading ? (
          <LoadingRows rows={4} />
        ) : !hasItems ? (
          <EmptyPanel message={emptyMessage} />
        ) : (
          children
        )}
      </div>
      {footerAction ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={footerAction.onClick}
            className="text-xs font-medium text-violet-700 hover:text-violet-800"
          >
            {footerAction.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PreviewRow({
  title,
  subtitle,
  value,
  valueLabel,
}: {
  title: string;
  subtitle: string;
  value: number;
  valueLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900">{title}</p>
        <p className="truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-neutral-900">{value.toLocaleString()}</p>
        <p className="text-[10px] uppercase tracking-wide text-neutral-500">{valueLabel}</p>
      </div>
    </div>
  );
}

function CenterCard({
  center,
  onOpen,
}: {
  center: DashboardPlatformOverview["preview"]["centers"][number];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <IconBuildingCommunity className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{formatCenterDisplayName(center.centerName)}</p>
          <p className="truncate text-xs text-slate-500">{formatCenterSubtitle(center)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "Learners", value: center.learnerCount },
              { label: "Batches", value: center.batchCount },
              { label: "Enrolled", value: center.enrolledInBatches },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-slate-100">
                <p className="text-sm font-semibold text-slate-900">{stat.value.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200 capitalize">{formatCenterStatus(center.status)}</span>
            <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
              {center.ongoingLearners.toLocaleString()} training
            </span>
            {center.pendingSyncLearners > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200">
                {center.pendingSyncLearners.toLocaleString()} pending sync
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function CatalogCard({
  title,
  code,
  stats,
}: {
  title: string;
  code: string;
  stats: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <IconStack2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">{code}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-slate-100">
                <p className="text-sm font-semibold text-slate-900">{stat.value.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  filters,
  loading,
  emptyMessage,
  isEmpty,
  children,
}: {
  filters: React.ReactNode;
  loading: boolean;
  emptyMessage: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        {filters}
      </div>
      {loading ? (
        <LoadingRows rows={PAGE_SIZE} />
      ) : isEmpty ? (
        <EmptyPanel message={emptyMessage} />
      ) : (
        children
      )}
    </section>
  );
}

function FilterPills<T extends readonly { value: string; label: string }[]>({
  options,
  value,
  onChange,
}: {
  options: T;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === option.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none ring-violet-200 transition focus:border-violet-300 focus:ring-2"
      />
    </label>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1 && total === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalPages}</span>
        {" · "}
        <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> total
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function LoadingRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-neutral-500">
      <IconActivity className="h-4 w-4" />
      {message}
    </div>
  );
}
