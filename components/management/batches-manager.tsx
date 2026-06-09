"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  IconCalendar,
  IconCloudUpload,
  IconEdit,
  IconEye,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconStack2,
  IconTrash,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import {
  buildSidhBatchPayload,
  calculateBatchEndDate,
  calculateMinimumAssessmentDate,
  resolveAssessmentDate,
  resolveBatchSchemeId,
  resolveSidhBatchFieldSelection,
} from "@/lib/sidh-batch-payload";
import { getSidhBatchFieldDefault, resolveSidhBatchFieldOptions } from "@/lib/sidh-batch-field-options";
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from "@/lib/sidh-display";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BatchesManagerProps = {
  portal: "admin" | "training_partner";
};

type ProgramOption = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  code?: string;
  createdSource?: string | null;
  feePaidBy?: string | null;
  name: string;
  programId: string;
  skillingCategoryId?: number;
  skillingCategoryName?: string | null;
  skillingCategoryScheme?: string | null;
};

type SectorOption = {
  code?: string;
  name: string;
  sectorId: string;
};

type CourseOption = {
  courseCode?: string;
  courseId: string;
  courseName: string;
  price?: number | null;
  programIds: string[];
  schemeIds: string[];
  sectorId: string;
  shortForm?: string | null;
  sidhCourseId?: string;
  totalHours?: number | null;
  trainingPerDayHours?: number | null;
};

type SchemeOption = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  createdSource?: string | null;
  fundingType?: string | null;
  name: string;
  schemeId: string;
  sidhSchemeId?: string | null;
  sidhSchemeReferenceId?: string | null;
  sidhSchemeType?: string | null;
  syncEnabled?: boolean;
};

type ReferenceData = {
  courses: CourseOption[];
  enums?: Record<string, Array<{ code: string; label: string }>>;
  programs: ProgramOption[];
  schemes: SchemeOption[];
  sectors: SectorOption[];
  sidhBatchContext?: {
    environment: string;
    tpId: string;
  };
  trainingCenters: Array<{ centerCode: string; centerId: string; centerName: string; sidhTcId?: string | null; verifiedForSidh?: boolean }>;
};

type BatchListItem = {
  assessmentDate: string | null;
  batchCode: string;
  batchId: string;
  batchName: string | null;
  batchSize: number;
  candidateCount: number;
  centerId: string;
  courseId: string;
  endDate: string | null;
  endTime: string;
  fee: number;
  schemeId: string;
  sidhBatchId: string | null;
  startDate: string | null;
  startTime: string;
  syncState: {
    batchSync: {
      lastFailureMessage?: string | null;
      status: string;
    };
    enrollmentSync: { status: string };
  };
  trainingHoursPerDay: number;
};

type PagedBatches = {
  items: BatchListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type PagedCourses = {
  items: CourseOption[];
  page: number;
  pageSize: number;
  total: number;
};

type CandidateOption = {
  candidateId: string;
  contactDetails: {
    mobileNumber: string;
  };
  createdAt: string | null;
  locationDetails: {
    centerName: string | null;
    city: string | null;
    state: string | null;
  };
  personalDetails: {
    fullName: string;
  };
  registrationMode: "internal_registration" | "existing_sidh_link";
  sidhCandidateId: string | null;
  syncState?: {
    status?: string | null;
  } | null;
};

type PagedCandidates = {
  items: CandidateOption[];
  page: number;
  pageSize: number;
  total: number;
};

type BatchDetail = BatchListItem & {
  sidhAssessmentMode?: string | null;
  sidhBatchType?: string | null;
  sidhCategoryType?: string | null;
  sidhCreatedSource?: string | null;
  sidhFeePaidBy?: string | null;
  sidhTpId?: string | null;
  status?: string;
  candidates: Array<{
    batchCandidateId: string;
    candidateId: string;
    candidateMobileNumber: string | null;
    candidateName: string | null;
    enrollmentStatus: string;
    lastEnrollmentFailureMessage?: string | null;
    sidhCandidateId: string | null;
    trainingStatus: string | null;
  }>;
};

type BatchFormState = {
  assessmentDate: string;
  assessmentMode: string;
  batchName: string;
  batchType: string;
  categoryType: string;
  centerId: string;
  courseId: string;
  createdSource: string;
  endDate: string;
  endTime: string;
  fee: string;
  feePaidBy: string;
  size: string;
  startDate: string;
  startTime: string;
  tpId: string;
  trainingHoursPerDay: string;
};

type BatchSyncStatus = {
  batchId: string;
  batchSync: {
    lastFailureMessage?: string | null;
    status: string;
  };
  sidhBatchId: string | null;
};

type SyncFilter = "" | "attention" | "pending" | "synced";

const portalContent = {
  admin: {
    description: "Create training batches, sync them to the government portal, and enroll registered learners.",
    heading: "Training Batches",
  },
  training_partner: {
    description: "Manage batches at your centers — create, sync, and enroll learners.",
    heading: "Training Batches",
  },
} as const;

function createEmptyBatchForm(enums?: ReferenceData["enums"]): BatchFormState {
  return {
    assessmentDate: "",
    assessmentMode: getSidhBatchFieldDefault("assessmentMode", enums),
    batchName: "",
    batchType: getSidhBatchFieldDefault("batchType", enums),
    categoryType: getSidhBatchFieldDefault("categoryType", enums),
    centerId: "",
    courseId: "",
    createdSource: getSidhBatchFieldDefault("createdSource", enums),
    endDate: "",
    endTime: "17:00",
    fee: "",
    feePaidBy: getSidhBatchFieldDefault("feePaidBy", enums),
    size: "",
    startDate: "",
    startTime: "09:00",
    tpId: "",
    trainingHoursPerDay: "",
  };
}

const emptyBatchForm = createEmptyBatchForm();

function canEditBatch(batch: Pick<BatchListItem, "sidhBatchId" | "syncState">) {
  const status = batch.syncState.batchSync.status;
  return !batch.sidhBatchId && !["synced", "queued", "processing"].includes(status);
}

function canPushBatch(batch: Pick<BatchListItem, "sidhBatchId" | "syncState">) {
  const status = batch.syncState.batchSync.status;
  return !batch.sidhBatchId && !["queued", "processing"].includes(status);
}

function canRemoveCandidate(batch: Pick<BatchListItem, "sidhBatchId">, enrollmentStatus: string) {
  return !batch.sidhBatchId || enrollmentStatus !== "synced";
}

function detailToForm(detail: BatchDetail, enums?: ReferenceData["enums"]): BatchFormState {
  return {
    assessmentDate: detail.endDate ? resolveAssessmentDate(detail.endDate, detail.assessmentDate) : detail.assessmentDate ?? "",
    assessmentMode: getSidhBatchFieldDefault("assessmentMode", enums, detail.sidhAssessmentMode),
    batchName: detail.batchName ?? detail.batchCode,
    batchType: getSidhBatchFieldDefault("batchType", enums, detail.sidhBatchType),
    categoryType: getSidhBatchFieldDefault("categoryType", enums, detail.sidhCategoryType),
    centerId: detail.centerId,
    courseId: detail.courseId,
    createdSource: getSidhBatchFieldDefault("createdSource", enums, detail.sidhCreatedSource),
    endDate: detail.endDate ?? "",
    endTime: detail.endTime,
    fee: String(detail.fee ?? 0),
    feePaidBy: getSidhBatchFieldDefault("feePaidBy", enums, detail.sidhFeePaidBy),
    size: String(detail.batchSize ?? 80),
    startDate: detail.startDate ?? "",
    startTime: detail.startTime,
    tpId: detail.sidhTpId ?? "",
    trainingHoursPerDay: String(detail.trainingHoursPerDay ?? 8),
  };
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatStatusLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "Not available";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isSidhVerifiedCandidate(candidate: CandidateOption) {
  const syncStatus = candidate.syncState?.status ?? (candidate.registrationMode === "existing_sidh_link" ? "linked" : null);
  return Boolean(candidate.sidhCandidateId && (!syncStatus || ["linked", "synced"].includes(syncStatus)));
}

function applyMasterDataDefaults(
  course: CourseOption,
  program: ProgramOption | undefined,
  scheme: SchemeOption | undefined,
  sidhContext: ReferenceData["sidhBatchContext"] | undefined,
  startDate: string,
  current: BatchFormState,
  enums?: ReferenceData["enums"],
): BatchFormState {
  const next = applyCourseDefaults(course, startDate, current);
  const fieldDefaults = resolveSidhBatchFieldOptions(enums);
  const sidhFields = resolveSidhBatchFieldSelection({
    batch: { tpId: current.tpId },
    configuredTpId: sidhContext?.tpId,
    defaults: {
      assessmentMode: fieldDefaults.assessmentMode[0],
      batchType: fieldDefaults.batchType[0],
      categoryType: fieldDefaults.categoryType[0],
      createdSource: fieldDefaults.createdSource[0],
      feePaidBy: fieldDefaults.feePaidBy[0],
    },
    program: program
      ? {
          assessmentMode: program.assessmentMode,
          batchCategoryType: program.batchCategoryType,
          batchType: program.batchType,
          createdSource: program.createdSource,
          feePaidBy: program.feePaidBy,
        }
      : null,
    scheme: scheme
      ? {
          assessmentMode: scheme.assessmentMode,
          batchCategoryType: scheme.batchCategoryType,
          batchType: scheme.batchType,
          createdSource: scheme.createdSource,
          fundingType: scheme.fundingType,
        }
      : null,
  });

  return {
    ...next,
    assessmentDate: resolveAssessmentDate(next.endDate, next.assessmentDate),
    assessmentMode: sidhFields.assessmentMode,
    batchType: sidhFields.batchType,
    categoryType: sidhFields.categoryType,
    createdSource: sidhFields.createdSource,
    fee: next.fee || String(course.price ?? 0),
    feePaidBy: sidhFields.feePaidBy,
    tpId: sidhFields.tpId,
    trainingHoursPerDay: next.trainingHoursPerDay || String(course.trainingPerDayHours || 8),
  };
}

function applyCourseDefaults(course: CourseOption, startDate: string, current: BatchFormState): BatchFormState {
  const trainingHoursPerDay = Number(course.trainingPerDayHours || 8);
  const totalHours = Number(course.totalHours || 0);
  const nextStartDate = startDate || current.startDate;
  const endDate =
    nextStartDate && totalHours > 0 ? calculateBatchEndDate(nextStartDate, totalHours, trainingHoursPerDay) : current.endDate;

  return {
    ...current,
    courseId: course.courseId,
    endDate,
    assessmentDate: resolveAssessmentDate(endDate, current.assessmentDate),
    fee: current.fee || String(course.price ?? 0),
    size: current.size || "80",
    trainingHoursPerDay: current.trainingHoursPerDay || String(course.trainingPerDayHours || 8),
  };
}

function ReadOnlyField({ hint, label, value }: { hint?: string; label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{value || "-"}</div>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function PayloadPreviewSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>
      <dl className="divide-y divide-slate-100">{children}</dl>
    </div>
  );
}

function PayloadPreviewRow({ apiValue, label, readableValue }: { apiValue: string; label: string; readableValue: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{readableValue || "-"}</dd>
      <dd className="font-mono text-xs text-slate-500">{apiValue || "-"}</dd>
    </div>
  );
}

function SidhPayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const skillingCategory = payload.skillingcategory as { id?: number; name?: string; scheme?: string } | undefined;
  const batchFee = payload.batchFee as { totalFees?: number } | undefined;

  return (
    <div className="space-y-4">
      <div className="hidden gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:grid sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)]">
        <span className="font-semibold uppercase tracking-wide">Field</span>
        <span className="font-semibold uppercase tracking-wide">Readable</span>
        <span className="font-semibold uppercase tracking-wide">API Value</span>
      </div>

      <PayloadPreviewSection title="Batch Details">
        <PayloadPreviewRow apiValue={String(payload.batchName ?? "")} label="Batch Name" readableValue={String(payload.batchName ?? "")} />
        <PayloadPreviewRow apiValue={String(payload.size ?? "")} label="Batch Size" readableValue={String(payload.size ?? "")} />
        <PayloadPreviewRow apiValue={String(payload.courseId ?? "")} label="Course ID" readableValue={String(payload.courseId ?? "")} />
        <PayloadPreviewRow
          apiValue={String(payload.trainingHoursPerDay ?? "")}
          label="Training Hours / Day"
          readableValue={String(payload.trainingHoursPerDay ?? "")}
        />
        <PayloadPreviewRow apiValue={String(payload.batchType ?? "")} label="Batch Type" readableValue={String(payload.batchType ?? "")} />
        <PayloadPreviewRow apiValue={String(payload.type ?? "")} label="Type" readableValue={String(payload.type ?? "")} />
      </PayloadPreviewSection>

      <PayloadPreviewSection title="Schedule">
        <PayloadPreviewRow
          apiValue={String(payload.batchStartDate ?? "")}
          label="Start Date"
          readableValue={formatDisplayDateTime(String(payload.batchStartDate ?? ""))}
        />
        <PayloadPreviewRow
          apiValue={String(payload.batchEndDate ?? "")}
          label="End Date"
          readableValue={formatDisplayDateTime(String(payload.batchEndDate ?? ""))}
        />
        <PayloadPreviewRow
          apiValue={String(payload.batchStartTime ?? "")}
          label="Start Time"
          readableValue={formatDisplayDateTime(String(payload.batchStartTime ?? ""))}
        />
        <PayloadPreviewRow
          apiValue={String(payload.batchEndTime ?? "")}
          label="End Time"
          readableValue={formatDisplayDateTime(String(payload.batchEndTime ?? ""))}
        />
        <PayloadPreviewRow
          apiValue={String(payload.assessmentStartDate ?? "")}
          label="Assessment Start"
          readableValue={formatDisplayDateTime(String(payload.assessmentStartDate ?? ""))}
        />
        <PayloadPreviewRow
          apiValue={String(payload.assessmentEndDate ?? "")}
          label="Assessment End"
          readableValue={formatDisplayDateTime(String(payload.assessmentEndDate ?? ""))}
        />
        <PayloadPreviewRow apiValue={String(payload.assessmentMode ?? "")} label="Assessment Mode" readableValue={String(payload.assessmentMode ?? "")} />
      </PayloadPreviewSection>

      <PayloadPreviewSection title="Fees">
        <PayloadPreviewRow
          apiValue={String(batchFee?.totalFees ?? "")}
          label="Total Fees"
          readableValue={batchFee?.totalFees !== undefined ? `₹${batchFee.totalFees}` : "-"}
        />
        <PayloadPreviewRow apiValue={String(payload.feePaidBy ?? "")} label="Fee Paid By" readableValue={String(payload.feePaidBy ?? "")} />
      </PayloadPreviewSection>

      <PayloadPreviewSection title="Scheme & Skilling Category">
        <PayloadPreviewRow apiValue={String(payload.schemeId ?? "")} label="Scheme ID" readableValue={String(payload.schemeId ?? "")} />
        <PayloadPreviewRow
          apiValue={String(payload.schemeReferenceId ?? "")}
          label="Scheme Reference ID"
          readableValue={String(payload.schemeReferenceId ?? "")}
        />
        <PayloadPreviewRow apiValue={String(payload.schemeType ?? "")} label="Scheme Type" readableValue={String(payload.schemeType ?? "")} />
        <PayloadPreviewRow apiValue={String(skillingCategory?.name ?? "")} label="Skilling Category" readableValue={String(skillingCategory?.name ?? "")} />
        <PayloadPreviewRow apiValue={String(skillingCategory?.id ?? "")} label="Category ID" readableValue={String(skillingCategory?.id ?? "")} />
        <PayloadPreviewRow apiValue={String(skillingCategory?.scheme ?? "")} label="Category Scheme" readableValue={String(skillingCategory?.scheme ?? "")} />
      </PayloadPreviewSection>

      <PayloadPreviewSection title="Training Partner & Center">
        <PayloadPreviewRow apiValue={String(payload.tpId ?? "")} label="TP ID" readableValue={String(payload.tpId ?? "")} />
        <PayloadPreviewRow apiValue={String(payload.tcId ?? "")} label="TC ID" readableValue={String(payload.tcId ?? "")} />
        <PayloadPreviewRow apiValue={String(payload.createdSource ?? "")} label="Created Source" readableValue={String(payload.createdSource ?? "")} />
      </PayloadPreviewSection>

      <details className="rounded-2xl border border-slate-200 bg-slate-950 text-slate-100">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Raw JSON payload</summary>
        <pre className="max-h-96 overflow-auto border-t border-slate-800 p-4 text-xs leading-6">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}

function formatCourseOptionLabel(course: CourseOption) {
  const shortForm = course.shortForm?.trim();
  return shortForm ? `${course.courseName} (${shortForm})` : course.courseName;
}

function createGeneratedBatchCode(course: CourseOption | undefined, startDate: string) {
  const datePart = startDate.replace(/-/g, "") || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const coursePart = (course?.shortForm || course?.courseCode || course?.courseName || "BAT")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase();

  return `${coursePart || "BAT"}${datePart}${Date.now().toString().slice(-4)}`;
}

function StatusBadge({ tone = "slate", value }: { tone?: "emerald" | "slate" | "amber" | "rose" | "sky"; value: string }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return <span className={classNames("inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", tones[tone])}>{formatStatusLabel(value)}</span>;
}

function StatCard({
  active = false,
  icon,
  label,
  onClick,
  value,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  value: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-3xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md sm:p-5",
        active ? "border-sky-300 ring-1 ring-sky-200" : "border-slate-200",
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

function BatchModal({
  children,
  icon,
  iconBg,
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  onClose: () => void;
  subtitle: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",
          wide ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className={cn("rounded-xl p-2.5", iconBg)}>{icon}</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function BatchActionButton({
  disabled = false,
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral" | "primary";
}) {
  const toneClass =
    tone === "primary"
      ? "border-sky-200 bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-300"
      : tone === "danger"
        ? "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3",
        toneClass,
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function BatchActionsBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5 sm:gap-2", className)}>{children}</div>;
}

function FieldSelect({
  children,
  disabled = false,
  id,
  onChange,
  value,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      id={id}
      disabled={disabled}
      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

export default function BatchesManager({ portal }: BatchesManagerProps) {
  const content = portalContent[portal];
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm);
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [syncingBatchId, setSyncingBatchId] = useState<string | null>(null);
  const [syncingEnrollmentBatchId, setSyncingEnrollmentBatchId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [assignBatchId, setAssignBatchId] = useState("");
  const [assignCandidates, setAssignCandidates] = useState<CandidateOption[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isAssigningCandidates, setIsAssigningCandidates] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [isDeletingAllUnpushed, setIsDeletingAllUnpushed] = useState(false);
  const [removingCandidateId, setRemovingCandidateId] = useState<string | null>(null);
  const [isRemovingAllCandidates, setIsRemovingAllCandidates] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [sectorCourses, setSectorCourses] = useState<CourseOption[]>([]);
  const [isLoadingSectorCourses, setIsLoadingSectorCourses] = useState(false);

  const courseMap = useMemo(() => {
    const courses = new Map((referenceData?.courses ?? []).map((course) => [course.courseId, course]));
    for (const course of sectorCourses) {
      courses.set(course.courseId, course);
    }
    return courses;
  }, [referenceData, sectorCourses]);
  const programMap = useMemo(() => new Map((referenceData?.programs ?? []).map((program) => [program.programId, program])), [referenceData]);
  const sectorMap = useMemo(() => new Map((referenceData?.sectors ?? []).map((sector) => [sector.sectorId, sector])), [referenceData]);
  const schemeMap = useMemo(() => new Map((referenceData?.schemes ?? []).map((scheme) => [scheme.schemeId, scheme])), [referenceData]);
  const centerMap = useMemo(
    () => new Map((referenceData?.trainingCenters ?? []).map((center) => [center.centerId, center])),
    [referenceData],
  );
  const sidhFieldOptionLabels = useMemo(
    () => resolveSidhBatchFieldOptions(referenceData?.enums),
    [referenceData?.enums],
  );
  const minimumAssessmentDate = useMemo(
    () => (batchForm.endDate ? calculateMinimumAssessmentDate(batchForm.endDate) : ""),
    [batchForm.endDate],
  );

  const selectedCourse = courseMap.get(batchForm.courseId);
  const selectedCenter = centerMap.get(batchForm.centerId);
  const selectedSchemeId = selectedCourse
    ? resolveBatchSchemeId(selectedCourse.schemeIds, referenceData?.schemes ?? [])
    : null;
  const selectedScheme = selectedSchemeId ? schemeMap.get(selectedSchemeId) : undefined;
  const selectedProgram = selectedCourse?.programIds[0] ? programMap.get(selectedCourse.programIds[0]) : undefined;

  const sidhPayloadPreview = useMemo(() => {
    if (!selectedCourse || !batchForm.startDate || !batchForm.endDate) {
      return null;
    }

    const sidhCourseId = selectedCourse.sidhCourseId || selectedCourse.courseCode || "";
    if (!sidhCourseId) {
      return null;
    }

    return buildSidhBatchPayload({
      assessmentDate: resolveAssessmentDate(batchForm.endDate, batchForm.assessmentDate),
      batchName: batchForm.batchName || `${selectedCourse.courseName} ${batchForm.startDate}`,
      batchSize: Number(batchForm.size || 80),
      configuredTpId: referenceData?.sidhBatchContext?.tpId,
      course: {
        sidhCourseId,
        trainingPerDayHours: Number(batchForm.trainingHoursPerDay || selectedCourse.trainingPerDayHours || 8),
      },
      endDate: batchForm.endDate,
      endTime: batchForm.endTime,
      fee: Number(batchForm.fee || selectedCourse.price || 0),
      options: {
        assessmentMode: batchForm.assessmentMode,
        batchType: batchForm.batchType,
        categoryType: batchForm.categoryType,
        createdSource: batchForm.createdSource,
        feePaidBy: batchForm.feePaidBy,
        tpId: batchForm.tpId,
      },
      program: selectedProgram
        ? {
            name: selectedProgram.name,
            skillingCategoryId: selectedProgram.skillingCategoryId,
            skillingCategoryName: selectedProgram.skillingCategoryName,
            skillingCategoryScheme: selectedProgram.skillingCategoryScheme,
            assessmentMode: selectedProgram.assessmentMode,
            batchCategoryType: selectedProgram.batchCategoryType,
            batchType: selectedProgram.batchType,
            createdSource: selectedProgram.createdSource,
            feePaidBy: selectedProgram.feePaidBy,
          }
        : null,
      scheme: {
        sidhSchemeId: selectedScheme?.sidhSchemeId,
        sidhSchemeReferenceId: selectedScheme?.sidhSchemeReferenceId,
        sidhSchemeType: selectedScheme?.sidhSchemeType,
      },
      startDate: batchForm.startDate,
      startTime: batchForm.startTime,
      tcId: selectedCenter?.sidhTcId,
    });
  }, [batchForm, referenceData?.sidhBatchContext?.tpId, selectedCenter?.sidhTcId, selectedCourse, selectedProgram, selectedScheme]);
  const assignBatch = batches.find((batch) => batch.batchId === assignBatchId);
  const assignedCandidateIds = useMemo(
    () => new Set(selectedBatch?.batchId === assignBatchId ? selectedBatch.candidates.map((candidate) => candidate.candidateId) : []),
    [assignBatchId, selectedBatch],
  );
  const assignableCandidates = useMemo(
    () => assignCandidates.filter((candidate) => isSidhVerifiedCandidate(candidate) && !assignedCandidateIds.has(candidate.candidateId)),
    [assignCandidates, assignedCandidateIds],
  );
  const activeSelectedCandidateIds = selectedCandidateIds.filter((candidateId) => assignableCandidates.some((candidate) => candidate.candidateId === candidateId));
  const allAssignableSelected = assignableCandidates.length > 0 && assignableCandidates.every((candidate) => activeSelectedCandidateIds.includes(candidate.candidateId));

  const batchStats = useMemo(
    () => ({
      total: batches.length,
      synced: batches.filter((b) => b.syncState.batchSync.status === "synced").length,
      pending: batches.filter((b) => ["queued", "processing", "not_queued", "not_synced"].includes(b.syncState.batchSync.status)).length,
      attention: batches.filter((b) => ["failed", "manual_review"].includes(b.syncState.batchSync.status)).length,
    }),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    if (syncFilter === "synced") {
      return batches.filter((b) => b.syncState.batchSync.status === "synced");
    }
    if (syncFilter === "pending") {
      return batches.filter((b) => ["queued", "processing", "not_queued", "not_synced"].includes(b.syncState.batchSync.status));
    }
    if (syncFilter === "attention") {
      return batches.filter((b) => ["failed", "manual_review"].includes(b.syncState.batchSync.status));
    }
    return batches;
  }, [batches, syncFilter]);

  const unpushedBatches = useMemo(() => batches.filter((batch) => canEditBatch(batch)), [batches]);

  const removableCandidates = useMemo(
    () => (selectedBatch ? selectedBatch.candidates.filter((candidate) => canRemoveCandidate(selectedBatch, candidate.enrollmentStatus)) : []),
    [selectedBatch],
  );

  function resetSectorCourseSelection() {
    setSelectedSectorId("");
    setSectorCourses([]);
    setIsLoadingSectorCourses(false);
  }

  async function loadCoursesForSector(sectorId: string) {
    if (!sectorId) {
      setSectorCourses([]);
      return;
    }

    setIsLoadingSectorCourses(true);

    try {
      const coursePage = await apiFetch<PagedCourses>(
        `/api/v1/masters/courses?page=1&pageSize=100&status=active&approvalStatus=approved&sectorId=${encodeURIComponent(sectorId)}`,
      );
      setSectorCourses(coursePage.items);
    } catch (error) {
      setSectorCourses([]);
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load courses for the selected sector");
    } finally {
      setIsLoadingSectorCourses(false);
    }
  }

  function openCreateModal() {
    setBatchForm(createEmptyBatchForm(referenceData?.enums));
    resetSectorCourseSelection();

    const sectors = referenceData?.sectors ?? [];
    if (sectors.length === 1) {
      const sectorId = sectors[0]?.sectorId ?? "";
      setSelectedSectorId(sectorId);
      if (sectorId) {
        void loadCoursesForSector(sectorId);
      }
    }

    setShowCreateModal(true);
  }

  async function loadData() {
    setIsLoading(true);

    try {
      const [refs, coursePage, batchPage] = await Promise.all([
        apiFetch<ReferenceData>("/api/v1/reference-data/candidate"),
        apiFetch<PagedCourses>("/api/v1/masters/courses?page=1&pageSize=100&status=active&approvalStatus=approved"),
        apiFetch<PagedBatches>("/api/v1/batches?page=1&pageSize=100"),
      ]);

      setReferenceData({ ...refs, courses: coursePage.items });
      setBatches(batchPage.items);
      setBatchForm((current) => {
        const next = { ...current };

        if (!current.centerId && refs.trainingCenters.length === 1) {
          next.centerId = refs.trainingCenters[0]?.centerId ?? "";
        }

        if (!current.tpId && refs.sidhBatchContext?.tpId) {
          next.tpId = refs.sidhBatchContext.tpId;
        }

        return next;
      });
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch details");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateBatchForm(patch: Partial<BatchFormState>) {
    setBatchForm((current) => ({ ...current, ...patch }));
  }

  async function handleViewBatch(batchId: string, openModal = true) {
    setDetailLoadingId(batchId);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`);
      setSelectedBatch(detail);
      if (openModal) {
        setShowDetailModal(true);
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch details");
    } finally {
      setDetailLoadingId(null);
    }
  }

  function openAssignModal(batchId = "") {
    setAssignBatchId(batchId);
    setSelectedCandidateIds([]);
    setAssignCandidates([]);
    setShowAssignModal(true);
    if (batchId) {
      void loadAssignableCandidates(batchId);
    }
  }

  async function loadAssignableCandidates(batchId: string, search = assignSearch) {
    const batch = batches.find((item) => item.batchId === batchId);

    if (!batch) {
      setAssignCandidates([]);
      return;
    }

    setIsLoadingCandidates(true);

    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (batch.centerId && batch.centerId !== "unassigned") {
        params.set("centerId", batch.centerId);
      }

      const [candidatePage] = await Promise.all([
        apiFetch<PagedCandidates>(`/api/v1/candidates?${params.toString()}`),
        handleViewBatch(batchId, false),
      ]);

      setAssignCandidates(candidatePage.items.filter(isSidhVerifiedCandidate));
      setSelectedCandidateIds([]);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load verified SIDH candidates");
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  async function handleCreateBatch() {
    const validationError = validateBatchForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const schemeId = selectedSchemeId as string;

    setIsSaving(true);

    try {
      const batchCode = createGeneratedBatchCode(selectedCourse, batchForm.startDate);
      const batchName = batchForm.batchName.trim() || `${selectedCourse?.courseName} ${batchForm.startDate}`;
      const createdBatch = await apiFetch<BatchDetail>("/api/v1/batches", {
        body: JSON.stringify({
          assessmentDate: resolveAssessmentDate(batchForm.endDate, batchForm.assessmentDate),
          assessmentEligibilityThreshold: 70,
          assessmentMode: batchForm.assessmentMode,
          batchCode,
          batchName,
          batchSize: Number(batchForm.size || 80),
          batchType: batchForm.batchType,
          categoryType: batchForm.categoryType,
          centerId: batchForm.centerId,
          courseId: batchForm.courseId,
          createdSource: batchForm.createdSource,
          endDate: batchForm.endDate,
          endTime: batchForm.endTime,
          fee: Number(batchForm.fee || selectedCourse?.price || 0),
          feePaidBy: batchForm.feePaidBy,
          schemeId,
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          status: "draft",
          syncEnabled: true,
          tpId: batchForm.tpId,
          trainingHoursPerDay: Number(batchForm.trainingHoursPerDay || selectedCourse?.trainingPerDayHours || 8),
        }),
        method: "POST",
      });

      toast.success("Batch saved locally. Review details and push to SIDH when ready.");

      setBatchForm(createEmptyBatchForm(referenceData?.enums));
      resetSectorCourseSelection();
      setShowCreateModal(false);
      await loadData();
      await handleViewBatch(createdBatch.batchId, true);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to create batch");
    } finally {
      setIsSaving(false);
    }
  }

  function validateBatchForm() {
    const schemeId = selectedSchemeId;

    if (!selectedSectorId) {
      return "Select a sector before choosing a course";
    }

    if (!batchForm.centerId || !batchForm.courseId || !batchForm.startDate || !batchForm.endDate || !batchForm.startTime || !batchForm.endTime) {
      return "Select a training center, course, start date, and end date before saving the batch";
    }

    if (!selectedCourse?.sidhCourseId && !selectedCourse?.courseCode) {
      return "Selected course is missing a SIDH course ID";
    }

    if (!selectedCenter?.sidhTcId) {
      return "Selected training center is missing an approved SIDH TC ID";
    }

    if (!selectedCenter.verifiedForSidh) {
      return "Verify the training center before preparing a SIDH batch";
    }

    if (!selectedProgram) {
      return "Selected course is not linked to a program with SIDH payload defaults";
    }

    if (!schemeId || !selectedScheme?.sidhSchemeId || !selectedScheme?.sidhSchemeReferenceId) {
      return "Selected course is not linked to a SIDH-ready scheme with both Scheme ID and Reference ID";
    }

    if (!batchForm.tpId.trim()) {
      return "Select a SIDH TP ID before saving the batch";
    }

    if (!batchForm.assessmentDate) {
      return "Set an assessment date before saving the batch";
    }

    if (batchForm.endDate && batchForm.assessmentDate < minimumAssessmentDate) {
      return `Assessment date must be at least 7 days after the batch end date (${minimumAssessmentDate})`;
    }

    return null;
  }

  function openEditModal(batchId: string) {
    const batch = batches.find((item) => item.batchId === batchId);
    if (batch && !canEditBatch(batch)) {
      toast.error("This batch can no longer be edited because it is synced or currently pushing to SIDH");
      return;
    }

    setEditingBatchId(batchId);
    setShowEditModal(true);

    void (async () => {
      try {
        const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`);
        setBatchForm(detailToForm(detail, referenceData?.enums));
        setSelectedBatch(detail);

        const course =
          (referenceData?.courses ?? []).find((item) => item.courseId === detail.courseId) ??
          courseMap.get(detail.courseId);
        const sectorId = course?.sectorId ?? "";
        setSelectedSectorId(sectorId);
        if (sectorId) {
          await loadCoursesForSector(sectorId);
        } else {
          setSectorCourses([]);
        }
      } catch (error) {
        toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch for editing");
        setShowEditModal(false);
        setEditingBatchId(null);
      }
    })();
  }

  async function handleUpdateBatch() {
    if (!editingBatchId) {
      return;
    }

    const validationError = validateBatchForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const schemeId = selectedSchemeId as string;
    setIsSaving(true);

    try {
      const updatedBatch = await apiFetch<BatchDetail>(`/api/v1/batches/${editingBatchId}`, {
        body: JSON.stringify({
          assessmentDate: resolveAssessmentDate(batchForm.endDate, batchForm.assessmentDate),
          assessmentMode: batchForm.assessmentMode,
          batchName: batchForm.batchName.trim() || `${selectedCourse?.courseName} ${batchForm.startDate}`,
          batchSize: Number(batchForm.size || 80),
          batchType: batchForm.batchType,
          categoryType: batchForm.categoryType,
          centerId: batchForm.centerId,
          courseId: batchForm.courseId,
          createdSource: batchForm.createdSource,
          endDate: batchForm.endDate,
          endTime: batchForm.endTime,
          fee: Number(batchForm.fee || selectedCourse?.price || 0),
          feePaidBy: batchForm.feePaidBy,
          schemeId,
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          status: "ready",
          syncEnabled: true,
          tpId: batchForm.tpId,
          trainingHoursPerDay: Number(batchForm.trainingHoursPerDay || selectedCourse?.trainingPerDayHours || 8),
        }),
        method: "PATCH",
      });

      toast.success("Batch updated. Push to SIDH when you are ready.");
      setShowEditModal(false);
      setEditingBatchId(null);
      setBatchForm(createEmptyBatchForm(referenceData?.enums));
      setSelectedBatch(updatedBatch);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to update batch");
    } finally {
      setIsSaving(false);
    }
  }

  async function pollBatchSyncStatus(batchId: string, attempts = 15) {
    for (let index = 0; index < attempts; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const status = await apiFetch<BatchSyncStatus>(`/api/v1/batches/${batchId}/status`);

      if (status.batchSync.status === "synced" && status.sidhBatchId) {
        toast.success(`Batch pushed to SIDH successfully. Government batch ID: ${status.sidhBatchId}`);
        await loadData();
        if (selectedBatch?.batchId === batchId) {
          await handleViewBatch(batchId, false);
        }
        return;
      }

      if (["failed", "manual_review"].includes(status.batchSync.status)) {
        toast.error(status.batchSync.lastFailureMessage ?? "Batch push to SIDH failed");
        await loadData();
        if (selectedBatch?.batchId === batchId) {
          await handleViewBatch(batchId, false);
        }
        return;
      }
    }

    toast.message("Batch push is still processing. Refresh the page to check the latest status.");
    await loadData();
  }

  async function handlePushToSidh(batchId: string) {
    const batch = batches.find((item) => item.batchId === batchId) ?? selectedBatch;
    if (batch && !canPushBatch(batch)) {
      toast.error("This batch is already synced or currently pushing to SIDH");
      return;
    }

    setSyncingBatchId(batchId);

    try {
      await apiFetch(`/api/v1/batches/${batchId}/sync`, {
        body: JSON.stringify({ forceResync: false }),
        method: "POST",
      });
      toast.success("Batch push to SIDH started");
      await loadData();
      await pollBatchSyncStatus(batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to push batch to SIDH");
    } finally {
      setSyncingBatchId(null);
    }
  }

  async function handleSaveAndPush() {
    if (!editingBatchId) {
      return;
    }

    const batchId = editingBatchId;
    const validationError = validateBatchForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const schemeId = selectedSchemeId as string;
    setIsSaving(true);

    try {
      await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`, {
        body: JSON.stringify({
          assessmentDate: resolveAssessmentDate(batchForm.endDate, batchForm.assessmentDate),
          assessmentMode: batchForm.assessmentMode,
          batchName: batchForm.batchName.trim() || `${selectedCourse?.courseName} ${batchForm.startDate}`,
          batchSize: Number(batchForm.size || 80),
          batchType: batchForm.batchType,
          categoryType: batchForm.categoryType,
          centerId: batchForm.centerId,
          courseId: batchForm.courseId,
          createdSource: batchForm.createdSource,
          endDate: batchForm.endDate,
          endTime: batchForm.endTime,
          fee: Number(batchForm.fee || selectedCourse?.price || 0),
          feePaidBy: batchForm.feePaidBy,
          schemeId,
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          status: "ready",
          syncEnabled: true,
          tpId: batchForm.tpId,
          trainingHoursPerDay: Number(batchForm.trainingHoursPerDay || selectedCourse?.trainingPerDayHours || 8),
        }),
        method: "PATCH",
      });

      setShowEditModal(false);
      setEditingBatchId(null);
      setBatchForm(createEmptyBatchForm(referenceData?.enums));
      await loadData();
      await handlePushToSidh(batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save batch before push");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRetrySync(batchId: string) {
    setSyncingBatchId(batchId);

    try {
      await apiFetch(`/api/v1/batches/${batchId}/sync`, {
        body: JSON.stringify({ forceResync: true }),
        method: "POST",
      });
      toast.success("SIDH retry queued");
      await loadData();
      if (selectedBatch?.batchId === batchId) {
        await handleViewBatch(batchId, false);
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to queue SIDH retry");
    } finally {
      setSyncingBatchId(null);
    }
  }

  async function handleRetryEnrollment(batchId: string, candidateIds?: string[]) {
    setSyncingEnrollmentBatchId(batchId);

    try {
      await apiFetch(`/api/v1/batches/${batchId}/enrollment-sync`, {
        body: JSON.stringify({ candidateIds, forceResync: true }),
        method: "POST",
      });
      toast.success("Enrollment retry queued");
      await loadData();
      await handleViewBatch(batchId, false);
      if (assignBatchId === batchId) {
        await loadAssignableCandidates(batchId);
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to queue enrollment retry");
    } finally {
      setSyncingEnrollmentBatchId(null);
    }
  }

  async function handleAssignCandidates() {
    if (!assignBatchId) {
      toast.error("Select a batch before assigning candidates");
      return;
    }

    if (activeSelectedCandidateIds.length === 0) {
      toast.error("Select at least one verified SIDH candidate");
      return;
    }

    setIsAssigningCandidates(true);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${assignBatchId}/candidates`, {
        body: JSON.stringify({ candidateIds: activeSelectedCandidateIds }),
        method: "POST",
      });
      setSelectedBatch(detail);
      setSelectedCandidateIds([]);
      toast.success("Candidates saved and enrollment queued");
      await loadData();
      await loadAssignableCandidates(assignBatchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to assign candidates to batch");
    } finally {
      setIsAssigningCandidates(false);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    const batch = batches.find((item) => item.batchId === batchId);
    if (batch && !canEditBatch(batch)) {
      toast.error("Only unpushed batches can be deleted");
      return;
    }

    if (!window.confirm("Delete this local batch and all of its learner assignments?")) {
      return;
    }

    setDeletingBatchId(batchId);

    try {
      await apiFetch(`/api/v1/batches/${batchId}`, { method: "DELETE" });
      toast.success("Batch deleted");
      if (selectedBatch?.batchId === batchId) {
        setSelectedBatch(null);
        setShowDetailModal(false);
      }
      if (assignBatchId === batchId) {
        setAssignBatchId("");
      }
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to delete batch");
    } finally {
      setDeletingBatchId(null);
    }
  }

  async function handleDeleteAllUnpushedBatches() {
    if (unpushedBatches.length === 0) {
      toast.error("No unpushed batches to delete");
      return;
    }

    if (!window.confirm(`Delete all ${unpushedBatches.length} unpushed batch(es)? This cannot be undone.`)) {
      return;
    }

    setIsDeletingAllUnpushed(true);
    let deletedCount = 0;

    for (const batch of unpushedBatches) {
      try {
        await apiFetch(`/api/v1/batches/${batch.batchId}`, { method: "DELETE" });
        deletedCount += 1;
      } catch {
        // Continue deleting remaining batches and summarize below.
      }
    }

    setIsDeletingAllUnpushed(false);
    setSelectedBatch(null);
    setShowDetailModal(false);
    await loadData();

    if (deletedCount === unpushedBatches.length) {
      toast.success(`Deleted ${deletedCount} unpushed batch(es)`);
    } else if (deletedCount > 0) {
      toast.warning(`Deleted ${deletedCount} of ${unpushedBatches.length} unpushed batch(es)`);
    } else {
      toast.error("Unable to delete unpushed batches");
    }
  }

  async function handleRemoveCandidate(batchId: string, candidateId: string) {
    if (!window.confirm("Remove this learner from the batch?")) {
      return;
    }

    setRemovingCandidateId(candidateId);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}/candidates/${candidateId}`, {
        method: "DELETE",
      });
      setSelectedBatch(detail);
      toast.success("Learner removed from batch");
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to remove learner from batch");
    } finally {
      setRemovingCandidateId(null);
    }
  }

  async function handleRemoveAllCandidates(batchId: string) {
    const batch = selectedBatch?.batchId === batchId ? selectedBatch : null;
    const removableCount =
      batch?.candidates.filter((candidate) => canRemoveCandidate(batch, candidate.enrollmentStatus)).length ?? 0;

    if (removableCount === 0) {
      toast.error("No removable learners in this batch");
      return;
    }

    if (!window.confirm(`Remove ${removableCount} removable learner(s) from this batch?`)) {
      return;
    }

    setIsRemovingAllCandidates(true);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}/candidates`, {
        method: "DELETE",
      });
      setSelectedBatch(detail);
      toast.success("Removable learners removed from batch");
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to remove learners from batch");
    } finally {
      setIsRemovingAllCandidates(false);
    }
  }

  function getSyncTone(batch: BatchListItem) {
    const status = batch.syncState.batchSync.status;
    if (status === "synced") {
      return "emerald" as const;
    }
    if (status === "queued" || status === "processing") {
      return "sky" as const;
    }
    if (status === "manual_review" || status === "failed") {
      return "amber" as const;
    }
    return "slate" as const;
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-100 py-24 text-slate-400">
        <IconLoader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const createFormFields = (
    <>
      <div className="grid gap-x-5 gap-y-6 lg:grid-cols-2">
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="batchName">Batch name</Label>
          <Input
            id="batchName"
            value={batchForm.batchName}
            onChange={(event) => updateBatchForm({ batchName: event.target.value })}
            placeholder={selectedCourse ? `${selectedCourse.courseName} ${batchForm.startDate || "YYYY-MM-DD"}` : "Batch display name"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="centerId">Training center</Label>
          <FieldSelect id="centerId" value={batchForm.centerId} onChange={(value) => updateBatchForm({ centerId: value })}>
            <option value="">{(referenceData?.trainingCenters.length ?? 0) > 0 ? "Select center" : "No centers available"}</option>
            {(referenceData?.trainingCenters ?? []).map((center) => (
              <option key={center.centerId} value={center.centerId}>
                {center.centerName} ({center.centerCode}){center.sidhTcId ? ` · TC Id: ${center.sidhTcId}` : ""}
              </option>
            ))}
          </FieldSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sectorId">Sector</Label>
          <FieldSelect
            id="sectorId"
            value={selectedSectorId}
            onChange={(value) => {
              setSelectedSectorId(value);
              updateBatchForm({ courseId: "" });
              void loadCoursesForSector(value);
            }}
          >
            <option value="">{(referenceData?.sectors.length ?? 0) > 0 ? "Select sector" : "No sectors available"}</option>
            {(referenceData?.sectors ?? []).map((sector) => (
              <option key={sector.sectorId} value={sector.sectorId}>
                {sector.name}
                {sector.code ? ` (${sector.code})` : ""}
              </option>
            ))}
          </FieldSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="courseId">Approved course</Label>
          <FieldSelect
            id="courseId"
            value={batchForm.courseId}
            disabled={!selectedSectorId || isLoadingSectorCourses}
            onChange={(value) => {
              const course = courseMap.get(value);
              if (!course) {
                updateBatchForm({ courseId: value });
                return;
              }
              const schemeIdForCourse = resolveBatchSchemeId(course.schemeIds, referenceData?.schemes ?? []);
              const scheme = schemeIdForCourse ? schemeMap.get(schemeIdForCourse) : undefined;
              const program = course.programIds[0] ? programMap.get(course.programIds[0]) : undefined;
              setBatchForm((current) =>
                applyMasterDataDefaults(
                  course,
                  program,
                  scheme,
                  referenceData?.sidhBatchContext,
                  current.startDate,
                  {
                    ...current,
                    courseId: value,
                  },
                  referenceData?.enums,
                ),
              );
            }}
          >
            <option value="">
              {!selectedSectorId
                ? "Select a sector first"
                : isLoadingSectorCourses
                  ? "Loading courses…"
                  : sectorCourses.length > 0
                    ? "Select course"
                    : "No approved courses in this sector"}
            </option>
            {sectorCourses.map((course) => (
              <option key={course.courseId} value={course.courseId}>
                {formatCourseOptionLabel(course)}
              </option>
            ))}
          </FieldSelect>
        </div>
        <ReadOnlyField label="Government course ID" value={selectedCourse?.sidhCourseId || selectedCourse?.courseCode || ""} />
        <ReadOnlyField label="Training center ID" value={selectedCenter?.sidhTcId ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            type="date"
            value={batchForm.startDate}
            onChange={(event) => {
              const nextStartDate = event.target.value;
              setBatchForm((current) => {
                if (!selectedCourse) {
                  return { ...current, startDate: nextStartDate };
                }
                return applyMasterDataDefaults(
                  selectedCourse,
                  selectedProgram,
                  selectedScheme,
                  referenceData?.sidhBatchContext,
                  nextStartDate,
                  { ...current, startDate: nextStartDate },
                  referenceData?.enums,
                );
              });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">Start time</Label>
          <Input id="startTime" type="time" value={batchForm.startTime} onChange={(event) => updateBatchForm({ startTime: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            type="date"
            value={batchForm.endDate}
            onChange={(event) => {
              const nextEndDate = event.target.value;
              updateBatchForm({
                assessmentDate: resolveAssessmentDate(nextEndDate, batchForm.assessmentDate),
                endDate: nextEndDate,
              });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">End time</Label>
          <Input id="endTime" type="time" value={batchForm.endTime} onChange={(event) => updateBatchForm({ endTime: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="size">Batch size</Label>
          <Input id="size" min={1} max={80} type="number" value={batchForm.size} onChange={(event) => updateBatchForm({ size: event.target.value })} placeholder="80" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assessmentDate">Assessment date</Label>
          <Input
            id="assessmentDate"
            type="date"
            min={minimumAssessmentDate || undefined}
            value={batchForm.assessmentDate}
            disabled={!batchForm.endDate}
            onChange={(event) => {
              const nextAssessmentDate = event.target.value;
              if (!minimumAssessmentDate) {
                return;
              }

              updateBatchForm({
                assessmentDate: !nextAssessmentDate || nextAssessmentDate < minimumAssessmentDate
                  ? minimumAssessmentDate
                  : nextAssessmentDate,
              });
            }}
          />
          {minimumAssessmentDate ? (
            <p className="text-xs text-slate-500">
              Defaults to 7 days after the batch end date. You can choose a later date, but not earlier than{" "}
              {minimumAssessmentDate}.
            </p>
          ) : (
            <p className="text-xs text-slate-500">Set the batch end date first to configure the assessment date.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="trainingHoursPerDay">Training hours / day</Label>
          <Input
            id="trainingHoursPerDay"
            min={1}
            max={24}
            type="number"
            value={batchForm.trainingHoursPerDay}
            onChange={(event) => updateBatchForm({ trainingHoursPerDay: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fee">Batch fee (₹)</Label>
          <Input id="fee" min={0} type="number" value={batchForm.fee} onChange={(event) => updateBatchForm({ fee: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpId">Training partner ID</Label>
          <FieldSelect id="tpId" value={batchForm.tpId} onChange={(value) => updateBatchForm({ tpId: value })}>
            <option value="">Select TP ID</option>
            {[...new Set([referenceData?.sidhBatchContext?.tpId, batchForm.tpId].filter(Boolean))].map((tpId) => (
              <option key={tpId} value={tpId}>
                {tpId}
              </option>
            ))}
          </FieldSelect>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <h3 className="text-sm font-semibold text-slate-900">SIDH batch parameters</h3>
        <p className="mt-1 text-xs text-slate-500">These values are sent to the government portal when you push the batch.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="assessmentMode">Assessment mode</Label>
            <FieldSelect id="assessmentMode" value={batchForm.assessmentMode} onChange={(value) => updateBatchForm({ assessmentMode: value })}>
              {sidhFieldOptionLabels.assessmentMode.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="batchType">Batch type</Label>
            <FieldSelect id="batchType" value={batchForm.batchType} onChange={(value) => updateBatchForm({ batchType: value })}>
              {sidhFieldOptionLabels.batchType.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoryType">Category type</Label>
            <FieldSelect id="categoryType" value={batchForm.categoryType} onChange={(value) => updateBatchForm({ categoryType: value })}>
              {sidhFieldOptionLabels.categoryType.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feePaidBy">Fee paid by</Label>
            <FieldSelect id="feePaidBy" value={batchForm.feePaidBy} onChange={(value) => updateBatchForm({ feePaidBy: value })}>
              {sidhFieldOptionLabels.feePaidBy.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="createdSource">Created source</Label>
            <FieldSelect id="createdSource" value={batchForm.createdSource} onChange={(value) => updateBatchForm({ createdSource: value })}>
              {sidhFieldOptionLabels.createdSource.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </div>
        </div>
      </div>
      {sidhPayloadPreview ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">Preview government portal payload</summary>
          <div className="border-t border-slate-200 p-4">
            <SidhPayloadPreview payload={sidhPayloadPreview} />
          </div>
        </details>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-1 flex-col gap-5 bg-slate-100 px-4 py-4 md:gap-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{content.description}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => startTransition(() => void loadData())}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 sm:w-auto"
          >
            <IconRefresh className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => openAssignModal()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 sm:w-auto"
          >
            <IconUserPlus className="h-4 w-4" />
            Enroll learners
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
          >
            <IconPlus className="h-4 w-4" />
            Create batch
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-sky-950 sm:px-5">
        <p className="font-medium">SIDH batch workflow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs sm:text-sm">
          <li>Create and save the batch locally.</li>
          <li>Review or edit the batch details and SIDH payload preview.</li>
          <li>Push the batch to SIDH and store the returned government batch ID.</li>
          <li>Enroll learners after the batch is synced.</li>
        </ol>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard active={syncFilter === ""} icon={<IconStack2 className="h-5 w-5" />} label="All batches" value={batchStats.total} onClick={() => setSyncFilter("")} />
        <StatCard active={syncFilter === "synced"} icon={<IconCalendar className="h-5 w-5" />} label="Synced" value={batchStats.synced} onClick={() => setSyncFilter("synced")} />
        <StatCard active={syncFilter === "pending"} icon={<IconLoader2 className="h-5 w-5" />} label="Pending sync" value={batchStats.pending} onClick={() => setSyncFilter("pending")} />
        <StatCard active={syncFilter === "attention"} icon={<IconRotateClockwise className="h-5 w-5" />} label="Needs attention" value={batchStats.attention} onClick={() => setSyncFilter("attention")} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Saved batches</h2>
              <p className="text-xs text-slate-500">View details, edit before push, push to SIDH, or enroll learners.</p>
            </div>
            {unpushedBatches.length > 0 ? (
              <button
                type="button"
                disabled={isDeletingAllUnpushed}
                onClick={() => void handleDeleteAllUnpushedBatches()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 sm:w-auto"
              >
                {isDeletingAllUnpushed ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconTrash className="h-4 w-4" />}
                Delete all unpushed ({unpushedBatches.length})
              </button>
            ) : null}
          </div>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500 sm:px-5">
            {batches.length === 0 ? "No batches yet. Create your first batch to get started." : "No batches match this filter."}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="min-w-[10rem] px-4 py-3">Batch</th>
                    <th className="min-w-[9rem] px-4 py-3">Course</th>
                    <th className="min-w-[7rem] px-4 py-3">SIDH batch ID</th>
                    <th className="min-w-[6.5rem] px-4 py-3">Schedule</th>
                    <th className="min-w-[4rem] px-4 py-3">Size</th>
                    <th className="min-w-[6rem] px-4 py-3">Sync</th>
                    <th className="min-w-[12rem] px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((batch) => {
                    const course = courseMap.get(batch.courseId);
                    return (
                      <tr key={batch.batchId} className="hover:bg-slate-50/60">
                        <td className="min-w-0 px-4 py-3">
                          <p className="truncate font-medium text-slate-900" title={batch.batchName ?? batch.batchCode}>
                            {batch.batchName ?? batch.batchCode}
                          </p>
                          <p className="truncate text-xs text-slate-400">{batch.batchCode}</p>
                        </td>
                        <td className="min-w-0 px-4 py-3">
                          <p className="truncate text-slate-700" title={course?.courseName}>{course?.courseName ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          {batch.sidhBatchId ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-800">
                              {batch.sidhBatchId}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not pushed</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>{formatDate(batch.startDate)}</p>
                          <p className="text-slate-400">to {formatDate(batch.endDate)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{batch.candidateCount}/{batch.batchSize}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={getSyncTone(batch)} value={batch.syncState.batchSync.status} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <BatchActionsBar className="justify-end">
                            <BatchActionButton
                              disabled={detailLoadingId === batch.batchId}
                              icon={detailLoadingId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconEye className="h-3.5 w-3.5" />}
                              label="View"
                              onClick={() => void handleViewBatch(batch.batchId)}
                            />
                            {canEditBatch(batch) ? (
                              <BatchActionButton icon={<IconEdit className="h-3.5 w-3.5" />} label="Edit" onClick={() => openEditModal(batch.batchId)} />
                            ) : null}
                            {canPushBatch(batch) ? (
                              <BatchActionButton
                                disabled={syncingBatchId === batch.batchId}
                                icon={syncingBatchId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconCloudUpload className="h-3.5 w-3.5" />}
                                label="Push"
                                onClick={() => void handlePushToSidh(batch.batchId)}
                                tone="primary"
                              />
                            ) : null}
                            {batch.sidhBatchId ? (
                              <BatchActionButton icon={<IconUserPlus className="h-3.5 w-3.5" />} label="Enroll" onClick={() => openAssignModal(batch.batchId)} />
                            ) : null}
                            {["failed", "manual_review"].includes(batch.syncState.batchSync.status) ? (
                              <BatchActionButton
                                disabled={syncingBatchId === batch.batchId}
                                icon={syncingBatchId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconRotateClockwise className="h-3.5 w-3.5" />}
                                label="Retry"
                                onClick={() => void handleRetrySync(batch.batchId)}
                              />
                            ) : null}
                            {canEditBatch(batch) ? (
                              <BatchActionButton
                                disabled={deletingBatchId === batch.batchId}
                                icon={deletingBatchId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5" />}
                                label="Delete"
                                onClick={() => void handleDeleteBatch(batch.batchId)}
                                tone="danger"
                              />
                            ) : null}
                          </BatchActionsBar>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 p-3 xl:hidden">
              {filteredBatches.map((batch) => {
                const course = courseMap.get(batch.courseId);
                return (
                  <div key={batch.batchId} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{batch.batchName ?? batch.batchCode}</p>
                        <p className="truncate text-xs text-slate-500">{course?.courseName}</p>
                      </div>
                      <StatusBadge tone={getSyncTone(batch)} value={batch.syncState.batchSync.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(batch.startDate)} – {formatDate(batch.endDate)} · {batch.candidateCount} learners ·{" "}
                      {batch.sidhBatchId ? `SIDH ${batch.sidhBatchId}` : "Not pushed"}
                    </p>
                    <BatchActionsBar className="mt-2">
                      <BatchActionButton icon={<IconEye className="h-3.5 w-3.5" />} label="View" onClick={() => void handleViewBatch(batch.batchId)} />
                      {canEditBatch(batch) ? (
                        <BatchActionButton icon={<IconEdit className="h-3.5 w-3.5" />} label="Edit" onClick={() => openEditModal(batch.batchId)} />
                      ) : null}
                      {canPushBatch(batch) ? (
                        <BatchActionButton
                          disabled={syncingBatchId === batch.batchId}
                          icon={syncingBatchId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconCloudUpload className="h-3.5 w-3.5" />}
                          label="Push"
                          onClick={() => void handlePushToSidh(batch.batchId)}
                          tone="primary"
                        />
                      ) : null}
                      {batch.sidhBatchId ? (
                        <BatchActionButton icon={<IconUserPlus className="h-3.5 w-3.5" />} label="Enroll" onClick={() => openAssignModal(batch.batchId)} />
                      ) : null}
                      {canEditBatch(batch) ? (
                        <BatchActionButton
                          disabled={deletingBatchId === batch.batchId}
                          icon={deletingBatchId === batch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5" />}
                          label="Delete"
                          onClick={() => void handleDeleteBatch(batch.batchId)}
                          tone="danger"
                        />
                      ) : null}
                    </BatchActionsBar>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {showCreateModal ? (
        <BatchModal
          icon={<IconPlus className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Create batch"
          subtitle="Save locally first, review the SIDH payload, then push when ready."
          onClose={() => {
            resetSectorCourseSelection();
            setShowCreateModal(false);
          }}
          wide
        >
          {createFormFields}
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => {
                resetSectorCourseSelection();
                setShowCreateModal(false);
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleCreateBatch()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconPlus className="h-4 w-4" />}
              Save locally
            </button>
          </div>
        </BatchModal>
      ) : null}

      {showEditModal && editingBatchId ? (
        <BatchModal
          icon={<IconEdit className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Edit batch"
          subtitle="Update batch details and SIDH parameters before pushing to the government portal."
          onClose={() => {
            setShowEditModal(false);
            setEditingBatchId(null);
            setBatchForm(createEmptyBatchForm(referenceData?.enums));
            resetSectorCourseSelection();
          }}
          wide
        >
          {createFormFields}
          <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowEditModal(false);
                setEditingBatchId(null);
                setBatchForm(createEmptyBatchForm(referenceData?.enums));
                resetSectorCourseSelection();
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleUpdateBatch()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconEdit className="h-4 w-4" />}
              Save changes
            </button>
            <button
              type="button"
              disabled={isSaving || syncingBatchId === editingBatchId}
              onClick={() => void handleSaveAndPush()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {syncingBatchId === editingBatchId ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconCloudUpload className="h-4 w-4" />}
              Save & push to SIDH
            </button>
          </div>
        </BatchModal>
      ) : null}

      {showDetailModal && selectedBatch ? (
        <BatchModal
          icon={<IconStack2 className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title={selectedBatch.batchName ?? selectedBatch.batchCode}
          subtitle={`${selectedBatch.candidateCount} enrolled · ${selectedBatch.batchCode}`}
          onClose={() => {
            setShowDetailModal(false);
          }}
          wide
        >
          <div className="mb-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SIDH batch ID</p>
              {selectedBatch.sidhBatchId ? (
                <p className="mt-1 break-all font-mono text-lg font-bold text-emerald-800">{selectedBatch.sidhBatchId}</p>
              ) : (
                <p className="mt-1 text-sm text-amber-700">Not pushed yet. Edit the batch and push to SIDH to receive the government batch ID.</p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <StatusBadge tone={getSyncTone(selectedBatch)} value={selectedBatch.syncState.batchSync.status} />
              <BatchActionsBar className="sm:ml-auto sm:justify-end">
                {canEditBatch(selectedBatch) ? (
                  <BatchActionButton
                    icon={<IconEdit className="h-3.5 w-3.5" />}
                    label="Edit"
                    onClick={() => {
                      setShowDetailModal(false);
                      openEditModal(selectedBatch.batchId);
                    }}
                  />
                ) : null}
                {canPushBatch(selectedBatch) ? (
                  <BatchActionButton
                    disabled={syncingBatchId === selectedBatch.batchId}
                    icon={syncingBatchId === selectedBatch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconCloudUpload className="h-3.5 w-3.5" />}
                    label="Push to SIDH"
                    onClick={() => void handlePushToSidh(selectedBatch.batchId)}
                    tone="primary"
                  />
                ) : null}
                {selectedBatch.sidhBatchId ? (
                  <BatchActionButton
                    icon={<IconUserPlus className="h-3.5 w-3.5" />}
                    label="Enroll learners"
                    onClick={() => {
                      setShowDetailModal(false);
                      openAssignModal(selectedBatch.batchId);
                    }}
                    tone="primary"
                  />
                ) : null}
                {["failed", "manual_review"].includes(selectedBatch.syncState.batchSync.status) ? (
                  <BatchActionButton
                    disabled={syncingBatchId === selectedBatch.batchId}
                    icon={syncingBatchId === selectedBatch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconRotateClockwise className="h-3.5 w-3.5" />}
                    label="Retry push"
                    onClick={() => void handleRetrySync(selectedBatch.batchId)}
                  />
                ) : null}
                {canEditBatch(selectedBatch) ? (
                  <BatchActionButton
                    disabled={deletingBatchId === selectedBatch.batchId}
                    icon={deletingBatchId === selectedBatch.batchId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5" />}
                    label="Delete batch"
                    onClick={() => void handleDeleteBatch(selectedBatch.batchId)}
                    tone="danger"
                  />
                ) : null}
              </BatchActionsBar>
            </div>
          </div>
          {selectedBatch.syncState.batchSync.lastFailureMessage ? (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {selectedBatch.syncState.batchSync.lastFailureMessage}
            </p>
          ) : null}
          {selectedBatch.candidates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No learners enrolled yet.</p>
          ) : (
            <>
              {removableCandidates.length > 0 ? (
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    disabled={isRemovingAllCandidates}
                    onClick={() => void handleRemoveAllCandidates(selectedBatch.batchId)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    {isRemovingAllCandidates ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5" />}
                    Delete all removable ({removableCandidates.length})
                  </button>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Learner</th>
                      <th className="px-3 py-2">Mobile</th>
                      <th className="px-3 py-2">Govt. ID</th>
                      <th className="px-3 py-2">Enrollment</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedBatch.candidates.map((candidate) => (
                      <tr key={candidate.batchCandidateId}>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{candidate.candidateName ?? candidate.candidateId}</td>
                        <td className="px-3 py-2.5 text-slate-600">{candidate.candidateMobileNumber ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{candidate.sidhCandidateId ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            tone={candidate.enrollmentStatus === "synced" ? "emerald" : candidate.enrollmentStatus === "failed" ? "rose" : "amber"}
                            value={candidate.enrollmentStatus}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {canRemoveCandidate(selectedBatch, candidate.enrollmentStatus) ? (
                            <div className="flex justify-end">
                              <BatchActionButton
                                disabled={removingCandidateId === candidate.candidateId}
                                icon={removingCandidateId === candidate.candidateId ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5" />}
                                label="Remove"
                                onClick={() => void handleRemoveCandidate(selectedBatch.batchId, candidate.candidateId)}
                                tone="danger"
                              />
                            </div>
                          ) : (
                            <p className="text-right text-xs text-slate-400">Enrolled in SIDH</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </BatchModal>
      ) : null}

      {showAssignModal ? (
        <BatchModal
          icon={<IconUsers className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Enroll learners"
          subtitle="Select a batch and add registered learners from the government portal."
          onClose={() => setShowAssignModal(false)}
          wide
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="assignBatchId">Batch</Label>
                <FieldSelect
                  id="assignBatchId"
                  value={assignBatchId}
                  onChange={(value) => {
                    setAssignBatchId(value);
                    setSelectedCandidateIds([]);
                    setAssignCandidates([]);
                    if (value) {
                      void loadAssignableCandidates(value);
                    }
                  }}
                >
                  <option value="">Select batch</option>
                  {batches.map((batch) => (
                    <option key={batch.batchId} value={batch.batchId}>{batch.batchName ?? batch.batchCode}</option>
                  ))}
                </FieldSelect>
              </div>
              <button
                type="button"
                disabled={!assignBatchId || activeSelectedCandidateIds.length === 0 || isAssigningCandidates}
                onClick={() => void handleAssignCandidates()}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              >
                {isAssigningCandidates ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconUserPlus className="h-4 w-4" />}
                Enroll {activeSelectedCandidateIds.length > 0 ? activeSelectedCandidateIds.length : ""} selected
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-10 pl-9"
                  placeholder="Search learners…"
                  value={assignSearch}
                  onChange={(event) => setAssignSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && assignBatchId) {
                      void loadAssignableCandidates(assignBatchId, assignSearch);
                    }
                  }}
                />
              </div>
              <button
                type="button"
                disabled={!assignBatchId || isLoadingCandidates}
                onClick={() => void loadAssignableCandidates(assignBatchId, assignSearch)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
              >
                {isLoadingCandidates ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconRefresh className="h-4 w-4" />}
                Search
              </button>
            </div>

            {!assignBatchId ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">Select a batch to load learners.</p>
            ) : isLoadingCandidates ? (
              <div className="flex justify-center py-10 text-slate-400"><IconLoader2 className="h-6 w-6 animate-spin" /></div>
            ) : assignableCandidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No eligible learners found for this batch.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allAssignableSelected}
                          disabled={assignableCandidates.length === 0}
                          onChange={(event) =>
                            setSelectedCandidateIds(event.target.checked ? assignableCandidates.map((c) => c.candidateId) : [])
                          }
                        />
                      </th>
                      <th className="px-3 py-2">Learner</th>
                      <th className="px-3 py-2">Mobile</th>
                      <th className="px-3 py-2">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignableCandidates.map((candidate) => (
                      <tr key={candidate.candidateId} className={activeSelectedCandidateIds.includes(candidate.candidateId) ? "bg-sky-50/50" : undefined}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={activeSelectedCandidateIds.includes(candidate.candidateId)}
                            onChange={(event) => {
                              setSelectedCandidateIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, candidate.candidateId])]
                                  : current.filter((id) => id !== candidate.candidateId),
                              );
                            }}
                          />
                        </td>
                        <td className="min-w-0 truncate px-3 py-2.5 font-medium text-slate-900">{candidate.personalDetails.fullName}</td>
                        <td className="px-3 py-2.5 text-slate-600">{candidate.contactDetails.mobileNumber}</td>
                        <td className="min-w-0 truncate px-3 py-2.5 text-slate-600">
                          {[candidate.locationDetails.district, candidate.locationDetails.state].filter(Boolean).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </BatchModal>
      ) : null}
    </div>
  );
}
