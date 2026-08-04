"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";

import { ClientApiError } from "@/lib/client/api";
import { swrKey, useApiSWR } from "@/lib/client/use-api-swr";
import { cn } from "@/lib/utils";

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

type DashboardTab = "overview" | "catalog" | "batches";
type CatalogKind = "sectors" | "courses";

type PagedSectionResponse<T> = {
  section: string;
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

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

const BATCH_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "ready", label: "Ready" },
  { value: "draft", label: "Draft" },
  { value: "completed", label: "Completed" },
] as const;

const PAGE_SIZE = 8;

export default function TrainingPartnerDashboardPanel({
  basePath,
  centerOverview,
  loading,
}: {
  basePath: string;
  centerOverview: DashboardCenterOverview | null;
  loading: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [catalogKind, setCatalogKind] = useState<CatalogKind>("sectors");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [batchSearch, setBatchSearch] = useState("");
  const [debouncedBatchSearch, setDebouncedBatchSearch] = useState("");
  const [batchStatus, setBatchStatus] = useState("all");
  const [batchPage, setBatchPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCatalogSearch(catalogSearch.trim()), catalogSearch ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBatchSearch(batchSearch.trim()), batchSearch ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [batchSearch]);

  const catalogKey =
    activeTab === "catalog"
      ? swrKey("/api/v1/dashboard/center-overview", {
          section: catalogKind,
          page: catalogPage,
          pageSize: PAGE_SIZE,
          search: debouncedCatalogSearch || undefined,
        })
      : null;
  const batchesKey =
    activeTab === "batches"
      ? swrKey("/api/v1/dashboard/center-overview", {
          section: "batches",
          page: batchPage,
          pageSize: PAGE_SIZE,
          search: debouncedBatchSearch || undefined,
          status: batchStatus !== "all" ? batchStatus : undefined,
        })
      : null;

  const {
    data: catalogData,
    error: catalogError,
    isLoading: catalogLoading,
    isValidating: catalogValidating,
  } = useApiSWR<
    PagedSectionResponse<
      | DashboardCenterOverview["preview"]["sectors"][number]
      | DashboardCenterOverview["preview"]["courses"][number]
    >
  >(catalogKey);
  const {
    data: batchesData,
    error: batchesError,
    isLoading: batchesLoading,
    isValidating: batchesValidating,
  } = useApiSWR<PagedSectionResponse<DashboardCenterOverview["preview"]["batches"][number]>>(batchesKey);

  const catalogItems = catalogData?.items ?? [];
  const batchItems = batchesData?.items ?? [];
  const catalogTotal = catalogData?.total ?? 0;
  const batchTotal = batchesData?.total ?? 0;
  const sectionLoading =
    (activeTab === "catalog" && catalogLoading && !catalogData) ||
    (activeTab === "batches" && batchesLoading && !batchesData) ||
    (activeTab === "catalog" && catalogValidating && Boolean(catalogData)) ||
    (activeTab === "batches" && batchesValidating && Boolean(batchesData));
  const sectionSwrError = catalogError ?? batchesError;
  const sectionError =
    sectionSwrError instanceof ClientApiError
      ? sectionSwrError.message
      : sectionSwrError
        ? "Unable to load dashboard data"
        : null;

  const primaryCenter = centerOverview?.centers[0] ?? null;
  const totals = centerOverview?.totals;

  const catalogTotalPages = Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE));
  const batchTotalPages = Math.max(1, Math.ceil(batchTotal / PAGE_SIZE));

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview", count: null },
        {
          id: "catalog" as const,
          label: "Sectors & courses",
          count: (totals?.sectors ?? 0) + (totals?.courses ?? 0),
        },
        { id: "batches" as const, label: "Batches", count: totals?.batches ?? 0 },
      ] satisfies Array<{ id: DashboardTab; label: string; count: number | null }>,
    [totals?.batches, totals?.courses, totals?.sectors],
  );

  return (
    <div className="space-y-4">
      {primaryCenter ? (
        <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-50 to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Your training center</p>
              <h2 className="mt-1 text-xl font-bold text-neutral-900">{primaryCenter.centerName}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {primaryCenter.district}, {primaryCenter.state} · Code {primaryCenter.centerCode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <MetricPill label="Sectors" value={totals?.sectors ?? 0} loading={loading} />
              <MetricPill label="Courses" value={totals?.courses ?? 0} loading={loading} />
              <MetricPill label="Batches" value={totals?.batches ?? 0} loading={loading} />
            </div>
          </div>
        </section>
      ) : null}

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
        <div className="grid gap-4 xl:grid-cols-3">
          <PreviewPanel
            title="Top sectors"
            total={totals?.sectors ?? 0}
            loading={loading}
            hasItems={(centerOverview?.preview.sectors.length ?? 0) > 0}
            emptyMessage="Sectors appear once courses are linked to your center."
            onViewAll={() => {
              setCatalogKind("sectors");
              setCatalogPage(1);
              setActiveTab("catalog");
            }}
          >
            {(centerOverview?.preview.sectors ?? []).map((sector) => (
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
            hasItems={(centerOverview?.preview.courses.length ?? 0) > 0}
            emptyMessage="Courses appear once linked to your center programs or batches."
            onViewAll={() => {
              setCatalogKind("courses");
              setCatalogPage(1);
              setActiveTab("catalog");
            }}
          >
            {(centerOverview?.preview.courses ?? []).map((course) => (
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
            hasItems={(centerOverview?.preview.batches.length ?? 0) > 0}
            emptyMessage="Create a batch to start enrolling learners."
            onViewAll={() => {
              setBatchPage(1);
              setActiveTab("batches");
            }}
            footerAction={{ label: "Manage all batches", onClick: () => router.push(`${basePath}/batches`) }}
          >
            {(centerOverview?.preview.batches ?? []).map((batch) => (
              <PreviewRow
                key={batch.batchId}
                title={batch.batchCode}
                subtitle={`${batch.courseName} · ${BATCH_STATUS_LABELS[batch.status] ?? batch.status}`}
                value={batch.enrolledCount}
                valueLabel={`of ${batch.batchSize}`}
              />
            ))}
          </PreviewPanel>
        </div>
      ) : null}

      {activeTab === "catalog" ? (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
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
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {sectionLoading ? (
              <LoadingRows rows={PAGE_SIZE} />
            ) : catalogItems.length === 0 ? (
              <EmptyPanel message={`No ${catalogKind} match your search.`} />
            ) : catalogKind === "sectors" ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {(catalogItems as DashboardCenterOverview["preview"]["sectors"]).map((sector) => (
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
                ))}
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {(catalogItems as DashboardCenterOverview["preview"]["courses"]).map((course) => (
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
            )}
          </div>

          <PaginationBar
            page={catalogPage}
            totalPages={catalogTotalPages}
            total={catalogTotal}
            onPageChange={setCatalogPage}
          />
        </section>
      ) : null}

      {activeTab === "batches" ? (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {BATCH_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setBatchStatus(filter.value);
                    setBatchPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    batchStatus === filter.value
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <SearchField
              value={batchSearch}
              onChange={(value) => {
                setBatchSearch(value);
                setBatchPage(1);
              }}
              placeholder="Search batch code or name..."
            />
          </div>

          <div className="max-h-[420px] overflow-auto">
            {sectionLoading ? (
              <LoadingRows rows={PAGE_SIZE} />
            ) : batchItems.length === 0 ? (
              <EmptyPanel message="No batches match your filters." />
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-100">
                    {["Batch", "Course", "Status", "Schedule", "Enrolled", "Synced"].map((heading) => (
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
            )}
          </div>

          <PaginationBar page={batchPage} totalPages={batchTotalPages} total={batchTotal} onPageChange={setBatchPage} />
        </section>
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
  children,
}: {
  title: string;
  total: number;
  loading: boolean;
  hasItems: boolean;
  emptyMessage: string;
  onViewAll: () => void;
  footerAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          <p className="text-xs text-neutral-500">{loading ? "Loading..." : `${total.toLocaleString()} total`}</p>
        </div>
        {total > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-sky-700 hover:text-sky-800"
          >
            View all
          </button>
        ) : null}
      </div>
      <div className="flex-1 space-y-2 p-4">
        {loading ? (
          <LoadingRows rows={4} compact />
        ) : !hasItems ? (
          <EmptyPanel message={emptyMessage} compact />
        ) : (
          children
        )}
      </div>
      {footerAction ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={footerAction.onClick}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
          >
            {footerAction.label}
            <IconExternalLink className="h-3.5 w-3.5" />
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
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
        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none ring-sky-200 transition focus:border-sky-300 focus:ring-2"
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

function LoadingRows({ rows, compact = false }: { rows: number; compact?: boolean }) {
  return (
    <div className={cn("space-y-2", compact ? "p-0" : "p-4")}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return <p className={cn("text-center text-sm text-neutral-500", compact ? "py-4" : "py-10")}>{message}</p>;
}
