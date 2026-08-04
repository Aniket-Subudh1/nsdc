"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconBuildingCommunity,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFilter,
  IconRefresh,
  IconSchool,
  IconStack2,
  IconUsers,
} from "@tabler/icons-react";

import { ClientApiError } from "@/lib/client/api";
import { swrKey, useApiSWR } from "@/lib/client/use-api-swr";
import { formatUserDate, formatUserDateTime } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type DistrictSummaryRow = {
  district: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

type DistrictTrendRow = {
  district: string;
  years: Record<string, { enrolled: number; synced: number }>;
  total: number;
};

type SectorwiseRow = {
  sectorId: string;
  sectorName: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  courseCount: number;
};

type CoursewiseRow = {
  courseId: string;
  courseName: string;
  sectorName: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

type CenterwiseRow = {
  centerId: string;
  centerName: string;
  district: string;
  state: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

type ProgramwiseRow = {
  programId: string;
  programName: string;
  programCode: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  batches: number;
};

type EnrollmentAnalyticsData = {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return formatUserDate(iso);
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 100) / 10}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-IN");
}

function truncateLabel(label: string, max = 14): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Bar height proportional to value vs max, with a 2px minimum when value > 0 */
function barHeight(value: number, max: number, plotHeight: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(Math.round((value / max) * plotHeight), 2);
}

const CHART = {
  plotHeight: 176,
  valueRowHeight: 18,
  columnSlotWidth: 76,
  groupedBarWidth: 14,
  groupedBarGap: 4,
  trendBarWidth: 12,
  trendBarGap: 3,
  trendColumnMinWidth: 64,
} as const;

const TABLE_PAGE_SIZE = 15;

function exportToCSV(data: EnrollmentAnalyticsData, financialYear: string) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fyLabel = financialYear === "all" ? "All Years" : `FY ${financialYear}`;
  const generatedOn = formatUserDateTime(new Date());

  const sections: string[] = [];

  sections.push(`Enrollment Analytics Report`);
  sections.push(`Generated on: ${generatedOn}`);
  sections.push(`Financial Year: ${fyLabel}`);
  sections.push(`Total Enrolled: ${data.totalEnrolled}`);
  sections.push(`Total Synced to SIDH: ${data.totalSynced}`);
  sections.push(``);

  // District Summary
  sections.push(`--- DISTRICT-WISE ENROLLMENT ---`);
  sections.push(`District,Enrolled,Synced to SIDH,Batch Capacity,Batches,Sync Rate`);
  for (const row of data.districtSummary) {
    sections.push(
      `${row.district},${row.enrolled},${row.synced},${row.batchSize},${row.batches},${pct(row.synced, row.enrolled)}`,
    );
  }
  sections.push(``);

  // District Trend
  if (data.districtTrend.length > 0) {
    const fys = data.availableFinancialYears;
    sections.push(`--- DISTRICT ENROLLMENT TREND (FINANCIAL YEAR-WISE) ---`);
    sections.push(`District,${fys.join(",")},Total`);
    for (const row of data.districtTrend) {
      const yearCols = fys.map((fy) => row.years[fy]?.enrolled ?? 0).join(",");
      sections.push(`${row.district},${yearCols},${row.total}`);
    }
    sections.push(``);
  }

  // Sector-wise
  sections.push(`--- SECTOR-WISE ENROLLMENT ---`);
  sections.push(`Sector,Enrolled,Synced to SIDH,Courses,Batch Capacity,Sync Rate`);
  for (const row of data.sectorwise) {
    sections.push(
      `${row.sectorName},${row.enrolled},${row.synced},${row.courseCount},${row.batchSize},${pct(row.synced, row.enrolled)}`,
    );
  }
  sections.push(``);

  // Course-wise
  sections.push(`--- COURSE-WISE ENROLLMENT ---`);
  sections.push(`Course,Sector,Enrolled,Synced to SIDH,Batches,Batch Capacity,Sync Rate`);
  for (const row of data.coursewise) {
    sections.push(
      `"${row.courseName}",${row.sectorName},${row.enrolled},${row.synced},${row.batches},${row.batchSize},${pct(row.synced, row.enrolled)}`,
    );
  }
  sections.push(``);

  // Program-wise
  sections.push(`--- PROGRAM-WISE ENROLLMENT ---`);
  sections.push(`Program,Code,Enrolled,Synced to SIDH,Batches,Batch Capacity,Sync Rate`);
  for (const row of data.programwise) {
    sections.push(
      `"${row.programName}",${row.programCode},${row.enrolled},${row.synced},${row.batches},${row.batchSize},${pct(row.synced, row.enrolled)}`,
    );
  }
  sections.push(``);

  // Center-wise
  sections.push(`--- TRAINING CENTER-WISE ENROLLMENT ---`);
  sections.push(`Center,District,State,Enrolled,Synced to SIDH,Batches,Batch Capacity,Sync Rate`);
  for (const row of data.centerwise) {
    sections.push(
      `"${row.centerName}",${row.district},${row.state},${row.enrolled},${row.synced},${row.batches},${row.batchSize},${pct(row.synced, row.enrolled)}`,
    );
  }

  const csvContent = sections.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `enrollment_analytics_${financialYear === "all" ? "all_years" : financialYear}_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnrollmentAnalyticsPanel() {
  const [financialYear, setFinancialYear] = useState("all");
  const [district, setDistrict] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [programId, setProgramId] = useState("");
  const [centerId, setCenterId] = useState("");

  const [activeSection, setActiveSection] = useState<"district" | "sector" | "course" | "program" | "center">(
    "district",
  );

  const analyticsKey = swrKey("/api/v1/dashboard/enrollment-analytics", {
    financialYear,
    district: district || undefined,
    sectorId: sectorId || undefined,
    programId: programId || undefined,
    centerId: centerId || undefined,
  });

  const {
    data: swrData,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useApiSWR<EnrollmentAnalyticsData>(analyticsKey);
  const data = swrData ?? null;

  const loading = isLoading && !data;
  const error =
    swrError instanceof ClientApiError
      ? swrError.message
      : swrError
        ? "Failed to load analytics"
        : null;

  async function fetchData() {
    await mutate();
  }

  const fyLabel = financialYear === "all" ? "All Financial Years" : `FY ${financialYear}`;
  const hasFilters = financialYear !== "all" || !!district || !!sectorId || !!programId || !!centerId;
  const filterKey = `${financialYear}|${district}|${sectorId}|${programId}|${centerId}`;

  const sections = [
    { id: "district" as const, label: "District", icon: <IconBuildingCommunity className="h-4 w-4" /> },
    { id: "sector" as const, label: "Sector", icon: <IconStack2 className="h-4 w-4" /> },
    { id: "course" as const, label: "Course", icon: <IconSchool className="h-4 w-4" /> },
    { id: "program" as const, label: "Program", icon: <IconChartBar className="h-4 w-4" /> },
    { id: "center" as const, label: "Training Center", icon: <IconBuildingCommunity className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-50 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Enrollment Analytics</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-900">Enrollment insights across all dimensions</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Drill into enrollment by district, sector, course, program, and training center. Use filters to slice by
              financial year or location.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs text-neutral-500 ring-1 ring-slate-200">
                As of {formatUserDateTime(data.asOf)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading || isValidating}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <IconRefresh className={cn("h-3.5 w-3.5", (loading || isValidating) && "animate-spin")} />
              Refresh
            </button>
            {data && data.totalEnrolled > 0 ? (
              <button
                type="button"
                onClick={() => exportToCSV(data, financialYear)}
                className="flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700"
              >
                <IconDownload className="h-3.5 w-3.5" />
                Export CSV
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <FilterBar
        data={data}
        financialYear={financialYear}
        district={district}
        sectorId={sectorId}
        programId={programId}
        onFinancialYearChange={(v) => setFinancialYear(v)}
        onDistrictChange={(v) => setDistrict(v)}
        onSectorChange={(v) => setSectorId(v)}
        onProgramChange={(v) => setProgramId(v)}
        onClearAll={() => {
          setFinancialYear("all");
          setDistrict("");
          setSectorId("");
          setProgramId("");
          setCenterId("");
        }}
        hasFilters={hasFilters}
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Total enrolled"
          value={loading ? null : data?.totalEnrolled ?? 0}
          sub={fyLabel}
          color="sky"
          icon={<IconUsers className="h-5 w-5" />}
        />
        <SummaryCard
          label="Synced to SIDH"
          value={loading ? null : data?.totalSynced ?? 0}
          sub={loading || !data ? "" : pct(data.totalSynced, data.totalEnrolled) + " sync rate"}
          color="emerald"
          icon={<IconChartBar className="h-5 w-5" />}
        />
        <SummaryCard
          label="Batch capacity"
          value={loading ? null : data?.totalBatchSize ?? 0}
          sub={
            loading || !data
              ? ""
              : `${pct(data.totalEnrolled, data.totalBatchSize)} fill rate`
          }
          color="violet"
          icon={<IconSchool className="h-5 w-5" />}
        />
        <SummaryCard
          label="Remaining seats"
          value={loading ? null : Math.max(0, (data?.totalBatchSize ?? 0) - (data?.totalEnrolled ?? 0))}
          sub="Available capacity"
          color="amber"
          icon={<IconBuildingCommunity className="h-5 w-5" />}
        />
      </div>

      {/* Section Tabs */}
      <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <div className="flex gap-1 overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                activeSection === section.id
                  ? "bg-sky-600 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section Content */}
      {activeSection === "district" ? (
        <DistrictSection data={data} loading={loading} financialYear={financialYear} filterKey={filterKey} />
      ) : null}
      {activeSection === "sector" ? <SectorSection data={data} loading={loading} filterKey={filterKey} /> : null}
      {activeSection === "course" ? <CourseSection data={data} loading={loading} filterKey={filterKey} /> : null}
      {activeSection === "program" ? <ProgramSection data={data} loading={loading} filterKey={filterKey} /> : null}
      {activeSection === "center" ? <CenterSection data={data} loading={loading} filterKey={filterKey} /> : null}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  data,
  financialYear,
  district,
  sectorId,
  programId,
  onFinancialYearChange,
  onDistrictChange,
  onSectorChange,
  onProgramChange,
  onClearAll,
  hasFilters,
}: {
  data: EnrollmentAnalyticsData | null;
  financialYear: string;
  district: string;
  sectorId: string;
  programId: string;
  onFinancialYearChange: (v: string) => void;
  onDistrictChange: (v: string) => void;
  onSectorChange: (v: string) => void;
  onProgramChange: (v: string) => void;
  onClearAll: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <IconFilter className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filters</span>
        {hasFilters ? (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterSelect
          label="Financial Year"
          value={financialYear}
          onChange={onFinancialYearChange}
          options={[
            { value: "all", label: "All financial years" },
            ...(data?.availableFinancialYears ?? []).map((fy) => ({
              value: fy,
              label: `FY ${fy}`,
            })),
          ]}
        />
        <FilterSelect
          label="District"
          value={district}
          onChange={onDistrictChange}
          options={[
            { value: "", label: "All districts" },
            ...(data?.availableDistricts ?? []).map((d) => ({ value: d, label: d })),
          ]}
        />
        <FilterSelect
          label="Sector"
          value={sectorId}
          onChange={onSectorChange}
          options={[
            { value: "", label: "All sectors" },
            ...(data?.availableSectors ?? []).map((s) => ({
              value: s.sectorId,
              label: s.sectorName,
            })),
          ]}
        />
        <FilterSelect
          label="Program"
          value={programId}
          onChange={onProgramChange}
          options={[
            { value: "", label: "All programs" },
            ...(data?.availablePrograms ?? []).map((p) => ({
              value: p.programId,
              label: p.programName,
            })),
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-sky-200 transition focus:border-sky-300 focus:ring-2"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: number | null;
  sub: string;
  color: "sky" | "emerald" | "violet" | "amber";
  icon: React.ReactNode;
}) {
  const colorMap = {
    sky: "bg-sky-50 border-sky-200 text-sky-600",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
    violet: "bg-violet-50 border-violet-200 text-violet-600",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
  };

  return (
    <div className={cn("rounded-2xl border p-4", colorMap[color])}>
      <div className="mb-2 flex items-center justify-between">
        <span className="opacity-70">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-neutral-900">
        {value === null ? (
          <span className="inline-block h-7 w-12 animate-pulse rounded bg-neutral-200" />
        ) : (
          value.toLocaleString("en-IN")
        )}
      </p>
      <p className="mt-0.5 text-xs font-medium text-neutral-600">{label}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p> : null}
    </div>
  );
}

// ─── Dual-metric Bar Row ──────────────────────────────────────────────────────

function DualBarRow({
  label,
  enrolled,
  synced,
  batchSize,
  maxEnrolled,
}: {
  label: string;
  enrolled: number;
  synced: number;
  batchSize: number;
  maxEnrolled: number;
}) {
  const enrolledWidth = maxEnrolled > 0 ? Math.round((enrolled / maxEnrolled) * 100) : 0;
  const syncedWidth = maxEnrolled > 0 ? Math.round((synced / maxEnrolled) * 100) : 0;
  const capacityDenominator = batchSize > 0 ? batchSize : enrolled;

  return (
    <div className="rounded-xl border border-transparent p-3 transition hover:border-slate-100 hover:bg-slate-50/80">
      <div className="mb-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-800" title={label}>
          {label}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
          <span>
            <span className="font-semibold text-sky-600">{enrolled.toLocaleString("en-IN")}</span>
            <span className="ml-0.5 text-neutral-400">enrolled</span>
          </span>
          <span>
            <span className="font-semibold text-emerald-600">{synced.toLocaleString("en-IN")}</span>
            <span className="ml-0.5 text-neutral-400">synced</span>
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <HorizontalMetricBar
          legend="Enrolled"
          value={enrolled}
          widthPct={enrolledWidth}
          fillClass="bg-sky-500"
          suffix={pct(enrolled, capacityDenominator)}
        />
        <HorizontalMetricBar
          legend="Synced"
          value={synced}
          widthPct={syncedWidth}
          fillClass="bg-emerald-500"
          suffix={pct(synced, enrolled)}
        />
      </div>
    </div>
  );
}

function HorizontalMetricBar({
  legend,
  value,
  widthPct,
  fillClass,
  suffix,
}: {
  legend: string;
  value: number;
  widthPct: number;
  fillClass: string;
  suffix: string;
}) {
  const displayWidth = value > 0 ? Math.max(widthPct, 2) : 0;

  return (
    <div className="grid grid-cols-[52px_1fr_40px] items-center gap-2">
      <span className="text-right text-[10px] font-medium text-neutral-500">{legend}</span>
      <div className="h-3.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", fillClass)}
          style={{ width: `${displayWidth}%` }}
        />
      </div>
      <span className="text-right text-[10px] font-medium tabular-nums text-neutral-500">{suffix}</span>
    </div>
  );
}

// ─── Column Bar Chart (grouped, grid-aligned) ─────────────────────────────────

function ColumnBarChart({
  bars,
  colorClass = "bg-sky-500",
  secondaryColorClass = "bg-emerald-400",
  showSecondary = true,
}: {
  bars: Array<{ label: string; primary: number; secondary?: number }>;
  colorClass?: string;
  secondaryColorClass?: string;
  showSecondary?: boolean;
}) {
  const visibleBars = bars.slice(0, 12);
  const maxVal = Math.max(...visibleBars.map((b) => Math.max(b.primary, b.secondary ?? 0)), 1);
  const chartWidth = visibleBars.length * CHART.columnSlotWidth;

  return (
    <div className="w-full">
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full" style={{ minWidth: `${chartWidth}px` }}>
          <div className="flex items-end">
            {visibleBars.map((bar, idx) => {
              const primaryH = barHeight(bar.primary, maxVal, CHART.plotHeight);
              const secondaryH =
                showSecondary && bar.secondary !== undefined
                  ? barHeight(bar.secondary, maxVal, CHART.plotHeight)
                  : 0;

              return (
                <div
                  key={`${bar.label}-${idx}`}
                  className="flex shrink-0 flex-col items-center"
                  style={{ width: `${CHART.columnSlotWidth}px` }}
                >
                  {/* Value labels — fixed row, no hover overlap */}
                  <div
                    className="flex w-full items-end justify-center gap-1 px-0.5"
                    style={{ height: `${CHART.valueRowHeight}px` }}
                  >
                    {bar.primary > 0 ? (
                      <span className="text-[9px] font-semibold leading-none text-sky-700">
                        {formatCompact(bar.primary)}
                      </span>
                    ) : (
                      <span className="text-[9px] leading-none text-transparent">0</span>
                    )}
                    {showSecondary && bar.secondary !== undefined && bar.secondary > 0 ? (
                      <span className="text-[9px] font-semibold leading-none text-emerald-700">
                        {formatCompact(bar.secondary)}
                      </span>
                    ) : null}
                  </div>

                  {/* Plot area — shared baseline */}
                  <div
                    className="flex w-full items-end justify-center border-b border-slate-200 bg-slate-50/40"
                    style={{ height: `${CHART.plotHeight}px`, gap: `${CHART.groupedBarGap}px` }}
                  >
                    <div
                      className={cn("shrink-0 rounded-t-sm", colorClass)}
                      style={{
                        width: `${CHART.groupedBarWidth}px`,
                        height: `${primaryH}px`,
                      }}
                      title={`${bar.label} — Enrolled: ${bar.primary.toLocaleString("en-IN")}`}
                    />
                    {showSecondary && bar.secondary !== undefined ? (
                      <div
                        className={cn("shrink-0 rounded-t-sm", secondaryColorClass)}
                        style={{
                          width: `${CHART.groupedBarWidth}px`,
                          height: `${secondaryH}px`,
                        }}
                        title={`${bar.label} — Synced: ${bar.secondary.toLocaleString("en-IN")}`}
                      />
                    ) : null}
                  </div>

                  {/* X-axis label — same width as column slot */}
                  <div className="mt-2 w-full px-1">
                    <p
                      className="mx-auto max-w-[68px] text-center text-[10px] leading-tight text-neutral-500"
                      title={bar.label}
                    >
                      {truncateLabel(bar.label, 16)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          <div className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", colorClass)} />
          <span className="text-[10px] text-neutral-600">Enrolled</span>
        </div>
        {showSecondary ? (
          <div className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", secondaryColorClass)} />
            <span className="text-[10px] text-neutral-600">Synced to SIDH</span>
          </div>
        ) : null}
        <span className="text-[10px] text-neutral-400">Max scale: {formatCompact(maxVal)}</span>
      </div>
    </div>
  );
}

// ─── Multi-Year Trend Chart (grouped, aligned columns) ────────────────────────

function TrendBarChart({
  rows,
  financialYears,
}: {
  rows: DistrictTrendRow[];
  financialYears: string[];
}) {
  const fyColors = [
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-teal-500",
  ];
  const visibleRows = rows.slice(0, 10);
  const maxVal = Math.max(
    ...visibleRows.flatMap((r) => financialYears.map((fy) => r.years[fy]?.enrolled ?? 0)),
    1,
  );

  const groupInnerWidth =
    financialYears.length * CHART.trendBarWidth + Math.max(0, financialYears.length - 1) * CHART.trendBarGap;
  const columnWidth = Math.max(CHART.trendColumnMinWidth, groupInnerWidth + 16);

  return (
    <div className="w-full">
      <div className="overflow-x-auto pb-1">
        <div className="inline-block" style={{ minWidth: `${visibleRows.length * columnWidth}px` }}>
          <div className="flex items-end">
            {visibleRows.map((row) => (
              <div
                key={row.district}
                className="flex shrink-0 flex-col items-center"
                style={{ width: `${columnWidth}px` }}
              >
                {/* FY value row — show top FY value only if single year selected feel cluttered; show max in group */}
                <div
                  className="flex w-full items-end justify-center px-1"
                  style={{ height: `${CHART.valueRowHeight}px` }}
                >
                  {row.total > 0 ? (
                    <span className="text-[9px] font-semibold leading-none text-neutral-600">
                      {formatCompact(row.total)}
                    </span>
                  ) : (
                    <span className="text-[9px] leading-none text-transparent">0</span>
                  )}
                </div>

                {/* Grouped FY bars */}
                <div
                  className="flex w-full items-end justify-center border-b border-slate-200 bg-slate-50/40"
                  style={{ height: `${CHART.plotHeight}px`, gap: `${CHART.trendBarGap}px` }}
                >
                  {financialYears.map((fy, fyIdx) => {
                    const val = row.years[fy]?.enrolled ?? 0;
                    const h = barHeight(val, maxVal, CHART.plotHeight);

                    return (
                      <div
                        key={fy}
                        className={cn("shrink-0 rounded-t-sm", fyColors[fyIdx % fyColors.length])}
                        style={{
                          width: `${CHART.trendBarWidth}px`,
                          height: `${h}px`,
                        }}
                        title={`${row.district} · FY ${fy}: ${val.toLocaleString("en-IN")} enrolled`}
                      />
                    );
                  })}
                </div>

                {/* District label */}
                <div className="mt-2 w-full px-1">
                  <p
                    className="mx-auto max-w-[88px] text-center text-[10px] leading-tight text-neutral-500"
                    title={row.district}
                  >
                    {truncateLabel(row.district, 18)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {financialYears.map((fy, idx) => (
          <div key={fy} className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-4 shrink-0 rounded-sm", fyColors[idx % fyColors.length])} />
            <span className="text-[10px] text-neutral-600">FY {fy}</span>
          </div>
        ))}
        <span className="text-[10px] text-neutral-400">Max scale: {formatCompact(maxVal)}</span>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="space-y-3 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
          <div className="h-5 flex-1 animate-pulse rounded-full bg-neutral-100" style={{ maxWidth: `${60 + i * 8}%` }} />
          <div className="h-3 w-8 animate-pulse rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function ColumnChartSkeleton({ columns = 8 }: { columns?: number }) {
  const heights = [48, 72, 96, 64, 120, 56, 88, 40, 104, 68, 80, 52];

  return (
    <div className="overflow-x-auto p-5">
      <div className="inline-flex items-end">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="flex shrink-0 flex-col items-center"
            style={{ width: `${CHART.columnSlotWidth}px` }}
          >
            <div className="mb-1 h-4 w-8 animate-pulse rounded bg-neutral-100" />
            <div
              className="flex items-end justify-center border-b border-slate-100 bg-slate-50/50"
              style={{ height: `${CHART.plotHeight}px`, gap: `${CHART.groupedBarGap}px` }}
            >
              <div
                className="animate-pulse rounded-t-sm bg-neutral-200"
                style={{ width: `${CHART.groupedBarWidth}px`, height: `${heights[i % heights.length]}px` }}
              />
              <div
                className="animate-pulse rounded-t-sm bg-neutral-100"
                style={{
                  width: `${CHART.groupedBarWidth}px`,
                  height: `${Math.max(24, heights[i % heights.length] - 20)}px`,
                }}
              />
            </div>
            <div className="mt-2 h-3 w-12 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className={cn("h-4 animate-pulse rounded bg-neutral-100", j === 0 ? "w-32" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyMsg({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{message}</p>;
}

function SectionPanel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        {badge !== undefined ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {badge.toLocaleString("en-IN")}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function FullWidthSection({ children }: { children: React.ReactNode }) {
  return <div className="xl:col-span-2">{children}</div>;
}

function usePaginatedRows<T>(items: T[], filterKey: string, pageSize = TABLE_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filterKey, items.length]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    setPage,
    total,
    totalPages,
    pageItems: items.slice(start, start + pageSize),
    pageSize,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
  };
}

function AnalyticsPaginationBar({
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-700">
          {rangeStart.toLocaleString("en-IN")}–{rangeEnd.toLocaleString("en-IN")}
        </span>{" "}
        of <span className="font-semibold text-slate-700">{total.toLocaleString("en-IN")}</span>
        {" · "}
        Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── District Section ─────────────────────────────────────────────────────────

function DistrictSection({
  data,
  loading,
  financialYear,
  filterKey,
}: {
  data: EnrollmentAnalyticsData | null;
  loading: boolean;
  financialYear: string;
  filterKey: string;
}) {
  const maxEnrolled = useMemo(
    () => Math.max(...(data?.districtSummary ?? []).map((d) => d.enrolled), 1),
    [data],
  );

  const summaryRows = data?.districtSummary ?? [];
  const trendRows = data?.districtTrend ?? [];
  const summaryPagination = usePaginatedRows(summaryRows, filterKey);
  const trendPagination = usePaginatedRows(trendRows, filterKey);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionPanel title="District-wise Enrollment" badge={data?.districtSummary.length}>
        {loading ? (
          <ColumnChartSkeleton />
        ) : !data?.districtSummary.length ? (
          <EmptyMsg message="No enrollment data found for the selected filters." />
        ) : (
          <div className="p-5">
            <ColumnBarChart
              bars={data.districtSummary.map((d) => ({
                label: d.district,
                primary: d.enrolled,
                secondary: d.synced,
              }))}
              colorClass="bg-sky-500"
              secondaryColorClass="bg-emerald-400"
            />
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Enrolled vs Synced by District">
        {loading ? (
          <div className="p-4">
            <ChartSkeleton />
          </div>
        ) : !data?.districtSummary.length ? (
          <EmptyMsg message="No district data available." />
        ) : (
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto p-2">
            {data.districtSummary.slice(0, 10).map((row) => (
              <DualBarRow
                key={row.district}
                label={row.district}
                enrolled={row.enrolled}
                synced={row.synced}
                batchSize={row.batchSize}
                maxEnrolled={maxEnrolled}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      <FullWidthSection>
        <SectionPanel
          title={`Financial Year-wise Enrollment Trend ${financialYear !== "all" ? "" : "(All Years)"}`}
          badge={data?.districtTrend.length}
        >
          <div className="p-5">
            {loading ? (
              <ColumnChartSkeleton columns={6} />
            ) : !data?.districtTrend.length ? (
              <EmptyMsg message="No trend data available." />
            ) : (
              <TrendBarChart rows={data.districtTrend} financialYears={data.availableFinancialYears} />
            )}
          </div>
        </SectionPanel>
      </FullWidthSection>

      <FullWidthSection>
        <SectionPanel title="District Enrollment Summary" badge={summaryRows.length}>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : !summaryRows.length ? (
            <EmptyMsg message="No district data available." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr className="border-b border-slate-100">
                      {["District", "Batches", "Enrolled", "Synced to SIDH", "Batch Capacity", "Sync Rate"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryPagination.pageItems.map((row) => (
                      <tr key={row.district} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-neutral-900">{row.district}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.batches.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 font-semibold text-sky-700">
                          {row.enrolled.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.synced.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{row.batchSize.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <SyncRateBadge synced={row.synced} enrolled={row.enrolled} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPaginationBar
                page={summaryPagination.page}
                totalPages={summaryPagination.totalPages}
                total={summaryPagination.total}
                rangeStart={summaryPagination.rangeStart}
                rangeEnd={summaryPagination.rangeEnd}
                onPageChange={summaryPagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>

      <FullWidthSection>
        <SectionPanel title="District Enrollment — Financial Year Breakdown" badge={trendRows.length}>
          {loading ? (
            <TableSkeleton cols={4} />
          ) : !trendRows.length ? (
            <EmptyMsg message="No trend data available." />
          ) : (
            <>
              <DistrictTrendTable
                pageRows={trendPagination.pageItems}
                allRows={trendRows}
                financialYears={data!.availableFinancialYears}
              />
              <AnalyticsPaginationBar
                page={trendPagination.page}
                totalPages={trendPagination.totalPages}
                total={trendPagination.total}
                rangeStart={trendPagination.rangeStart}
                rangeEnd={trendPagination.rangeEnd}
                onPageChange={trendPagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>
    </div>
  );
}

function DistrictTrendTable({
  pageRows,
  allRows,
  financialYears,
}: {
  pageRows: DistrictTrendRow[];
  allRows: DistrictTrendRow[];
  financialYears: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              District
            </th>
            {financialYears.map((fy) => (
              <th
                key={fy}
                className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                FY {fy}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.district} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
              <td className="px-4 py-3 font-medium text-neutral-900">{row.district}</td>
              {financialYears.map((fy) => {
                const val = row.years[fy]?.enrolled ?? 0;
                return (
                  <td key={fy} className="px-3 py-3 text-right">
                    {val > 0 ? (
                      <span className="font-medium text-sky-700">{val.toLocaleString("en-IN")}</span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                {row.total.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-3 text-xs font-bold text-neutral-700">Total</td>
            {financialYears.map((fy) => {
              const total = allRows.reduce((sum, r) => sum + (r.years[fy]?.enrolled ?? 0), 0);
              return (
                <td key={fy} className="px-3 py-3 text-right text-xs font-bold text-neutral-700">
                  {total.toLocaleString("en-IN")}
                </td>
              );
            })}
            <td className="px-4 py-3 text-right text-xs font-bold text-neutral-700">
              {allRows.reduce((sum, r) => sum + r.total, 0).toLocaleString("en-IN")}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Sector Section ───────────────────────────────────────────────────────────

function SectorSection({
  data,
  loading,
  filterKey,
}: {
  data: EnrollmentAnalyticsData | null;
  loading: boolean;
  filterKey: string;
}) {
  const maxEnrolled = useMemo(
    () => Math.max(...(data?.sectorwise ?? []).map((s) => s.enrolled), 1),
    [data],
  );

  const sectorRows = data?.sectorwise ?? [];
  const sectorPagination = usePaginatedRows(sectorRows, filterKey);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionPanel title="Sector-wise Enrollment — Bar Chart" badge={data?.sectorwise.length}>
        {loading ? (
          <ColumnChartSkeleton columns={6} />
        ) : !data?.sectorwise.length ? (
          <EmptyMsg message="No sector data found." />
        ) : (
          <div className="p-5">
            <ColumnBarChart
              bars={data.sectorwise.map((s) => ({
                label: s.sectorName,
                primary: s.enrolled,
                secondary: s.synced,
              }))}
              colorClass="bg-violet-500"
              secondaryColorClass="bg-emerald-400"
            />
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Sector Enrollment Detail">
        {loading ? (
          <div className="p-4">
            <ChartSkeleton />
          </div>
        ) : !data?.sectorwise.length ? (
          <EmptyMsg message="No sector data available." />
        ) : (
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto p-2">
            {data.sectorwise.slice(0, 10).map((row) => (
              <DualBarRow
                key={row.sectorId}
                label={row.sectorName}
                enrolled={row.enrolled}
                synced={row.synced}
                batchSize={row.batchSize}
                maxEnrolled={maxEnrolled}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      <FullWidthSection>
        <SectionPanel title="All Sectors — Full Table" badge={sectorRows.length}>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : !sectorRows.length ? (
            <EmptyMsg message="No sector data available." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr className="border-b border-slate-100">
                      {["Sector", "Courses", "Enrolled", "Synced to SIDH", "Sync Rate", "Capacity"].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sectorPagination.pageItems.map((row) => (
                      <tr key={row.sectorId} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-neutral-900">{row.sectorName}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.courseCount.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 font-semibold text-violet-700">
                          {row.enrolled.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.synced.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <SyncRateBadge synced={row.synced} enrolled={row.enrolled} />
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{row.batchSize.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPaginationBar
                page={sectorPagination.page}
                totalPages={sectorPagination.totalPages}
                total={sectorPagination.total}
                rangeStart={sectorPagination.rangeStart}
                rangeEnd={sectorPagination.rangeEnd}
                onPageChange={sectorPagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>
    </div>
  );
}

// ─── Course Section ───────────────────────────────────────────────────────────

function CourseSection({
  data,
  loading,
  filterKey,
}: {
  data: EnrollmentAnalyticsData | null;
  loading: boolean;
  filterKey: string;
}) {
  const maxEnrolled = useMemo(
    () => Math.max(...(data?.coursewise ?? []).map((c) => c.enrolled), 1),
    [data],
  );
  const topCourses = useMemo(() => (data?.coursewise ?? []).slice(0, 10), [data]);
  const courseRows = data?.coursewise ?? [];
  const coursePagination = usePaginatedRows(courseRows, filterKey);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionPanel title="Top Courses by Enrollment" badge={topCourses.length}>
        {loading ? (
          <ColumnChartSkeleton columns={8} />
        ) : !topCourses.length ? (
          <EmptyMsg message="No course data found." />
        ) : (
          <div className="p-5">
            <ColumnBarChart
              bars={topCourses.map((c) => ({
                label: c.courseName,
                primary: c.enrolled,
                secondary: c.synced,
              }))}
              colorClass="bg-amber-500"
              secondaryColorClass="bg-emerald-400"
            />
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Course Enrollment Detail">
        {loading ? (
          <div className="p-4">
            <ChartSkeleton />
          </div>
        ) : !topCourses.length ? (
          <EmptyMsg message="No course data available." />
        ) : (
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto p-2">
            {topCourses.map((row) => (
              <DualBarRow
                key={row.courseId}
                label={row.courseName}
                enrolled={row.enrolled}
                synced={row.synced}
                batchSize={row.batchSize}
                maxEnrolled={maxEnrolled}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      <FullWidthSection>
        <SectionPanel title="All Courses — Full Table" badge={courseRows.length}>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : !courseRows.length ? (
            <EmptyMsg message="No course data available." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr className="border-b border-slate-100">
                      {["Course", "Sector", "Batches", "Enrolled", "Synced to SIDH", "Sync Rate"].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coursePagination.pageItems.map((row) => (
                      <tr key={row.courseId} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-900">{row.courseName}</p>
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{row.sectorName}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.batches.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 font-semibold text-amber-700">
                          {row.enrolled.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.synced.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <SyncRateBadge synced={row.synced} enrolled={row.enrolled} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPaginationBar
                page={coursePagination.page}
                totalPages={coursePagination.totalPages}
                total={coursePagination.total}
                rangeStart={coursePagination.rangeStart}
                rangeEnd={coursePagination.rangeEnd}
                onPageChange={coursePagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>
    </div>
  );
}

// ─── Program Section ──────────────────────────────────────────────────────────

function ProgramSection({
  data,
  loading,
  filterKey,
}: {
  data: EnrollmentAnalyticsData | null;
  loading: boolean;
  filterKey: string;
}) {
  const maxEnrolled = useMemo(
    () => Math.max(...(data?.programwise ?? []).map((p) => p.enrolled), 1),
    [data],
  );

  const programRows = data?.programwise ?? [];
  const programPagination = usePaginatedRows(programRows, filterKey);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionPanel title="Program-wise Enrollment — Bar Chart" badge={data?.programwise.length}>
        {loading ? (
          <ColumnChartSkeleton columns={5} />
        ) : !data?.programwise.length ? (
          <EmptyMsg message="No program data found." />
        ) : (
          <div className="p-5">
            <ColumnBarChart
              bars={data.programwise.map((p) => ({
                label: p.programName,
                primary: p.enrolled,
                secondary: p.synced,
              }))}
              colorClass="bg-rose-500"
              secondaryColorClass="bg-emerald-400"
            />
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Program Enrollment Detail">
        {loading ? (
          <div className="p-4">
            <ChartSkeleton />
          </div>
        ) : !data?.programwise.length ? (
          <EmptyMsg message="No program data available." />
        ) : (
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto p-2">
            {data.programwise.slice(0, 10).map((row) => (
              <DualBarRow
                key={row.programId}
                label={row.programName}
                enrolled={row.enrolled}
                synced={row.synced}
                batchSize={row.batchSize}
                maxEnrolled={maxEnrolled}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      <FullWidthSection>
        <SectionPanel title="All Programs — Full Table" badge={programRows.length}>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : !programRows.length ? (
            <EmptyMsg message="No program data available." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr className="border-b border-slate-100">
                      {["Program", "Code", "Batches", "Enrolled", "Synced to SIDH", "Sync Rate"].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programPagination.pageItems.map((row) => (
                      <tr key={row.programId} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-neutral-900">{row.programName}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.programCode}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.batches.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 font-semibold text-rose-700">
                          {row.enrolled.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.synced.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <SyncRateBadge synced={row.synced} enrolled={row.enrolled} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPaginationBar
                page={programPagination.page}
                totalPages={programPagination.totalPages}
                total={programPagination.total}
                rangeStart={programPagination.rangeStart}
                rangeEnd={programPagination.rangeEnd}
                onPageChange={programPagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>
    </div>
  );
}

// ─── Center Section ───────────────────────────────────────────────────────────

function CenterSection({
  data,
  loading,
  filterKey,
}: {
  data: EnrollmentAnalyticsData | null;
  loading: boolean;
  filterKey: string;
}) {
  const maxEnrolled = useMemo(
    () => Math.max(...(data?.centerwise ?? []).map((c) => c.enrolled), 1),
    [data],
  );
  const topCenters = useMemo(() => (data?.centerwise ?? []).slice(0, 10), [data]);
  const centerRows = data?.centerwise ?? [];
  const centerPagination = usePaginatedRows(centerRows, filterKey);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionPanel title="Top Training Centers by Enrollment" badge={topCenters.length}>
        {loading ? (
          <ColumnChartSkeleton columns={8} />
        ) : !topCenters.length ? (
          <EmptyMsg message="No training center data found." />
        ) : (
          <div className="p-5">
            <ColumnBarChart
              bars={topCenters.map((c) => ({
                label: c.centerName,
                primary: c.enrolled,
                secondary: c.synced,
              }))}
              colorClass="bg-teal-500"
              secondaryColorClass="bg-emerald-400"
            />
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Center Enrollment Detail">
        {loading ? (
          <div className="p-4">
            <ChartSkeleton />
          </div>
        ) : !topCenters.length ? (
          <EmptyMsg message="No center data available." />
        ) : (
          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto p-2">
            {topCenters.map((row) => (
              <DualBarRow
                key={row.centerId}
                label={row.centerName}
                enrolled={row.enrolled}
                synced={row.synced}
                batchSize={row.batchSize}
                maxEnrolled={maxEnrolled}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      <FullWidthSection>
        <SectionPanel title="All Training Centers — Full Table" badge={centerRows.length}>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : !centerRows.length ? (
            <EmptyMsg message="No training center data available." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr className="border-b border-slate-100">
                      {["Center", "District", "State", "Batches", "Enrolled", "Synced to SIDH", "Sync Rate"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {centerPagination.pageItems.map((row) => (
                      <tr key={row.centerId} className="border-b border-neutral-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-900">{row.centerName}</p>
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{row.district}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.state}</td>
                        <td className="px-4 py-3 text-neutral-600">{row.batches.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 font-semibold text-teal-700">
                          {row.enrolled.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.synced.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <SyncRateBadge synced={row.synced} enrolled={row.enrolled} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPaginationBar
                page={centerPagination.page}
                totalPages={centerPagination.totalPages}
                total={centerPagination.total}
                rangeStart={centerPagination.rangeStart}
                rangeEnd={centerPagination.rangeEnd}
                onPageChange={centerPagination.setPage}
              />
            </>
          )}
        </SectionPanel>
      </FullWidthSection>
    </div>
  );
}

// ─── Sync Rate Badge ──────────────────────────────────────────────────────────

function SyncRateBadge({ synced, enrolled }: { synced: number; enrolled: number }) {
  const rate = enrolled > 0 ? Math.round((synced / enrolled) * 100) : 0;
  const color =
    rate >= 80
      ? "bg-emerald-100 text-emerald-700"
      : rate >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";

  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", color)}>{rate}%</span>
  );
}
