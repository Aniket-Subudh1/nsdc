"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, LayoutList, LoaderCircle, Plus, RefreshCw, RotateCcw, Users } from "lucide-react";
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

type BatchDetail = BatchListItem & {
  candidates: Array<{
    batchCandidateId: string;
    candidateId: string;
    candidateMobileNumber: string | null;
    candidateName: string | null;
    enrollmentStatus: string;
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
      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
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
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

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
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 md:px-8 md:py-7">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Batch Details / {activeTab === "create" ? "Create Batch" : activeTab === "view" ? "View Batch Details" : "Assign Candidate To Batch"}</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>

          <button
            className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
            onClick={() => startTransition(() => void loadData())}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-slate-200">
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
                  "inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition",
                  activeTab === tab.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "create" ? (
          <section className="rounded-md border border-slate-200 bg-white shadow-sm">
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
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
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
            <div className="rounded-md border border-slate-200 bg-white shadow-sm">
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
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-60"
                                disabled={detailLoadingId === batch.batchId}
                                onClick={() => void handleViewBatch(batch.batchId)}
                                title="View enrolled candidates"
                                type="button"
                              >
                                {detailLoadingId === batch.batchId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                              </button>
                              <button
                                aria-label="Retry SIDH sync"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
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
              <div className="rounded-md border border-slate-200 bg-white shadow-sm">
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
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
                      disabled={syncingBatchId === selectedBatch.batchId}
                      onClick={() => void handleRetrySync(selectedBatch.batchId)}
                      type="button"
                    >
                      {syncingBatchId === selectedBatch.batchId ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Retry SIDH create
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
                            <StatusBadge tone={candidate.enrollmentStatus === "synced" ? "emerald" : candidate.enrollmentStatus === "manual_review" ? "amber" : "slate"} value={candidate.enrollmentStatus} />
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
          <section className="rounded-md border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="rounded-full bg-slate-100 p-4 text-slate-600">
                <Users className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">Assign Candidate To Batch</h2>
              <p className="text-sm leading-6 text-slate-500">This tab is ready for the next phase.</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}