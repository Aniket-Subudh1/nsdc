"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, LayoutList, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BatchesManagerProps = {
  portal: "admin" | "training_partner";
};

type ProgramOption = {
  code?: string;
  name: string;
  programId: string;
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
  trainingPerDayHours?: number | null;
};

type ReferenceData = {
  courses: CourseOption[];
  programs: ProgramOption[];
  schemes: Array<{ name: string; schemeId: string }>;
  sectors: SectorOption[];
  trainingCenters: Array<{ centerCode: string; centerId: string; centerName: string }>;
};

type BatchListItem = {
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
  categoryId: string;
  courseId: string;
  endDate: string;
  endTime: string;
  fee: string;
  sectorId: string;
  size: string;
  startDate: string;
  startTime: string;
};

type TabKey = "create" | "view" | "assign";

const emptyBatchForm: BatchFormState = {
  categoryId: "",
  courseId: "",
  endDate: "",
  endTime: "17:00",
  fee: "",
  sectorId: "",
  size: "",
  startDate: "",
  startTime: "09:00",
};

const portalContent = {
  admin: {
    description: "Create new SIDH-ready batches, review saved batches, and inspect enrolled candidates from one focused workspace.",
    heading: "Batch Details",
  },
  training_partner: {
    description: "Create batches for your scoped centers, retry SIDH sync when needed, and review enrolled candidates.",
    heading: "Batch Details",
  },
} as const;

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

function normalizeMatchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function valuesMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeMatchValue(left);
  const normalizedRight = normalizeMatchValue(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
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

  return <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", tones[tone])}>{formatStatusLabel(value)}</span>;
}

function MetricCard({
  active,
  icon,
  label,
  onClick,
  value,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  value: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "group rounded-3xl border p-5 text-left shadow-sm transition",
        active ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-sky-200",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className={classNames("rounded-2xl p-3", active ? "bg-slate-900 text-white" : "bg-sky-50 text-sky-600 group-hover:bg-sky-100")}>{icon}</span>
        <span className={classNames("text-2xl font-bold tracking-tight", active ? "text-slate-950" : "text-slate-800")}>{value}</span>
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-700">{label}</div>
    </button>
  );
}

function FieldSelect({
  children,
  id,
  onChange,
  value,
}: {
  children: React.ReactNode;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      id={id}
      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

export default function BatchesManager({ portal }: BatchesManagerProps) {
  const content = portalContent[portal];
  const [activeTab, setActiveTab] = useState<TabKey>("create");
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm);
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

  const courseMap = useMemo(() => new Map((referenceData?.courses ?? []).map((course) => [course.courseId, course])), [referenceData]);
  const programMap = useMemo(() => new Map((referenceData?.programs ?? []).map((program) => [program.programId, program])), [referenceData]);
  const sectorMap = useMemo(() => new Map((referenceData?.sectors ?? []).map((sector) => [sector.sectorId, sector])), [referenceData]);

  const filteredCourses = useMemo(() => {
    return (referenceData?.courses ?? []).filter((course) => {
      const selectedSector = sectorMap.get(batchForm.sectorId);
      const selectedProgram = programMap.get(batchForm.categoryId);
      const matchesSector = batchForm.sectorId
        ? valuesMatch(course.sectorId, batchForm.sectorId) || valuesMatch(course.sectorId, selectedSector?.code) || valuesMatch(course.sectorId, selectedSector?.name)
        : true;
      const matchesCategory = batchForm.categoryId
        ? course.programIds.length === 0 ||
          course.programIds.some(
            (programId) =>
              valuesMatch(programId, batchForm.categoryId) || valuesMatch(programId, selectedProgram?.code) || valuesMatch(programId, selectedProgram?.name),
          )
        : true;
      return matchesSector && matchesCategory;
    });
  }, [batchForm.categoryId, batchForm.sectorId, programMap, referenceData?.courses, sectorMap]);

  const selectedCourse = courseMap.get(batchForm.courseId);
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

  async function handleViewBatch(batchId: string, switchTab = true) {
    setDetailLoadingId(batchId);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`);
      setSelectedBatch(detail);
      if (switchTab) {
        setActiveTab("view");
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load enrolled candidates");
    } finally {
      setDetailLoadingId(null);
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
    const schemeId = selectedCourse?.schemeIds[0] ?? referenceData?.schemes[0]?.schemeId;

    if (!batchForm.categoryId || !batchForm.sectorId || !batchForm.courseId || !batchForm.startDate || !batchForm.endDate || !batchForm.startTime || !batchForm.endTime) {
      toast.error("Complete category, sector, course, date, and time fields before creating the batch");
      return;
    }

    if (!schemeId) {
      toast.error("Add an active scheme or course scheme mapping before creating a batch");
      return;
    }

    setIsSaving(true);

    try {
      const batchCode = createGeneratedBatchCode(selectedCourse, batchForm.startDate);
      const batchName = `${selectedCourse?.courseName ?? "Batch"} ${batchForm.startDate}`;
      const createdBatch = await apiFetch<BatchDetail>("/api/v1/batches", {
        body: JSON.stringify({
          assessmentDate: batchForm.endDate,
          assessmentEligibilityThreshold: 70,
          batchCode,
          batchName,
          batchSize: Number(batchForm.size || 1),
          courseId: batchForm.courseId,
          endDate: batchForm.endDate,
          endTime: batchForm.endTime,
          fee: Number(batchForm.fee || 0),
          schemeId,
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          status: "ready",
          syncEnabled: true,
          trainingHoursPerDay: Number(selectedCourse?.trainingPerDayHours || 8),
        }),
        method: "POST",
      });

      toast.success("Batch saved locally");

      setBatchForm(emptyBatchForm);
      setActiveTab("view");
      await loadData();
      await handleViewBatch(createdBatch.batchId, false);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to create batch");
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-700">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading batch details
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6 bg-slate-100 px-4 py-4 text-slate-900 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>

          <button
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
            onClick={() => startTransition(() => void loadData())}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh visible data
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Plus className="h-5 w-5" />} label="Create Batch" value="New" active={activeTab === "create"} onClick={() => setActiveTab("create")} />
        <MetricCard icon={<LayoutList className="h-5 w-5" />} label="Saved Batches" value={batches.length} active={activeTab === "view"} onClick={() => setActiveTab("view")} />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Assign Candidates" value={selectedBatch?.candidates.length ?? 0} active={activeTab === "assign"} onClick={() => setActiveTab("assign")} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-5 pt-3">
          {[
            { icon: Plus, key: "create" as const, label: "Create Batch" },
            { icon: LayoutList, key: "view" as const, label: "View All Batches" },
            { icon: Users, key: "assign" as const, label: "Assign Candidate To Batch" },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={classNames(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
                  activeTab === tab.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600",
                )}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <span className={classNames("rounded-full px-1.5 py-0.5 text-[10px] font-bold", activeTab === tab.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>
                  {tab.key === "create" ? "1" : tab.key === "view" ? batches.length : selectedBatch?.candidates.length ?? 0}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

        {activeTab === "create" ? (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Create Batch</h2>
            </div>

            <div className="grid gap-x-5 gap-y-8 p-5 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="categoryId">Select Category</Label>
                <FieldSelect id="categoryId" value={batchForm.categoryId} onChange={(value) => updateBatchForm({ categoryId: value, courseId: "" })}>
                  <option value="">Select Category</option>
                  {(referenceData?.programs ?? []).map((program) => (
                    <option key={program.programId} value={program.programId}>{program.name}</option>
                  ))}
                </FieldSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sectorId">Select Sector</Label>
                <FieldSelect id="sectorId" value={batchForm.sectorId} onChange={(value) => updateBatchForm({ sectorId: value, courseId: "" })}>
                  <option value="">Select Sector</option>
                  {(referenceData?.sectors ?? []).map((sector) => (
                    <option key={sector.sectorId} value={sector.sectorId}>{sector.name}</option>
                  ))}
                </FieldSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="courseId">Select Course</Label>
                <FieldSelect
                  id="courseId"
                  value={batchForm.courseId}
                  onChange={(value) => {
                    const course = courseMap.get(value);
                    updateBatchForm({ courseId: value, fee: course?.price ? String(course.price) : batchForm.fee });
                  }}
                >
                  <option value="">Select Course</option>
                  {filteredCourses.map((course) => (
                    <option key={course.courseId} value={course.courseId}>{course.courseName}</option>
                  ))}
                </FieldSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" value={batchForm.startDate} onChange={(event) => updateBatchForm({ startDate: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input id="startTime" type="time" value={batchForm.startTime} onChange={(event) => updateBatchForm({ startTime: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" value={batchForm.endDate} onChange={(event) => updateBatchForm({ endDate: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input id="endTime" type="time" value={batchForm.endTime} onChange={(event) => updateBatchForm({ endTime: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee">Fee</Label>
                <Input id="fee" min={0} type="number" value={batchForm.fee} onChange={(event) => updateBatchForm({ fee: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="size">Size</Label>
                <Input id="size" min={1} max={80} type="number" value={batchForm.size} onChange={(event) => updateBatchForm({ size: event.target.value })} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-5">
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={() => void handleCreateBatch()}
                type="button"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Create Batch
              </button>
              {selectedCourse ? (
                <span className="text-sm text-slate-500">
                  {programMap.get(batchForm.categoryId)?.name ?? "Selected category"} / {sectorMap.get(batchForm.sectorId)?.name ?? "Selected sector"}
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === "view" ? (
          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-semibold text-slate-950">View Batch Details</h2>
                <StatusBadge tone="sky" value={`${batches.length} batches`} />
              </div>

              <div className="overflow-x-auto p-5">
                <table className="w-full border-collapse text-sm" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Batch ID</th>
                      <th className="px-3 py-3">Batch Name</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Sector</th>
                      <th className="px-3 py-3">Course</th>
                      <th className="px-3 py-3">Size</th>
                      <th className="px-3 py-3">Start</th>
                      <th className="px-3 py-3">End</th>
                      <th className="px-3 py-3">Fee</th>
                      <th className="px-3 py-3">SIDH Sync</th>
                      <th className="px-3 py-3">Candidates</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {batches.map((batch) => {
                      const course = courseMap.get(batch.courseId);
                      const category = course?.programIds[0] ? programMap.get(course.programIds[0]) : undefined;
                      const sector = course?.sectorId ? sectorMap.get(course.sectorId) : undefined;

                      return (
                        <tr key={batch.batchId} className="bg-white align-top hover:bg-slate-50">
                          <td className="px-3 py-4 font-medium text-slate-800">{batch.sidhBatchId ?? batch.batchCode}</td>
                          <td className="px-3 py-4 text-slate-700">{batch.batchName ?? batch.batchCode}</td>
                          <td className="px-3 py-4 text-slate-600">{category?.name ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-600">{sector?.name ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-700">{course?.courseName ?? batch.courseId}</td>
                          <td className="px-3 py-4 text-slate-700">{batch.batchSize}</td>
                          <td className="px-3 py-4 text-slate-700">{formatDate(batch.startDate)} {batch.startTime}</td>
                          <td className="px-3 py-4 text-slate-700">{formatDate(batch.endDate)} {batch.endTime}</td>
                          <td className="px-3 py-4 text-slate-700">{batch.fee}</td>
                          <td className="px-3 py-4">
                            <div className="flex max-w-56 flex-col gap-2">
                              <StatusBadge tone={getSyncTone(batch)} value={batch.syncState.batchSync.status} />
                              {batch.syncState.batchSync.lastFailureMessage ? <span className="text-xs text-amber-700">{batch.syncState.batchSync.lastFailureMessage}</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-slate-700">{batch.candidateCount}</td>
                          <td className="px-3 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                aria-label="View enrolled candidates"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-700 disabled:opacity-60"
                                disabled={detailLoadingId === batch.batchId}
                                onClick={() => void handleViewBatch(batch.batchId)}
                                title="View enrolled candidates"
                                type="button"
                              >
                                {detailLoadingId === batch.batchId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                              </button>
                              <button
                                aria-label="Retry SIDH sync"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                                disabled={syncingBatchId === batch.batchId}
                                onClick={() => void handleRetrySync(batch.batchId)}
                                title="Retry SIDH sync"
                                type="button"
                              >
                                {syncingBatchId === batch.batchId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {batches.length === 0 ? <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No batches created yet.</div> : null}
              </div>
            </div>

            {selectedBatch ? (
              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Enrolled Candidate Details</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedBatch.batchName ?? selectedBatch.batchCode}</p>
                    {selectedBatch.syncState.batchSync.lastFailureMessage ? (
                      <p className="mt-2 max-w-3xl text-sm text-amber-700">SIDH create failed: {selectedBatch.syncState.batchSync.lastFailureMessage}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={getSyncTone(selectedBatch)} value={selectedBatch.syncState.batchSync.status} />
                    <StatusBadge tone={selectedBatch.candidates.length > 0 ? "emerald" : "slate"} value={`${selectedBatch.candidates.length} enrolled`} />
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                      disabled={syncingBatchId === selectedBatch.batchId}
                      onClick={() => void handleRetrySync(selectedBatch.batchId)}
                      type="button"
                    >
                      {syncingBatchId === selectedBatch.batchId ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Retry SIDH create
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                      disabled={syncingEnrollmentBatchId === selectedBatch.batchId || selectedBatch.candidates.length === 0}
                      onClick={() => void handleRetryEnrollment(selectedBatch.batchId)}
                      type="button"
                    >
                      {syncingEnrollmentBatchId === selectedBatch.batchId ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                      Retry enrollment
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto p-5">
                  <table className="w-full text-sm" style={{ minWidth: 820 }}>
                    <thead>
                      <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3">Candidate ID</th>
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Mobile</th>
                        <th className="px-3 py-3">SIDH Candidate</th>
                        <th className="px-3 py-3">Enrollment</th>
                        <th className="px-3 py-3">Training</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedBatch.candidates.map((candidate) => (
                        <tr key={candidate.batchCandidateId}>
                          <td className="px-3 py-4 font-medium text-slate-800">{candidate.candidateId}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.candidateName ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.candidateMobileNumber ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.sidhCandidateId ?? "-"}</td>
                          <td className="px-3 py-4">
                            <div className="flex max-w-72 flex-col gap-2">
                              <StatusBadge tone={candidate.enrollmentStatus === "synced" ? "emerald" : candidate.enrollmentStatus === "manual_review" ? "amber" : candidate.enrollmentStatus === "failed" ? "rose" : "slate"} value={candidate.enrollmentStatus} />
                              {candidate.lastEnrollmentFailureMessage ? <span className="text-xs text-amber-700">{candidate.lastEnrollmentFailureMessage}</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-slate-700">{formatStatusLabel(candidate.trainingStatus ?? "ongoing")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {selectedBatch.candidates.length === 0 ? <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No candidates enrolled in this batch yet.</div> : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "assign" ? (
          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-950">Assign Candidate to Batch</h2>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="assignBatchId">Select Batch</Label>
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
                    <option value="">Select Batch</option>
                    {batches.map((batch) => (
                      <option key={batch.batchId} value={batch.batchId}>{batch.batchName ?? batch.batchCode}</option>
                    ))}
                  </FieldSelect>
                </div>

                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
                  disabled={!assignBatchId || activeSelectedCandidateIds.length === 0 || isAssigningCandidates}
                  onClick={() => void handleAssignCandidates()}
                  type="button"
                >
                  {isAssigningCandidates ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  Assign Candidate to Batch
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Assign Candidate to Batch</h2>
                  <p className="mt-1 text-sm text-slate-500">{assignBatch ? `${assignBatch.batchName ?? assignBatch.batchCode} / ${assignBatch.sidhBatchId ?? "SIDH batch pending"}` : "Select a batch to load verified SIDH candidates"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="h-10 w-64 pl-9"
                      placeholder="Search"
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
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                    disabled={!assignBatchId || isLoadingCandidates}
                    onClick={() => void loadAssignableCandidates(assignBatchId, assignSearch)}
                    type="button"
                  >
                    {isLoadingCandidates ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                  <span>{activeSelectedCandidateIds.length} selected</span>
                  {assignBatchId && selectedBatch?.batchId === assignBatchId ? <StatusBadge tone="sky" value={`${selectedBatch.candidates.length} assigned`} /> : null}
                </div>

                <table className="w-full border-collapse text-sm" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-12 px-3 py-3">
                        <input
                          aria-label="Select all verified SIDH candidates"
                          checked={allAssignableSelected}
                          disabled={assignableCandidates.length === 0}
                          onChange={(event) => setSelectedCandidateIds(event.target.checked ? assignableCandidates.map((candidate) => candidate.candidateId) : [])}
                          type="checkbox"
                        />
                      </th>
                      <th className="px-3 py-3">Candidate ID</th>
                      <th className="px-3 py-3">First Name</th>
                      <th className="px-3 py-3">State</th>
                      <th className="px-3 py-3">City</th>
                      <th className="px-3 py-3">Centre Name</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Created on</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assignableCandidates.map((candidate) => {
                      const isSelected = activeSelectedCandidateIds.includes(candidate.candidateId);

                      return (
                        <tr key={candidate.candidateId} className={classNames("align-top hover:bg-slate-50", isSelected ? "bg-sky-50" : "bg-white")}>
                          <td className="px-3 py-4">
                            <input
                              aria-label={`Select ${candidate.candidateId}`}
                              checked={isSelected}
                              onChange={(event) => {
                                setSelectedCandidateIds((current) =>
                                  event.target.checked ? [...new Set([...current, candidate.candidateId])] : current.filter((id) => id !== candidate.candidateId),
                                );
                              }}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-4 font-medium text-slate-800">{candidate.sidhCandidateId ?? candidate.candidateId}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.personalDetails.fullName}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.locationDetails.state ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.locationDetails.city ?? "-"}</td>
                          <td className="px-3 py-4 text-slate-700">{candidate.locationDetails.centerName ?? "-"}</td>
                          <td className="px-3 py-4"><StatusBadge tone="emerald" value="Registration Done" /></td>
                          <td className="px-3 py-4 text-slate-700">{candidate.createdAt ? new Date(candidate.createdAt).toLocaleString("en-IN") : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {assignBatchId && !isLoadingCandidates && assignableCandidates.length === 0 ? <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No verified SIDH candidates are available for this batch.</div> : null}
                {!assignBatchId ? <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Select a batch to load candidates.</div> : null}
              </div>
            </div>
          </section>
        ) : null}
    </div>
  );
}